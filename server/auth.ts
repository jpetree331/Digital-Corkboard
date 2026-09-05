import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Database } from './database.js';
export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const MIN_PASSWORD_LENGTH = 16;
/** The active workspace password: either saved in Neon (chosen in the app) or the BOARD_PASSWORD bootstrap value. */
export type Auth = { source: 'database' | 'environment'; secret: string; verify: (value: string) => boolean };
export const SETTINGS_TABLE_SQL = `create table if not exists corkboard_settings (
 id integer primary key check(id = 1), password_hash text not null,
 updated_at timestamptz not null default now()
)`;
const digest = (value: string) => createHash('sha256').update(value).digest();
export function hashPassword(value: string, salt = randomBytes(16).toString('hex')): string {
  return `scrypt$${salt}$${scryptSync(value, salt, 32).toString('hex')}`;
}
function verifyHash(value: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  return timingSafeEqual(Buffer.from(hash, 'hex'), scryptSync(value, salt, 32));
}
export function environmentAuth(): Auth {
  const value = process.env.BOARD_PASSWORD;
  if (!value || value.length < MIN_PASSWORD_LENGTH) throw new HttpError(503, 'Set BOARD_PASSWORD to at least 16 characters in the server environment.');
  return { source: 'environment', secret: value, verify: candidate => timingSafeEqual(digest(candidate), digest(value)) };
}
function databaseAuth(hash: string): Auth {
  return { source: 'database', secret: hash, verify: candidate => verifyHash(candidate, hash) };
}
/** A password chosen in the app wins; otherwise fall back to BOARD_PASSWORD. A missing settings table means nothing was chosen yet. */
export async function loadAuth(db: Database): Promise<Auth> {
  let row: { password_hash?: string } | undefined;
  try { [row] = await db.query('select password_hash from corkboard_settings where id = 1'); }
  catch (error) { if ((error as { code?: string })?.code !== '42P01') throw error; }
  return row?.password_hash ? databaseAuth(row.password_hash) : environmentAuth();
}
export async function changePassword(db: Database, auth: Auth, current: unknown, next: unknown): Promise<Auth> {
  if (typeof current !== 'string' || typeof next !== 'string' || current.length > 1000 || next.length > 1000) throw new HttpError(400, 'Enter your current password and a new one.');
  if (!auth.verify(current)) throw new HttpError(401, 'Your current password is incorrect.');
  if (next.length < MIN_PASSWORD_LENGTH) throw new HttpError(400, `Choose a new password of at least ${MIN_PASSWORD_LENGTH} characters.`);
  if (next === current) throw new HttpError(400, 'Choose a password different from the current one.');
  const hash = hashPassword(next);
  await db.query(SETTINGS_TABLE_SQL);
  await db.query(`insert into corkboard_settings(id, password_hash) values (1, $1)
    on conflict(id) do update set password_hash = excluded.password_hash, updated_at = now()`, [hash]);
  return databaseAuth(hash);
}
function signature(auth: Auth, value: string): string {
  return createHmac('sha256', `corkboard:${auth.source}:${auth.secret}`).update(`corkboard-session:${value}`).digest('hex');
}
export function sessionToken(auth: Auth, now = Date.now()): string {
  const body = `${now + 7 * 86400_000}.${randomBytes(24).toString('hex')}`;
  return `${body}.${signature(auth, body)}`;
}
export function authenticated(req: Request, auth: Auth, now = Date.now()): boolean {
  const token = req.headers.get('cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith('corkboard_session='))?.slice(18);
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 3 || !/^\d{13}$/.test(parts[0]) || !/^[a-f0-9]{48}$/.test(parts[1]) || !/^[a-f0-9]{64}$/.test(parts[2])) return false;
  if (Number(parts[0]) <= now || Number(parts[0]) > now + 7 * 86400_000) return false;
  return timingSafeEqual(Buffer.from(parts[2], 'hex'), Buffer.from(signature(auth, `${parts[0]}.${parts[1]}`), 'hex'));
}
export function cookie(token: string, req: Request): string {
  const secure = process.env.VERCEL || new URL(req.url).protocol === 'https:';
  return `corkboard_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${token ? 604800 : 0}${secure ? '; Secure' : ''}`;
}
export function checkMutation(req: Request) {
  if (req.headers.get('x-corkboard-request') !== '1') throw new HttpError(403, 'Request rejected.');
  const origin = req.headers.get('origin');
  if (origin && origin !== new URL(req.url).origin) throw new HttpError(403, 'Request rejected.');
}
export async function limitLogin(db: Database, req: Request, auth: Auth) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local';
  const key = createHmac('sha256', auth.secret).update(ip).digest('hex');
  await db.query('delete from corkboard_login_attempts where expires_at < now()');
  const [row] = await db.query(`insert into corkboard_login_attempts(key, attempts, expires_at)
    values ($1, 1, now() + interval '15 minutes')
    on conflict(key) do update set attempts = corkboard_login_attempts.attempts + 1
    returning attempts`, [key]);
  if (row.attempts > 10) throw new HttpError(429, 'Too many sign-in attempts. Try again in 15 minutes.');
}
export function json(body: unknown, status = 200, headers = {}): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });
}
export function failure(error: unknown): Response {
  if (error instanceof HttpError) return json({ error: { message: error.message } }, error.status);
  const code = (error as { code?: string })?.code;
  if (code === '23505') return json({ data: null, error: { message: 'That item already exists.', code } }, 409);
  if (code === '42P01') return json({ error: { message: 'Database setup is incomplete. Run db/schema.sql in Neon.' } }, 503);
  // Do not expose SQL, connection strings, hostnames, or driver internals.
  return json({ error: { message: 'The database request failed. Check the server database configuration and try again.' } }, 503);
}
export async function readJson(req: Request): Promise<any> {
  if (!req.headers.get('content-type')?.includes('application/json')) throw new HttpError(415, 'Expected JSON.');
  if (Number(req.headers.get('content-length') || 0) > 2_000_000) throw new HttpError(413, 'This item is too large.');
  const text = await req.text();
  if (Buffer.byteLength(text) > 2_000_000) throw new HttpError(413, 'This item is too large.');
  try { return JSON.parse(text); } catch { throw new HttpError(400, 'Invalid JSON.'); }
}
