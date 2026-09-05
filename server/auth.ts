import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Database } from './database';
export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function password(): string {
  const value = process.env.BOARD_PASSWORD;
  if (!value || value.length < 16) throw new HttpError(503, 'Set BOARD_PASSWORD to at least 16 characters in the server environment.');
  return value;
}
const digest = (value: string) => createHash('sha256').update(value).digest();
export function matchesPassword(value: string): boolean {
  return timingSafeEqual(digest(value), digest(password()));
}
function signature(value: string): string {
  return createHmac('sha256', password()).update(`corkboard-session:${value}`).digest('hex');
}
export function sessionToken(now = Date.now()): string {
  const body = `${now + 7 * 86400_000}.${randomBytes(24).toString('hex')}`;
  return `${body}.${signature(body)}`;
}
export function authenticated(req: Request, now = Date.now()): boolean {
  password(); // Configuration failures never grant access.
  const token = req.headers.get('cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith('corkboard_session='))?.slice(18);
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 3 || !/^\d{13}$/.test(parts[0]) || !/^[a-f0-9]{48}$/.test(parts[1]) || !/^[a-f0-9]{64}$/.test(parts[2])) return false;
  if (Number(parts[0]) <= now || Number(parts[0]) > now + 7 * 86400_000) return false;
  return timingSafeEqual(Buffer.from(parts[2], 'hex'), Buffer.from(signature(`${parts[0]}.${parts[1]}`), 'hex'));
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
export async function limitLogin(db: Database, req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local';
  const key = createHmac('sha256', password()).update(ip).digest('hex');
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
