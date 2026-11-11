import type { Category, Platform, Prompt, PromptType } from '../../shared/schema';

export type SortKey = 'added' | 'modified' | 'lastUsed' | 'usage' | 'alpha' | 'favorited';

export interface Filters {
  q: string;
  category: number | null; // top-level category id
  sub: number | null; // subcategory id
  platform: Platform | '';
  type: PromptType | '';
  favorites: boolean;
  usedOnly: boolean;
  recency: '' | 'added' | 'updated';
  sort: SortKey;
}

export const DEFAULT_FILTERS: Filters = { q: '', category: null, sub: null, platform: '', type: '', favorites: false, usedOnly: false, recency: '', sort: 'modified' };
export const RECENT_MS = 7 * 24 * 3600 * 1000;

const haystack = (p: Prompt) =>
  [p.title, p.description, p.content, p.category, p.subcategory, p.promptType, ...p.tags, ...p.platforms].filter(Boolean).join('\n').toLowerCase();

const byDate = (a: string | null, b: string | null) => (b ?? '').localeCompare(a ?? '');

const SORTS: Record<SortKey, (a: Prompt, b: Prompt) => number> = {
  added: (a, b) => byDate(a.createdAt, b.createdAt),
  modified: (a, b) => byDate(a.updatedAt, b.updatedAt),
  lastUsed: (a, b) => byDate(a.lastUsedAt, b.lastUsedAt),
  usage: (a, b) => b.usageCount - a.usageCount || byDate(a.updatedAt, b.updatedAt),
  alpha: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }),
  favorited: (a, b) => Number(b.isFavorite) - Number(a.isFavorite) || b.usageCount - a.usageCount,
};

// ponytail: filters the full list in memory on each keystroke; fine for thousands of prompts, move to server/FTS beyond that.
export function applyFilters(prompts: Prompt[], f: Filters, categories: Category[], now = Date.now()): Prompt[] {
  const tokens = f.q.toLowerCase().split(/\s+/).filter(Boolean);
  const catIds = f.category === null ? null : new Set([f.category, ...categories.filter((c) => c.parentId === f.category).map((c) => c.id)]);
  return prompts
    .filter((p) => {
      if (tokens.length) {
        const h = haystack(p);
        if (!tokens.every((t) => h.includes(t))) return false;
      }
      if (f.sub !== null && p.categoryId !== f.sub) return false;
      if (catIds && (p.categoryId === null || !catIds.has(p.categoryId))) return false;
      if (f.platform && !p.platforms.includes(f.platform)) return false;
      if (f.type && p.promptType !== f.type) return false;
      if (f.favorites && !p.isFavorite) return false;
      if (f.usedOnly && !p.lastUsedAt) return false;
      if (f.recency === 'added' && now - new Date(p.createdAt).getTime() > RECENT_MS) return false;
      if (f.recency === 'updated' && now - new Date(p.updatedAt).getTime() > RECENT_MS) return false;
      return true;
    })
    .sort(SORTS[f.sort]);
}

export const isFiltered = (f: Filters) => JSON.stringify({ ...f, sort: 0 }) !== JSON.stringify({ ...DEFAULT_FILTERS, sort: 0 });
