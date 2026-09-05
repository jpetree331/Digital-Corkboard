// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createHandler } from '../server/handler';
import { compileQuery } from '../server/queries';
import { authenticated, sessionToken } from '../server/auth';
import { CHUNK_BYTES, WORKSPACE_ID, type Query } from '../shared/protocol';
import type { Database } from '../server/database';
const pg = new PGlite();
const db: Database = { query: async (text, params) => (await pg.query(text, params)).rows };
const handle = createHandler(() => db);
const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
let session = '';
const headers = () => ({ 'Content-Type': 'application/json', 'X-Corkboard-Request': '1', Cookie: session });
async function call(action: string, body?: unknown, extraHeaders = {}) {
  return handle(new Request(`https://board.example/api/corkboard?action=${action}`, {
    method: body === undefined ? 'GET' : 'POST', headers: { ...headers(), ...extraHeaders },
    body: body === undefined ? undefined : JSON.stringify(body),
  }));
}
function query(table: string, values: Partial<Query> = {}): Query {
  return { table, action: 'select', columns: '*', filters: [], orders: [], rows: true, ...values };
}
async function data(body: Query) {
  const response = await call('query', body);
  expect(response.status).toBe(200);
  return (await response.json()).data;
}
beforeAll(async () => {
  vi.stubEnv('BOARD_PASSWORD', 'testing-a-private-workspace-password');
  await pg.query(schema); await pg.query(schema); // Same prepared-query protocol as the Vercel editor.
}, 120_000);
afterAll(async () => { await pg.close(); vi.unstubAllEnvs(); });

describe('password and API boundaries', () => {
  it('denies board and attachment operations without a session', async () => {
    expect((await call('session')).status).toBe(200);
    expect((await (await call('session')).json()).authenticated).toBe(false);
    expect((await call('query', query('notes_boards'))).status).toBe(401);
    expect((await call('media', { action: 'read', path: 'anything' })).status).toBe(401);
  });
  it('fails closed with missing configuration', async () => {
    vi.stubEnv('BOARD_PASSWORD', '');
    expect((await call('session')).status).toBe(503);
    vi.stubEnv('BOARD_PASSWORD', 'testing-a-private-workspace-password');
  });
  it('rejects cross-origin requests and incorrect passwords', async () => {
    expect((await call('login', { password: 'wrong' }, { Origin: 'https://attacker.example' })).status).toBe(403);
    expect((await call('login', { password: 'wrong' }, { 'X-Corkboard-Request': '' })).status).toBe(403);
    expect((await call('login', { password: 'wrong' })).status).toBe(401);
  });
  it('unlocks using a Secure HttpOnly SameSite cookie', async () => {
    const response = await call('login', { password: process.env.BOARD_PASSWORD });
    expect(response.status).toBe(200);
    const cookie = response.headers.get('set-cookie')!;
    expect(cookie).toContain('HttpOnly'); expect(cookie).toContain('Secure'); expect(cookie).toContain('SameSite=Strict');
    session = cookie.split(';')[0];
    expect((await (await call('session')).json()).authenticated).toBe(true);
  });
  it('rejects forged, expired and password-rotated sessions', () => {
    const req = (token: string) => new Request('https://board.example', { headers: { cookie: `corkboard_session=${token}` } });
    const token = sessionToken();
    expect(authenticated(req(token))).toBe(true);
    expect(authenticated(req(token.slice(0, -1) + (token.endsWith('0') ? '1' : '0')))).toBe(false);
    expect(authenticated(req(sessionToken(Date.now() - 8 * 86400_000)))).toBe(false);
    vi.stubEnv('BOARD_PASSWORD', 'another-long-workspace-password');
    expect(authenticated(req(token))).toBe(false);
    vi.stubEnv('BOARD_PASSWORD', 'testing-a-private-workspace-password');
  });
  it('rate-limits password guessing using database-backed counters', async () => {
    for (let i = 0; i < 10; i++) expect((await call('login', { password: 'wrong' }, { 'X-Forwarded-For': '192.0.2.10' })).status).toBe(401);
    expect((await call('login', { password: 'wrong' }, { 'X-Forwarded-For': '192.0.2.10' })).status).toBe(429);
  });
  it('does not permit arbitrary SQL tables, columns, or unfiltered deletes', () => {
    expect(() => compileQuery(query('corkboard_login_attempts'))).toThrow();
    expect(() => compileQuery(query('notes_boards', { columns: 'id; drop table notes_boards' }))).toThrow();
    expect(() => compileQuery(query('notes_boards', { action: 'delete' }))).toThrow();
    expect(() => compileQuery(query('notes_boards', { action: 'update', values: { user_id: 'forged' }, filters: [{ col: 'id', value: 'x' }] }))).toThrow();
    const compiled = compileQuery(query('notes_boards', { filters: [{ col: 'name', value: "'; drop table notes_boards; --" }] }));
    expect(compiled.text).not.toContain('drop table');
    expect(compiled.params).toContain("'; drop table notes_boards; --");
  });
});

describe('actual Notes CRUD through the authenticated API', () => {
  it('preserves the editor data API, concurrent Home creation, geometry and trash restore', async () => {
    // Exercise the real browser data module through the handler, without a network database.
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => handle(new Request(`https://board.example${url}`, {
      ...init, headers: { ...(init.headers as Record<string,string>), Cookie: session },
    })));
    try {
      const notes = await import('../src/lib/notes');
      const roots = await Promise.all([notes.getOrCreateRootBoard(), notes.getOrCreateRootBoard()]);
      expect(roots[0].id).toBe(roots[1].id);
      const { board, tile } = await notes.createBoardWithTile({ parent_board_id: roots[0].id, name: 'Ideas', x: 20, y: 30 });
      expect(tile.board_ref).toBe(board.id);
      const card = await notes.createCard({ board_id: board.id, type: 'note', x: 240, y: 160, payload: { body: '<p>Hello Neon</p>' } });
      expect(card.x).toBe(240);
      await notes.updateCard(card.id, { x: 275, payload: { body: '<p>Saved remotely</p>' } });
      const [saved] = await notes.listCards(board.id);
      expect(saved.x).toBe(275);
      const trashId = await notes.softDeleteCard(saved);
      expect(await notes.listCards(board.id)).toEqual([]);
      await notes.restoreTrash((await notes.listTrash()).find(row => row.id === trashId)!);
      expect((await notes.listCards(board.id))[0].payload).toEqual(saved.payload);
      expect(await notes.listTrash()).toEqual([]);
    } finally { vi.unstubAllGlobals(); }
  });
  it('reruns the single-statement setup without changing saved cards', async () => {
    const before = await pg.query('select * from notes_cards order by id');
    expect(before.rows.length).toBeGreaterThan(0);
    await pg.query(schema);
    const after = await pg.query('select * from notes_cards order by id');
    expect(after.rows).toEqual(before.rows);
  });
  it('overrides forged workspace ownership and excludes foreign rows', async () => {
    const [board] = await data(query('notes_boards', { action: 'insert', values: { user_id: crypto.randomUUID(), name: 'Scoped' } }));
    expect(board.user_id).toBe(WORKSPACE_ID);
    const foreign = crypto.randomUUID();
    await pg.query('insert into notes_boards(user_id,name) values ($1,$2)', [foreign,'Other workspace']);
    expect(await data(query('notes_boards', { filters: [{ col: 'user_id', value: foreign }] }))).toEqual([]);
  });
});

describe('chunked Neon attachments', () => {
  it('round-trips a file larger than one Vercel payload without oversized requests', async () => {
    const path = `${WORKSPACE_ID}/${crypto.randomUUID()}-file.bin`;
    const bytes = Buffer.alloc(5 * 1024 * 1024 + 13, 123);
    const op = async (body: unknown) => { const res = await call('media', body); expect(res.status).toBe(200); return (await res.json()).data; };
    await op({ action:'begin', path, size:bytes.length, mime:'application/octet-stream' });
    expect((await call('media', { action:'complete', path })).status).toBe(400);
    expect((await call('media', { action:'read', path })).status).toBe(404);
    for (let part = 0; part < Math.ceil(bytes.length / CHUNK_BYTES); part++) {
      await op({ action:'chunk', path, part, base64: bytes.subarray(part*CHUNK_BYTES,(part+1)*CHUNK_BYTES).toString('base64') });
    }
    await op({ action:'complete', path });
    const meta = await op({ action:'read', path });
    expect(meta.size).toBe(bytes.length);
    const chunks: Buffer[] = [];
    for (let part=0; part<meta.chunks; part++) chunks.push(Buffer.from((await op({ action:'read-chunk',path,part })).base64,'base64'));
    expect(Buffer.concat(chunks).equals(bytes)).toBe(true);
    await op({ action:'remove', paths:[path] });
    expect((await call('media',{action:'read',path})).status).toBe(404);
  });
  it('rejects oversized files, foreign paths, and malformed chunk data', async () => {
    expect((await call('media',{action:'begin',path:'foreign/file',size:10,mime:'text/plain'})).status).toBe(400);
    expect((await call('media',{action:'begin',path:`${WORKSPACE_ID}/large`,size:26*1024*1024,mime:'text/plain'})).status).toBe(413);
    const path = `${WORKSPACE_ID}/invalid-chunk`;
    await call('media',{action:'begin',path,size:3,mime:'text/plain'});
    expect((await call('media',{action:'chunk',path,part:0,base64:'????'})).status).toBe(400);
    expect((await call('media',{action:'chunk',path,part:1,base64:'YWJj'})).status).toBe(400);
  });
  it('clears the browser session on logout', async () => {
    expect((await call('logout',{})).headers.get('set-cookie')).toContain('Max-Age=0');
  });
});
