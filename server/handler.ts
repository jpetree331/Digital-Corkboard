import { database, type Database } from './database.js';
import { authenticated, changePassword, checkMutation, cookie, failure, HttpError, json, limitLogin, loadAuth, readJson, sessionToken } from './auth.js';
import { runQuery } from './queries.js';
import { media } from './media.js';
import { WORKSPACE_ID } from '../shared/protocol.js';
export function createHandler(getDb: () => Database = database) {
  return async (req: Request): Promise<Response> => {
    try {
      const action = new URL(req.url).searchParams.get('action');
      if (req.method !== 'GET' && req.method !== 'POST') throw new HttpError(405, 'Method not allowed.');
      if (req.method === 'POST') checkMutation(req);
      if (req.method === 'POST' && action === 'logout') return json({ ok: true }, 200, { 'Set-Cookie': cookie('', req) });
      const db = getDb();
      const auth = await loadAuth(db);
      if (req.method === 'GET') {
        if (action === 'session') return json({ authenticated: authenticated(req, auth), userId: WORKSPACE_ID });
        throw new HttpError(405, 'Method not allowed.');
      }
      if (action === 'login') {
        const body = await readJson(req);
        if (typeof body?.password !== 'string' || body.password.length > 1000) throw new HttpError(400, 'Enter the workspace password.');
        const valid = auth.verify(body.password);
        await limitLogin(db, req, auth);
        if (!valid) throw new HttpError(401, 'Incorrect password.');
        return json({ authenticated: true }, 200, { 'Set-Cookie': cookie(sessionToken(auth), req) });
      }
      if (!authenticated(req, auth)) throw new HttpError(401, 'Please unlock your workspace again.');
      const body = await readJson(req);
      if (action === 'change-password') {
        // Guessing the current password from an open session is limited like sign-in attempts.
        await limitLogin(db, req, auth);
        const next = await changePassword(db, auth, body?.current, body?.next);
        // Other devices must unlock again with the new password; this device stays open.
        return json({ ok: true }, 200, { 'Set-Cookie': cookie(sessionToken(next), req) });
      }
      if (action === 'query') return json(await runQuery(db, body));
      if (action === 'media') return json({ data: await media(db, body), error: null });
      throw new HttpError(404, 'Unknown API route.');
    } catch (error) { return failure(error); }
  };
}
