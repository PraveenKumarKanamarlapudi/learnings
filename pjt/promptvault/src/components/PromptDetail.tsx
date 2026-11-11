import { useEffect, useMemo, useState } from 'react';
import { diffLines } from 'diff';
import { Copy, Download, FileJson, FileText, History, Pencil, Star, Trash2, Wand2, CopyPlus, RotateCcw } from 'lucide-react';
import { PLATFORM_SHORT, type Platform, type Prompt, type VersionRow } from '../../shared/schema';
import { extractVariables, fillVariables } from '../../shared/variables';
import { api } from '../api';
import { useApp } from '../ctx';
import { categoryLabel, copyText, download, exportJson, fmtDateTime, promptToMarkdown, slug } from '../lib/util';
import { Markdown } from './PromptEditor';
import { Badge, Button, Field, Modal, cn, inputCls } from './ui';

/** Preview + fill {{variables}} + copy. Records one use on copy. */
export function UseDialog({ prompt, onClose }: { prompt: Prompt; onClose: () => void }) {
  const { reload, toast } = useApp();
  const options = ['Base prompt', ...Object.keys(prompt.variants)];
  const [which, setWhich] = useState(options[0]);
  const raw = which === options[0] ? prompt.content : prompt.variants[which];
  const names = useMemo(() => extractVariables(raw), [raw]);
  const [values, setValues] = useState<Record<string, string>>({});
  const filled = fillVariables(raw, values);
  const missing = names.filter((n) => !values[n]);

  async function copy() {
    const ok = await copyText(filled);
    if (!ok) return toast('Copy failed: clipboard not available', 'error');
    await api.post(`/prompts/${prompt.id}/use`);
    await reload();
    toast(missing.length ? `Copied (${missing.length} placeholder${missing.length > 1 ? 's' : ''} left unfilled)` : 'Copied to clipboard');
    onClose();
  }

  return (
    <Modal size="lg" title={`Use: ${prompt.title}`} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={copy}><Copy size={14} />Copy{missing.length ? ' (with placeholders)' : ''}</Button></>}>
      <div className="grid gap-4 p-5 md:grid-cols-2">
        <div className="space-y-3">
          {options.length > 1 && (
            <Field label="Version of the prompt">
              <select className={inputCls} value={which} onChange={(e) => setWhich(e.target.value)}>{options.map((o) => <option key={o}>{o}</option>)}</select>
            </Field>
          )}
          {names.length === 0 && <p className="text-sm text-zinc-500">This prompt has no {'{{variables}}'}. Review the preview and copy.</p>}
          {names.map((n) => (
            <Field key={n} label={n}>
              <textarea rows={n.toLowerCase().includes('code') || n.toLowerCase().includes('text') ? 5 : 1} className={cn(inputCls, 'font-mono')} value={values[n] ?? ''} onChange={(e) => setValues({ ...values, [n]: e.target.value })} placeholder={`{{${n}}}`} />
            </Field>
          ))}
        </div>
        <div>
          <div className="mb-1 text-xs font-medium text-zinc-500">Preview</div>
          <pre aria-label="Filled prompt preview" className="max-h-[55vh] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-zinc-200 bg-zinc-50 p-3 font-mono text-sm dark:border-zinc-800 dark:bg-zinc-950">{filled}</pre>
          {missing.length > 0 && <p className="mt-1 text-xs text-amber-600">Unfilled: {missing.join(', ')}</p>}
        </div>
      </div>
    </Modal>
  );
}

const FIELD_LABELS: Record<string, string> = { title: 'Title', description: 'Description', content: 'Content', categoryId: 'Category', promptType: 'Type', platforms: 'Platforms', tags: 'Tags', notes: 'Notes', expectedOutput: 'Expected output', variants: 'Platform variants' };

function VersionHistory({ prompt }: { prompt: Prompt }) {
  const { reload, toast } = useApp();
  const [rows, setRows] = useState<VersionRow[] | null>(null);
  const [a, setA] = useState<number>(0);
  const [b, setB] = useState<number>(0);

  useEffect(() => {
    api.get<VersionRow[]>(`/prompts/${prompt.id}/versions`).then((r) => {
      setRows(r);
      setB(r[0]?.version ?? 0);
      setA(r[1]?.version ?? r[0]?.version ?? 0);
    }).catch((e) => toast(e.message, 'error'));
  }, [prompt.id, prompt.version, toast]);

  if (!rows) return <p className="p-5 text-sm text-zinc-500">Loading history…</p>;
  const va = rows.find((r) => r.version === a), vb = rows.find((r) => r.version === b);
  const changed = va && vb ? Object.keys(FIELD_LABELS).filter((k) => JSON.stringify((va.snapshot as any)[k]) !== JSON.stringify((vb.snapshot as any)[k])) : [];

  async function restore(v: number) {
    if (!confirm(`Restore version ${v}? It will be saved as a new version; nothing is deleted.`)) return;
    await api.post(`/prompts/${prompt.id}/restore/${v}`);
    await reload();
    toast(`Restored v${v} as a new version`);
  }

  return (
    <div className="grid gap-4 p-5">
      <ol className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.version} className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800">
            <Badge className="bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">v{r.version}</Badge>
            {r.version === prompt.version && <Badge>current</Badge>}
            <span className="text-zinc-500">{fmtDateTime(r.createdAt)}</span>
            <span className="text-zinc-400">{r.note}</span>
            {r.version !== prompt.version && <Button size="sm" className="ml-auto" onClick={() => restore(r.version)}><RotateCcw size={13} />Restore</Button>}
          </li>
        ))}
      </ol>
      {rows.length > 1 && va && vb && (
        <section aria-label="Compare versions">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
            Compare
            <select aria-label="Older version" className={cn(inputCls, 'w-auto!')} value={a} onChange={(e) => setA(Number(e.target.value))}>{rows.map((r) => <option key={r.version} value={r.version}>v{r.version}</option>)}</select>
            with
            <select aria-label="Newer version" className={cn(inputCls, 'w-auto!')} value={b} onChange={(e) => setB(Number(e.target.value))}>{rows.map((r) => <option key={r.version} value={r.version}>v{r.version}</option>)}</select>
          </div>
          <p className="mb-2 text-xs text-zinc-500">{changed.length ? `Changed: ${changed.map((k) => FIELD_LABELS[k]).join(', ')}` : 'Identical.'}</p>
          <pre className="max-h-80 overflow-auto rounded-lg border border-zinc-200 font-mono text-xs dark:border-zinc-800">
            {diffLines(va.snapshot.content, vb.snapshot.content).map((part, i) => (
              <span key={i} className={cn('block whitespace-pre-wrap px-3', part.added && 'bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-300', part.removed && 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-300')}>
                {part.value.replace(/\n$/, '').split('\n').map((l) => `${part.added ? '+ ' : part.removed ? '- ' : '  '}${l}`).join('\n')}
              </span>
            ))}
          </pre>
        </section>
      )}
    </div>
  );
}

const Meta = ({ k, children }: { k: string; children: React.ReactNode }) => (
  <div><dt className="text-xs text-zinc-400">{k}</dt><dd className="text-sm">{children}</dd></div>
);

export function PromptDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { prompts, reload, toast, editPrompt, usePrompt, toggleFavorite } = useApp();
  const p = prompts.find((x) => x.id === id);
  const [tab, setTab] = useState<'prompt' | 'history'>('prompt');
  const [raw, setRaw] = useState(false);
  useEffect(() => { if (!p) onClose(); }, [p, onClose]);
  if (!p) return null;

  async function quickCopy(p: Prompt) {
    if (!(await copyText(p.content))) return toast('Copy failed: clipboard not available', 'error');
    await api.post(`/prompts/${p.id}/use`);
    await reload();
    toast('Copied to clipboard');
  }
  async function duplicate() {
    const d = await api.post<Prompt>(`/prompts/${p!.id}/duplicate`);
    await reload();
    toast('Duplicated');
    editPrompt(d);
    onClose();
  }
  async function remove() {
    if (!confirm(`Delete "${p!.title}" and its version history? This cannot be undone. (Export or back up first if unsure.)`)) return;
    await api.del(`/prompts/${p!.id}`);
    await reload();
    toast('Deleted');
    onClose();
  }

  return (
    <Modal
      size="lg"
      onClose={onClose}
      title={<span className="flex items-center gap-2">{p.title}<Badge>v{p.version}</Badge></span>}
      footer={
        <>
          <Button onClick={() => toggleFavorite(p)} aria-pressed={p.isFavorite}><Star size={14} className={cn(p.isFavorite && 'fill-amber-400 text-amber-400')} />{p.isFavorite ? 'Favorited' : 'Favorite'}</Button>
          <Button onClick={() => download(`${slug(p.title)}.md`, promptToMarkdown(p), 'text/markdown')}><FileText size={14} />Export .md</Button>
          <Button onClick={() => download(`${slug(p.title)}.json`, exportJson([p]))}><FileJson size={14} />Export .json</Button>
          <Button onClick={duplicate}><CopyPlus size={14} />Duplicate</Button>
          <Button variant="danger" onClick={remove}><Trash2 size={14} />Delete</Button>
          <Button onClick={() => editPrompt(p)}><Pencil size={14} />Edit</Button>
          <Button onClick={() => usePrompt(p)}><Wand2 size={14} />Use with variables</Button>
          <Button variant="primary" onClick={() => quickCopy(p)}><Copy size={14} />Copy</Button>
        </>
      }
    >
      <div className="flex gap-1 border-b border-zinc-200 px-5 pt-2 dark:border-zinc-800" role="tablist">
        {(['prompt', 'history'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn('-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm capitalize', tab === t ? 'border-indigo-500 font-medium' : 'border-transparent text-zinc-500')}>
            {t === 'history' && <History size={14} />}{t}
          </button>
        ))}
      </div>
      {tab === 'history' ? <VersionHistory prompt={p} /> : (
        <div className="grid gap-5 p-5">
          {p.description && <p className="text-zinc-600 dark:text-zinc-300">{p.description}</p>}
          <section>
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-xs font-medium text-zinc-500">Prompt</h3>
              <Button size="sm" variant="ghost" onClick={() => setRaw(!raw)}>{raw ? 'Rendered' : 'Raw'}</Button>
            </div>
            <div className="max-h-96 overflow-auto rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              {raw ? <pre className="whitespace-pre-wrap break-words font-mono text-sm">{p.content}</pre> : <Markdown text={p.content} />}
            </div>
          </section>
          {Object.entries(p.variants).map(([pl, text]) => (
            <section key={pl}>
              <h3 className="mb-1 text-xs font-medium text-zinc-500">Variant for {PLATFORM_SHORT[pl as Platform] ?? pl}</h3>
              <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-zinc-200 p-3 font-mono text-sm dark:border-zinc-800">{text}</pre>
            </section>
          ))}
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Meta k="Category">{categoryLabel(p)}</Meta>
            <Meta k="Type">{p.promptType}</Meta>
            <Meta k="Author">{p.author}</Meta>
            <Meta k="Platforms">{p.platforms.length ? <span className="flex flex-wrap gap-1">{p.platforms.map((x) => <Badge key={x}>{PLATFORM_SHORT[x]}</Badge>)}</span> : '—'}</Meta>
            <Meta k="Tags">{p.tags.length ? p.tags.map((t) => `#${t}`).join(' ') : '—'}</Meta>
            <Meta k="Variables">{p.variables.length ? <span className="font-mono text-xs">{p.variables.map((v) => `{{${v}}}`).join(' ')}</span> : '—'}</Meta>
            <Meta k="Created">{fmtDateTime(p.createdAt)}</Meta>
            <Meta k="Modified">{fmtDateTime(p.updatedAt)}</Meta>
            <Meta k="Usage">{p.usageCount} uses{p.lastUsedAt ? `, last ${fmtDateTime(p.lastUsedAt)}` : ''}</Meta>
          </dl>
          {p.expectedOutput && <section><h3 className="mb-1 text-xs font-medium text-zinc-500">Expected output</h3><p className="whitespace-pre-wrap text-sm">{p.expectedOutput}</p></section>}
          {p.notes && <section><h3 className="mb-1 text-xs font-medium text-zinc-500">Personal notes</h3><p className="whitespace-pre-wrap rounded-lg bg-amber-50 p-3 text-sm dark:bg-amber-950/30">{p.notes}</p></section>}
          <p className="flex items-center gap-1 text-xs text-zinc-400"><Download size={12} />Exports include all fields; JSON can be re-imported.</p>
        </div>
      )}
    </Modal>
  );
}
