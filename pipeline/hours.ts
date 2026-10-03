// Opening hours, read with the site's own reader. hours.js is the one place
// that understands OpenStreetMap's opening_hours syntax, so the pipeline loads
// it instead of keeping a second copy that could disagree about "open".

import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

type State = { known: boolean; open: boolean | null };
type World = { window: { WA: { Hours?: { state: (raw: string, at?: Date) => State } } } };

const world = createContext({ window: { WA: {} }, Intl, Date, console });
runInContext(readFileSync(new URL('../hours.js', import.meta.url), 'utf8'), world);
const hours = (world as unknown as World).window.WA.Hours!;

/** Is a place open at this instant: 'open', 'shut', or 'unknown' when no hours are filed. */
export function hoursAt(raw: string | null | undefined, at: Date): 'open' | 'shut' | 'unknown' {
  if (!raw) return 'unknown';
  const s = hours.state(raw, at);
  return !s.known ? 'unknown' : s.open ? 'open' : 'shut';
}
