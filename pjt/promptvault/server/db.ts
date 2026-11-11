import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { DEFAULT_CATEGORIES, type Category, type Prompt, type PromptInputT, type Snapshot, type VersionRow } from '../shared/schema';
import { extractVariables } from '../shared/variables';

export type Db = DatabaseSync;

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const now = () => new Date().toISOString();
// node:sqlite is typed loosely (SQLOutputValue); rows are cast at this one boundary.
const all = (db: Db, sql: string, ...p: any[]) => db.prepare(sql).all(...p) as any[];
const one = (db: Db, sql: string, ...p: any[]) => db.prepare(sql).get(...p) as any;
const run = (db: Db, sql: string, ...p: any[]) => db.prepare(sql).run(...p);

export function tx<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export function openDb(file = ':memory:', starter = false): Db {
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      parentId INTEGER REFERENCES categories(id) ON DELETE CASCADE,
      position INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS prompts (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL,
      categoryId INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      promptType TEXT NOT NULL,
      platforms TEXT NOT NULL DEFAULT '[]',
      tags TEXT NOT NULL DEFAULT '[]',
      variables TEXT NOT NULL DEFAULT '[]',
      variants TEXT NOT NULL DEFAULT '{}',
      version INTEGER NOT NULL DEFAULT 1,
      author TEXT NOT NULL DEFAULT 'Me',
      isFavorite INTEGER NOT NULL DEFAULT 0,
      usageCount INTEGER NOT NULL DEFAULT 0,
      lastUsedAt TEXT,
      notes TEXT NOT NULL DEFAULT '',
      expectedOutput TEXT NOT NULL DEFAULT '',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS versions (
      promptId TEXT NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      snapshot TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (promptId, version)
    );
  `);
  if (!one(db, "SELECT 1 FROM meta WHERE key='seeded'")) {
    tx(db, () => {
      for (const [top, subs] of Object.entries(DEFAULT_CATEGORIES)) subs.forEach((s) => ensureCategory(db, top, s));
      if (starter) seedStarter(db);
      run(db, "INSERT INTO meta (key, value) VALUES ('seeded', '1')");
    });
  }
  return db;
}

// ---------- categories ----------

export const listCategories = (db: Db): Category[] =>
  all(db, 'SELECT id, name, parentId, position FROM categories ORDER BY parentId IS NOT NULL, parentId, position, id');

const nextPosition = (db: Db, parentId: number | null) =>
  (one(db, 'SELECT COALESCE(MAX(position), -1) + 1 AS n FROM categories WHERE parentId IS ?', parentId).n as number);

function assertValidPlacement(db: Db, name: string, parentId: number | null, selfId?: number) {
  if (parentId !== null) {
    const parent = one(db, 'SELECT parentId FROM categories WHERE id = ?', parentId);
    if (!parent) throw new HttpError(400, 'Parent category not found');
    if (parent.parentId !== null) throw new HttpError(400, 'Only two levels are supported (category > subcategory)');
    if (selfId !== undefined && one(db, 'SELECT 1 FROM categories WHERE parentId = ?', selfId))
      throw new HttpError(400, 'A category that has subcategories cannot become a subcategory');
  }
  const dup = one(db, 'SELECT id FROM categories WHERE name = ? COLLATE NOCASE AND parentId IS ? AND id IS NOT ?', name, parentId, selfId ?? null);
  if (dup) throw new HttpError(409, `"${name}" already exists here`);
}

export function createCategory(db: Db, name: string, parentId: number | null): Category {
  assertValidPlacement(db, name, parentId);
  const r = run(db, 'INSERT INTO categories (name, parentId, position) VALUES (?, ?, ?)', name, parentId, nextPosition(db, parentId));
  return one(db, 'SELECT id, name, parentId, position FROM categories WHERE id = ?', Number(r.lastInsertRowid));
}

export function updateCategory(db: Db, id: number, patch: { name?: string; parentId?: number | null }): Category {
  const cur = one(db, 'SELECT id, name, parentId, position FROM categories WHERE id = ?', id) as Category | undefined;
  if (!cur) throw new HttpError(404, 'Category not found');
  const name = patch.name ?? cur.name;
  const parentId = patch.parentId === undefined ? cur.parentId : patch.parentId;
  if (parentId === id) throw new HttpError(400, 'A category cannot be its own parent');
  assertValidPlacement(db, name, parentId, id);
  const position = parentId === cur.parentId ? cur.position : nextPosition(db, parentId);
  run(db, 'UPDATE categories SET name = ?, parentId = ?, position = ? WHERE id = ?', name, parentId, position, id);
  return { id, name, parentId, position };
}

/** Swap position with the neighbouring sibling. */
export function moveCategory(db: Db, id: number, dir: 'up' | 'down') {
  const cur = one(db, 'SELECT id, parentId FROM categories WHERE id = ?', id);
  if (!cur) throw new HttpError(404, 'Category not found');
  const sibs = all(db, 'SELECT id FROM categories WHERE parentId IS ? ORDER BY position, id', cur.parentId).map((r) => r.id as number);
  const i = sibs.indexOf(id);
  const j = dir === 'up' ? i - 1 : i + 1;
  if (j < 0 || j >= sibs.length) return;
  [sibs[i], sibs[j]] = [sibs[j], sibs[i]];
  sibs.forEach((sid, pos) => run(db, 'UPDATE categories SET position = ? WHERE id = ?', pos, sid));
}

/** Prompts in the deleted category (and its subcategories) fall back to the parent category, or Uncategorised. */
export function deleteCategory(db: Db, id: number) {
  const cur = one(db, 'SELECT parentId FROM categories WHERE id = ?', id);
  if (!cur) throw new HttpError(404, 'Category not found');
  const ids = [id, ...all(db, 'SELECT id FROM categories WHERE parentId = ?', id).map((r) => r.id as number)];
  for (const cid of ids) run(db, 'UPDATE prompts SET categoryId = ? WHERE categoryId = ?', cur.parentId, cid);
  run(db, 'DELETE FROM categories WHERE id = ?', id);
}

/** Find or create a category and optional subcategory by exact name (names may themselves contain "/"). */
export function ensureCategory(db: Db, top?: string | null, sub?: string | null): number | null {
  const names = [top, sub].map((s) => s?.trim()).filter(Boolean) as string[];
  if (!names.length) return null;
  let parentId: number | null = null;
  for (const name of names) {
    const hit = one(db, 'SELECT id FROM categories WHERE name = ? COLLATE NOCASE AND parentId IS ?', name, parentId);
    parentId = hit ? (hit.id as number) : createCategory(db, name, parentId).id;
  }
  return parentId;
}

// ---------- prompts ----------

const SELECT = `SELECT p.*, c.name AS cName, pc.name AS pName FROM prompts p
  LEFT JOIN categories c ON c.id = p.categoryId LEFT JOIN categories pc ON pc.id = c.parentId`;

const toPrompt = (r: any): Prompt => ({
  id: r.id,
  title: r.title,
  description: r.description,
  content: r.content,
  categoryId: r.categoryId,
  category: r.pName ?? r.cName ?? null,
  subcategory: r.pName ? r.cName : null,
  promptType: r.promptType,
  platforms: JSON.parse(r.platforms),
  tags: JSON.parse(r.tags),
  variables: JSON.parse(r.variables),
  variants: JSON.parse(r.variants),
  version: r.version,
  author: r.author,
  isFavorite: !!r.isFavorite,
  usageCount: r.usageCount,
  lastUsedAt: r.lastUsedAt,
  notes: r.notes,
  expectedOutput: r.expectedOutput,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

export const listPrompts = (db: Db): Prompt[] => all(db, `${SELECT} ORDER BY p.updatedAt DESC`).map(toPrompt);

export function getPrompt(db: Db, id: string): Prompt {
  const r = one(db, `${SELECT} WHERE p.id = ?`, id);
  if (!r) throw new HttpError(404, 'Prompt not found');
  return toPrompt(r);
}

// Fixed key order so JSON equality means "nothing changed".
const snap = (p: Snapshot): Snapshot => ({
  title: p.title,
  description: p.description,
  content: p.content,
  categoryId: p.categoryId,
  promptType: p.promptType,
  platforms: p.platforms,
  tags: p.tags,
  notes: p.notes,
  expectedOutput: p.expectedOutput,
  variants: Object.fromEntries(Object.entries(p.variants).sort(([a], [b]) => a.localeCompare(b))),
});

const vars = (p: { content: string; variants: Record<string, string> }) => extractVariables(p.content, ...Object.values(p.variants));

export interface CreateExtra {
  id?: string;
  version?: number;
  isFavorite?: boolean;
  usageCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export function createPrompt(db: Db, input: PromptInputT, x: CreateExtra = {}): Prompt {
  const id = x.id ?? randomUUID();
  const version = x.version ?? 1;
  const created = x.createdAt ?? now();
  run(
    db,
    `INSERT INTO prompts (id, title, description, content, categoryId, promptType, platforms, tags, variables, variants,
       version, author, isFavorite, usageCount, notes, expectedOutput, createdAt, updatedAt)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id, input.title, input.description, input.content, input.categoryId, input.promptType,
    JSON.stringify(input.platforms), JSON.stringify(input.tags), JSON.stringify(vars(input)), JSON.stringify(input.variants),
    version, input.author, x.isFavorite ? 1 : 0, x.usageCount ?? 0, input.notes, input.expectedOutput, created, x.updatedAt ?? created,
  );
  run(db, 'INSERT INTO versions (promptId, version, snapshot, createdAt, note) VALUES (?,?,?,?,?)', id, version, JSON.stringify(snap(input)), created, 'Created');
  return getPrompt(db, id);
}

/** Changing any editable field appends a new version; history rows are never modified. */
export function updatePrompt(db: Db, id: string, input: PromptInputT, note = ''): Prompt {
  const cur = getPrompt(db, id);
  if (JSON.stringify(snap(input)) === JSON.stringify(snap(cur)) && input.author === cur.author) return cur;
  const version = cur.version + 1;
  const t = now();
  run(
    db,
    `UPDATE prompts SET title=?, description=?, content=?, categoryId=?, promptType=?, platforms=?, tags=?, variables=?, variants=?,
       notes=?, expectedOutput=?, author=?, version=?, updatedAt=? WHERE id=?`,
    input.title, input.description, input.content, input.categoryId, input.promptType, JSON.stringify(input.platforms),
    JSON.stringify(input.tags), JSON.stringify(vars(input)), JSON.stringify(input.variants), input.notes, input.expectedOutput,
    input.author, version, t, id,
  );
  run(db, 'INSERT INTO versions (promptId, version, snapshot, createdAt, note) VALUES (?,?,?,?,?)', id, version, JSON.stringify(snap(input)), t, note || 'Edited');
  return getPrompt(db, id);
}

export const deletePrompt = (db: Db, id: string) => {
  if (!run(db, 'DELETE FROM prompts WHERE id = ?', id).changes) throw new HttpError(404, 'Prompt not found');
};

export function listVersions(db: Db, id: string): VersionRow[] {
  getPrompt(db, id);
  return all(db, 'SELECT version, createdAt, note, snapshot FROM versions WHERE promptId = ? ORDER BY version DESC', id).map((r) => ({
    version: r.version,
    createdAt: r.createdAt,
    note: r.note,
    snapshot: JSON.parse(r.snapshot),
  }));
}

/** Restoring writes the old content as a NEW version on top; nothing is overwritten. */
export function restoreVersion(db: Db, id: string, version: number): Prompt {
  const cur = getPrompt(db, id);
  const row = listVersions(db, id).find((v) => v.version === version);
  if (!row) throw new HttpError(404, `Version ${version} not found`);
  return updatePrompt(db, id, { ...row.snapshot, author: cur.author }, `Restored from v${version}`);
}

export const toggleFavorite = (db: Db, id: string) => {
  run(db, 'UPDATE prompts SET isFavorite = 1 - isFavorite WHERE id = ?', id);
  return getPrompt(db, id);
};

export const recordUse = (db: Db, id: string) => {
  run(db, 'UPDATE prompts SET usageCount = usageCount + 1, lastUsedAt = ? WHERE id = ?', now(), id);
  return getPrompt(db, id);
};

export function duplicatePrompt(db: Db, id: string): Prompt {
  const p = getPrompt(db, id);
  return createPrompt(db, { ...p, title: `${p.title} (copy)` });
}

// ---------- starter data (first run of the real server only) ----------

function seedStarter(db: Db) {
  const base = { platforms: [], tags: [], notes: '', expectedOutput: '', variants: {}, author: 'Me', promptType: 'User Prompt' as const, description: '' };
  createPrompt(db, {
    ...base,
    title: 'Architecture review of a codebase',
    description: 'Ask an assistant to find architecture issues in source code and suggest improvements.',
    content: 'You are an expert {{ROLE}} specializing in {{TECHNOLOGY}}.\n\nAnalyze the following source code:\n\n```\n{{SOURCE_CODE}}\n```\n\nIdentify architecture issues and suggest improvements. Rank findings by impact.',
    categoryId: ensureCategory(db, 'Architecture & Engineering', 'Repository Analysis'),
    platforms: ['Claude / Claude Code', 'Platform Independent'],
    tags: ['review', 'architecture'],
    promptType: 'Role-based Prompt',
    expectedOutput: 'A ranked list of issues, each with a concrete fix.',
  });
  createPrompt(db, {
    ...base,
    title: 'Embedded C review against a coding standard',
    description: 'Review embedded C for memory safety and standard compliance.',
    content: 'Review this embedded C for undefined behaviour, buffer overruns, ISR safety and violations of {{STANDARD}}.\n\n```c\n{{SOURCE_CODE}}\n```\n\nReport each finding as CRITICAL / HIGH / MEDIUM / LOW with a fix.',
    categoryId: ensureCategory(db, 'Embedded Systems', 'Embedded C/C++'),
    platforms: ['Claude / Claude Code', 'GitHub Copilot', 'Cursor'],
    tags: ['misra', 'embedded'],
    promptType: 'Reusable Template',
  });
  createPrompt(db, {
    ...base,
    title: 'Meeting notes to action items',
    content: 'Turn these meeting notes into a list of action items with owner and due date. Flag anything ambiguous.\n\n{{NOTES}}',
    categoryId: ensureCategory(db, 'Productivity & Management', 'Meeting Preparation'),
    platforms: ['Platform Independent'],
    tags: ['meetings'],
  });
}
