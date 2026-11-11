import express, { type ErrorRequestHandler } from 'express';
import { z, ZodError } from 'zod';
import { CategoryInput, ImportPrompt, PromptInput } from '../shared/schema';
import {
  HttpError, createCategory, createPrompt, deleteCategory, deletePrompt, duplicatePrompt, ensureCategory, getPrompt,
  listCategories, listPrompts, listVersions, moveCategory, recordUse, restoreVersion, toggleFavorite, tx, updateCategory,
  updatePrompt, type Db,
} from './db';

const idParam = (s: string | string[]) => Number(Array.isArray(s) ? s[0] : s);
const str = (s: string | string[]) => (Array.isArray(s) ? s[0] : s);

// Raw table rows for backup/restore. Columns are a fixed allow-list, never taken from the file.
const COLS = {
  categories: ['id', 'name', 'parentId', 'position'],
  prompts: ['id', 'title', 'description', 'content', 'categoryId', 'promptType', 'platforms', 'tags', 'variables', 'variants', 'version', 'author', 'isFavorite', 'usageCount', 'lastUsedAt', 'notes', 'expectedOutput', 'createdAt', 'updatedAt'],
  versions: ['promptId', 'version', 'snapshot', 'createdAt', 'note'],
} as const;
const Row = z.record(z.string(), z.union([z.string(), z.number(), z.null()]));
const BackupFile = z.object({
  format: z.literal('promptvault-backup'),
  categories: z.array(Row),
  prompts: z.array(Row),
  versions: z.array(Row),
});

export function createApp(db: Db) {
  const app = express();
  app.use(express.json({ limit: '25mb' }));

  // ----- prompts -----
  app.get('/api/prompts', (_q, r) => r.json(listPrompts(db)));
  app.get('/api/prompts/:id', (q, r) => r.json(getPrompt(db, str(q.params.id))));
  app.post('/api/prompts', (q, r) => r.status(201).json(createPrompt(db, PromptInput.parse(q.body))));
  app.put('/api/prompts/:id', (q, r) => r.json(updatePrompt(db, str(q.params.id), PromptInput.parse(q.body))));
  app.delete('/api/prompts/:id', (q, r) => (deletePrompt(db, str(q.params.id)), r.status(204).end()));
  app.post('/api/prompts/:id/duplicate', (q, r) => r.status(201).json(duplicatePrompt(db, str(q.params.id))));
  app.post('/api/prompts/:id/favorite', (q, r) => r.json(toggleFavorite(db, str(q.params.id))));
  app.post('/api/prompts/:id/use', (q, r) => r.json(recordUse(db, str(q.params.id))));
  app.get('/api/prompts/:id/versions', (q, r) => r.json(listVersions(db, str(q.params.id))));
  app.post('/api/prompts/:id/restore/:version', (q, r) => r.json(restoreVersion(db, str(q.params.id), idParam(q.params.version))));

  // ----- categories -----
  app.get('/api/categories', (_q, r) => r.json(listCategories(db)));
  app.post('/api/categories', (q, r) => {
    const b = CategoryInput.parse(q.body);
    r.status(201).json(createCategory(db, b.name, b.parentId));
  });
  app.put('/api/categories/:id', (q, r) => r.json(updateCategory(db, idParam(q.params.id), CategoryInput.partial().parse(q.body))));
  app.post('/api/categories/:id/move', (q, r) => {
    moveCategory(db, idParam(q.params.id), z.enum(['up', 'down']).parse(q.body?.dir));
    r.json(listCategories(db));
  });
  app.delete('/api/categories/:id', (q, r) => (tx(db, () => deleteCategory(db, idParam(q.params.id))), r.status(204).end()));

  // ----- import: each prompt validated on its own so one bad entry doesn't sink the file -----
  app.post('/api/import', (q, r) => {
    const list: unknown = Array.isArray(q.body) ? q.body : q.body?.prompts;
    if (!Array.isArray(list)) throw new HttpError(400, 'Not a PromptVault file: expected a JSON array of prompts or { "prompts": [...] }');
    const existing = listPrompts(db);
    const ids = new Set(existing.map((p) => p.id));
    const keys = new Set(existing.map((p) => `${p.title}\u0000${p.content}`));
    const result = { imported: 0, skipped: [] as { index: number; title: string; reason: string }[], errors: [] as { index: number; title: string; message: string }[] };
    tx(db, () => {
      list.forEach((raw, index) => {
        const title = typeof raw?.title === 'string' ? raw.title : '(untitled)';
        const parsed = ImportPrompt.safeParse(raw);
        if (!parsed.success) {
          result.errors.push({ index, title, message: parsed.error.issues.map((i) => `${i.path.join('.') || 'prompt'}: ${i.message}`).join('; ') });
          return;
        }
        const { id, category, subcategory, version, isFavorite, usageCount, createdAt, updatedAt, ...input } = parsed.data;
        const key = `${input.title}\u0000${input.content}`;
        if ((id && ids.has(id)) || keys.has(key)) {
          result.skipped.push({ index, title, reason: 'Duplicate of an existing prompt' });
          return;
        }
        const created = createPrompt(db, { ...input, categoryId: ensureCategory(db, category, category ? subcategory : null) }, { id, version, isFavorite, usageCount, createdAt, updatedAt });
        ids.add(created.id);
        keys.add(key);
        result.imported++;
      });
    });
    r.json(result);
  });

  // ----- backup / restore (full fidelity, includes version history) -----
  app.get('/api/backup', (_q, r) => {
    const rows = (t: keyof typeof COLS) => db.prepare(`SELECT ${COLS[t].join(', ')} FROM ${t}`).all();
    r.json({ format: 'promptvault-backup', exportedAt: new Date().toISOString(), categories: rows('categories'), prompts: rows('prompts'), versions: rows('versions') });
  });
  app.post('/api/restore', (q, r) => {
    const b = BackupFile.parse(q.body);
    try {
      tx(db, () => {
        for (const t of ['versions', 'prompts', 'categories'] as const) db.exec(`DELETE FROM ${t}`);
        for (const t of ['categories', 'prompts', 'versions'] as const) {
          const stmt = db.prepare(`INSERT INTO ${t} (${COLS[t].join(', ')}) VALUES (${COLS[t].map(() => '?').join(', ')})`);
          for (const row of b[t]) stmt.run(...COLS[t].map((c) => row[c] ?? null));
        }
      });
    } catch (e) {
      throw new HttpError(400, `Invalid backup, nothing was changed: ${(e as Error).message}`);
    }
    r.json({ prompts: b.prompts.length, categories: b.categories.length });
  });

  const onError: ErrorRequestHandler = (err, _q, res, _n) => {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'Validation failed', issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
    } else if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
    } else if (/constraint/i.test(String(err?.message))) {
      res.status(400).json({ error: err.message });
    } else if (err?.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'Request body is not valid JSON' });
    } else {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
  app.use(onError);
  return app;
}
