// The events pipeline, one pass:
//   1. sync sources.<city>.json into the sources table
//   2. collect every source into raw_items (only new or changed items)
//   3. read pending raw items into candidates (structured parse, or a model)
//   4. classify candidates (kind, relevance, English title and summary)
//   5. fold the OpenStreetMap venue catalogue into places, enrich a few
//      places (links, photo), resolve venues, write events and provenance
//   6. archive what has ended, record each source's health
//
//   node pipeline/run.ts                 full pass (needs SUPABASE_SERVICE_ROLE_KEY)
//   node pipeline/run.ts --dry-run       collect, read and classify; print, write nothing
//   node pipeline/run.ts --source kino-soprus --dry-run --out /tmp/x.json
//   node pipeline/run.ts --models        list configured model lanes and probe each once

import { readFileSync, writeFileSync } from 'node:fs';
import type { Candidate, Enrichment, RawItem, Source } from './types.ts';
import * as fienta from './sources/fienta.ts';
import * as jsonld from './sources/jsonld.ts';
import * as wordpress from './sources/wordpress.ts';
import * as vabalava from './sources/vabalava.ts';
import * as nextflight from './sources/nextflight.ts';
import * as saal from './sources/saal.ts';
import * as stl from './sources/stl.ts';
import { keepStarted } from './sources/still-on.ts';
import { osmCatalogue, enrichPlace, wikidataByOsm } from './venues.ts';
import { instagramConfig, attachInstagramPictures, lookupProfile, lookupPosts, fillInstagramDetails, type PostLookup } from './instagram.ts';
import { collectInstagram, collectHashtags, instagramPostUrl } from './sources/instagram.ts';
import { collectTelegram, collectPage, collectRss } from './sources/text.ts';
import { Models, lanes, extractEvents, classify, classifyPlaces, transcribePoster, usage } from './llm.ts';
import { englishModels, refreshEnglish } from './english.ts';
import { localModels, refreshLocal } from './localize.ts';
import { attachPosters } from './posters.ts';
import { fetchOverture, matchPlace } from './overture.ts';
import { Places, isDistrict, type Place } from './places.ts';
import { Seen, earlierListing, type Listed } from './dedupe.ts';
import { textFlag, worse } from './flags.ts';
import { Db, inList, chunks } from './db.ts';
import { sha, nameKey, scrubContacts, httpUrl, lastBy } from './util.ts';
import { tallinnDay } from './time.ts';
import { withEasyAlone } from './easy.ts';
import { fillLogoTones } from './logo-tone.ts';
import { PLACE_COLUMNS, loadPlaces, reconcilePlaces, reconcileEvents, refreshLiveness, retireForeignScriptPlaces, verifyPlaces } from './maintenance.ts';
import { composeRoutes } from './routes.ts';
import { fillHours } from './hours-sources.ts';
import { facebookCheck } from './facebook-hours.ts';
import { wikidataNear } from './wikidata-near.ts';
import { draftNotes } from './place-notes.ts';
import { checkDrift } from './drift.ts';
import { fillSourceLinks } from './venue-source-facts.ts';

/** Refresh source facts without erasing reviewed artwork or classification. */
export function eventRefreshFacts(row: Record<string, unknown>): Record<string, unknown> {
  if (String(row.status_note).startsWith('manual review: date and time read from Instagram poster')) {
    return { id: row.id, last_seen_at: row.last_seen_at };
  }
  const { status: _s, status_note: _n, relevance: _r, ...facts } = row;
  // English copy belongs to the separate editorial queue, including originals.
  delete facts.title_en; delete facts.summary_en;
  if (!facts.image_url) { delete facts.image_url; delete facts.image_attr; }
  if (String(facts.engine).endsWith('+rules')) {
    delete facts.kind; delete facts.tags;
  }
  return facts;
}

const args = process.argv.slice(2);
const flag = (f: string) => args.includes(f);
const opt = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };

const CITY = opt('--city') ?? 'tallinn';
const DRY = flag('--dry-run');
const ONLY = opt('--source');
const MAX_ITEMS = Number(opt('--max-items') ?? 400);
const MAX_ATTEMPTS = 3;          // a raw item that errors this often is parked as 'error'
const KEEP_RAW_DAYS = 60;

const log = (...xs: unknown[]) => console.log('[pipeline]', ...xs);

export function loadSources(city = CITY): Source[] {
  const url = new URL(`./sources.${city}.json`, import.meta.url);
  return (JSON.parse(readFileSync(url, 'utf8')) as Source[]).filter(s => s.config.enabled !== false).map(s => ({ ...s, active: true } as Source));
}

/** Venue programme pages read by their own parser, named by config.shape: no model reads them. */
const SHAPES = new Map<string, { collect: (s: Source) => Promise<RawItem[]>; extract: (i: RawItem, s: Source) => Candidate[] }>(
  Object.entries({ vabalava, nextflight, saal, stl }));
export const pageShape = (s: Source) => (s.kind === 'html' && typeof s.config.shape === 'string' ? SHAPES.get(s.config.shape) : undefined);

async function collect(source: Source, db: Db | null): Promise<RawItem[]> {
  switch (source.kind) {
    case 'fienta': return fienta.collect(source);
    case 'jsonld': return jsonld.collect(source);
    case 'wordpress': return wordpress.collect(source);
    case 'osm': return [];            // places, not events: step 5
    case 'telegram': return collectTelegram(source);
    case 'html': return pageShape(source)?.collect(source) ?? collectPage(source);
    case 'rss': return collectRss(source);
    case 'instagram': return source.config.hashtags ? collectHashtags(source) : collectInstagram(source, db);
  }
}

/** Posters read per run; each costs about 35 Workers AI neurons. */
const posters = { left: Number(opt('--max-posters') ?? 30) };
const instagramPosters = { left: 5 };
const postCache = new Map<string, Promise<PostLookup>>();

const needsModel = (s: Source) => s.kind === 'telegram' || (s.kind === 'html' && !pageShape(s)) || s.kind === 'rss' || s.kind === 'instagram';

/** Raw item → candidates. Null means "not now" (no model available). */
export async function read(item: RawItem, source: Source, models: Models,
  deps: { posts?: typeof lookupPosts; transcribe?: typeof transcribePoster; extract?: typeof extractEvents; canTranscribe?: boolean } = {},
): Promise<Candidate[] | null> {
  if (source.kind === 'fienta') return fienta.extract(item);
  if (source.kind === 'jsonld') return jsonld.extract(item, source);
  if (source.kind === 'wordpress') return wordpress.extract(item, source);
  const shape = pageShape(source);
  if (shape) return shape.extract(item, source);
  if (!models.ready) return null;
  const p = item.payload as { text?: string; title?: string; posted_at?: string; photos?: string[]; venue_name?: string; handle?: string; poster_available?: boolean };
  const isInstagram = source.kind === 'instagram';
  let image = isInstagram ? undefined : p.photos?.[0];
  // Resolve signed media URLs when reading, not when queuing: expiry must not change content hashes.
  if (isInstagram && p.poster_available && p.handle && !/\b\d{1,2}[:.]\d{2}\b/.test(p.text ?? '')) {
    const cfg = instagramConfig();
    const vision = deps.canTranscribe ?? !!(process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID);
    if (!cfg || !vision || instagramPosters.left <= 0 || posters.left <= 0 || usage.neurons >= models.neuronBudget - 50) return null;
    if (!postCache.has(p.handle)) postCache.set(p.handle, (deps.posts ?? lookupPosts)(p.handle, cfg, 25));
    const lookup = await postCache.get(p.handle)!;
    if (lookup.kind !== 'found') throw new Error(`Instagram poster unavailable: ${lookup.reason}`);
    image = lookup.posts.find(post => instagramPostUrl(post.permalink) === instagramPostUrl(item.url ?? ''))?.imageUrl;
    if (!image) throw new Error('Instagram poster no longer available in recent posts; check the source manually');
    instagramPosters.left--;
  }
  // A post's poster often carries the date, time and venue its text leaves out.
  const poster = image && posters.left > 0 && usage.neurons < models.neuronBudget - 50 ? (posters.left--, await (deps.transcribe ?? transcribePoster)(image)) : null;
  if (isInstagram && image && !poster) throw new Error('Instagram poster transcription unavailable; retry or check the source manually');
  const text = [p.title, p.text, poster ? `Text on the attached poster:\n${poster}` : ''].filter(Boolean).join('\n\n');
  if (!text.trim() && !p.photos?.length) return [];
  const found = await (deps.extract ?? extractEvents)(models, {
    text, source: source.kind === 'instagram' && p.venue_name ? `Instagram account @${p.handle} of ${p.venue_name}` : `${source.label} (${source.handle})`, postedAt: p.posted_at ?? null,
    images: isInstagram ? [] : p.photos ?? [], pageUrl: item.url ?? null,
  });
  // A single venue's own programme page: every event is at that venue,
  // whatever hall name the page uses.
  const venue = source.config.venue_name as string | undefined;
  // A venue's own Instagram post names no other place: it is at that venue.
  if (isInstagram) return found.map(c => ({ ...c, image_url: null, venue_name: c.venue_name || p.venue_name,
    ...(poster ? { review_note: 'manual review: date and time read from Instagram poster' } : {}) }));
  return venue ? found.map(c => ({ ...c, venue_name: venue })) : found;
}

export interface LiveEvent { id: string; title: string; starts_at: string; has_time: boolean }

/** The live events each source item read this run listed before, for items that are one occurrence:
 *  a structured source's item (models read posts and pages that list many shows) that gave one
 *  candidate. The event id hashes the start, so without this a moved start made a second row. */
export async function itemListings(db: Pick<Db, 'select'>, found: { p: { rawId: number | null; source: Source } }[], live: LiveEvent[]): Promise<Map<number, Listed[]>> {
  const per = new Map<number, number>();
  for (const { p } of found) if (p.rawId != null && !needsModel(p.source)) per.set(p.rawId, (per.get(p.rawId) ?? 0) + 1);
  const single = [...per].filter(([, n]) => n === 1).map(([id]) => id);
  const byId = new Map(live.map(k => [k.id, { id: k.id, title: k.title, start: Date.parse(k.starts_at), has_time: k.has_time }]));
  const out = new Map<number, Listed[]>();
  for (const part of chunks(single, 150)) {
    for (const r of await db.select<{ event_id: string; raw_item_id: number }>(`event_sources?raw_item_id=in.(${part.join(',')})&select=event_id,raw_item_id`)) {
      const k = byId.get(r.event_id);
      if (k) out.set(r.raw_item_id, [...(out.get(r.raw_item_id) ?? []), k]);
    }
  }
  return out;
}

export function eventId(city: string, c: Candidate, placeId: string | null): string {
  const local = new Date(c.starts_at).toLocaleTimeString('en-GB', { timeZone: 'Europe/Tallinn', hour: '2-digit', minute: '2-digit' });
  const where = placeId ?? nameKey(c.venue_name ?? '');
  return `ev_${sha([city, nameKey(c.title), tallinnDay(c.starts_at), c.has_time ? local : '', where].join('|')).slice(0, 16)}`;
}

/** Formats that are never WanderAlt, whoever lists them: a venue that
 *  rents its halls out (Kultuurikatel) lists conferences and trade fairs
 *  beside its gigs. Rejected by rule, before a model is asked. */
const OFF_TOPIC = /\b(conference|konverents|summit|forum|foorum|seminar|koolitus|webinar|expo|trade fair|messe|hackathon|business|networking|investor|recruitment|job fair|töömess)\b/i;
export function offTopic(title: string): { status: string; note: string } | null {
  const m = OFF_TOPIC.exec(title);
  return m ? { status: 'rejected', note: `rule: ${m[1].toLowerCase()}` } : null;
}

/** A phrase standing on its own. \b sees only ASCII letters, so Estonian and Russian words need letter
 *  lookarounds; `\p{L}*` extends a stem. */
const words = (src: string) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${src})(?![\\p{L}\\p{N}])`, 'iu');

/** What WanderAlt is not for, whoever lists it and whatever a model scored it: the guide is alternative,
 *  independent and underground culture, contemporary art and social movements, never the mainstream
 *  or dining. Each match goes to the private review queue, never rejected, so a false match costs one
 *  look; the phrases stay specific enough that "Ritual", "Dinner Party" or "Cocktails & Conversation"
 *  do not match. */
const OFF_PROMISE_TITLE: [string, RegExp][] = [
  ['wellness', words(String.raw`sound ?baths?|helivann\p{L}*|helirännak\p{L}*|helikümblus\p{L}*|sound (?:journey|healing|meditation)s?|gong ?baths?|gongivann\p{L}*|singing bowls?|laulvad kausid|crystal (?:bowls?|healing|sound)|kristallkaus\p{L}*|kristallidega|звуков\p{L}* (?:ванн|путешестви|медитаци|терапи)\p{L}*|звукотерапи\p{L}*|поющи\p{L}* чаш\p{L}*`
    + String.raw`|kirtan\p{L}*|киртан\p{L}*|mantra (?:concert|singing|circle)s?|мантр\p{L}*|cacao (?:ceremony|circle)|kakaotseremoonia\p{L}*|какао[- ]церемони\p{L}*|церемони\p{L}* какао|tea ceremony|teetseremoonia\p{L}*|чайн\p{L}* церемони\p{L}*|cha dao`
    + String.raw`|breath ?work|vabastav hingamine|hingamis(?:töötuba|praktika|tehnika|sessioon|harjutus)\p{L}*|дыхательн\p{L}* (?:практик|сесси)\p{L}*|ecstatic dance|ekstaatiline tants|экстатическ\p{L}* танц\p{L}*|biodanza|tantra|тантр\p{L}*|reiki|рейки|chakras?|tšakra\p{L}*|чакр\p{L}*`
    + String.raw`|shaman\p{L}*|šamaan\p{L}*|шаман\p{L}*|retreat|\p{L}*retriit\p{L}*|ретрит\p{L}*|meditation\p{L}*|meditatsioon\p{L}*|медитаци\p{L}*|yoga|jooga\p{L}*|йога|йоги|йогой|pilates|пилатес\p{L}*|qigong|цигун|tai ?chi|taiji|holisti\p{L}*|холистич\p{L}*`
    + String.raw`|music is medicine|medicine (?:music|songs?|circle)|wellness|well-?being|heaolu(?:tund|hommik|päev|õhtu)\p{L}*|велнес\p{L}*|women['’]?s circle|naiste ring\p{L}*|женск\p{L}* круг\p{L}*|moon circle|family constellations?|perekonnaseade\p{L}*|astrolog\p{L}*|астролог\p{L}*|tarot|numerolo\p{L}*|нумеролог\p{L}*`)],
  ['hobby class', words(String.raw`sip (?:&|and|n|'n'|\+) (?:paint|pour)|paint (?:&|and|n|'n') sip|wine (?:&|and) (?:paint|canvas)|candle[- ]?making|candles? (?:workshop|class|painting)|(?:cocktail|scented|soy|aroma) candles?|küünla(?:valmistamis|töötuba|tegemis|maalimis)\p{L}*|küünalde valmistami\p{L}*|свеч\p{L}* своими руками|мастер-класс\p{L}* по (?:изготовлению )?свеч\p{L}*`
    + String.raw`|key ?chains?|võtmehoidja\p{L}*|брелок\p{L}*|(?:bling|charm) bar|keraamika ?(?:töötuba|kursus|tund)\p{L}*|savitöötuba\p{L}*|pottery (?:class|workshop|course|taster)\p{L}*|ceramics? (?:class|workshop|course)\p{L}*|potikedr?a? ?(?:kursus|töötuba)\p{L}*|potikeder|гончарн\p{L}*|мастер-класс\p{L}* по керамик\p{L}*`
    + String.raw`|art class(?:es)?|арт-класс\p{L}*|арт класс\p{L}*|kunstitund\p{L}*|maalitund\p{L}*|painting class(?:es)?|ikebana|икебан\p{L}*|floristi\p{L}*|флористи\p{L}*|lilleseade\p{L}*|\p{L}*kimbu töötuba|bouquet (?:workshop|class)`
    + String.raw`|cocktail (?:class|workshop|masterclass|making)|kokteili(?:töötuba|kursus|koolitus)\p{L}*|wine tasting|vein(?:i)?(?:neljapäev|degustatsioon|koolitus)\p{L}*|vahuvein\p{L}*|дегустаци\p{L}* вин\p{L}*|винн\p{L}* дегустаци\p{L}*`)],
  ['self-help', words(String.raw`coaching|life ?coach\p{L}*|коучинг\p{L}*|коуч|self[- ]help|personal growth|eneseareng\p{L}*|саморазвити\p{L}*|личностн\p{L}* рост\p{L}*|inspiratsioonipäev\p{L}*|inspiration day|motivational|мотивационн\p{L}*`
    + String.raw`|kõik suhetest|all about relationships|kuidas armastada|how to love|как любить|relationship (?:seminar|workshop|coaching|course)s?|suhte(?:seminar|koolitus|töötuba)\p{L}*|paarisuh\p{L}*`
    + String.raw`|sauna (?:social|night|evening|session|party)|saunaõhtu\p{L}*|saunapidu\p{L}*|speed ?dating|kiirkohting\p{L}*|быстр\p{L}* свидани\p{L}*|singles? (?:night|party|evening)`)],
  ['mainstream', words(String.raw`candlelight|candle-?lit concerts?|küünlavalgel|при свечах|tribute|трибьют\p{L}*|трибут\p{L}*|cover ?band|coverbänd\p{L}*|кавер[- ]?(?:групп|бэнд)\p{L}*`
    + String.raw`|best of|greatest hits|the best (?:opera|arias|hits|songs)|opera arias|ooperiaaria\p{L}*|ooperigala\p{L}*|оперн\p{L}* ари\p{L}*|лучш\p{L}* хит\p{L}*`
    + String.raw`|retro ?dis[ck]o|ретро[- ]?дискотек\p{L}*|(?:disco|disko|дискотек\p{L}*|party|pidu|вечеринк\p{L}*)\s*[«"„“]?\s*[3-6]0\s*\+|[3-6]0\s*\+\s*(?:disco|disko|party|pidu|дискотек\p{L}*|вечеринк\p{L}*)`
    + String.raw`|latin nights?|salsa (?:night|party|social)s?|bachata|kizomba|латино[- ]?вечеринк\p{L}*`
    + String.raw`|dinner[- ]show|dinner (?:&|and|\+) (?:show|concert|music)|(?:show|concert) (?:&|and|\+|with) dinner|\p{L}*õhtusöögiga|\p{L}*õhtusöök (?:ja|\+|&) (?:etendus|kontsert|show)|(?:etendus|kontsert|show)[- ](?:ja |\+ |& )?õhtusöök\p{L}*|\p{L}*gurmee\p{L}*|\d+[- ]?käigulise\p{L}*|\d+[- ]course (?:dinner|menu)|ужин[- ]шоу|шоу[- ]ужин|(?:шоу|концерт) с ужином|gala ?dinner`
    + String.raw`|immersive (?:\p{L}+ ){0,2}experience|cat (?:show|exhibition)|kassinäitus\p{L}*|выставк\p{L}* кошек|dog show|koertenäitus\p{L}*|выставк\p{L}* собак|pet (?:show|expo)`
    + String.raw`|vegan (?:fair|festival)|veganlaat\p{L}*|veganmess\p{L}*|food fair|toidumess\p{L}*|toidulaat\p{L}*|веганск\p{L}* ярмарк\p{L}*`
    + String.raw`|walking tour|old town tour|sightseeing|ghost tour|pub crawl|bar crawl|vanalinna ekskursioon\p{L}*|экскурси\p{L}* по (?:старому )?(?:город|таллин)\p{L}*|seikluspar\p{L}*|adventure park`)],
  ['children', words(String.raw`for (?:kids|children|toddlers|families|teens)|kids['’]? (?:workshop|party|disco|show|club)|lastele|lasteetendus\p{L}*|lastelavastus\p{L}*|lastekontsert\p{L}*|lastehommik\p{L}*|kogupere\p{L}*|perepäev\p{L}*|family day|teismelistele|для детей|для подростков|детск\p{L}* (?:спектакл|праздник|мастер|концерт)\p{L}*`)],
];
/** Where an event is held can say the same: a restaurant or hotel, a yoga studio, a puppet theatre or
 *  youth centre, an arena. Checked on the venue only, since a title naming a hotel is often a film. */
const OFF_PROMISE_VENUE: [string, RegExp][] = [
  ['restaurant', words(String.raw`restaurant|restoran\p{L}*|resto(?:baar|bar)?|ресторан\p{L}*`)],
  ['hotel', words(String.raw`hotel\p{L}*|radisson|hilton|sokos|swiss[oô]tel|park inn|отел\p{L}*|гостиниц\p{L}*`)],
  ['wellness', words(String.raw`yoga|jooga\p{L}*|йога|taiji|tai chi`)],
  ['children', words(String.raw`nukuteat\p{L}*|puppet theat\p{L}*|кукольн\p{L}* театр\p{L}*|noortekeskus\p{L}*|youth cent(?:er|re)|молод[её]жн\p{L}* центр\p{L}*`)],
  ['mainstream', words(String.raw`saku suurhall|unibet arena`)],
];
const plain = (s: string) => s.normalize('NFKC').replace(/\s+/g, ' ').trim();

/** Off the guide's promise by rule: held for a person, with the rule and the words it matched. */
export function offPromise(title: string, venue?: string | null): { status: string; note: string } | null {
  const t = plain(title), v = plain(venue ?? '');
  for (const [label, re] of OFF_PROMISE_TITLE) {
    const m = re.exec(t);
    if (m) return { status: 'review', note: `rule: ${label} (${m[0].toLowerCase()})` };
  }
  for (const [label, re] of OFF_PROMISE_VENUE) {
    const m = v ? re.exec(v) : null;
    if (m) return { status: 'review', note: `rule: ${label} venue (${m[0].toLowerCase()})` };
  }
  return null;
}

/** Who publishes on the lower bar. A curated source is a venue's or collective's own programme. Fienta
 *  is a ticket marketplace that sells for anyone, and a venue filter on it also returns whoever rents
 *  the hall, so a Fienta listing is trusted only for an organiser its source names
 *  (`trusted_organizer_ids`: venues and collectives checked by hand), whether or not the source is curated. */
export function trustedListing(source: Source, item: RawItem): boolean {
  return source.kind === 'fienta' ? fienta.trustedOrganiser(item, source) : source.curated;
}

/** A newly read listing's status. The rules come before trust and fit, so neither a trusted organiser nor
 *  a generous score publishes what they hold. A poster-read date keeps its own review note, which
 *  eventRefreshFacts protects the row by. */
export function listingStatus(c: Candidate, e: Enrichment, source: Source, item: RawItem): { status: string; note: string } {
  return offTopic(c.title) ?? (c.review_note ? { status: 'review', note: c.review_note } : null)
    ?? offPromise(c.title, c.venue_name) ?? decide(e, trustedListing(source, item));
}

/** Upcoming published listings the rules above now hold: an item is not read again unless its source
 *  changes it, and a refresh keeps the earlier status, so without this a row published before a rule
 *  existed stays published. Moves matches to review with the rule as the note; a person's decision
 *  (a note starting "manual") is never overridden and nothing is deleted. */
export async function recheckPublished(db: Pick<Db, 'all' | 'patch'>, city: string): Promise<{ id: string; title: string; note: string }[]> {
  const notManual = 'or=(status_note.is.null,status_note.not.like.manual*)';
  const rows = await db.all<{ id: string; title: string; venue_name: string | null }>(
    `events?city=eq.${city}&status=eq.published&archived_at=is.null&merged_into=is.null&${notManual}&select=id,title,venue_name&order=id.asc`);
  const moved: { id: string; title: string; note: string }[] = [];
  for (const r of rows) {
    const hit = offPromise(r.title, r.venue_name);
    if (!hit) continue;
    await db.patch(`events?id=eq.${encodeURIComponent(r.id)}&status=eq.published&${notManual}`, { status: hit.status, status_note: hit.note });
    moved.push({ id: r.id, title: r.title, note: hit.note });
  }
  return moved;
}

/** Publish, hold for review, or reject. Trusted sources need a lower bar. */
export function decide(e: Enrichment, trusted: boolean): { status: string; note: string } {
  const r = e.relevance;
  if (Number.isNaN(r)) return trusted
    ? { status: 'published', note: 'trusted source, not classified' }
    : { status: 'review', note: 'not classified yet' };
  if (trusted) return r >= 0.3 ? { status: 'published', note: 'trusted source' } : { status: 'review', note: `trusted source, low fit ${r.toFixed(2)}` };
  if (r >= 0.6) return { status: 'published', note: `fit ${r.toFixed(2)}` };
  if (r >= 0.35) return { status: 'review', note: `borderline fit ${r.toFixed(2)}` };
  return { status: 'rejected', note: `low fit ${r.toFixed(2)}` };
}

interface Pending { rawId: number | null; item: RawItem; source: Source }

/** What a crashed run can still record: the neurons it spent. A run that dies writes nothing at its end,
 *  and the daily allowance sums these rows, so an unrecorded crash let the next run spend the same neurons again. */
const current: { db: Db | null; runId: number | null; calls: () => number } = { db: null, runId: null, calls: () => 0 };
const perSource = new Map<string, number>();

async function main() {
  // Keep some Workers AI allocation for new events' English copy after writes.
  const callBudget = Number(process.env.LLM_CALL_BUDGET ?? 60);
  const englishBudget = DRY ? 0 : Math.min(10, Math.max(0, callBudget));
  // Three readers share one neuron counter, each with a ceiling inside the
  // run's allowance R: prose extraction up to R/2, classification (a smaller,
  // cheaper Workers AI model) up to 3R/4, English copy up to R.
  const runCap = Number(process.env.WORKERS_AI_NEURON_BUDGET ?? 2400);
  const models = new Models(undefined, Math.max(0, callBudget - englishBudget), DRY ? runCap : Math.round(runCap / 2));
  const sorter = new Models(lanes(process.env.WORKERS_AI_CLASSIFY_MODEL?.trim() || '@cf/openai/gpt-oss-20b'),
    Math.max(0, callBudget - englishBudget), DRY ? runCap : Math.round(runCap * .75));
  if (flag('--models')) {
    for (const l of models.available) {
      try {
        const answer = await l.call('Answer in JSON.', 'Return {"ok": true}.', { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] });
        log(`lane ${l.name} (${l.model}) answered: ${answer.slice(0, 60)}`);
      } catch (e) { log(`lane ${l.name} (${l.model}) failed: ${(e as Error).message}`); }
    }
    if (!models.available.length) log('no model lane has a key; see README.md');
    return;
  }

  // A look at the Instagram token alone: two real lookups, nothing written.
  if (flag('--instagram-check')) {
    const cfg = instagramConfig();
    if (!cfg) { log('instagram: INSTAGRAM_ACCESS_TOKEN or INSTAGRAM_BUSINESS_ID is not set'); return; }
    for (const handle of ['kanutigildisaal', 'laine.bar']) {
      const r = await lookupProfile(handle, cfg);
      log(`instagram check @${handle}: ${r.kind}${r.kind === 'found' ? ` (username ${r.username}, picture address received)` : ` (${r.reason})`}`);
    }
    return;
  }

  // A look at what Facebook gives this token, step by step, nothing written (README.md).
  if (flag('--facebook-check')) {
    const cfg = instagramConfig();
    if (!cfg) { log('facebook: INSTAGRAM_ACCESS_TOKEN or INSTAGRAM_BUSINESS_ID is not set'); return; }
    for (const line of await facebookCheck(cfg, ['fotografiskatallinn', 'KanutiGildiSAAL', 'uuslaine'])) log(`facebook check ${line}`);
    return;
  }

  const sources = loadSources().filter(s => !ONLY || s.id === ONLY);
  const db = DRY ? null : new Db();
  const english = englishModels(englishBudget);
  english.neuronBudget = runCap;
  // Estonian and Russian copy (localize.ts): its own few calls, after English, from what is left.
  const local = localModels(DRY || flag('--no-local') ? 0 : Number(opt('--local-calls') ?? 8));
  local.neuronBudget = runCap;
  const routesModels = new Models(undefined, DRY || flag('--no-routes') ? 0 : 4, runCap);
  current.calls = () => models.calls + sorter.calls + english.calls + local.calls + routesModels.calls;

  // The run's row, and what today's earlier runs already spent: the free
  // Workers AI allocation is per day (reset 00:00 UTC) and per account.
  // A missing table (migration not applied yet) leaves the per-run cap alone.
  let runId: number | null = null;
  if (db) {
    try {
      const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
      const spent = (await db.select<{ neurons: number }>(`pipeline_runs?started_at=gte.${dayStart.toISOString()}&select=neurons`))
        .reduce((a, r) => a + Number(r.neurons || 0), 0);
      const daily = Number(process.env.WORKERS_AI_DAILY_NEURONS || 6000);
      const left = Math.max(0, daily - spent);
      for (const m of [models, sorter, english, local, routesModels]) m.neuronBudget = Math.min(m.neuronBudget, left);
      const [row] = await db.req<{ id: number }[]>('POST', 'pipeline_runs', [{}], 'return=representation');
      runId = row?.id ?? null;
      current.db = db; current.runId = runId;
      log(`Workers AI: ${Math.round(spent)} neurons spent today, ${Math.round(Math.min(runCap, left))} allowed this run`);
    } catch (e) {
      log(`pipeline_runs unavailable, daily budget not applied: ${(e as Error).message}`);
    }
  }
  const account = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  if (account) log(`Workers AI account ending …${account.slice(-4)} (compare with the account that owns the daily allocation)`);
  log(`${DRY ? 'dry run' : 'run'} for ${CITY}: ${sources.length} sources, model lanes: ${models.available.map(l => `${l.name}:${l.model}`).join(', ') || 'none'}`);

  if (db) {
    // Reserve free calls for English before prose extraction spends its budget.
    await refreshEnglish(db, english, CITY, 20);
    await db.upsert('sources', sources.map(({ id, city, kind, url, handle, label, curated, config }) =>
      ({ id, city, kind, url, handle, label, curated, config, active: true })), 'id');
    // A source removed from the JSON stops being read and stops being shown.
    if (!ONLY) await db.patch(`sources?city=eq.${CITY}&active=is.true&id=not.in.${encodeURIComponent(inList(sources.map(s => s.id)))}`, { active: false });
  }

  // ── 2. collect ──
  const pending: Pending[] = [];
  const health: Record<string, { ok: boolean; yield: number; error?: string }> = {};
  for (const source of sources) {
    try {
      const items = await collect(source, db);
      health[source.id] = { ok: true, yield: items.length };
      // Quiet accounts (or no Instagram secrets) are not a broken source.
      if (source.kind === 'instagram' && !items.length) delete health[source.id];
      if (!db) { pending.push(...items.map(item => ({ rawId: null, item, source }))); log(`${source.id}: ${items.length} items`); continue; }
      const known = new Map<string, string>();
      for (const part of chunks(items.map(i => i.external_id), 150)) {
        const rows = await db.select<{ external_id: string; content_hash: string }>(
          `raw_items?source_id=eq.${encodeURIComponent(source.id)}&external_id=in.${encodeURIComponent(inList(part))}&select=external_id,content_hash`);
        for (const r of rows) known.set(r.external_id, r.content_hash);
      }
      const fresh = lastBy(items, i => i.external_id)
        .map(i => ({ ...i, content_hash: sha(JSON.stringify(i.payload)) }))
        .filter(i => known.get(i.external_id) !== i.content_hash);
      for (const part of chunks(fresh, 200)) {
        await db.upsert('raw_items', part.map(i => ({
          source_id: source.id, external_id: i.external_id, url: i.url ?? null, content_hash: i.content_hash,
          payload: i.payload, fetched_at: new Date().toISOString(), status: 'new', note: null, attempts: 0,
        })), 'source_id,external_id');
      }
      // Seeing an unchanged source item is still fresh activity evidence.
      // Refresh only its provenance; never re-read it or clear its flags.
      const changed = new Set(fresh.map(i => i.external_id));
      for (const part of chunks(items.filter(i => !changed.has(i.external_id)).map(i => i.external_id), 150)) {
        await db.req('POST', 'rpc/refresh_source_seen', { p_source: source.id, p_external_ids: part });
      }
      log(`${source.id}: ${items.length} items, ${fresh.length} new or changed`);
    } catch (e) {
      health[source.id] = { ok: false, yield: 0, error: (e as Error).message };
      log(`${source.id}: collect failed: ${(e as Error).message}`);
    }
  }

  if (db) {
    const ids = sources.map(s => s.id);
    const rows = await db.select<{ id: number; source_id: string; external_id: string; url: string | null; payload: Record<string, unknown>; attempts: number }>(
      `raw_items?status=eq.new&source_id=in.${encodeURIComponent(inList(ids))}&order=fetched_at.asc&limit=${MAX_ITEMS}&select=id,source_id,external_id,url,payload,attempts`);
    const byId = new Map(sources.map(s => [s.id, s]));
    for (const r of rows) pending.push({ rawId: r.id, item: r, source: byId.get(r.source_id)! });
  }
  // Structured sources first: they cost no model calls.
  pending.sort((a, b) => Number(needsModel(a.source)) - Number(needsModel(b.source)));

  // ── 3. read ──
  const found: { c: Candidate; p: Pending }[] = [];
  const done: number[] = [];
  const skipped: number[] = [];
  const failed: { id: number; attempts: number; note: string }[] = [];
  const wasRead = new Set<Pending>();
  for (const p of pending) {
    try {
      const before = models.calls;
      const cands = await read(p.item, p.source, models);
      if (models.calls > before) perSource.set(p.source.id, (perSource.get(p.source.id) ?? 0) + models.calls - before);
      if (cands === null) continue;               // waits for a model
      wasRead.add(p);
      cands.forEach(c => found.push({ c, p }));
      if (p.rawId !== null) (cands.length ? done : skipped).push(p.rawId);
    } catch (e) {
      const attempts = Number((p.item as { attempts?: number }).attempts ?? 0) + 1;
      if (p.rawId !== null) failed.push({ id: p.rawId, attempts, note: (e as Error).message.slice(0, 300) });
      log(`${p.source.id}/${p.item.external_id}: read failed (${attempts}/${MAX_ATTEMPTS}): ${(e as Error).message}`);
    }
  }
  log(`read ${pending.length} items into ${found.length} candidates (${models.calls} model calls)`);
  // A page that is still fetched but no longer yields events has usually
  // been redesigned; say so, since collection alone looks healthy.
  for (const s of sources.filter(needsModel)) {
    const read = pending.filter(p => p.source.id === s.id && wasRead.has(p));
    if (read.length && !found.some(f => f.p.source.id === s.id)) log(`${s.id}: ${read.length} items read, no events found in any`);
  }

  // ── 4. classify ──
  const enrich = await classify(sorter, found.map(f => f.c));

  // ── 5. places and events ──
  let existingPlaces = db ? await loadPlaces(db, CITY) : [];
  if (db) existingPlaces = await retireForeignScriptPlaces(db, existingPlaces);
  if (db) {
    const plan = await reconcilePlaces(db, existingPlaces);
    if (plan.some(p => p.match.action === 'merge')) existingPlaces = await loadPlaces(db, CITY);
    await reconcileEvents(db, CITY);
  }
  // The venue catalogue: every cultural venue OpenStreetMap knows in the city.
  const osm = sources.find(s => s.kind === 'osm');
  let skipCatalogue = false;
  if (db && osm && !flag('--no-liveness')) {
    try {
      await refreshLiveness(db, existingPlaces, false, Number(opt('--max-liveness') ?? 50));
      existingPlaces = await loadPlaces(db, CITY);
    } catch (e) {
      // A maintenance check, not a source: it is logged and retried next run,
      // and does not turn the run red or count against the source.
      skipCatalogue = true;
      delete health[osm.id];   // not collected this run: neither a failure nor an empty source
      log(`${osm.id}: liveness check failed, will retry next run; visibility unchanged: ${(e as Error).message}`);
    }
  }
  const places = new Places(existingPlaces, CITY, DRY && !flag('--geocode') ? 0 : Number(opt('--max-geocode') ?? 100));
  if (osm && !skipCatalogue) {
    try {
      const catalogue = await osmCatalogue(CITY, String(osm.config.area ?? 'Tallinn'), Array.isArray(osm.config.craft_beer) ? osm.config.craft_beer.map(String) : []);
      for (const p of catalogue) places.merge(p);
      if (health[osm.id]?.ok !== false) health[osm.id] = { ok: true, yield: catalogue.length };
      log(`${osm.id}: ${catalogue.length} venues; ${places.created.length} new, ${places.updated.length} updated`);
    } catch (e) {
      // The public Overpass servers time out now and then. The catalogue
      // changes slowly, so a run stays green while the last good read is under
      // two days old; after that the source counts as failing.
      const [prev] = db ? await db.select<{ last_ok_at: string | null }>(`sources?id=eq.${encodeURIComponent(osm.id)}&select=last_ok_at`).catch(() => []) : [];
      if (prev?.last_ok_at && Date.now() - Date.parse(prev.last_ok_at) < 48 * 3600_000) {
        delete health[osm.id];
        log(`${osm.id}: read failed, last good read ${prev.last_ok_at}; kept: ${(e as Error).message}`);
      } else {
        health[osm.id] = { ok: false, yield: 0, error: (e as Error).message };
        log(`${osm.id}: failed: ${(e as Error).message}`);
      }
    }
  }
  // Areas a visitor knows (Kalamaja, not Põhja-Tallinna) for places that
  // carry a district or nothing; 40 a run, one Nominatim lookup each.
  if (!(DRY && !flag('--geocode'))) {
    let n = 0;
    for (const p of places.all().filter(p => (p.status ?? 'active') === 'active' && p.lat != null && isDistrict(p.neighborhood)).slice(0, 40)) {
      if (await places.area(p)) {
        n++;
        if (!places.created.includes(p) && !places.updated.includes(p)) places.updated.push(p);
      }
    }
    if (n) log(`areas: ${n} places moved from a district to their asum`);
  }

  // A curated source that names its one venue may name that venue's own
  // site (`venue_site`): the place gets it when it has none.
  for (const p of fillSourceLinks(places.all(), sources)) {
    if (!places.created.includes(p) && !places.updated.includes(p)) places.updated.push(p);
    log(`source links: ${p.name} missing website/profile filled`);
  }
  // A Wikidata item that names a place's OpenStreetMap object as its own.
  if (!flag('--no-enrich') && !(DRY && !flag('--geocode'))) {
    try {
      const lonely = places.all().filter(p => (p.status ?? 'active') === 'active' && !p.wikidata_id && (p.osm_id || p.osm_ids?.length));
      const found = await wikidataByOsm(lonely.flatMap(p => [p.osm_id, ...(p.osm_ids ?? [])].filter((x): x is string => !!x)));
      let n = 0;
      for (const p of lonely) {
        const qid = [p.osm_id, ...(p.osm_ids ?? [])].map(x => (x ? found.get(x) : undefined)).find(Boolean);
        if (!qid) continue;
        p.wikidata_id = qid; p.enriched_at = null; n++;
        if (!places.created.includes(p) && !places.updated.includes(p)) places.updated.push(p);
      }
      if (n) log(`wikidata: ${n} places matched by their OpenStreetMap id`);
    } catch (e) { log(`wikidata lookup failed: ${(e as Error).message}`); }
  }
  // A place with no link at all: the one Wikidata item near it that names it (wikidata-near.ts).
  if (!flag('--no-enrich') && !(DRY && !flag('--geocode'))) {
    try {
      const found = await wikidataNear(places.all(), Number(opt('--max-near') ?? 12));
      for (const p of found) if (!places.created.includes(p) && !places.updated.includes(p)) places.updated.push(p);
      if (found.length) log(`wikidata: ${found.length} places with no links matched by name and place (${found.map(p => `${p.name} ${p.wikidata_id}`).join(', ')})`);
    } catch (e) { log(`wikidata near lookup failed: ${(e as Error).message}`); }
  }

  // Websites and profiles for places that still have none, from Overture
  // Maps, when the DuckDB CLI is installed; every match is logged.
  if (!flag('--no-overture') && !(DRY && !flag('--geocode'))) {
    try {
      const bare = places.all().filter(p => (p.status ?? 'active') === 'active' && p.lat != null && p.lng != null && (!p.website || !p.facebook || !p.instagram));
      if (bare.length) {
        const pad = 0.002;
        const rows = await fetchOverture({
          west: Math.min(...bare.map(p => p.lng!)) - pad, east: Math.max(...bare.map(p => p.lng!)) + pad,
          south: Math.min(...bare.map(p => p.lat!)) - pad, north: Math.max(...bare.map(p => p.lat!)) + pad,
        });
        if (rows === null) log('overture: DuckDB not installed, skipped');
        else {
          let n = 0;
          for (const p of bare) {
            const f = matchPlace(p, rows);
            if (!f) continue;
            const before = `${p.website ?? ''}${p.facebook ?? ''}${p.instagram ?? ''}`;
            if (!p.website && f.website) { p.website = f.website; p.website_source = 'overture'; p.enriched_at = null; }
            if (!p.facebook && f.facebook) p.facebook = f.facebook;
            if (!p.instagram && f.instagram) p.instagram = f.instagram;
            if (`${p.website ?? ''}${p.facebook ?? ''}${p.instagram ?? ''}` === before) continue;
            n++;
            if (!places.created.includes(p) && !places.updated.includes(p)) places.updated.push(p);
            log(`overture: ${p.name} ← "${f.name}" (${f.metres} m) ${f.website ?? ''}`);
          }
          log(`overture: ${rows.length} records read, ${n} places filled in`);
        }
      }
    } catch (e) { log(`overture failed: ${(e as Error).message}`); }
  }

  // Links and a photo for a few places a run, from sources that identify them.
  if (!flag('--no-enrich')) {
    // A place with no picture is looked at again after a week: sites add logos. One missing a
    // link (website, Instagram, Facebook) is looked at again after a month, since its site or its
    // Wikidata item may have gained one; nobody has to fill links in by hand, in any city.
    const weekAgo = Date.now() - 7 * 86_400_000, monthAgo = Date.now() - 30 * 86_400_000;
    const due = places.all().filter(p => (p.status ?? 'active') === 'active' && (p.wikidata_id || p.website || p.facebook)
      && (!p.enriched_at || (!p.image_url && Date.parse(p.enriched_at) < weekAgo)
        || ((!p.website || !p.instagram || !p.facebook) && Date.parse(p.enriched_at) < monthAgo)))
      .sort((a, b) => Number(!!b.picked) - Number(!!a.picked)).slice(0, Number(opt('--max-enrich') ?? 60));
    for (const p of due) {
      Object.assign(p, await enrichPlace(p, { facebook: !flag('--no-facebook') }), { enriched_at: new Date().toISOString() });
      if (!places.created.includes(p) && !places.updated.includes(p)) places.updated.push(p);
    }
    if (due.length) log(`enriched ${due.length} places`);
  }

  // Last resort for a picture: the venue's Instagram profile picture through
  // Meta's Graph API, copied into our own bucket. Needs both secrets.
  const instagram = instagramConfig();
  if (db && instagram && !flag('--no-instagram')) {
    try {
      for (const p of await attachInstagramPictures(db, places.all(), instagram, Number(opt('--max-instagram') ?? 20))) {
        if (!places.created.includes(p) && !places.updated.includes(p)) places.updated.push(p);
      }
    } catch (e) { log(`instagram failed: ${(e as Error).message}`); }
  }

  // How each venue logo looks (logo-tone.ts), measured once per image, so the pages can draw it on
  // light and dark paper without a white square around it.
  if (!flag('--no-logo-tones')) {
    try {
      for (const p of await fillLogoTones(places.all(), Number(opt('--max-logo-tones') ?? 40))) {
        if (!places.created.includes(p) && !places.updated.includes(p)) places.updated.push(p);
      }
    } catch (e) { log(`logo tones failed: ${(e as Error).message}`); }
  }

  // Opening hours for places that have none: the venue's own site, then its Facebook Page, then its
  // Instagram bio, then a free model reading that same text (hours-sources.ts). A few a run.
  const bios = new Map<string, string>();
  if (instagram) {
    try {
      for (const p of await fillInstagramDetails(places.all(), instagram, 20, { bios })) {
        if (!places.created.includes(p) && !places.updated.includes(p)) places.updated.push(p);
      }
    } catch (e) { log(`instagram details failed: ${(e as Error).message}`); }
  }
  if (!flag('--no-hours')) {
    try {
      for (const p of await fillHours(places.all(), instagram, Number(opt('--max-hours') ?? 30), { bios, models: flag('--no-model-hours') ? null : models })) {
        if (!places.created.includes(p) && !places.updated.includes(p)) places.updated.push(p);
      }
    } catch (e) { log(`hours failed: ${(e as Error).message}`); }
  }

  // A picked place with no note gets one drafted from its own words (place-notes.ts), so a new
  // city's picks show a line without anyone writing it. Written only into an empty note.
  if (db && !flag('--no-notes')) {
    try {
      const bare = await db.select<Place>(`places?city=eq.${CITY}&picked=is.true&pick_note=is.null&merged_into=is.null&status=eq.active&order=id.asc&limit=200`
        + '&select=id,city,name,kind,neighborhood,description,instagram,picked,status,note_checked_at');
      for (const p of await draftNotes(bare, models, Number(opt('--max-notes') ?? 10), { bios })) {
        const body = p.pick_note ? { pick_note: p.pick_note, pick_note_source: 'model', note_checked_at: p.note_checked_at } : { note_checked_at: p.note_checked_at };
        if (DRY) log(`[notes] ${p.name}: ${p.pick_note ?? '(nothing kept)'}`);
        else await db.req('PATCH', `places?id=eq.${encodeURIComponent(p.id)}&pick_note=is.null`, body, 'return=minimal');
      }
    } catch (e) { log(`notes failed: ${(e as Error).message}`); }
  }

  // What a venue's Instagram bio says about itself (a new address, new hours, "we have moved") against
  // what we hold, about once a month per place. Differences become rows in place_fact_flags for a person
  // to review; no stored fact is changed (drift.ts).
  if (instagram && !flag('--no-drift')) {
    try {
      const { looked, found } = await checkDrift(places.all(), instagram, Number(opt('--max-drift') ?? 30), { bios });
      for (const p of looked) if (!places.created.includes(p) && !places.updated.includes(p)) places.updated.push(p);
      if (db && found.length) await db.insertIgnore('place_fact_flags', found.map(f => ({ place_id: f.placeId, field: f.field, stored: f.stored, found: f.found, source: 'instagram' })), 'place_id,field,found');
    } catch (e) { log(`drift failed: ${(e as Error).message}`); }
  }

  // Upcoming events already stored, so a second source's copy of a show joins it.
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const upcoming = db
    ? await db.all<LiveEvent & { place_id: string | null; venue_name: string | null; url: string | null }>(
        `events?city=eq.${CITY}&archived_at=is.null&merged_into=is.null&starts_at=gte.${since}&select=id,title,place_id,venue_name,starts_at,has_time,url&order=id.asc`)
    : [];
  const seen = new Seen(upcoming.map(k => ({ id: k.id, title: k.title, where: k.place_id ?? nameKey(k.venue_name ?? ''), start: Date.parse(k.starts_at), url: k.url })));
  // A source item read again with a moved start keeps the row it listed before.
  const listedBy = db ? await itemListings(db, found, upcoming) : new Map<number, Listed[]>();

  const events = new Map<string, Record<string, unknown>>();
  const provenance: Record<string, unknown>[] = [];
  for (let i = 0; i < found.length; i++) {
    const { c, p } = found[i];
    const e = enrich[i];
    // A model-read listing that has started stays only as an exhibition still on (sources/still-on.ts).
    if (needsModel(p.source) && !keepStarted(c, e.kind)) continue;
    const place = await places.resolve(c, !(DRY && !flag('--geocode')));
    const where = place?.id ?? nameKey(c.venue_name ?? '');
    const start = Date.parse(c.starts_at);
    const earlier = p.rawId != null ? earlierListing(c.title, start, c.has_time, listedBy.get(p.rawId) ?? []) : null;
    const id = earlier ?? seen.match(c.title, where, start) ?? seen.matchUrl(c.title, c.url, start) ?? eventId(CITY, c, place?.id ?? null);
    seen.add({ id, title: c.title, where, start, url: c.url });
    const { status, note } = listingStatus(c, e, p.source, p.item);
    // Any source saying a show is off or sold out wins over one that doesn't.
    const state = worse(c.flag, textFlag(c.title, c.description));
    const imagePage = httpUrl(c.url ?? p.item.url);
    provenance.push({ event_id: id, source_id: p.source.id, raw_item_id: p.rawId, url: c.url ?? p.item.url ?? null,
      flag: state, last_seen_at: new Date().toISOString() });
    if (events.has(id)) { const had = events.get(id)!; had.flag = worse(had.flag as never, state); continue; }
    events.set(id, {
      id, city: CITY, title: c.title, title_en: e.title_en, summary_en: e.summary_en, description: scrubContacts(c.description),
      kind: e.kind, tags: withEasyAlone(e.tags, c.title, c.venue_name), place_id: place?.id ?? null, venue_name: c.venue_name ?? null, address: c.address ?? null,
      lat: c.lat ?? null, lng: c.lng ?? null, starts_at: c.starts_at, ends_at: c.ends_at ?? null, has_time: c.has_time,
      is_free: c.is_free ?? null, price_min: c.price_min ?? null, price_max: c.price_max ?? null, currency: c.currency ?? null,
      ticket_url: c.ticket_url ?? null, url: c.url ?? null, image_url: c.image_url ?? null, language: c.language ?? null,
      image_attr: c.image_url && imagePage ? `Image from ${new URL(imagePage).hostname.replace(/^www\./, '')}` : null,
      series_key: c.series_key ?? null, relevance: Number.isNaN(e.relevance) ? null : e.relevance,
      flag: state, status, status_note: note, engine: `${c.engine}+${e.engine}`, last_seen_at: new Date().toISOString(),
    });
  }

  // Venues OpenStreetMap could not name get a kind from the model, judged
  // by their name, address and the events held there.
  const unnamed = places.all().filter(p => !p.kind).slice(0, 90);
  if (unnamed.length && sorter.ready) {
    const held = (id: string) => [...events.values()].filter(e => e.place_id === id).map(e => String(e.title));
    const kinds = await classifyPlaces(sorter, unnamed.map(p => ({ name: p.name, address: p.address, events: held(p.id) })));
    kinds.forEach((k, i) => {
      const p = unnamed[i];
      if (!k) return;
      p.kind = k;
      if (!places.created.includes(p) && !places.updated.includes(p)) places.updated.push(p);
    });
    log(`venue kinds: ${kinds.filter(Boolean).length} of ${unnamed.length} from the model`);
  }

  const counts = [...events.values()].reduce<Record<string, number>>((a, e) => ({ ...a, [String(e.status)]: (a[String(e.status)] ?? 0) + 1 }), {});
  log(`events: ${events.size} (${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ') || 'none'}), new places: ${places.created.length}`);

  if (!db) {
    const out = opt('--out');
    const rows = [...events.values()].sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)));
    if (out) writeFileSync(out, JSON.stringify({ events: rows, places: places.created, health }, null, 2));
    log(`${models.calls + sorter.calls} model calls, ${Math.round(usage.neurons)} Workers AI neurons`);
    for (const e of rows.slice(0, Number(opt('--show') ?? 15))) {
      log(`  ${e.status} ${new Date(String(e.starts_at)).toLocaleString('en-GB', { timeZone: 'Europe/Tallinn', dateStyle: 'short', timeStyle: 'short' })} · ${e.kind} · ${e.title_en ?? e.title} @ ${e.venue_name ?? '?'}`);
    }
    return;
  }

  // One row per id: a bulk upsert that names a row twice is refused.
  const touched = [...new Map([...places.created, ...places.updated].map(p => [p.id, p])).values()];
  if (touched.length) {
    // Every row carries every column: a bulk upsert takes its column list
    // from the first row, and a missing key would be written as null.
    await db.upsert('places', touched.map(p => ({
      // Liveness/visibility fields belong to their atomic RPC, not a
      // stale bulk snapshot. New rows receive the database defaults.
      ...Object.fromEntries(PLACE_COLUMNS.filter(k => !k.startsWith('osm_') || ['osm_id','osm_ids'].includes(k))
        .filter(k => !['status','merged_into','created_at','picked','verified_at','website_checked_at'].includes(k) && !k.startsWith('verification_'))
        .map(k => [k, (p as unknown as Record<string, unknown>)[k] ?? null])),
      aliases: p.aliases ?? [], osm_ids: p.osm_ids ?? [], updated_at: new Date().toISOString(),
    })), 'id');
  }
  const ids = [...events.keys()];
  const existing = new Set<string>();
  for (const part of chunks(ids, 150)) {
    for (const r of await db.select<{ id: string }>(`events?id=in.${encodeURIComponent(inList(part))}&select=id`)) existing.add(r.id);
  }
  const fresh = ids.filter(id => !existing.has(id)).map(id => events.get(id)!);
  for (const part of chunks(fresh, 200)) await db.insert('events', part);
  // Known events: refresh the facts, keep whatever status a person or an
  // earlier run gave them. A run without a model keeps the earlier
  // classification too. Upsert with merge-duplicates updates only the
  // columns sent, and every row here already exists.
  const refresh = ids.filter(id => existing.has(id)).map(id => eventRefreshFacts(events.get(id)!));
  const byShape = new Map<string, Record<string, unknown>[]>();
  for (const r of refresh) {
    if (Object.keys(r).length === 2 && r.id && r.last_seen_at) {
      await db.patch(`events?id=eq.${encodeURIComponent(String(r.id))}`, { last_seen_at: r.last_seen_at });
      continue;
    }
    const shape = Object.keys(r).sort().join(',');
    byShape.set(shape, [...(byShape.get(shape) ?? []), r]);
  }
  for (const group of byShape.values()) for (const part of chunks(group, 200)) await db.upsert('events', part, 'id');
  const prov = new Map<string, Record<string, unknown>>();
  for (const p of provenance) {
    const key = `${p.event_id}|${p.source_id}`;
    prov.set(key, { ...p, flag: worse(prov.get(key)?.flag as never, p.flag as never) });
  }
  for (const part of chunks([...prov.values()], 200)) await db.upsert('event_sources', part, 'event_id,source_id');
  for (const part of chunks(ids, 200)) await db.req('POST', 'rpc/refresh_event_flags', { p_ids: part });

  for (const part of chunks(done, 200)) await db.patch(`raw_items?id=in.(${part.join(',')})`, { status: 'done', note: null });
  for (const part of chunks(skipped, 200)) await db.patch(`raw_items?id=in.(${part.join(',')})`, { status: 'skipped', note: 'no dated Tallinn event' });
  for (const f of failed) {
    await db.patch(`raw_items?id=eq.${f.id}`, { status: f.attempts >= MAX_ATTEMPTS ? 'error' : 'new', attempts: f.attempts, note: f.note });
  }

  // Events written before any model was available get classified now.
  if (sorter.ready) {
    const waiting = await db.select<{ id: string; title: string; venue_name: string | null; description: string | null; starts_at: string; status_note: string | null }>(
      `events?city=eq.${CITY}&relevance=is.null&status=in.(review,published)&archived_at=is.null&or=(status_note.is.null,status_note.not.like.manual*)&order=starts_at.asc&limit=200&select=id,title,venue_name,description,starts_at,status_note`);
    const cands = waiting.map(w => ({ title: w.title, venue_name: w.venue_name, description: w.description, starts_at: w.starts_at, has_time: true, engine: 'db' }) as Candidate);
    const late = await classify(sorter, cands);
    let n = 0;
    for (let i = 0; i < waiting.length; i++) {
      const e = late[i];
      if (Number.isNaN(e.relevance)) continue;
      // A row the rules hold stays held once a model has scored it.
      const { status, note } = offTopic(waiting[i].title) ?? offPromise(waiting[i].title, waiting[i].venue_name)
        ?? decide(e, (waiting[i].status_note ?? '').startsWith('trusted'));
      await db.patch(`events?id=eq.${encodeURIComponent(waiting[i].id)}`, {
        kind: e.kind, tags: withEasyAlone(e.tags, waiting[i].title, waiting[i].venue_name), relevance: e.relevance, status, status_note: note,
      });
      n++;
    }
    if (waiting.length) log(`classified ${n} of ${waiting.length} earlier events`);
  }
  // Published rows written before a rule existed: held for review by the same rules (before routes compose).
  try {
    const moved = await recheckPublished(db, CITY);
    for (const m of moved) log(`held for review: ${m.title} (${m.note})`);
  } catch (e) { log(`published re-check failed: ${(e as Error).message}`); }

  // ── 6. archive and health ──
  await refreshEnglish(db, english, CITY, 40);
  if (local.budget) {
    try { await refreshLocal(db, local, CITY, 40); } catch (e) { log(`local copy failed: ${(e as Error).message}`); }
  }
  if (!flag('--no-posters')) {
    try {
      const n = await attachPosters(db, CITY, Number(opt('--max-event-pages') ?? 30));
      if (n) log(`posters: ${n} events got the picture their own page attaches to them`);
    } catch (e) { log(`posters failed: ${(e as Error).message}`); }
  }
  const now = new Date().toISOString();
  const cutoff = new Date(Date.now() - 12 * 3600_000).toISOString();
  await db.patch(`events?archived_at=is.null&or=(and(ends_at.is.null,starts_at.lt.${cutoff}),ends_at.lt.${now})`, { archived_at: now });
  const stale = new Date(Date.now() - KEEP_RAW_DAYS * 86_400_000).toISOString();
  await db.req('DELETE', `raw_items?status=in.(done,skipped,error)&fetched_at=lt.${stale}`);
  if (!flag('--no-verification')) await verifyPlaces(db, CITY, Number(opt('--max-website-checks') ?? 30));
  // Evenings for the next few days. The model reads a short brief per day; with no model the same routes are titled by rule.
  if (!flag('--no-routes')) {
    try {
      const rows = await composeRoutes(db, CITY, routesModels, {});
      if (rows.length) log(`routes: ${rows.length} evenings for the next few days`);
    } catch (e) { log(`routes failed: ${(e as Error).message}`); }
  }

  for (const [id, h] of Object.entries(health)) {
    const [prev] = await db.select<{ consecutive_failures: number }>(`sources?id=eq.${encodeURIComponent(id)}&select=consecutive_failures`);
    await db.patch(`sources?id=eq.${encodeURIComponent(id)}`, h.ok
      ? { last_run_at: now, last_ok_at: now, last_yield: h.yield, consecutive_failures: 0, last_error: null }
      : { last_run_at: now, last_yield: 0, consecutive_failures: (prev?.consecutive_failures ?? 0) + 1, last_error: h.error ?? null });
  }
  if (perSource.size) log(`model calls by source: ${[...perSource].sort((a, b) => b[1] - a[1]).map(([id, n]) => `${id} ${n}`).join(', ')}`);
  log(`wrote ${fresh.length} new events, refreshed ${existing.size}; ${current.calls()} model calls, ${Math.round(usage.neurons)} Workers AI neurons`);
  const c = usage.claude;
  if (c.requests) log(`Claude: ${c.requests} requests, ${c.input} input tokens (${c.cacheRead} read from cache), ${c.output} output, $${c.usd.toFixed(4)}${c.overLimit ? `; ${c.overLimit} over 100,000 prompt tokens` : ''}`);
  if (runId != null) {
    await db.patch(`pipeline_runs?id=eq.${runId}`, {
      finished_at: new Date().toISOString(), neurons: usage.neurons, model_calls: current.calls(),
      events_new: fresh.length, events_seen: existing.size, ok: !Object.values(health).some(h => !h.ok),
    });
  }

  const failing = Object.entries(health).filter(([, h]) => !h.ok);
  const empty = Object.entries(health).filter(([, h]) => h.ok && h.yield === 0);
  if (failing.length || empty.length) {
    // A non-zero exit marks the Actions run red, which is the alert.
    console.error(`[pipeline] sources failing: ${failing.map(([id, h]) => `${id} (${h.error})`).join('; ') || 'none'}; empty: ${empty.map(([id]) => id).join(', ') || 'none'}`);
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  main().catch(async (e) => {
    console.error('[pipeline] failed:', e);
    if (current.db && current.runId != null) {
      try {
        await current.db.patch(`pipeline_runs?id=eq.${current.runId}`, { finished_at: new Date().toISOString(), neurons: usage.neurons, model_calls: current.calls(), ok: false });
      } catch { /* the failure above is the one that matters */ }
    }
    process.exit(1);
  });
}
