import type { FastifyInstance } from 'fastify';
import type { EmbeddedAsset } from './bundled';

/**
 * Serve a interface a partir dos arquivos embutidos no build.
 *
 * Nada de disco: procurar um `web/dist` ao lado daria página em branco sempre
 * que o processo subisse de outro diretório — e não sobreviveria a virar um
 * executável único.
 *
 * Sem assets embutidos (desenvolvimento, onde quem serve é o Vite), não
 * registra nada: o servidor não tem casca para dar e não deve fingir que tem.
 */
export function registerSpa(app: FastifyInstance, assets: Record<string, EmbeddedAsset>): void {
  const shell = assets['/index.html'];
  if (!shell) return;

  // Decodifica uma vez no boot, e não a cada requisição.
  const bodies = new Map<string, Buffer>(Object.entries(assets).map(([route, a]) => [route, Buffer.from(a.base64, 'base64')]));

  for (const [route, asset] of Object.entries(assets)) {
    app.get(route, async (_req, reply) => reply.type(asset.type).send(bodies.get(route)));
    if (route === '/index.html') {
      app.get('/', async (_req, reply) => reply.type(asset.type).send(bodies.get(route)));
    }
  }

  app.setNotFoundHandler((req, reply) => {
    // /api desconhecida é erro de programa, não navegação: devolver HTML faria o
    // cliente tentar interpretar uma página inteira como JSON.
    if (req.url.startsWith('/api')) return reply.code(404).send({ error: 'not_found' });
    // Qualquer outra URL é rota da SPA (/copia/abc): recarregar a página nelas
    // precisa devolver a casca, ou o app some no F5.
    return reply.type(shell.type).send(bodies.get('/index.html'));
  });
}
