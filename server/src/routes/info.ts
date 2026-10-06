import type { FastifyInstance } from 'fastify';
import { APP_VERSION } from '../bundled';
import type { AppDeps } from '../deps';

// O que a SPA precisa saber antes de qualquer outra coisa: se já existe um
// OAuth client e quantas contas estão conectadas (sem isso, vai para o assistente).
export async function infoRoutes(app: FastifyInstance, opts: { deps: AppDeps }): Promise<void> {
  const { db } = opts.deps;
  app.get('/api/info', async () => {
    const client = (db.prepare('SELECT COUNT(*) AS n FROM oauth_client').get() as { n: number }).n > 0;
    const accounts = (db.prepare('SELECT COUNT(*) AS n FROM accounts').get() as { n: number }).n;
    return { version: APP_VERSION, platform: process.platform, configured: { client, accounts } };
  });
}
