import type { Category, Prompt } from '../../shared/schema';
import { applyFilters, DEFAULT_FILTERS } from './filter';

const cats: Category[] = [
  { id: 1, name: 'Embedded Systems', parentId: null, position: 0 },
  { id: 2, name: 'RTOS', parentId: 1, position: 0 },
  { id: 3, name: 'Writing', parentId: null, position: 1 },
];
const mk = (o: Partial<Prompt>): Prompt => ({
  id: o.title ?? 'x', title: 't', description: '', content: 'c', categoryId: null, category: null, subcategory: null, promptType: 'User Prompt',
  platforms: [], tags: [], variables: [], variants: {}, version: 1, author: 'Me', isFavorite: false, usageCount: 0, lastUsedAt: null,
  notes: '', expectedOutput: '', createdAt: '2026-01-02T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z', ...o,
});
const a = mk({ title: 'Alpha review', content: 'check ISR safety', categoryId: 2, category: 'Embedded Systems', subcategory: 'RTOS', tags: ['misra'], platforms: ['Cursor'], usageCount: 5, isFavorite: true });
const b = mk({ title: 'Beta essay', categoryId: 3, category: 'Writing', usageCount: 9, updatedAt: '2026-02-01T00:00:00Z' });
const list = [a, b];
const run = (f: object) => applyFilters(list, { ...DEFAULT_FILTERS, ...f }, cats).map((p) => p.title);

describe('applyFilters', () => {
  it('searches across title, content, category, tags and platform (all tokens must match)', () => {
    expect(run({ q: 'isr' })).toEqual(['Alpha review']);
    expect(run({ q: 'rtos misra' })).toEqual(['Alpha review']);
    expect(run({ q: 'cursor' })).toEqual(['Alpha review']);
    expect(run({ q: 'rtos essay' })).toEqual([]);
  });
  it('top-level category includes its subcategories; subcategory is exact', () => {
    expect(run({ category: 1 })).toEqual(['Alpha review']);
    expect(run({ category: 1, sub: 2 })).toEqual(['Alpha review']);
    expect(run({ category: 3, sub: 2 })).toEqual([]);
  });
  it('sorts by usage, alpha and modified', () => {
    expect(run({ sort: 'usage' })).toEqual(['Beta essay', 'Alpha review']);
    expect(run({ sort: 'alpha' })).toEqual(['Alpha review', 'Beta essay']);
    expect(run({ sort: 'modified' })).toEqual(['Beta essay', 'Alpha review']);
  });
  it('favorites and recency filters', () => {
    expect(run({ favorites: true })).toEqual(['Alpha review']);
    const now = new Date('2026-02-02T00:00:00Z').getTime();
    expect(applyFilters(list, { ...DEFAULT_FILTERS, recency: 'updated' }, cats, now).map((p) => p.title)).toEqual(['Beta essay']);
  });
});
