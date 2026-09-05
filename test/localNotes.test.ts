// Exercise the extracted schema and actual Notes CRUD against real Postgres.
// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getDatabase, initializeDatabase } from '../src/lib/local/database';
import { MIGRATIONS } from '../src/lib/local/migrations';
import { supabase } from '../src/lib/supabase';
import {
  createBoardWithTile, createCard, getOrCreateRootBoard, listCards,
  listTrash, restoreTrash, softDeleteCard, updateCard,
} from '../src/lib/notes';

beforeAll(async () => { await getDatabase(); }, 120_000);
afterAll(async () => { await (await getDatabase()).close(); });

describe('standalone Notes storage', () => {
  it('initializes only Notes tables and safely repeats migrations', async () => {
    const pg = await getDatabase();
    await initializeDatabase(pg);
    const tables = await pg.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public'",
    );
    expect(tables.rows.map(row => row.table_name).sort()).toEqual([
      'local_files', 'local_migrations', 'notes_arrows', 'notes_boards', 'notes_cards', 'notes_trash',
    ]);
    const ledger = await pg.query('select name from local_migrations');
    expect(ledger.rows).toHaveLength(MIGRATIONS.length);
  });

  it('creates one empty Home board, including concurrent startup calls', async () => {
    const roots = await Promise.all([getOrCreateRootBoard(), getOrCreateRootBoard()]);
    expect(roots[0].id).toBe(roots[1].id);
    expect(roots[0].name).toBe('Home');
    expect(await listCards(roots[0].id)).toEqual([]);
  });

  it('saves numeric geometry, rich text, nested boards, and restores trash', async () => {
    const root = await getOrCreateRootBoard();
    const { board, tile } = await createBoardWithTile({ parent_board_id: root.id, name: 'Ideas', x: 20, y: 40 });
    expect(tile.board_ref).toBe(board.id);
    const card = await createCard({ board_id: board.id, type: 'note', x: 240, y: 160, payload: { body: '<p>Hello</p>' } });
    expect(card.x).toBe(240);
    await updateCard(card.id, { x: card.x + 35, payload: { body: '<p>Saved note</p>' } });
    const [saved] = await listCards(board.id);
    expect(saved.x).toBe(275);
    expect(saved.payload).toEqual({ body: '<p>Saved note</p>' });
    const trashId = await softDeleteCard(saved);
    expect(await listCards(board.id)).toEqual([]);
    const entry = (await listTrash()).find(row => row.id === trashId)!;
    expect(entry).toBeDefined();
    await restoreTrash(entry);
    expect((await listCards(board.id))[0].payload).toEqual(saved.payload);
    expect(await listTrash()).toEqual([]);
  });

  it('stores attachment bytes and retrieves a usable object URL', async () => {
    const storage = supabase.storage.from('notes-media');
    const upload = await storage.upload('test/hello.txt', new Uint8Array([72, 105]), { contentType: 'text/plain' });
    expect(upload.error).toBeNull();
    const result = await storage.createSignedUrl('test/hello.txt', 60);
    expect(result.error).toBeNull();
    expect(await (await fetch(result.data!.signedUrl)).text()).toBe('Hi');
    expect((await storage.remove(['test/hello.txt'])).error).toBeNull();
  });
});
