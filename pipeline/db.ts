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
        // A legacy service_role key is a JWT and goes in both headers; a new
        // secret key (sb_secret_…) is not a JWT and goes in apikey only.
        ...(this.key.startsWith('eyJ') ? { authorization: `Bearer ${this.key}` } : {}),
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
  /** PostgREST caps every response, even when limit=5000 was requested. */
  async all<T>(path: string): Promise<T[]> {
    if (!/[?&]order=/.test(path)) throw new Error('Paged reads need a stable order');
    const out: T[] = [];
    for (let offset = 0; offset < 100_000; offset += 500) {
      const page = await this.select<T>(`${path}&limit=500&offset=${offset}`);
      out.push(...page);
      if (page.length < 500) return out;
    }
    throw new Error('Paged read exceeded 100000 rows');
  }
  insert(table: string, rows: unknown[]) { return rows.length ? this.req('POST', table, rows, 'return=minimal') : null; }
  /** Insert rows whose conflict key already exists as nothing: a reviewed row keeps its state. */
  insertIgnore(table: string, rows: unknown[], onConflict: string) {
    return rows.length ? this.req('POST', `${table}?on_conflict=${onConflict}`, rows, 'resolution=ignore-duplicates,return=minimal') : null;
  }
  upsert(table: string, rows: unknown[], onConflict: string) {
    return rows.length
      ? this.req('POST', `${table}?on_conflict=${onConflict}`, rows, 'resolution=merge-duplicates,return=minimal')
      : null;
  }
  /** Put a file into a public Storage bucket (service role); its public address. */
  async storageUpload(bucket: string, path: string, bytes: Uint8Array, contentType: string): Promise<string> {
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
      method: 'POST',
      headers: {
        apikey: this.key,
        ...(this.key.startsWith('eyJ') ? { authorization: `Bearer ${this.key}` } : {}),
        'content-type': contentType, 'x-upsert': 'true', 'cache-control': 'max-age=86400',
      },
      body: Buffer.from(bytes),
      signal: AbortSignal.timeout(30_000),
    });
    if (!r.ok) throw new Error(`storage upload ${path} → ${r.status} ${(await r.text()).slice(0, 200)}`);
    return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
  }
  private storageHeaders(extra: Record<string, string> = {}) {
    return { apikey: this.key, ...(this.key.startsWith('eyJ') ? { authorization: `Bearer ${this.key}` } : {}), ...extra };
  }
  /** File names in a Storage bucket under a prefix (service role; works for private buckets). */
  async storageList(bucket: string, prefix = ''): Promise<string[]> {
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${bucket}`, {
      method: 'POST', headers: this.storageHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify({ prefix, limit: 1000, sortBy: { column: 'name', order: 'asc' } }), signal: AbortSignal.timeout(30_000),
    });
    if (!r.ok) throw new Error(`storage list ${bucket} → ${r.status} ${(await r.text()).slice(0, 200)}`);
    return ((await r.json()) as { name: string }[]).map(f => f.name);
  }
  async storageDelete(bucket: string, paths: string[]): Promise<void> {
    if (!paths.length) return;
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}`, {
      method: 'DELETE', headers: this.storageHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify({ prefixes: paths }), signal: AbortSignal.timeout(30_000),
    });
    if (!r.ok) throw new Error(`storage delete ${bucket} → ${r.status} ${(await r.text()).slice(0, 200)}`);
  }
  async storageDownload(bucket: string, path: string): Promise<Uint8Array> {
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, { headers: this.storageHeaders(), signal: AbortSignal.timeout(60_000) });
    if (!r.ok) throw new Error(`storage download ${path} → ${r.status}`);
    return new Uint8Array(await r.arrayBuffer());
  }
  patch(path: string, values: unknown) { return this.req('PATCH', path, values, 'return=minimal'); }
}

/** PostgREST `in.(…)` list, quoting every value. */
export const inList = (xs: string[]) =>
  `(${xs.map(x => `"${x.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')})`;

export const chunks = <T>(xs: T[], n: number): T[][] =>
  Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
