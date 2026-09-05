import { CHUNK_BYTES, MAX_FILE_BYTES, WORKSPACE_ID } from '../shared/protocol.js';
import type { Database } from './database.js';
import { HttpError } from './auth.js';
export async function media(db: Database, body: any) {
  if (!body || typeof body !== 'object') throw new HttpError(400, 'Invalid attachment request.');
  const pathValid = (path: unknown): path is string => typeof path === 'string' && path.startsWith(WORKSPACE_ID + '/') && /^[a-zA-Z0-9/._-]+$/.test(path) && path.length < 250;
  if (body.action === 'remove') {
    if (!Array.isArray(body.paths) || body.paths.length > 500 || !body.paths.every(pathValid)) throw new HttpError(400, 'Invalid attachment paths.');
    await db.query('delete from corkboard_files where path = any($1::text[])', [body.paths]);
    return [];
  }
  if (!pathValid(body.path)) throw new HttpError(400, 'Invalid attachment path.');
  const path = body.path;
  if (body.action === 'begin') {
    if (!Number.isInteger(body.size) || body.size < 0 || body.size > MAX_FILE_BYTES) throw new HttpError(413, 'Attachments can be up to 25 MB.');
    if (typeof body.mime !== 'string' || body.mime.length > 150 || /[\r\n]/.test(body.mime)) throw new HttpError(400, 'Invalid file type.');
    await db.query("delete from corkboard_files where not complete and created_at < now() - interval '1 day'");
    await db.query('insert into corkboard_files(path,mime,size,chunks) values ($1,$2,$3,$4)', [path, body.mime, body.size, Math.max(1, Math.ceil(body.size / CHUNK_BYTES))]);
    return { path };
  }
  const [file] = await db.query('select mime,size,chunks,complete from corkboard_files where path = $1', [path]);
  if (!file) throw new HttpError(404, 'Attachment not found.');
  if (body.action === 'chunk') {
    if (file.complete || !Number.isInteger(body.part) || body.part < 0 || body.part >= file.chunks || typeof body.base64 !== 'string' || body.base64.length > Math.ceil(CHUNK_BYTES / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(body.base64)) throw new HttpError(400, 'Invalid attachment chunk.');
    const bytes = Buffer.from(body.base64, 'base64');
    const expected = body.part === file.chunks - 1 ? file.size - body.part * CHUNK_BYTES : CHUNK_BYTES;
    if (bytes.length !== expected) throw new HttpError(400, 'Incomplete attachment chunk.');
    await db.query(`insert into corkboard_file_chunks(path,part,bytes) values ($1,$2,decode($3,'base64'))
      on conflict(path,part) do update set bytes = excluded.bytes`, [path,body.part,body.base64]);
    return { path };
  }
  if (body.action === 'complete') {
    const [updated] = await db.query(`update corkboard_files set complete = true where path = $1
      and chunks = (select count(*) from corkboard_file_chunks where path = $1)
      and size = (select coalesce(sum(octet_length(bytes)),0) from corkboard_file_chunks where path = $1)
      returning path`, [path]);
    if (!updated) throw new HttpError(400, 'Upload is incomplete. Please try again.');
    return updated;
  }
  if (!file.complete) throw new HttpError(404, 'Attachment upload is incomplete.');
  if (body.action === 'read') return file;
  if (body.action === 'read-chunk') {
    if (!Number.isInteger(body.part) || body.part < 0 || body.part >= file.chunks) throw new HttpError(400, 'Invalid chunk index.');
    const [chunk] = await db.query("select encode(bytes,'base64') as base64 from corkboard_file_chunks where path = $1 and part = $2", [path,body.part]);
    if (!chunk) throw new HttpError(404, 'Attachment chunk not found.');
    return chunk;
  }
  throw new HttpError(400, 'Unknown attachment operation.');
}
