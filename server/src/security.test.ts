import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerLocalOriginGuard } from './security';

const make = () => {
  const app = Fastify();
  registerLocalOriginGuard(app);
  app.get('/api/x', async () => ({ ok: true }));
  app.get('/outra', async () => 'ok');
  return app;
};

describe('guarda de origem local', () => {
  it('sem Origin passa (navegação e fetch same-origin GET)', async () => {
    expect((await make().inject({ url: '/api/x' })).statusCode).toBe(200);
  });

  it('Origin local passa', async () => {
    expect((await make().inject({ url: '/api/x', headers: { origin: 'http://127.0.0.1:7799' } })).statusCode).toBe(200);
    expect((await make().inject({ url: '/api/x', headers: { origin: 'http://localhost:7799' } })).statusCode).toBe(200);
    expect((await make().inject({ url: '/api/x', headers: { origin: 'http://localhost:5173' } })).statusCode).toBe(200);
  });

  it('Origin de outro site é 403', async () => {
    expect((await make().inject({ url: '/api/x', headers: { origin: 'https://malicioso.example' } })).statusCode).toBe(403);
    expect((await make().inject({ url: '/api/x', headers: { origin: 'http://localhost.malicioso.example' } })).statusCode).toBe(403);
  });

  it('Sec-Fetch-Site cross-site é 403; same-origin e none passam', async () => {
    expect((await make().inject({ url: '/api/x', headers: { 'sec-fetch-site': 'cross-site' } })).statusCode).toBe(403);
    expect((await make().inject({ url: '/api/x', headers: { 'sec-fetch-site': 'same-origin' } })).statusCode).toBe(200);
    expect((await make().inject({ url: '/api/x', headers: { 'sec-fetch-site': 'none' } })).statusCode).toBe(200);
  });

  it('não afeta rotas fora de /api', async () => {
    expect((await make().inject({ url: '/outra', headers: { origin: 'https://malicioso.example' } })).statusCode).toBe(200);
  });
});
