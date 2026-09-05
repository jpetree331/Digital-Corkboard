import { loadEnv, type Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHandler } from './handler';
export function apiPlugin(): Plugin {
  const handler = createHandler();
  const middleware = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (req.url?.split('?')[0] !== '/api/corkboard') return next();
    try {
      const chunks: Buffer[] = []; let length = 0;
      for await (const chunk of req) {
        length += Buffer.byteLength(chunk);
        if (length > 2_000_000) { res.statusCode = 413; res.end('Request too large'); return; }
        chunks.push(Buffer.from(chunk));
      }
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) if (value) headers.set(key, Array.isArray(value) ? value.join(',') : value);
      const request = new Request(`http://${req.headers.host}${req.url}`, {
        method: req.method, headers,
        body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
      });
      const response = await handler(request);
      res.statusCode = response.status;
      response.headers.forEach((value, key) => res.setHeader(key, value));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch { res.statusCode = 500; res.end('API request failed'); }
  };
  return {
    name: 'corkboard-api',
    configResolved(config) {
      const env = loadEnv(config.mode, process.cwd(), '');
      for (const key of ['DATABASE_URL','POSTGRES_URL','BOARD_PASSWORD']) if (!process.env[key] && env[key]) process.env[key] = env[key];
    },
    configureServer(server) { server.middlewares.use(middleware); },
    configurePreviewServer(server) { server.middlewares.use(middleware); },
  };
}
