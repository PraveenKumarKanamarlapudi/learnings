import { useMemo } from 'react';
import { FilePlus2, SearchX } from 'lucide-react';
import { PLATFORMS, PROMPT_TYPES, type Platform, type PromptType } from '../../shared/schema';
import { useApp } from '../ctx';
import { applyFilters, DEFAULT_FILTERS, isFiltered, type Filters, type SortKey } from '../lib/filter';
import { PromptCard } from './PromptCard';
import { Button, EmptyState, inputCls, cn } from './ui';

const SORTS: [SortKey, string][] = [
  ['modified', 'Recently modified'], ['added', 'Recently added'], ['lastUsed', 'Recently used'],
  ['usage', 'Most frequently used'], ['alpha', 'Alphabetical'], ['favorited', 'Favorites first'],
];

export function Library({ title, filters, setFilters }: { title: string; filters: Filters; setFilters: (f: Filters) => void }) {
  const { prompts, categories, openPrompt, editPrompt, copyPrompt, toggleFavorite } = useApp();
  const shown = useMemo(() => applyFilters(prompts, filters, categories), [prompts, filters, categories]);
  const set = (patch: Partial<Filters>) => setFilters({ ...filters, ...patch });
  const tops = categories.filter((c) => c.parentId === null);
  const subs = categories.filter((c) => c.parentId === filters.category);
  const sel = (cls = '') => cn(inputCls, 'w-auto! py-1.5', cls);

  return (
    <section aria-label={title}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold">{title}</h1>
        <span className="text-sm text-zinc-500" aria-live="polite">{shown.length} of {prompts.length} prompts</span>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2" role="group" aria-label="Filters and sorting">
        <select aria-label="Category" className={sel()} value={filters.category ?? ''} onChange={(e) => set({ category: e.target.value ? Number(e.target.value) : null, sub: null })}>
          <option value="">All categories</option>
          {tops.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select aria-label="Subcategory" className={sel()} disabled={!subs.length} value={filters.sub ?? ''} onChange={(e) => set({ sub: e.target.value ? Number(e.target.value) : null })}>
          <option value="">All subcategories</option>
          {subs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select aria-label="Platform" className={sel()} value={filters.platform} onChange={(e) => set({ platform: e.target.value as Platform | '' })}>
          <option value="">All platforms</option>
          {PLATFORMS.map((p) => <option key={p}>{p}</option>)}
        </select>
        <select aria-label="Prompt type" className={sel()} value={filters.type} onChange={(e) => set({ type: e.target.value as PromptType | '' })}>
          <option value="">All types</option>
          {PROMPT_TYPES.map((p) => <option key={p}>{p}</option>)}
        </select>
        <select aria-label="Recency" className={sel()} value={filters.recency} onChange={(e) => set({ recency: e.target.value as Filters['recency'] })}>
          <option value="">Any time</option>
          <option value="added">Added in last 7 days</option>
          <option value="updated">Updated in last 7 days</option>
        </select>
        <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={filters.favorites} onChange={(e) => set({ favorites: e.target.checked })} />Favorites</label>
        <select aria-label="Sort by" className={sel('ml-auto')} value={filters.sort} onChange={(e) => set({ sort: e.target.value as SortKey })}>
          {SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        {isFiltered(filters) && <Button size="sm" variant="ghost" onClick={() => setFilters({ ...DEFAULT_FILTERS, sort: filters.sort })}>Clear filters</Button>}
      </div>

      {prompts.length === 0 ? (
        <EmptyState icon={<FilePlus2 size={32} />} title="Your vault is empty" body="Save your first prompt, or import a JSON file from the Import / Export page." action={<Button variant="primary" onClick={() => editPrompt('new')}>New prompt</Button>} />
      ) : shown.length === 0 ? (
        <EmptyState icon={<SearchX size={32} />} title="No prompts match" body={filters.q ? `Nothing found for “${filters.q}” with the current filters.` : 'Try removing a filter.'} action={<Button onClick={() => setFilters({ ...DEFAULT_FILTERS, sort: filters.sort })}>Clear search and filters</Button>} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((p) => <PromptCard key={p.id} p={p} onOpen={(x) => openPrompt(x.id)} onCopy={copyPrompt} onFavorite={toggleFavorite} />)}
        </div>
      )}
    </section>
  );
}
