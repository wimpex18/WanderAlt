// "Easy to join alone": a listing whose format is built for people who turn up on their
// own to mix: a quiz, a game night, a craft club, an open stage, a drawing night, a
// language night, a night for meeting people. It is our reading of the title, not the
// organiser's word, and the site says so. Titles and venue names only, never the
// description, and anything adult-themed or built for a group of friends or a couple is left
// out however it is worded.
// supabase/migrations/20261003121000_easy_alone_tag.sql applies the same two patterns to
// events already stored; keep them in step.
export const EASY_ALONE_TAG = 'easy-alone';

export const FORMAT = /(quiz|viktoriin|trivia|chess|board ?games?|lauam[aä]ng|open[- ]mic|knitting|crochet|yarn society|drink (and|&) draw|sip (and|&) paint|drawing night|language (exchange|caf[eé])|keelekohvik|make friends|friend[- ]making|friends meeting|speed friending|book club|raamatuklubi|film club)/i;
export const NOT_FOR_SOLO = /(consent|kink|erotic|fetish|bdsm|tantra|sex|nude|naked|orgasm|18\+|adult|dating|sauna|swinger|burlesque|girls.{0,3} night|date night|couples|hen party|bachelor|team[- ]?building)/i;

/** The tags with `easy-alone` first when the title or venue says the format, else unchanged. */
export function withEasyAlone(tags: string[], title: string, venue?: string | null): string[] {
  const words = `${title} ${venue ?? ''}`;
  if (tags.includes(EASY_ALONE_TAG) || !FORMAT.test(words) || NOT_FOR_SOLO.test(words)) return tags;
  return [EASY_ALONE_TAG, ...tags].slice(0, 5);
}
