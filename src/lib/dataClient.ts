import { CHUNK_BYTES, MAX_FILE_BYTES, WORKSPACE_ID, type Query, type Result } from '../../shared/protocol';
let pending = 0;
let queuedWrites = 0;
let writeQueue: Promise<unknown> = Promise.resolve();
let unlockPromise: Promise<void> | null = null;
export function requestsPending() { return pending > 0 || queuedWrites > 0; }
function waitForUnlock() {
  if (!unlockPromise) {
    unlockPromise = new Promise<void>(resolve => {
      window.addEventListener('corkboard-unlocked', () => { unlockPromise = null; resolve(); }, { once: true });
    });
    window.dispatchEvent(new Event('corkboard-locked'));
  }
  return unlockPromise;
}
export async function request(action: string, body?: unknown, retry = true): Promise<any> {
  pending++;
  try {
    const response = await fetch(`/api/corkboard?action=${action}`, {
      method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json', 'X-Corkboard-Request': '1' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.status === 401 && retry && (action === 'query' || action === 'media')) {
      await waitForUnlock();
      return request(action, body, false);
    }
    const result = await response.json().catch(() => { throw new Error('The server returned an invalid response. Check the Vercel deployment.'); });
    if (!response.ok || result.error) throw Object.assign(new Error(result.error?.message || 'The server request failed.'), { code: result.error?.code });
    return result;
  } finally { pending--; }
}
class RemoteQuery implements PromiseLike<Result> {
  private q: Query;
  constructor(table: string) { this.q = { table, action: 'select', columns: '*', filters: [], orders: [], rows: true }; }
  select(columns = '*') { this.q.columns = columns; this.q.rows = true; return this; }
  insert(values: Query['values']) { this.q.action = 'insert'; this.q.values = values; this.q.rows = false; return this; }
  update(values: Record<string, unknown>) { this.q.action = 'update'; this.q.values = values; this.q.rows = false; return this; }
  delete() { this.q.action = 'delete'; this.q.rows = false; return this; }
  eq(col: string, value: unknown) { this.q.filters.push({ col, value }); return this; }
  or(expr: string) { this.q.or = expr; return this; }
  order(col: string, opts?: { ascending?: boolean }) { this.q.orders.push({ col, ascending: opts?.ascending !== false }); return this; }
  limit(limit: number) { this.q.limit = limit; return this; }
  single() { this.q.single = 'single'; return this; }
  maybeSingle() { this.q.single = 'maybe'; return this; }
  then<R1 = Result, R2 = never>(ok?: ((result: Result) => R1 | PromiseLike<R1>) | null, fail?: ((reason: unknown) => R2 | PromiseLike<R2>) | null): PromiseLike<R1 | R2> {
    const run = () => request('query', this.q).catch(error => ({ data: null, error }));
    if (this.q.action === 'select') return run().then(ok, fail);
    // Keep successive edits ordered even when server response times differ.
    queuedWrites++;
    const result = writeQueue.then(run).finally(() => { queuedWrites--; });
    writeQueue = result.catch(() => {});
    return result.then(ok, fail);
  }
}
const mediaRequest = async (body: unknown) => (await request('media', body)).data;
const urls = new Map<string, Promise<string>>();
export async function clearMediaCache() {
  for (const promise of urls.values()) { try { URL.revokeObjectURL(await promise); } catch { /* failed download */ } }
  urls.clear();
}
const storage = {
  async upload(path: string, file: Blob | ArrayBuffer | Uint8Array, opts?: { contentType?: string; upsert?: boolean }) {
    let started = false;
    try {
      const blob = file instanceof Blob ? file : new Blob([file as BlobPart]);
      if (blob.size > MAX_FILE_BYTES) throw new Error('Attachments can be up to 25 MB.');
      await mediaRequest({ action: 'begin', path, size: blob.size, mime: opts?.contentType || blob.type || 'application/octet-stream' });
      started = true;
      const count = Math.max(1, Math.ceil(blob.size / CHUNK_BYTES));
      for (let part = 0; part < count; part++) {
        const bytes = new Uint8Array(await blob.slice(part * CHUNK_BYTES, (part + 1) * CHUNK_BYTES).arrayBuffer());
        let binary = '';
        for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        await mediaRequest({ action: 'chunk', path, part, base64: btoa(binary) });
      }
      await mediaRequest({ action: 'complete', path });
      return { data: { path }, error: null };
    } catch (error) {
      if (started) await mediaRequest({ action: 'remove', paths: [path] }).catch(() => {});
      return { data: null, error: error as Error };
    }
  },
  async createSignedUrl(path: string, _seconds: number, opts?: { download?: string }) {
    const cacheKey = opts?.download ? path + ':download' : path;
    try {
      if (!urls.has(cacheKey)) urls.set(cacheKey, (async () => {
        const file = await mediaRequest({ action: 'read', path });
        const parts: Uint8Array[] = [];
        for (let part = 0; part < file.chunks; part++) {
          const chunk = await mediaRequest({ action: 'read-chunk', path, part });
          const text = atob(chunk.base64.replace(/\s/g, ''));
          parts.push(Uint8Array.from(text, c => c.charCodeAt(0)));
        }
        return URL.createObjectURL(new Blob(parts as BlobPart[], { type: opts?.download ? 'application/octet-stream' : file.mime }));
      })());
      return { data: { signedUrl: await urls.get(cacheKey)! }, error: null };
    } catch (error) { urls.delete(cacheKey); return { data: null, error: error as Error }; }
  },
  async remove(paths: string[]) {
    try {
      await mediaRequest({ action: 'remove', paths });
      for (const path of paths) for (const key of [path, path + ':download']) { const url = urls.get(key); if (url) URL.revokeObjectURL(await url); urls.delete(key); }
      return { data: [], error: null };
    } catch (error) { return { data: null, error: error as Error }; }
  },
};
// Fluent Notes data interface; authentication and all persistence live on the server.
export const dataClient = {
  from: (table: string) => new RemoteQuery(table),
  auth: { getUser: async () => ({ data: { user: { id: WORKSPACE_ID } }, error: null }) },
  storage: { from: (_bucket: string) => storage },
};
