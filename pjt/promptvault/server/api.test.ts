// @vitest-environment node
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from './app';
import { openDb } from './db';

let server: Server;
let base: string;

beforeEach(async () => {
  server = createApp(openDb(':memory:')).listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
afterEach(() => new Promise((r) => server.close(r)));

const call = async (method: string, path: string, body?: unknown) => {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: res.status === 204 ? null : await res.json() };
};
const mk = (over = {}) => ({ title: 'T', content: 'Hello {{NAME}}', ...over });

describe('prompts + versioning', () => {
  it('creates v1, detects variables, resolves category path', async () => {
    const cats = (await call('GET', '/categories')).body;
    const sub = cats.find((c: any) => c.name === 'Code Review');
    const { status, body } = await call('POST', '/prompts', mk({ categoryId: sub.id }));
    expect(status).toBe(201);
    expect(body).toMatchObject({ version: 1, variables: ['NAME'], category: 'Software Development', subcategory: 'Code Review' });
  });

  it('every real edit appends a version, no-op edits do not, history is preserved', async () => {
    const { body: p } = await call('POST', '/prompts', mk());
    await call('PUT', `/prompts/${p.id}`, mk({ content: 'Second {{A}}' }));
    const same = await call('PUT', `/prompts/${p.id}`, mk({ content: 'Second {{A}}' }));
    expect(same.body.version).toBe(2);
    const versions = (await call('GET', `/prompts/${p.id}/versions`)).body;
    expect(versions.map((v: any) => v.version)).toEqual([2, 1]);
    expect(versions[1].snapshot.content).toBe('Hello {{NAME}}');
  });

  it('restore creates a new version holding the old content', async () => {
    const { body: p } = await call('POST', '/prompts', mk());
    await call('PUT', `/prompts/${p.id}`, mk({ content: 'Changed' }));
    const r = await call('POST', `/prompts/${p.id}/restore/1`);
    expect(r.body).toMatchObject({ version: 3, content: 'Hello {{NAME}}' });
    const versions = (await call('GET', `/prompts/${p.id}/versions`)).body;
    expect(versions).toHaveLength(3);
    expect(versions[0].note).toBe('Restored from v1');
    expect(versions[1].snapshot.content).toBe('Changed');
  });

  it('validates input with clear errors', async () => {
    const r = await call('POST', '/prompts', { title: '', content: '' });
    expect(r.status).toBe(400);
    expect(r.body.issues.map((i: any) => i.path).sort()).toEqual(['content', 'title']);
  });

  it('favorite, use, duplicate, delete', async () => {
    const { body: p } = await call('POST', '/prompts', mk());
    expect((await call('POST', `/prompts/${p.id}/favorite`)).body.isFavorite).toBe(true);
    const used = (await call('POST', `/prompts/${p.id}/use`)).body;
    expect(used.usageCount).toBe(1);
    expect(used.lastUsedAt).toBeTruthy();
    const dup = (await call('POST', `/prompts/${p.id}/duplicate`)).body;
    expect(dup).toMatchObject({ title: 'T (copy)', version: 1, usageCount: 0, isFavorite: false });
    expect((await call('DELETE', `/prompts/${p.id}`)).status).toBe(204);
    expect((await call('GET', `/prompts/${p.id}`)).status).toBe(404);
  });
});

describe('categories', () => {
  it('seeds the spec categories with names containing "/" intact', async () => {
    const cats = (await call('GET', '/categories')).body;
    const names = cats.map((c: any) => c.name);
    expect(names).toEqual(expect.arrayContaining(['Embedded C/C++', 'ARM / NEON', 'Software Development']));
    expect(names).not.toContain('Embedded C / C++');
    expect(cats.filter((c: any) => !c.parentId)).toHaveLength(8);
    expect(cats.filter((c: any) => c.parentId)).toHaveLength(47);
  });

  it('import round-trips a category whose name contains "/"', async () => {
    await call('POST', '/import', { prompts: [{ title: 'X', content: 'c', category: 'Embedded Systems', subcategory: 'Embedded C/C++' }] });
    const [p] = (await call('GET', '/prompts')).body;
    expect(p).toMatchObject({ category: 'Embedded Systems', subcategory: 'Embedded C/C++' });
    expect((await call('GET', '/categories')).body.filter((c: any) => c.name.startsWith('Embedded C'))).toHaveLength(1);
  });

  it('rejects duplicates and 3-level nesting; deleting falls prompts back to parent', async () => {
    const top = (await call('POST', '/categories', { name: 'Top' })).body;
    expect((await call('POST', '/categories', { name: 'top' })).status).toBe(409);
    const sub = (await call('POST', '/categories', { name: 'Sub', parentId: top.id })).body;
    expect((await call('POST', '/categories', { name: 'Deep', parentId: sub.id })).status).toBe(400);
    const { body: p } = await call('POST', '/prompts', mk({ categoryId: sub.id }));
    await call('DELETE', `/categories/${sub.id}`);
    expect((await call('GET', `/prompts/${p.id}`)).body).toMatchObject({ category: 'Top', subcategory: null });
  });

  it('moves siblings up/down', async () => {
    const a = (await call('POST', '/categories', { name: 'A' })).body;
    const b = (await call('POST', '/categories', { name: 'B' })).body;
    const order = async () => (await call('GET', '/categories')).body.filter((c: any) => !c.parentId).map((c: any) => c.name).slice(-2);
    expect(await order()).toEqual(['A', 'B']);
    await call('POST', `/categories/${b.id}/move`, { dir: 'up' });
    expect(await order()).toEqual(['B', 'A']);
    void a;
  });
});

describe('import / backup', () => {
  it('imports valid, reports invalid and duplicates separately', async () => {
    const file = [
      { title: 'Good', content: 'x {{V}}', category: 'Brand New', subcategory: 'Child', platforms: ['Cursor'] },
      { title: 'Bad platform', content: 'y', platforms: ['Nope'] },
      { title: 'Good', content: 'x {{V}}' },
    ];
    const r = (await call('POST', '/import', { prompts: file })).body;
    expect(r.imported).toBe(1);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatchObject({ index: 1, title: 'Bad platform' });
    expect(r.skipped).toHaveLength(1);
    const all = (await call('GET', '/prompts')).body;
    expect(all[0]).toMatchObject({ category: 'Brand New', subcategory: 'Child' });
    expect((await call('POST', '/import', { nope: 1 })).status).toBe(400);
  });

  it('backup then restore reproduces data and history; bad backup changes nothing', async () => {
    const { body: p } = await call('POST', '/prompts', mk());
    await call('PUT', `/prompts/${p.id}`, mk({ content: 'v2' }));
    const backup = (await call('GET', '/backup')).body;
    await call('DELETE', `/prompts/${p.id}`);
    expect((await call('POST', '/restore', backup)).status).toBe(200);
    expect((await call('GET', `/prompts/${p.id}/versions`)).body).toHaveLength(2);
    const bad = { ...backup, prompts: [{ id: 'x' }] }; // missing NOT NULL columns
    expect((await call('POST', '/restore', bad)).status).toBe(400);
    expect((await call('GET', `/prompts/${p.id}`)).status).toBe(200);
  });
});
