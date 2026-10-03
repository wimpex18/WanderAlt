// A weekly logical backup of what the database holds that cannot be collected again: the picked
// places and their notes, manual hours, reviews, fact flags, merge logs (the undo records), and
// everything people made (follows, saved lists, going, notifications, push subscriptions, digest
// settings, problem reports). The free Supabase plan keeps no backups of its own.
//
// One gzip JSON file per run goes to the private Storage bucket `backups` (never the public
// repository: it holds personal data), the newest 12 are kept. Left out on purpose: raw_items and
// going_counts (collected or derived again) and social_tokens (a secret). Login accounts live in
// auth.users, which the REST API does not expose; the owner's single account is re-created by
// signing in again.
//
//   node pipeline/backup.ts                          back up now, prune to the newest 12
//   node pipeline/backup.ts --list                   the files in the bucket
//   node pipeline/backup.ts --restore <file> --table places [--yes]
//                                                    show, or with --yes upsert, one table's rows
//                                                    from a file; it adds and updates, never deletes
import { gzipSync, gunzipSync } from 'node:zlib';
import { Db, chunks } from './db.ts';

export const BUCKET = 'backups';
export const KEEP = 12;
/** Table → the columns that make a row unique (also its stable read order). */
export const BACKUP_TABLES: Record<string, string[]> = {
  places: ['id'], place_redirects: ['id'], place_match_reviews: ['place_a', 'place_b'], place_merge_log: ['id'], place_fact_flags: ['id'], place_liveness_log: ['id'],
  events: ['id'], event_sources: ['event_id', 'source_id'], event_redirects: ['id'], event_merge_log: ['id'],
  sources: ['id'], routes: ['id'], pipeline_runs: ['id'],
  bookmarks: ['user_id', 'pick_id'], follows: ['user_id', 'follow_id'], going: ['user_id', 'pick_id'], notifications: ['id'], change_notices: ['user_id', 'pick_id', 'flag'],
  saved_lists: ['user_id', 'id'], saved_list_items: ['user_id', 'list_id', 'pick_id'], push_subscriptions: ['user_id', 'endpoint'], digest_prefs: ['user_id'], problem_reports: ['id'],
};

export interface BackupFile { version: 1; taken_at: string; counts: Record<string, number>; tables: Record<string, unknown[]> }

/** The file name for a moment: sortable, one per run. */
export const backupName = (at: Date) => `wanderalt-${at.toISOString().replace(/[:T]/g, '-').slice(0, 16)}.json.gz`;

/** Names to delete so that only the newest `keep` remain. */
export function toPrune(names: string[], keep = KEEP): string[] {
  return names.filter(n => /^wanderalt-.*\.json\.gz$/.test(n)).sort().slice(0, Math.max(0, names.filter(n => /^wanderalt-.*\.json\.gz$/.test(n)).length - keep));
}

export async function readAll(db: Pick<Db, 'all'>, tables = BACKUP_TABLES): Promise<BackupFile> {
  const out: Record<string, unknown[]> = {}, counts: Record<string, number> = {};
  for (const [table, pk] of Object.entries(tables)) {
    out[table] = await db.all(`${table}?select=*&order=${pk.join(',')}`);
    counts[table] = out[table].length;
  }
  return { version: 1, taken_at: new Date().toISOString(), counts, tables: out };
}

export const pack = (f: BackupFile) => new Uint8Array(gzipSync(Buffer.from(JSON.stringify(f))));
export const unpack = (bytes: Uint8Array): BackupFile => {
  const f = JSON.parse(gunzipSync(Buffer.from(bytes)).toString('utf8')) as BackupFile;
  if (f?.version !== 1 || typeof f.tables !== 'object') throw new Error('Not a WanderAlt backup file');
  return f;
};

export async function restoreTable(db: Pick<Db, 'upsert'>, file: BackupFile, table: string, apply: boolean): Promise<number> {
  const pk = BACKUP_TABLES[table];
  if (!pk) throw new Error(`Unknown table "${table}"; known: ${Object.keys(BACKUP_TABLES).join(', ')}`);
  const rows = file.tables[table] ?? [];
  if (apply) for (const part of chunks(rows, 200)) await db.upsert(table, part, pk.join(','));
  return rows.length;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const value = (k: string) => { const i = args.indexOf(k); return i < 0 ? undefined : args[i + 1]; };
  const db = new Db();
  try {
    if (args.includes('--list')) {
      for (const n of await db.storageList(BUCKET)) console.log(n);
    } else if (value('--restore')) {
      const file = unpack(await db.storageDownload(BUCKET, value('--restore')!));
      const table = value('--table');
      if (!table) throw new Error('Restore needs --table');
      const n = await restoreTable(db, file, table, args.includes('--yes'));
      console.log(`[backup] ${args.includes('--yes') ? 'restored' : 'would restore'} ${n} rows of ${table} from ${value('--restore')} (taken ${file.taken_at})${args.includes('--yes') ? '' : '; add --yes to write'}`);
    } else {
      const file = await readAll(db);
      const name = backupName(new Date());
      await db.storageUpload(BUCKET, name, pack(file), 'application/gzip');
      const total = Object.values(file.counts).reduce((a, b) => a + b, 0);
      console.log(`[backup] ${name}: ${total} rows in ${Object.keys(file.counts).length} tables`);
      const stale = toPrune(await db.storageList(BUCKET));
      await db.storageDelete(BUCKET, stale);
      if (stale.length) console.log(`[backup] removed ${stale.length} older file(s)`);
    }
  } catch (e) { console.error('[backup]', (e as Error).message); process.exitCode = 1; }
}
