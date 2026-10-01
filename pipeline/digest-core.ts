// The pure half of the email alerts: who matches what, and the words. No
// network here, so the rules that keep the mail from becoming spam are tested.

export interface EventRow {
  id: string; title: string; venue: string | null; venue_id: string | null;
  handle: string | null; starts_at: string; time: string | null; flag: string | null;
  kind?: string | null; is_free?: boolean | null; price_min?: number | null; event_languages?: string[] | null;
}

const ORIGIN = 'https://wanderalt.app';
const fold = (s: unknown) => String(s ?? '').toLowerCase().trim();

/** A follow id is place:<places.id> or src:<handle without @>. */
export function matchesFollow(follows: ReadonlySet<string>, e: Pick<EventRow, 'venue_id' | 'handle'> & Partial<EventRow>): boolean {
  if (e.venue_id && follows.has(`place:${e.venue_id}`)) return true;
  const h = fold(e.handle).replace(/^@/, '');
  if (h && follows.has(`src:${h}`)) return true;
  for (const f of follows) if (f.startsWith('search:') && matchesSearch(f, e)) return true;
  return false;
}

/** search:kind=gig,club&free=1&english=1, the same shape follow.js writes. */
export function matchesSearch(id: string, e: Partial<EventRow>): boolean {
  const p = new URLSearchParams(id.replace(/^search:/, ''));
  const kinds = (p.get('kind') || '').split(',').filter(Boolean);
  if (kinds.length && !kinds.includes(fold(e.kind))) return false;
  if (p.get('free') === '1' && !(e.is_free === true || (e.price_min != null && Number(e.price_min) === 0))) return false;
  if (p.get('english') === '1' && !(e.event_languages || []).includes('en')) return false;
  return !!(kinds.length || p.get('free') === '1' || p.get('english') === '1');
}

/** Events in the next `days` days at followed places or sources, soonest first.
 *  Cancelled and postponed events are left out of the digest; they have their own note. */
export function weeklyEvents(follows: ReadonlySet<string>, events: readonly EventRow[], now: Date, days = 7): EventRow[] {
  const end = now.getTime() + days * 86_400_000;
  return events
    .filter(e => {
      const t = Date.parse(e.starts_at);
      return t >= now.getTime() && t < end && e.flag !== 'cancelled' && e.flag !== 'postponed' && matchesFollow(follows, e);
    })
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
}

const day = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Tallinn', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso));
const clock = (e: EventRow) => e.time || new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Tallinn', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(e.starts_at));
const link = (e: EventRow) => `${ORIGIN}/detail.html?id=${encodeURIComponent(e.id)}`;
const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const unsubscribeUrl = (token: string) => `${ORIGIN}/api/unsubscribe?t=${encodeURIComponent(token)}`;

export interface Mail { subject: string; text: string; html: string }

function build(subject: string, intro: string, events: readonly EventRow[], token: string, note?: (e: EventRow) => string): Mail {
  const byDay = new Map<string, EventRow[]>();
  for (const e of events) { const d = day(e.starts_at); byDay.set(d, [...(byDay.get(d) ?? []), e]); }
  const unsub = unsubscribeUrl(token);
  const text = [intro, '', ...[...byDay].flatMap(([d, list]) => [d, ...list.map(e =>
    `  ${clock(e)}  ${e.title}${e.venue ? `, ${e.venue}` : ''}${note ? ` (${note(e)})` : ''}\n  ${link(e)}`), '']),
    `You asked for this. Stop it with one click: ${unsub}`].join('\n');
  const html = `<div style="font:16px/1.5 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1d1a18;max-width:560px">
<p>${escHtml(intro)}</p>
${[...byDay].map(([d, list]) => `<h2 style="font-size:16px;margin:20px 0 6px">${escHtml(d)}</h2>${list.map(e =>
    `<p style="margin:0 0 10px"><strong>${escHtml(clock(e))}</strong> <a href="${escHtml(link(e))}" style="color:#c2410c">${escHtml(e.title)}</a>${e.venue ? `, ${escHtml(e.venue)}` : ''}${note ? ` <em>(${escHtml(note(e))})</em>` : ''}</p>`).join('')}`).join('')}
<p style="font-size:13px;color:#6a625b;margin-top:28px">You asked for this. <a href="${escHtml(unsub)}" style="color:#6a625b">Stop it with one click</a>.</p>
</div>`;
  return { subject, text, html };
}

/** The Thursday mail. Null when nothing matches: an empty digest is never sent. */
export function composeWeekly(events: readonly EventRow[], token: string): Mail | null {
  if (!events.length) return null;
  const n = events.length;
  return build(`${n} ${n === 1 ? 'thing' : 'things'} this week at places you follow`,
    'Coming up in the next seven days, from the venues and sources you follow.', events, token);
}

/** Cancelled or postponed events the reader saved or marked going, not yet told. */
export function composeChanges(events: readonly EventRow[], token: string): Mail | null {
  if (!events.length) return null;
  const n = events.length;
  return build(n === 1 ? `${events[0].title} has changed` : `${n} of your events have changed`,
    'The source says one of the events you saved or marked going has changed. Check the listing before you go.',
    events, token, e => (e.flag === 'cancelled' ? 'Cancelled' : 'Postponed'));
}

export interface PushMessage { title: string; body: string; url: string; tag: string }

/** What goes over the wire. Safari 18.4 and later read the `web_push: 8030` object and show it themselves,
 *  with no service worker run, which is more reliable on a phone. Every other browser, and older Safari,
 *  hands the same JSON to `sw.js`, which reads the flat title, body, url and tag beside it. */
export function pushPayload(m: PushMessage, origin = 'https://wanderalt.app') {
  return {
    web_push: 8030,
    notification: { title: m.title, body: m.body, navigate: new URL(m.url, origin).href, lang: 'en', dir: 'ltr' },
    title: m.title, body: m.body, url: m.url, tag: m.tag,
  };
}

/** A change note as a notification. Null when nothing changed. */
export function pushChanges(events: readonly EventRow[]): PushMessage | null {
  if (!events.length) return null;
  const e = events[0], what = e.flag === 'cancelled' ? 'Cancelled' : 'Postponed';
  return events.length === 1
    ? { title: `${what}: ${e.title}`, body: 'The source says this has changed. Check the listing before you go.', url: `/detail.html?id=${encodeURIComponent(e.id)}`, tag: `change-${e.id}` }
    : { title: `${events.length} of your events have changed`, body: events.slice(0, 3).map(x => x.title).join(', '), url: '/saved.html', tag: 'change-many' };
}

/** The 16:00 note: what starts today at places, sources and searches the reader follows. Null when nothing does. */
export function pushTonight(events: readonly EventRow[]): PushMessage | null {
  if (!events.length) return null;
  const e = events[0];
  return events.length === 1
    ? { title: `Tonight: ${e.title}`, body: [clock(e), e.venue].filter(Boolean).join(' · '), url: `/detail.html?id=${encodeURIComponent(e.id)}`, tag: 'tonight' }
    : { title: `${events.length} things tonight at places you follow`, body: events.slice(0, 3).map(x => `${clock(x)} ${x.title}`).join(', '), url: '/index.html', tag: 'tonight' };
}

/** Events starting between `now` and `endOfDay`, at followed places, sources or searches, not cancelled or postponed. */
export function tonightEvents(follows: ReadonlySet<string>, events: readonly EventRow[], now: Date, endOfDay: Date): EventRow[] {
  return weeklyEvents(follows, events, now, (endOfDay.getTime() - now.getTime()) / 86_400_000);
}

export interface InboxItem { kind: 'change' | 'week'; title: string; body: string; url: string; dedupe: string }

const shortDay = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Tallinn', weekday: 'short' }).format(new Date(iso));
const detailUrl = (e: EventRow) => `/detail.html?id=${encodeURIComponent(e.id)}`;

/** One inbox row per cancelled or postponed event, told once per (event, flag). */
export function inboxChanges(events: readonly EventRow[]): InboxItem[] {
  return events.filter(e => e.flag === 'cancelled' || e.flag === 'postponed').map(e => ({
    kind: 'change' as const,
    title: `${e.flag === 'cancelled' ? 'Cancelled' : 'Postponed'}: ${e.title}`.slice(0, 200),
    body: [`${shortDay(e.starts_at)} ${clock(e)}`, e.venue].filter(Boolean).join(', ') + '. The source says this has changed. Check the listing before you go.',
    url: detailUrl(e),
    dedupe: `change:${e.id}:${e.flag}`,
  }));
}

/** Monday-based week number counted from the epoch, so one row a week however often the job runs. */
export const weekKey = (now: Date) => Math.floor((now.getTime() / 86_400_000 + 3) / 7);

/** The weekly row: what is on in the next seven days at followed places. Null when nothing is. */
export function inboxWeek(events: readonly EventRow[], now: Date): InboxItem | null {
  if (!events.length) return null;
  const n = events.length;
  const lines = events.slice(0, 5).map(e => `${shortDay(e.starts_at)} ${clock(e)} ${e.title}${e.venue ? `, ${e.venue}` : ''}`);
  if (n > 5) lines.push(`and ${n - 5} more`);
  return {
    kind: 'week',
    title: `${n} ${n === 1 ? 'thing' : 'things'} this week at places you follow`,
    body: lines.join('\n').slice(0, 600),
    url: '/discover.html',
    dedupe: `week:${weekKey(now)}`,
  };
}
