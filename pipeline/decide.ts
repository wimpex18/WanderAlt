// Settle the held listings by hand, as each pipeline run does (review-decider.ts):
//   npm run review:decide -- [--dry-run] [--audit 40] [--only ev_a,ev_b] [--eval ev_a,ev_b [--as-is]] [--out decisions.json] [--city tallinn]
// --audit also takes a second look at that many listings published on a fit score alone. --eval judges any rows
// and writes nothing: as if they were held, or with --as-is as a second look at published ones.

import { writeFileSync } from 'node:fs';
import { Db } from './db.ts';
import { read } from './run.ts';
import { usage, type Models } from './llm.ts';
import { REASONS, decideHeld, deciderModels } from './review-decider.ts';

const args = process.argv.slice(2);
const value = (k: string) => { const i = args.indexOf(k); return i < 0 ? undefined : args[i + 1]; };
const list = (k: string) => value(k)?.split(',').map(s => s.trim()).filter(Boolean);
const noModels = { ready: false, neuronBudget: 0 } as unknown as Models;

try {
  const out = await decideHeld(new Db(), value('--city') ?? 'tallinn', deciderModels(Number(value('--calls') ?? 60)), {
    dry: args.includes('--dry-run'), only: list('--only'), evaluate: list('--eval'), evaluateAsIs: args.includes('--as-is'),
    audit: value('--audit') ? Number(value('--audit')) : undefined,
    reread: (item, source) => read(item, source, noModels),
  });
  const key = (d: (typeof out)[number]) => (d.quote ? `${d.status} (${REASONS[d.reason]})` : 'waiting');
  const by = out.reduce<Record<string, number>>((a, d) => ({ ...a, [key(d)]: (a[key(d)] ?? 0) + 1 }), {});
  console.log(`[decide] ${out.length} listings: ${Object.entries(by).map(([k, n]) => `${n} ${k}`).join(', ')}`);
  if (value('--out')) writeFileSync(value('--out')!, JSON.stringify(out, null, 1));
  const c = usage.claude;
  if (c.requests) console.log(`[decide] Claude: ${c.requests} requests, ${c.input} input tokens, ${c.output} output, $${c.usd.toFixed(4)}`);
} catch (e) { console.error('[decide]', (e as Error).message); process.exitCode = 1; }
