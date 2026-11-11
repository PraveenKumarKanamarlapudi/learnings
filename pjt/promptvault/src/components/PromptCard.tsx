import { Copy, Star } from 'lucide-react';
import { PLATFORM_SHORT, type Prompt } from '../../shared/schema';
import { ago, categoryLabel } from '../lib/util';
import { Badge, Button, cn } from './ui';

interface Props {
  p: Prompt;
  onOpen: (p: Prompt) => void;
  onCopy: (p: Prompt) => void;
  onFavorite: (p: Prompt) => void;
}

export function PromptCard({ p, onOpen, onCopy, onFavorite }: Props) {
  return (
    <article className="group pv-in relative flex flex-col rounded-xl border border-zinc-200 bg-white p-4 transition hover:border-indigo-400 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-indigo-500">
      <div className="flex items-start justify-between gap-2">
        {/* The title button is stretched over the whole card so the card is one keyboard target. */}
        <h3 className="min-w-0 font-medium leading-snug">
          <button type="button" onClick={() => onOpen(p)} className="text-left after:absolute after:inset-0 after:content-[''] focus-visible:after:rounded-xl focus-visible:after:outline-2 focus-visible:after:outline-indigo-500">
            {p.title}
          </button>
        </h3>
        <div className="relative z-10 flex shrink-0 gap-0.5">
          <Button variant="ghost" size="sm" aria-label={p.isFavorite ? 'Remove from favorites' : 'Add to favorites'} aria-pressed={p.isFavorite} onClick={() => onFavorite(p)}>
            <Star size={15} className={cn(p.isFavorite && 'fill-amber-400 text-amber-400')} />
          </Button>
          <Button variant="ghost" size="sm" aria-label="Copy prompt" onClick={() => onCopy(p)}>
            <Copy size={15} />
          </Button>
        </div>
      </div>
      <p className="mt-1 line-clamp-2 min-h-10 text-sm text-zinc-500 dark:text-zinc-400">{p.description || p.content}</p>
      <div className="mt-3 flex flex-wrap gap-1">
        <Badge className="bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">{categoryLabel(p)}</Badge>
        {p.platforms.map((pl) => <Badge key={pl}>{PLATFORM_SHORT[pl]}</Badge>)}
      </div>
      {p.tags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1 text-xs text-zinc-500">
          {p.tags.slice(0, 4).map((t) => <span key={t}>#{t}</span>)}
          {p.tags.length > 4 && <span>+{p.tags.length - 4}</span>}
        </div>
      )}
      <div className="mt-auto flex items-center gap-3 pt-3 text-xs text-zinc-400">
        <span>v{p.version}</span>
        <span>{p.usageCount} {p.usageCount === 1 ? "use" : "uses"}</span>
        {p.variables.length > 0 && <span>{p.variables.length} {p.variables.length === 1 ? "var" : "vars"}</span>}
        <span className="ml-auto">{ago(p.updatedAt)}</span>
      </div>
    </article>
  );
}
