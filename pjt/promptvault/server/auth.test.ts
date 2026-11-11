// @vitest-environment node
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from './app';
import { openDb } from './db';

const PW = 'correct horse battery';
let server: Server;
let base: string;

async function start(password?: string) {
  server = createApp(openDb(':memory:'), { password }).listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
afterEach(() => new Promise((r) => server.close(r)));

const post = (path: string, body: unknown, cookie?: string) =>
  fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
const get = (path: string, cookie?: string) => fetch(base + path, { headers: cookie ? { cookie } : {} });
const login = async (password = PW) => {
  const r = await post('/api/login', { password });
  return { r, cookie: r.headers.getSetCookie()[0]?.split(';')[0] };
};

describe('auth enabled', () => {
  beforeEach(() => start(PW));

  it('blocks every data route without a session, but not the health check or session probe', async () => {
    for (const path of ['/api/prompts', '/api/categories', '/api/backup']) expect((await get(path)).status).toBe(401);
    expect((await post('/api/import', { prompts: [] })).status).toBe(401);
    expect((await post('/api/restore', {})).status).toBe(401);
    expect((await get('/healthz')).status).toBe(200);
    expect(await (await get('/api/session')).json()).toEqual({ authRequired: true, authenticated: false });
  });

  it('rejects a wrong password and accepts the right one with a hardened cookie', async () => {
    expect((await login('nope')).r.status).toBe(401);
    const { r, cookie } = await login();
    expect(r.status).toBe(200);
    const header = r.headers.getSetCookie()[0];
    expect(header).toMatch(/HttpOnly/i);
    expect(header).toMatch(/SameSite=Strict/i);
    expect((await get('/api/prompts', cookie)).status).toBe(200);
    expect(await (await get('/api/session', cookie)).json()).toEqual({ authRequired: true, authenticated: true });
  });

  it('rejects tampered and expired cookies', async () => {
    const { cookie } = await login();
    const [name, value] = cookie!.split('=');
    const [exp, sig] = value.split('.');
    expect((await get('/api/prompts', `${name}=${exp}.${sig!.slice(0, -2)}xx`)).status).toBe(401);
    expect((await get('/api/prompts', `${name}=${Number(exp) + 1000}.${sig}`)).status).toBe(401); // valid signature for a different expiry
    expect((await get('/api/prompts', `${name}=${Date.now() - 1000}.${sig}`)).status).toBe(401);
    expect((await get('/api/prompts', `${name}=garbage`)).status).toBe(401);
  });

  it('logout clears the cookie', async () => {
    const { cookie } = await login();
    const r = await post('/api/logout', {}, cookie);
    expect(r.headers.getSetCookie()[0]).toMatch(/pv_session=;/);
  });

  it('locks out after 5 wrong attempts, even for the right password', async () => {
    for (let i = 0; i < 5; i++) expect((await login('wrong')).r.status).toBe(401);
    expect((await login('wrong')).r.status).toBe(429);
    expect((await login()).r.status).toBe(429);
  });

  it('a wrong-password body that is not a string cannot crash or bypass', async () => {
    for (const body of [{}, { password: 123 }, { password: null }, { password: ['x'] }]) expect((await post('/api/login', body)).status).toBe(401);
  });
});

describe('auth disabled (local dev default)', () => {
  beforeEach(() => start());
  it('leaves the API open and reports it', async () => {
    expect((await get('/api/prompts')).status).toBe(200);
    expect(await (await get('/api/session')).json()).toEqual({ authRequired: false, authenticated: true });
  });
});
