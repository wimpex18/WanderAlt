// A small PostgREST client for the pipeline. It writes with the service-role
// key, which bypasses RLS, so it only ever runs server-side (GitHub Actions
// or a developer's shell) and never ships to a browser.

export const SUPABASE_URL = process.env.SUPABASE_URL?.trim() || 'https://aqnsmmbrspkbfcvougeh.supabase.co';

export class Db {
  private key: string;

  constructor(key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set (use --dry-run to read sources without it)');
    this.key = key;
  }

  async req<T = unknown>(method: string, path: string, body?: unknown, prefer?: string): Promise<T> {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method,
      headers: {
        apikey: this.key,
        authorization: `Bearer ${this.key}`,
        'content-type': 'application/json',
        ...(prefer ? { prefer } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await r.text();
    if (!r.ok) throw new Error(`${method} ${path.split('?')[0]} → ${r.status} ${text.slice(0, 300)}`);
    return (text ? JSON.parse(text) : null) as T;
  }

  select<T>(path: string) { return this.req<T[]>('GET', path); }
  insert(table: string, rows: unknown[]) { return rows.length ? this.req('POST', table, rows, 'return=minimal') : null; }
  upsert(table: string, rows: unknown[], onConflict: string) {
    return rows.length
      ? this.req('POST', `${table}?on_conflict=${onConflict}`, rows, 'resolution=merge-duplicates,return=minimal')
      : null;
  }
  patch(path: string, values: unknown) { return this.req('PATCH', path, values, 'return=minimal'); }
}

/** PostgREST `in.(…)` list, quoting every value. */
export const inList = (xs: string[]) =>
  `(${xs.map(x => `"${x.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')})`;

export const chunks = <T>(xs: T[], n: number): T[][] =>
  Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
