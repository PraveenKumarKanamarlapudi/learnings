import { useEffect, useState } from 'react';
import type { Prompt } from '../../shared/schema';

export const fmtDate = (s: string) => new Date(s).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
export const fmtDateTime = (s: string) => new Date(s).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function ago(s: string, now = Date.now()) {
  const m = Math.max(0, Math.round((now - new Date(s).getTime()) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  if (m < 43200) return `${Math.round(m / 1440)}d ago`;
  return fmtDate(s);
}

export function download(name: string, text: string, mime = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'prompt';

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for non-secure contexts (e.g. opened over plain http on a LAN address)
    const t = document.createElement('textarea');
    t.value = text;
    document.body.appendChild(t);
    t.select();
    const ok = document.execCommand('copy');
    t.remove();
    return ok;
  }
}

export const categoryLabel = (p: Pick<Prompt, 'category' | 'subcategory'>) =>
  p.category ? (p.subcategory ? `${p.category} / ${p.subcategory}` : p.category) : 'Uncategorised';

/** Portable shape used for JSON export (category as a path, not a database id). */
export const toExport = (p: Prompt) => ({
  id: p.id, title: p.title, description: p.description, content: p.content,
  category: p.category, subcategory: p.subcategory,
  promptType: p.promptType, platforms: p.platforms, tags: p.tags, variables: p.variables, variants: p.variants,
  version: p.version, author: p.author, isFavorite: p.isFavorite, usageCount: p.usageCount,
  notes: p.notes, expectedOutput: p.expectedOutput, createdAt: p.createdAt, updatedAt: p.updatedAt,
});

export const exportJson = (ps: Prompt[]) =>
  JSON.stringify({ format: 'promptvault', version: 1, exportedAt: new Date().toISOString(), prompts: ps.map(toExport) }, null, 2);

export function promptToMarkdown(p: Prompt) {
  const meta = [
    `# ${p.title}`,
    p.description && `> ${p.description}`,
    `- **Category:** ${categoryLabel(p)}`,
    `- **Type:** ${p.promptType}`,
    p.platforms.length > 0 && `- **Platforms:** ${p.platforms.join(', ')}`,
    p.tags.length > 0 && `- **Tags:** ${p.tags.join(', ')}`,
    p.variables.length > 0 && `- **Variables:** ${p.variables.map((v) => `\`{{${v}}}\``).join(', ')}`,
    `- **Version:** ${p.version} · **Author:** ${p.author} · **Updated:** ${p.updatedAt}`,
  ].filter(Boolean);
  const variants = Object.entries(p.variants).map(([k, v]) => `## Variant: ${k}\n\n${v}`);
  const extra = [p.expectedOutput && `## Expected output\n\n${p.expectedOutput}`, p.notes && `## Notes\n\n${p.notes}`];
  return [meta.join('\n'), `## Prompt\n\n${p.content}`, ...variants, ...extra].filter(Boolean).join('\n\n') + '\n';
}

const csvCell = (v: unknown) => {
  const s = Array.isArray(v) ? v.join('; ') : String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function promptsToCsv(ps: Prompt[]) {
  const head = ['id', 'title', 'description', 'category', 'subcategory', 'promptType', 'platforms', 'tags', 'variables', 'version', 'author', 'isFavorite', 'usageCount', 'lastUsedAt', 'createdAt', 'updatedAt'] as const;
  return [head.join(','), ...ps.map((p) => head.map((h) => csvCell(p[h])).join(','))].join('\n');
}

export function useLocalStorage(key: string, initial: string) {
  const [v, setV] = useState(() => {
    try { return localStorage.getItem(key) ?? initial; } catch { return initial; }
  });
  useEffect(() => {
    try { localStorage.setItem(key, v); } catch { /* private mode: keep in memory only */ }
  }, [key, v]);
  return [v, setV] as const;
}
