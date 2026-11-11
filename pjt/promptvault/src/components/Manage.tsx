import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Database, Download, FileUp, Pencil, Plus, Trash2, Upload, X } from 'lucide-react';
import { PLATFORMS, PLATFORM_SHORT, type Category } from '../../shared/schema';
import { api, ApiError } from '../api';
import { useApp } from '../ctx';
import { download, exportJson, promptsToCsv } from '../lib/util';
import { Badge, Button, inputCls, cn } from './ui';

// ---------------- categories ----------------

function NameForm({ initial = '', placeholder, onSave, onCancel }: { initial?: string; placeholder: string; onSave: (n: string) => void; onCancel: () => void }) {
  const [v, setV] = useState(initial);
  return (
    <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); v.trim() && onSave(v.trim()); }}>
      <input autoFocus aria-label={placeholder} placeholder={placeholder} className={cn(inputCls, 'py-1')} value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && onCancel()} />
      <Button size="sm" variant="primary" type="submit" aria-label="Save"><Check size={14} /></Button>
      <Button size="sm" aria-label="Cancel" onClick={onCancel}><X size={14} /></Button>
    </form>
  );
}

export function CategoriesView() {
  const { categories, prompts, reload, toast, go } = useApp();
  const [editing, setEditing] = useState<number | null>(null);
  const [adding, setAdding] = useState<number | 'top' | null>(null);
  const tops = categories.filter((c) => c.parentId === null);
  const countFor = (c: Category) => prompts.filter((p) => p.categoryId === c.id || categories.some((s) => s.id === p.categoryId && s.parentId === c.id)).length;

  const act = (fn: () => Promise<unknown>, ok?: string) => async () => {
    try { await fn(); await reload(); if (ok) toast(ok); setEditing(null); setAdding(null); } catch (e) { toast((e as ApiError).message, 'error'); }
  };
  const remove = (c: Category) => {
    const subs = categories.filter((x) => x.parentId === c.id).length;
    const n = prompts.filter((p) => p.categoryId === c.id).length;
    if (!confirm(`Delete "${c.name}"${subs ? ` and its ${subs} subcategories` : ''}? ${n ? `${n} prompt(s) directly in it move to ${c.parentId ? 'the parent category' : 'Uncategorised'}. ` : ''}Prompts are never deleted.`)) return;
    return act(() => api.del(`/categories/${c.id}`), 'Category deleted')();
  };

  const Row = ({ c, sub }: { c: Category; sub?: boolean }) => (
    <li className={cn('flex flex-wrap items-center gap-2 py-1.5', sub && 'pl-6')}>
      {editing === c.id ? (
        <NameForm initial={c.name} placeholder="Name" onCancel={() => setEditing(null)} onSave={(name) => act(() => api.put(`/categories/${c.id}`, { name }), 'Renamed')()} />
      ) : (
        <>
          <button className="text-left text-sm hover:text-indigo-600" onClick={() => go('prompts', sub ? { category: c.parentId, sub: c.id } : { category: c.id })}>{c.name}</button>
          <Badge>{countFor(c)}</Badge>
          <span className="ml-auto flex items-center gap-0.5">
            <Button size="sm" variant="ghost" aria-label={`Move ${c.name} up`} onClick={act(() => api.post(`/categories/${c.id}/move`, { dir: 'up' }))}><ArrowUp size={14} /></Button>
            <Button size="sm" variant="ghost" aria-label={`Move ${c.name} down`} onClick={act(() => api.post(`/categories/${c.id}/move`, { dir: 'down' }))}><ArrowDown size={14} /></Button>
            <select aria-label={`Move ${c.name} under`} className={cn(inputCls, 'w-auto! py-0.5 text-xs')} value="" onChange={(e) => e.target.value && act(() => api.put(`/categories/${c.id}`, { parentId: e.target.value === 'top' ? null : Number(e.target.value) }), 'Moved')()}>
              <option value="">Move to…</option>
              {c.parentId !== null && <option value="top">Top level</option>}
              {tops.filter((t) => t.id !== c.id && t.id !== c.parentId).map((t) => <option key={t.id} value={t.id}>Under {t.name}</option>)}
            </select>
            {!sub && <Button size="sm" variant="ghost" aria-label={`Add subcategory to ${c.name}`} onClick={() => setAdding(c.id)}><Plus size={14} /></Button>}
            <Button size="sm" variant="ghost" aria-label={`Rename ${c.name}`} onClick={() => setEditing(c.id)}><Pencil size={14} /></Button>
            <Button size="sm" variant="ghost" aria-label={`Delete ${c.name}`} onClick={() => remove(c)}><Trash2 size={14} /></Button>
          </span>
        </>
      )}
    </li>
  );

  return (
    <section aria-label="Categories">
      <div className="mb-4 flex items-center justify-between"><h1 className="text-xl font-semibold">Categories</h1>
        {adding === 'top' ? <NameForm placeholder="New category" onCancel={() => setAdding(null)} onSave={(name) => act(() => api.post('/categories', { name }), 'Category added')()} /> : <Button variant="primary" onClick={() => setAdding('top')}><Plus size={14} />New category</Button>}
      </div>
      <div className="space-y-3">
        {tops.map((t) => (
          <div key={t.id} className="rounded-xl border border-zinc-200 bg-white px-4 py-2 dark:border-zinc-800 dark:bg-zinc-900">
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              <Row c={t} />
              {categories.filter((c) => c.parentId === t.id).map((c) => <Row key={c.id} c={c} sub />)}
              {adding === t.id && <li className="py-2 pl-6"><NameForm placeholder="New subcategory" onCancel={() => setAdding(null)} onSave={(name) => act(() => api.post('/categories', { name, parentId: t.id }), 'Subcategory added')()} /></li>}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------- platforms ----------------

export function PlatformsView() {
  const { prompts, go } = useApp();
  return (
    <section aria-label="AI platforms">
      <h1 className="mb-1 text-xl font-semibold">AI Platforms</h1>
      <p className="mb-4 text-sm text-zinc-500">A prompt can target several platforms and carry platform-specific variants. Platform instructions, tools and metadata are not interchangeable, so keep variants separate.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {PLATFORMS.map((pl) => {
          const list = prompts.filter((p) => p.platforms.includes(pl));
          const variants = prompts.filter((p) => pl in p.variants).length;
          return (
            <button key={pl} onClick={() => go('prompts', { platform: pl })} className="rounded-xl border border-zinc-200 bg-white p-4 text-left transition hover:border-indigo-400 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900">
              <div className="text-xs text-zinc-400">{PLATFORM_SHORT[pl]}</div>
              <div className="font-medium">{pl}</div>
              <div className="mt-2 text-2xl font-semibold tabular-nums">{list.length}</div>
              <div className="text-xs text-zinc-400">prompts{variants ? ` · ${variants} with a custom variant` : ''}</div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ---------------- import / export / backup ----------------

interface ImportResult { file: string; imported?: number; skipped?: { index: number; title: string; reason: string }[]; errors?: { index: number; title: string; message: string }[]; fatal?: string }

export function DataView() {
  const { prompts, reload, toast } = useApp();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<ImportResult[]>([]);
  const importRef = useRef<HTMLInputElement>(null);
  const restoreRef = useRef<HTMLInputElement>(null);
  const stamp = new Date().toISOString().slice(0, 10);
  const chosen = prompts.filter((p) => selected.has(p.id));
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function readJson(f: File): Promise<unknown> {
    try { return JSON.parse(await f.text()); } catch { throw new Error('Not a valid JSON file'); }
  }

  async function importFiles(files: FileList | null) {
    if (!files?.length) return;
    const out: ImportResult[] = [];
    for (const f of Array.from(files)) {
      try {
        const r = await api.post<Omit<ImportResult, 'file'>>('/import', await readJson(f));
        out.push({ file: f.name, ...r });
      } catch (e) {
        out.push({ file: f.name, fatal: (e as Error).message });
      }
    }
    setResults(out);
    await reload();
    if (importRef.current) importRef.current.value = '';
  }

  async function backup() {
    download(`promptvault-backup-${stamp}.json`, JSON.stringify(await api.get('/backup'), null, 2));
  }
  async function restore(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    try {
      if (!confirm(`Restore "${f.name}"? This REPLACES all current prompts, categories and history. Download a backup first if unsure.`)) return;
      const r = await api.post<{ prompts: number; categories: number }>('/restore', await readJson(f));
      await reload();
      toast(`Restored ${r.prompts} prompts and ${r.categories} categories`);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      if (restoreRef.current) restoreRef.current.value = '';
    }
  }

  return (
    <section aria-label="Import and export" className="space-y-6">
      <h1 className="text-xl font-semibold">Import / Export</h1>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-1 flex items-center gap-2 font-medium"><Upload size={16} />Import prompts</h2>
          <p className="mb-3 text-sm text-zinc-500">JSON exported from PromptVault (or an array of prompts). Choose several files for a bulk import. Invalid entries and duplicates are reported, never silently dropped.</p>
          <input ref={importRef} type="file" accept="application/json,.json" multiple hidden onChange={(e) => importFiles(e.target.files)} aria-label="Import JSON files" />
          <Button variant="primary" onClick={() => importRef.current?.click()}><FileUp size={14} />Choose JSON file(s)</Button>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-1 flex items-center gap-2 font-medium"><Database size={16} />Backup &amp; restore</h2>
          <p className="mb-3 text-sm text-zinc-500">A backup contains every prompt, category and the full version history. Restoring replaces everything currently in the vault.</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={backup}><Download size={14} />Download backup</Button>
            <input ref={restoreRef} type="file" accept="application/json,.json" hidden onChange={(e) => restore(e.target.files)} aria-label="Restore backup file" />
            <Button variant="danger" onClick={() => restoreRef.current?.click()}>Restore from backup…</Button>
          </div>
        </div>
      </div>

      {results.length > 0 && (
        <div role="status" className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="font-medium">Import results</h2>
          {results.map((r) => (
            <div key={r.file} className="text-sm">
              <div className="font-medium">{r.file}</div>
              {r.fatal ? <p className="text-red-600">Failed: {r.fatal}</p> : (
                <>
                  <p className="text-green-700 dark:text-green-400">{r.imported} imported</p>
                  {r.skipped?.map((s) => <p key={s.index} className="text-amber-600">#{s.index + 1} “{s.title}” skipped: {s.reason}</p>)}
                  {r.errors?.map((s) => <p key={s.index} className="text-red-600">#{s.index + 1} “{s.title}” invalid: {s.message}</p>)}
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="mr-auto font-medium">Export</h2>
          <Button size="sm" disabled={!chosen.length} onClick={() => download(`promptvault-selected-${stamp}.json`, exportJson(chosen))}>Selected as JSON ({chosen.length})</Button>
          <Button size="sm" disabled={!prompts.length} onClick={() => download(`promptvault-all-${stamp}.json`, exportJson(prompts))}>All as JSON</Button>
          <Button size="sm" disabled={!prompts.length} onClick={() => download(`promptvault-metadata-${stamp}.csv`, promptsToCsv(prompts), 'text/csv')}>Metadata as CSV</Button>
        </div>
        {prompts.length === 0 ? <p className="text-sm text-zinc-400">Nothing to export yet.</p> : (
          <>
            <label className="mb-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={selected.size === prompts.length} onChange={(e) => setSelected(e.target.checked ? new Set(prompts.map((p) => p.id)) : new Set())} />Select all</label>
            <ul className="max-h-72 divide-y divide-zinc-100 overflow-auto dark:divide-zinc-800">
              {prompts.map((p) => (
                <li key={p.id}><label className="flex items-center gap-2 py-1.5 text-sm"><input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} /><span className="truncate">{p.title}</span></label></li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-zinc-400">Individual prompts can be exported as Markdown from their detail view.</p>
          </>
        )}
      </div>
    </section>
  );
}

// ---------------- settings ----------------

export function SettingsView() {
  const { author, setAuthor, theme, toggleTheme } = useApp();
  const keys: [string, string][] = [['/  or  Ctrl+K', 'Focus search'], ['n', 'New prompt'], ['Esc', 'Close dialog']];
  return (
    <section aria-label="Settings" className="max-w-xl space-y-6">
      <h1 className="text-xl font-semibold">Settings</h1>
      <label className="block"><span className="mb-1 block text-sm font-medium">Default author</span>
        <input className={inputCls} value={author} onChange={(e) => setAuthor(e.target.value)} /><span className="mt-1 block text-xs text-zinc-400">Used for new prompts. Stored in this browser.</span></label>
      <div className="flex items-center justify-between"><span className="text-sm font-medium">Theme</span><Button onClick={toggleTheme}>{theme === 'dark' ? 'Dark (switch to light)' : 'Light (switch to dark)'}</Button></div>
      <div><h2 className="mb-2 text-sm font-medium">Keyboard shortcuts</h2>
        <dl className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
          {keys.map(([k, d]) => <div key={k} className="flex justify-between px-4 py-2 text-sm"><dt className="text-zinc-500">{d}</dt><dd><kbd className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">{k}</kbd></dd></div>)}
        </dl></div>
      <p className="text-xs text-zinc-400">Data lives in <code>data/promptvault.db</code> (SQLite) next to the server. Use Import / Export for backups.</p>
    </section>
  );
}
