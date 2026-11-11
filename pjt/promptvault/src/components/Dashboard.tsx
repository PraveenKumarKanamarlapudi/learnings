import { useMemo, type ReactNode } from 'react';
import { Clock, FolderTree, Layers, Plus, Sparkles, Star, Library as LibIcon } from 'lucide-react';
import { PLATFORMS, PLATFORM_SHORT, type Prompt } from '../../shared/schema';
import { useApp, type View } from '../ctx';
import { RECENT_MS } from '../lib/filter';
import { ago, categoryLabel } from '../lib/util';
import { Button } from './ui';

function StatCard({ icon, label, value, hint, onClick }: { icon: ReactNode; label: string; value: number; hint?: string; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={!onClick} className="rounded-xl border border-zinc-200 bg-white p-4 text-left transition enabled:hover:border-indigo-400 enabled:hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center gap-2 text-sm text-zinc-500">{icon}{label}</div>
      <div className="mt-2 text-3xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-zinc-400">{hint}</div>}
    </button>
  );
}

function Bars({ title, rows, empty }: { title: string; rows: [string, number][]; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="mb-3 text-sm font-medium">{title}</h2>
      {rows.length === 0 ? <p className="text-sm text-zinc-400">{empty}</p> : (
        <ul className="space-y-2">
          {rows.map(([label, n]) => (
            <li key={label} className="grid grid-cols-[minmax(0,10rem)_1fr_2rem] items-center gap-2 text-sm">
              <span className="truncate" title={label}>{label}</span>
              <span className="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800" role="img" aria-label={`${label}: ${n}`}>
                <span className="block h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${(n / max) * 100}%` }} />
              </span>
              <span className="text-right tabular-nums text-zinc-500">{n}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ListCard({ title, items, sub, empty, onMore }: { title: string; items: Prompt[]; sub: (p: Prompt) => string; empty: string; onMore: () => void }) {
  const { openPrompt } = useApp();
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-medium">{title}</h2><Button size="sm" variant="ghost" onClick={onMore}>View all</Button></div>
      {items.length === 0 ? <p className="text-sm text-zinc-400">{empty}</p> : (
        <ul className="-mx-2">
          {items.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => openPrompt(p.id)} className="flex w-full items-baseline justify-between gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800">
                <span className="min-w-0 truncate text-sm">{p.title}</span>
                <span className="shrink-0 text-xs text-zinc-400">{sub(p)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function Dashboard() {
  const { prompts, categories, go, editPrompt } = useApp();
  const s = useMemo(() => {
    const now = Date.now();
    const count = (key: (p: Prompt) => string[]) => {
      const m = new Map<string, number>();
      prompts.forEach((p) => key(p).forEach((k) => m.set(k, (m.get(k) ?? 0) + 1)));
      return [...m].sort((a, b) => b[1] - a[1]);
    };
    return {
      added: [...prompts].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      used: prompts.filter((p) => p.usageCount > 0).sort((a, b) => b.usageCount - a.usageCount),
      favs: prompts.filter((p) => p.isFavorite),
      recentUsed: prompts.filter((p) => p.lastUsedAt && now - new Date(p.lastUsedAt).getTime() < RECENT_MS).length,
      recentAdded: prompts.filter((p) => now - new Date(p.createdAt).getTime() < RECENT_MS).length,
      byCategory: count((p) => [p.category ?? 'Uncategorised']),
      byPlatform: count((p) => p.platforms.map((x) => PLATFORM_SHORT[x])),
      platformsInUse: new Set(prompts.flatMap((p) => p.platforms)).size,
    };
  }, [prompts]);
  const to = (v: View) => () => go(v);
  const tops = categories.filter((c) => c.parentId === null).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-xl font-semibold">Dashboard</h1><p className="text-sm text-zinc-500">Everything in your prompt library at a glance.</p></div>
        <Button variant="primary" onClick={() => editPrompt('new')}><Plus size={16} />New prompt</Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard icon={<LibIcon size={15} />} label="Total Prompts" value={prompts.length} onClick={to('prompts')} />
        <StatCard icon={<FolderTree size={15} />} label="Categories" value={tops} hint={`${categories.length - tops} subcategories`} onClick={to('categories')} />
        <StatCard icon={<Star size={15} />} label="Favorite Prompts" value={s.favs.length} onClick={to('favorites')} />
        <StatCard icon={<Clock size={15} />} label="Recently Used" value={s.recentUsed} hint="last 7 days" onClick={to('used')} />
        <StatCard icon={<Sparkles size={15} />} label="Recently Added" value={s.recentAdded} hint="last 7 days" onClick={to('added')} />
        <StatCard icon={<Layers size={15} />} label="AI Platforms Supported" value={PLATFORMS.length} hint={`${s.platformsInUse} in use`} onClick={to('platforms')} />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <ListCard title="Recently added" items={s.added.slice(0, 5)} sub={(p) => ago(p.createdAt)} empty="No prompts yet." onMore={to('added')} />
        <ListCard title="Frequently used" items={s.used.slice(0, 5)} sub={(p) => `${p.usageCount} ${p.usageCount === 1 ? "use" : "uses"}`} empty="Copy a prompt and it shows up here." onMore={() => go('prompts', { sort: 'usage' })} />
        <ListCard title="Favorites" items={s.favs.slice(0, 5)} sub={(p) => categoryLabel(p)} empty="Star a prompt to pin it here." onMore={to('favorites')} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Bars title="Prompts by category" rows={s.byCategory.slice(0, 8)} empty="No prompts yet." />
        <Bars title="Prompts by AI platform" rows={s.byPlatform} empty="No platforms tagged yet." />
      </div>
    </div>
  );
}
