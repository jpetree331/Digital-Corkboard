import { WORKSPACE_ID, type Query, type Result } from '../shared/protocol';
import type { Database } from './database';
import { HttpError } from './auth';
const common = ['id','user_id','created_at','updated_at'];
const columns: Record<string, string[]> = {
  notes_boards: [...common,'parent_id','name','tile_x','tile_y','tile_color','tile_icon','is_root','starred'],
  notes_cards: [...common,'board_id','type','x','y','w','h','z','color','payload','board_ref','parent_column','column_index'],
  notes_arrows: [...common,'board_id','from_card','to_card','label','style'],
  notes_trash: ['id','user_id','kind','origin_board','origin_card','snapshot','deleted_at'],
};
const jsonColumns = new Set(['payload','style','snapshot']);
const bad = () => new HttpError(400, 'Invalid board operation.');
export function compileQuery(input: unknown): { text: string; params: unknown[]; request: Query } {
  if (!input || typeof input !== 'object') throw bad();
  const q = input as Query;
  if (!Object.hasOwn(columns, q.table) || !['select','insert','update','delete'].includes(q.action)) throw bad();
  if (!Array.isArray(q.filters) || q.filters.length > 20 || !Array.isArray(q.orders) || q.orders.length > 10) throw bad();
  if (typeof q.columns !== 'string' || q.columns.length > 400 || typeof q.rows !== 'boolean') throw bad();
  if (q.single !== undefined && q.single !== 'single' && q.single !== 'maybe') throw bad();
  const allowed = columns[q.table];
  const col = (key: string) => { if (!allowed.includes(key)) throw bad(); return `"${key}"`; };
  const expr = (key: string) => {
    if (key === 'payload->>storagePath') return `"payload"->>'storagePath'`;
    if (key === 'payload->>thumbPath') return `"payload"->>'thumbPath'`;
    return col(key);
  };
  const params: unknown[] = [];
  const value = (key: string, v: unknown) => {
    params.push(jsonColumns.has(key) ? JSON.stringify(v) : v);
    return `$${params.length}${jsonColumns.has(key) ? '::jsonb' : ''}`;
  };
  const selected = q.columns === '*' ? '*' : q.columns.split(',').map(s => col(s.trim())).join(',');
  const table = `"${q.table}"`;
  let text: string;
  if (q.action === 'insert') {
    const rows = Array.isArray(q.values) ? q.values : [q.values];
    if (!rows.length || rows.length > 500 || rows.some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw bad();
    const keys = Array.from(new Set([...Object.keys(rows[0]!), 'user_id']));
    keys.forEach(col);
    for (const row of rows) if (Object.keys(row!).some(key => !keys.includes(key))) throw bad();
    const tuples = rows.map(row => '(' + keys.map(key => value(key, key === 'user_id' ? WORKSPACE_ID : row![key] ?? null)).join(',') + ')');
    text = `insert into ${table} (${keys.map(col).join(',')}) values ${tuples.join(',')} returning ${selected}`;
  } else {
    if (q.action === 'select') text = `select ${selected} from ${table}`;
    else if (q.action === 'delete') text = `delete from ${table}`;
    else {
      if (!q.values || Array.isArray(q.values) || typeof q.values !== 'object') throw bad();
      const keys = Object.keys(q.values);
      if (!keys.length || keys.some(k => ['id','user_id','created_at','updated_at'].includes(k))) throw bad();
      const sets = keys.map(k => `${col(k)} = ${value(k, (q.values as Record<string, unknown>)[k])}`);
      if (allowed.includes('updated_at')) sets.push('updated_at = now()');
      text = `update ${table} set ${sets.join(',')}`;
    }
    // Single private workspace: scope even requests with forged user_id filters.
    const predicates = [`user_id = ${value('user_id', WORKSPACE_ID)}`];
    for (const filter of q.filters) {
      if (!filter || typeof filter.col !== 'string') throw bad();
      predicates.push(filter.value === null ? `${expr(filter.col)} is null` : `${expr(filter.col)} = ${value(filter.col, filter.value)}`);
    }
    if (q.or !== undefined) {
      if (typeof q.or !== 'string' || q.or.length > 2000) throw bad();
      const clauses = q.or.split(',').map(part => {
        const match = part.match(/^(payload->>(?:storagePath|thumbPath))\.eq\.(.+)$/);
        if (!match || q.table !== 'notes_cards') throw bad();
        return `${expr(match[1])} = ${value(match[1], match[2])}`;
      });
      predicates.push(`(${clauses.join(' or ')})`);
    }
    if (q.action !== 'select' && !q.filters.some(f => ['id','board_ref','board_id'].includes(f.col) && typeof f.value === 'string')) throw bad();
    text += ` where ${predicates.join(' and ')}`;
    if (q.action === 'select') {
      if (q.orders.length) text += ' order by ' + q.orders.map(o => `${col(o.col)} ${o.ascending === false ? 'desc' : 'asc'}`).join(',');
      if (q.limit !== undefined) {
        if (!Number.isInteger(q.limit) || q.limit < 0 || q.limit > 10000) throw bad();
        text += ` limit ${q.limit}`;
      }
    } else text += ` returning ${selected}`;
  }
  return { text, params, request: q };
}
export async function runQuery(db: Database, input: unknown): Promise<Result> {
  const { text, params, request } = compileQuery(input);
  const rows = await db.query(text, params);
  if (request.single) {
    if (rows.length === 1) return { data: rows[0], error: null };
    if (!rows.length && request.single === 'maybe') return { data: null, error: null };
    return { data: null, error: { message: `Expected one item, received ${rows.length}.`, code: 'PGRST116' } };
  }
  const result = { data: request.rows ? rows : null, error: null };
  if (Buffer.byteLength(JSON.stringify(result)) > 4_000_000) throw new HttpError(413, 'This board is too large to load in one request.');
  return result;
}
