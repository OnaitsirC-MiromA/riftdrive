import Fastify, { type FastifyInstance } from 'fastify';
import type { AppConfig } from './config';
import type { Db } from './db';
import type { AppDeps } from './deps';
import { registerSpa } from './spa';
import { WEB_ASSETS } from './bundled';
import { registerLocalOriginGuard } from './security';
import { healthRoutes } from './routes/health';
import { infoRoutes } from './routes/info';
import { authRoutes } from './routes/auth';
import { accountsRoutes } from './routes/accounts';
import { inspectRoutes } from './routes/inspect';
import { jobsRoutes } from './routes/jobs';
import { copiesRoutes } from './routes/copies';
import { settingsRoutes } from './routes/settings';
import { quotaRoutes } from './routes/quota';

export function buildApp(config: AppConfig, db: Db, deps: AppDeps): FastifyInstance {
  void config;
  void db;
  const app = Fastify({ logger: false });

  // Corpo vazio em application/json vira undefined, não erro: um POST sem corpo
  // (pausar, retomar) é comum aqui e não deve falhar com FST_ERR_CTP_EMPTY_JSON_BODY.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    const raw = (body as string).trim();
    if (raw === '') return done(null, undefined);
    try {
      done(null, JSON.parse(raw));
    } catch (err) {
      (err as { statusCode?: number }).statusCode = 400;
      done(err as Error, undefined);
    }
  });

  registerLocalOriginGuard(app);

  app.register(healthRoutes);
  app.register(infoRoutes, { deps });
  app.register(authRoutes, { deps });
  app.register(accountsRoutes, { deps });
  app.register(inspectRoutes, { deps });
  app.register(jobsRoutes, { deps });
  app.register(copiesRoutes, { deps });
  app.register(settingsRoutes, { deps });
  app.register(quotaRoutes, { deps });
  // [ROUTES]

  // A interface vem embutida no build, não do disco — ver spa.ts.
  registerSpa(app, WEB_ASSETS);

  return app;
}
