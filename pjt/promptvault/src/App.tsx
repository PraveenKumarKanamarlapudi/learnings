import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowDownUp, Clock, FolderTree, Layers, LayoutDashboard, Library as LibIcon, Menu, Moon, Plus, Search, Settings, Sparkles, Star, Sun } from 'lucide-react';
import type { Category, Prompt } from '../shared/schema';
import { api } from './api';
import { Ctx, type AppCtx, type View } from './ctx';
import { DEFAULT_FILTERS, type Filters } from './lib/filter';
import { copyText, useLocalStorage } from './lib/util';
import { Dashboard } from './components/Dashboard';
import { Library } from './components/Library';
import { CategoriesView, DataView, PlatformsView, SettingsView } from './components/Manage';
import { PromptDetail, UseDialog } from './components/PromptDetail';
import { PromptEditor } from './components/PromptEditor';
import { Button, cn } from './components/ui';

const NAV: { view: View; label: string; icon: ReactNode; preset?: Partial<Filters> }[] = [
  { view: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={16} /> },
  { view: 'prompts', label: 'All Prompts', icon: <LibIcon size={16} /> },
  { view: 'categories', label: 'Categories', icon: <FolderTree size={16} /> },
  { view: 'platforms', label: 'AI Platforms', icon: <Layers size={16} /> },
  { view: 'favorites', label: 'Favorites', icon: <Star size={16} />, preset: { favorites: true } },
  { view: 'used', label: 'Recently Used', icon: <Clock size={16} />, preset: { usedOnly: true, sort: 'lastUsed' } },
  { view: 'added', label: 'Recently Added', icon: <Sparkles size={16} />, preset: { sort: 'added' } },
  { view: 'data', label: 'Import / Export', icon: <ArrowDownUp size={16} /> },
  { view: 'settings', label: 'Settings', icon: <Settings size={16} /> },
];
const TITLES: Partial<Record<View, string>> = { prompts: 'All Prompts', favorites: 'Favorites', used: 'Recently Used', added: 'Recently Added' };

export default function App() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<View>('dashboard');
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editor, setEditor] = useState<Prompt | 'new' | null>(null);
  const [using, setUsing] = useState<Prompt | null>(null);
  const [menu, setMenu] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ msg: string; kind: 'ok' | 'error' } | null>(null);
  const [author, setAuthor] = useLocalStorage('pv.author', 'Me');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (document.documentElement.classList.contains('dark') ? 'dark' : 'light'));
  const search = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<number>(undefined);

  const reload = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([api.get<Prompt[]>('/prompts'), api.get<Category[]>('/categories')]);
      setPrompts(p);
      setCategories(c);
      setLoadError(null);
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setLoaded(true);
    }
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  const toast = useCallback((msg: string, kind: 'ok' | 'error' = 'ok') => {
    setToastMsg({ msg, kind });
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(null), kind === 'error' ? 6000 : 2500);
  }, []);

  const ctx: AppCtx = useMemo(() => ({
    prompts, categories, reload, toast, author, setAuthor, theme,
    openPrompt: setDetailId,
    editPrompt: setEditor,
    usePrompt: setUsing,
    copyPrompt: async (p) => {
      if (p.variables.length) return setUsing(p);
      if (!(await copyText(p.content))) return toast('Copy failed: clipboard not available', 'error');
      await api.post(`/prompts/${p.id}/use`);
      await reload();
      toast('Copied to clipboard');
    },
    toggleFavorite: async (p) => {
      await api.post(`/prompts/${p.id}/favorite`);
      await reload();
    },
    go: (v, patch) => {
      setFilters({ ...DEFAULT_FILTERS, ...(NAV.find((n) => n.view === v)?.preset ?? {}), ...patch });
      setView(v);
      setMenu(false);
    },
    toggleTheme: () => {
      const next = theme === 'dark' ? 'light' : 'dark';
      document.documentElement.classList.toggle('dark', next === 'dark');
      try { localStorage.theme = next; } catch { /* ignore */ }
      setTheme(next);
    },
  }), [prompts, categories, reload, toast, author, setAuthor, theme]);

  // Keyboard shortcuts: "/" or Ctrl/Cmd+K focus search, "n" new prompt (ignored while typing or in a dialog).
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable;
      if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing)) { e.preventDefault(); search.current?.focus(); }
      else if (e.key === 'n' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey && !editor && !detailId && !using) { e.preventDefault(); setEditor('new'); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [editor, detailId, using]);

  const onSearch = (q: string) => {
    if (!['prompts', 'favorites', 'used', 'added'].includes(view)) setView('prompts');
    setFilters((f) => ({ ...f, q }));
  };
  const closeDetail = useCallback(() => setDetailId(null), []);
  const showLibrary = view in TITLES;

  return (
    <Ctx.Provider value={ctx}>
      <div className="flex min-h-screen">
        {menu && <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setMenu(false)} />}
        <aside className={cn('fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-zinc-200 bg-white p-3 transition-transform dark:border-zinc-800 dark:bg-zinc-900 md:sticky md:top-0 md:h-screen md:translate-x-0', menu ? 'translate-x-0' : '-translate-x-full')}>
          <div className="mb-4 flex items-center gap-2 px-2 pt-1 font-semibold">
            <span className="grid size-7 place-items-center rounded-lg bg-indigo-600 text-white" aria-hidden>▸</span>PromptVault
          </div>
          <nav aria-label="Main" className="flex-1 space-y-0.5 overflow-y-auto">
            {NAV.map((n) => (
              <button key={n.view} onClick={() => ctx.go(n.view)} aria-current={view === n.view ? 'page' : undefined}
                className={cn('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition', view === n.view ? 'bg-indigo-50 font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300' : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800')}>
                {n.icon}{n.label}
              </button>
            ))}
          </nav>
          <p className="px-2 text-xs text-zinc-400">{prompts.length} prompts</p>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-zinc-200 bg-zinc-50/85 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/85">
            <Button variant="ghost" className="md:hidden" aria-label="Open menu" onClick={() => setMenu(true)}><Menu size={18} /></Button>
            <div className="relative max-w-xl flex-1">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input ref={search} type="search" aria-label="Search prompts" placeholder="Search title, content, tags, category, platform…   ( / )"
                className="w-full rounded-lg border border-zinc-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900"
                value={filters.q} onChange={(e) => onSearch(e.target.value)} />
            </div>
            <Button variant="ghost" aria-label="Toggle dark mode" onClick={ctx.toggleTheme}>{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</Button>
            <Button variant="primary" onClick={() => setEditor('new')}><Plus size={16} /><span className="hidden sm:inline">New prompt</span></Button>
          </header>

          <main className="mx-auto max-w-7xl p-4 md:p-6">
            {!loaded ? <p className="text-sm text-zinc-500">Loading…</p> : loadError ? (
              <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                {loadError} <Button size="sm" className="ml-2" onClick={() => void reload()}>Retry</Button>
              </div>
            ) : view === 'dashboard' ? <Dashboard />
              : showLibrary ? <Library title={TITLES[view]!} filters={filters} setFilters={setFilters} />
              : view === 'categories' ? <CategoriesView />
              : view === 'platforms' ? <PlatformsView />
              : view === 'data' ? <DataView />
              : <SettingsView />}
          </main>
        </div>
      </div>

      {detailId && <PromptDetail id={detailId} onClose={closeDetail} />}
      {editor && <PromptEditor prompt={editor === 'new' ? null : editor} onClose={() => setEditor(null)} onSaved={(p) => { setEditor(null); setDetailId(p.id); }} />}
      {using && <UseDialog prompt={using} onClose={() => setUsing(null)} />}
      {toastMsg && <div role="status" className={cn('pv-in fixed bottom-4 right-4 z-[60] max-w-sm rounded-lg px-4 py-2.5 text-sm text-white shadow-lg', toastMsg.kind === 'error' ? 'bg-red-600' : 'bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900')}>{toastMsg.msg}</div>}
    </Ctx.Provider>
  );
}
