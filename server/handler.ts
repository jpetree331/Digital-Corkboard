import { database, type Database } from './database';
import { authenticated, checkMutation, cookie, failure, HttpError, json, limitLogin, matchesPassword, readJson, sessionToken } from './auth';
import { runQuery } from './queries';
import { media } from './media';
import { WORKSPACE_ID } from '../shared/protocol';
export function createHandler(getDb: () => Database = database) {
  return async (req: Request): Promise<Response> => {
    try {
      const action = new URL(req.url).searchParams.get('action');
      if (req.method === 'GET' && action === 'session') return json({ authenticated: authenticated(req), userId: WORKSPACE_ID });
      if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed.');
      checkMutation(req);
      if (action === 'logout') return json({ ok: true }, 200, { 'Set-Cookie': cookie('', req) });
      if (action === 'login') {
        const body = await readJson(req);
        if (typeof body?.password !== 'string' || body.password.length > 1000) throw new HttpError(400, 'Enter the workspace password.');
        // Validate configuration before opening a database connection.
        const valid = matchesPassword(body.password);
        await limitLogin(getDb(), req);
        if (!valid) throw new HttpError(401, 'Incorrect password.');
        return json({ authenticated: true }, 200, { 'Set-Cookie': cookie(sessionToken(), req) });
      }
      if (!authenticated(req)) throw new HttpError(401, 'Please unlock your workspace again.');
      const body = await readJson(req);
      if (action === 'query') return json(await runQuery(getDb(), body));
      if (action === 'media') return json({ data: await media(getDb(), body), error: null });
      throw new HttpError(404, 'Unknown API route.');
    } catch (error) { return failure(error); }
  };
}
