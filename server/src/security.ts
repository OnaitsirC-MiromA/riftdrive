import type { FastifyInstance } from 'fastify';

// App local: uma página maliciosa aberta no navegador poderia disparar fetch
// para http://127.0.0.1:7799/api/... (CSRF / DNS rebinding). Quem faz isso manda
// Origin (ou Sec-Fetch-Site) de outro site; a própria SPA, same-origin, manda
// Origin local ou nenhum. Vale só para /api — a casca HTML pode ser aberta de
// qualquer lugar.
const LOCAL_ORIGIN = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/;

export function registerLocalOriginGuard(app: FastifyInstance): void {
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api')) return;
    const site = req.headers['sec-fetch-site'];
    if (site && site !== 'same-origin' && site !== 'none') return reply.code(403).send({ error: 'forbidden_origin' });
    const origin = req.headers.origin;
    if (origin && !LOCAL_ORIGIN.test(origin)) return reply.code(403).send({ error: 'forbidden_origin' });
  });
}
