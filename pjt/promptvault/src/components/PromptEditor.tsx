import { useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Copy, Eye, EyeOff, Maximize2, Minimize2, Plus, X } from 'lucide-react';
import { PLATFORMS, PLATFORM_SHORT, PROMPT_TYPES, type Platform, type Prompt, type PromptInputT } from '../../shared/schema';
import { extractVariables, VARIABLE_RE_SOURCE } from '../../shared/variables';
import { api, ApiError } from '../api';
import { useApp } from '../ctx';
import { copyText } from '../lib/util';
import { Badge, Button, Field, Modal, cn, inputCls } from './ui';

export const Markdown = ({ text }: { text: string }) => (
  <div className="md"><ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>{text}</ReactMarkdown></div>
);

// Textarea with an identical-metrics layer behind it, so {{PLACEHOLDERS}} get a highlight without a rich-text engine.
const TEXT = 'font-mono text-sm leading-6 p-3 whitespace-pre-wrap break-words overflow-y-scroll';
function HighlightedTextarea({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  const back = useRef<HTMLDivElement>(null);
  const parts = useMemo(() => value.split(new RegExp(`(${VARIABLE_RE_SOURCE})`, 'g')), [value]);
  // split() with nested groups yields [text, match, name, text, ...]; matches are at index % 3 === 1
  return (
    <div className={cn('relative rounded-lg border border-zinc-300 bg-white focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900', className)}>
      <div ref={back} aria-hidden className={cn(TEXT, 'pointer-events-none absolute inset-0 text-transparent')}>
        {parts.map((s, i) => (i % 3 === 1 ? <mark key={i} className="rounded bg-indigo-200/80 text-transparent dark:bg-indigo-500/40">{s}</mark> : i % 3 === 0 ? s : null))}
        {'\n '}
      </div>
      <textarea
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        aria-label="Prompt content"
        onChange={(e) => onChange(e.target.value)}
        onScroll={(e) => back.current && (back.current.scrollTop = e.currentTarget.scrollTop)}
        className={cn(TEXT, 'relative block h-full w-full resize-none bg-transparent outline-none')}
      />
    </div>
  );
}

const blank = (author: string): PromptInputT => ({
  title: '', description: '', content: '', categoryId: null, promptType: 'User Prompt', platforms: [], tags: [], notes: '', expectedOutput: '', variants: {}, author,
});

export function PromptEditor({ prompt, onClose, onSaved }: { prompt: Prompt | null; onClose: () => void; onSaved: (p: Prompt) => void }) {
  const { categories, author, reload, toast } = useApp();
  const [f, setF] = useState<PromptInputT>(() => (prompt ? { ...prompt } : blank(author)));
  const [tagText, setTagText] = useState('');
  const [preview, setPreview] = useState(true);
  const [full, setFull] = useState(false);
  const [variantPlatform, setVariantPlatform] = useState<string>('');
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof PromptInputT>(k: K, v: PromptInputT[K]) => setF((s) => ({ ...s, [k]: v }));
  const variables = useMemo(() => extractVariables(f.content, ...Object.values(f.variants)), [f.content, f.variants]);
  const words = f.content.trim() ? f.content.trim().split(/\s+/).length : 0;
  const tops = categories.filter((c) => c.parentId === null);

  const addTags = (raw: string) => {
    const add = raw.split(',').map((t) => t.trim().replace(/^#/, '')).filter((t) => t && !f.tags.includes(t));
    if (add.length) set('tags', [...f.tags, ...add]);
    setTagText('');
  };
  const togglePlatform = (p: Platform) => set('platforms', f.platforms.includes(p) ? f.platforms.filter((x) => x !== p) : [...f.platforms, p]);
  const freePlatforms = PLATFORMS.filter((p) => !(p in f.variants));

  async function save() {
    setSaving(true);
    setErrors([]);
    try {
      const body = { ...f, tags: tagText.trim() ? [...f.tags, tagText.trim()] : f.tags };
      const saved = prompt ? await api.put<Prompt>(`/prompts/${prompt.id}`, body) : await api.post<Prompt>('/prompts', body);
      await reload();
      toast(prompt ? (saved.version > prompt.version ? `Saved as version ${saved.version}` : 'No changes to save') : 'Prompt created');
      onSaved(saved);
    } catch (e) {
      const err = e as ApiError;
      setErrors(err.issues?.length ? err.issues.map((i) => `${i.path}: ${i.message}`) : [err.message]);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      size={full ? 'full' : 'lg'}
      title={prompt ? `Edit: ${prompt.title}` : 'New prompt'}
      onClose={onClose}
      footer={
        <>
          {errors.length > 0 && (
            <ul role="alert" className="mr-auto text-xs text-red-600">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
          )}
          {prompt && <span className="mr-2 text-xs text-zinc-400">Saving creates version {prompt.version + 1}; v{prompt.version} stays in history.</span>}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save prompt'}</Button>
        </>
      }
    >
      <div className="grid gap-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title *"><input className={inputCls} value={f.title} onChange={(e) => set('title', e.target.value)} autoFocus /></Field>
          <Field label="Prompt type">
            <select className={inputCls} value={f.promptType} onChange={(e) => set('promptType', e.target.value as PromptInputT['promptType'])}>
              {PROMPT_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Short description"><input className={inputCls} value={f.description} onChange={(e) => set('description', e.target.value)} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category / subcategory">
            <select className={inputCls} value={f.categoryId ?? ''} onChange={(e) => set('categoryId', e.target.value ? Number(e.target.value) : null)}>
              <option value="">Uncategorised</option>
              {tops.map((t) => (
                <optgroup key={t.id} label={t.name}>
                  <option value={t.id}>{t.name} (general)</option>
                  {categories.filter((c) => c.parentId === t.id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </optgroup>
              ))}
            </select>
          </Field>
          <Field label="Tags" hint="Press Enter or comma to add">
            <div className={cn(inputCls, 'flex flex-wrap items-center gap-1 py-1.5')}>
              {f.tags.map((t) => (
                <Badge key={t} className="gap-1">#{t}<button type="button" aria-label={`Remove tag ${t}`} onClick={() => set('tags', f.tags.filter((x) => x !== t))}><X size={11} /></button></Badge>
              ))}
              <input
                aria-label="Add tag"
                className="min-w-20 flex-1 bg-transparent outline-none"
                value={tagText}
                onChange={(e) => (e.target.value.includes(',') ? addTags(e.target.value) : setTagText(e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); addTags(tagText); }
                  if (e.key === 'Backspace' && !tagText && f.tags.length) set('tags', f.tags.slice(0, -1));
                }}
                onBlur={() => addTags(tagText)}
              />
            </div>
          </Field>
        </div>

        <fieldset>
          <legend className="mb-1 text-xs font-medium text-zinc-500">Compatible AI platforms</legend>
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map((p) => (
              <button key={p} type="button" aria-pressed={f.platforms.includes(p)} onClick={() => togglePlatform(p)}
                className={cn('rounded-full border px-3 py-1 text-xs transition', f.platforms.includes(p) ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300' : 'border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800')}>
                {p}
              </button>
            ))}
          </div>
        </fieldset>

        <div>
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-zinc-500">Prompt (Markdown) *</span>
            <span className="text-xs text-zinc-400">{f.content.length} chars · {words} words</span>
            <div className="ml-auto flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => copyText(f.content).then((ok) => toast(ok ? 'Copied' : 'Copy failed', ok ? 'ok' : 'error'))}><Copy size={14} />Copy</Button>
              <Button size="sm" variant="ghost" onClick={() => setPreview(!preview)}>{preview ? <EyeOff size={14} /> : <Eye size={14} />}{preview ? 'Hide preview' : 'Preview'}</Button>
              <Button size="sm" variant="ghost" onClick={() => setFull(!full)}>{full ? <Minimize2 size={14} /> : <Maximize2 size={14} />}{full ? 'Exit full screen' : 'Full screen'}</Button>
            </div>
          </div>
          <div className={cn('grid gap-3', preview && 'md:grid-cols-2')}>
            <HighlightedTextarea value={f.content} onChange={(v) => set('content', v)} placeholder="You are an expert {{ROLE}}…" className={full ? 'h-[calc(100vh-24rem)] min-h-64' : 'h-72'} />
            {preview && (
              <div className={cn('overflow-auto rounded-lg border border-zinc-200 p-3 dark:border-zinc-800', full ? 'h-[calc(100vh-24rem)] min-h-64' : 'h-72')} aria-label="Preview">
                {f.content ? <Markdown text={f.content} /> : <p className="text-sm text-zinc-400">Live preview appears here.</p>}
              </div>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-zinc-500">Variables detected:</span>
            {variables.length ? variables.map((v) => <Badge key={v} className="bg-indigo-50 font-mono text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">{`{{${v}}}`}</Badge>) : <span className="text-zinc-400">none. Use {'{{NAME}}'} to add one.</span>}
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="text-xs font-medium text-zinc-500">Platform-specific variants</span>
            <span className="text-xs text-zinc-400">Optional. Tools, system instructions and metadata are not interchangeable across platforms.</span>
          </div>
          {Object.entries(f.variants).map(([pl, text]) => (
            <div key={pl} className="mb-3">
              <div className="mb-1 flex items-center justify-between"><Badge>{PLATFORM_SHORT[pl as Platform] ?? pl}</Badge>
                <Button size="sm" variant="ghost" aria-label={`Remove ${pl} variant`} onClick={() => set('variants', Object.fromEntries(Object.entries(f.variants).filter(([k]) => k !== pl)))}><X size={14} /></Button>
              </div>
              <textarea aria-label={`${pl} variant`} className={cn(inputCls, 'h-32 font-mono')} value={text} onChange={(e) => set('variants', { ...f.variants, [pl]: e.target.value })} />
            </div>
          ))}
          {freePlatforms.length > 0 && (
            <div className="flex gap-2">
              <select aria-label="Variant platform" className={cn(inputCls, 'max-w-60')} value={variantPlatform} onChange={(e) => setVariantPlatform(e.target.value)}>
                <option value="">Add variant for…</option>
                {freePlatforms.map((p) => <option key={p}>{p}</option>)}
              </select>
              <Button disabled={!variantPlatform} onClick={() => { set('variants', { ...f.variants, [variantPlatform]: f.content }); setVariantPlatform(''); }}><Plus size={14} />Add (copy of base)</Button>
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Expected output (optional)"><textarea className={cn(inputCls, 'h-24')} value={f.expectedOutput} onChange={(e) => set('expectedOutput', e.target.value)} /></Field>
          <Field label="Personal notes"><textarea className={cn(inputCls, 'h-24')} value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
        </div>
        <Field label="Author"><input className={cn(inputCls, 'max-w-xs')} value={f.author} onChange={(e) => set('author', e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
