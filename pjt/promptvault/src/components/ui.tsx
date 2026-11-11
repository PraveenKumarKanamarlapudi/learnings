import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { X } from 'lucide-react';

export const cn = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ');

export const inputCls =
  'w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:placeholder:text-zinc-500';

const VARIANT = {
  primary: 'bg-indigo-600 text-white hover:bg-indigo-500 border-transparent',
  outline: 'border-zinc-300 bg-white hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800',
  ghost: 'border-transparent hover:bg-zinc-200/70 dark:hover:bg-zinc-800',
  danger: 'border-red-300 text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950',
};

export function Button({ variant = 'outline', size = 'md', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof VARIANT; size?: 'sm' | 'md' }) {
  return (
    <button
      type="button"
      {...p}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-lg border font-medium transition disabled:pointer-events-none disabled:opacity-50',
        size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-2 text-sm',
        VARIANT[variant],
        className,
      )}
    />
  );
}

export const Badge = ({ children, className }: { children: ReactNode; className?: string }) => (
  <span className={cn('inline-flex items-center rounded-md bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300', className)}>{children}</span>
);

export const Field = ({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) => (
  <label className="block">
    <span className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</span>
    {children}
    {hint && <span className="mt-1 block text-xs text-zinc-400">{hint}</span>}
  </label>
);

export const EmptyState = ({ icon, title, body, action }: { icon: ReactNode; title: string; body?: string; action?: ReactNode }) => (
  <div className="flex flex-col items-center rounded-2xl border border-dashed border-zinc-300 px-6 py-14 text-center dark:border-zinc-700">
    <div className="mb-3 text-zinc-400">{icon}</div>
    <h3 className="font-medium">{title}</h3>
    {body && <p className="mt-1 max-w-sm text-sm text-zinc-500">{body}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

// Only the top-most modal reacts to Escape (detail -> "use" dialog stacks two).
// ponytail: no focus trap; the panel takes focus on open. Add one if keyboard users report tabbing out.
const stack: symbol[] = [];

export function Modal({ title, onClose, children, size = 'md', footer }: { title: ReactNode; onClose: () => void; children: ReactNode; size?: 'md' | 'lg' | 'full'; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const id = Symbol();
    stack.push(id);
    ref.current?.focus();
    const h = (e: KeyboardEvent) => e.key === 'Escape' && stack[stack.length - 1] === id && onClose();
    window.addEventListener('keydown', h);
    return () => {
      window.removeEventListener('keydown', h);
      stack.splice(stack.indexOf(id), 1);
    };
  }, [onClose]);
  return (
    <div className={cn('fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm', size !== 'full' && 'p-3 sm:p-6')} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        className={cn(
          'pv-in flex max-h-full w-full flex-col overflow-hidden bg-white shadow-2xl outline-none dark:bg-zinc-900',
          size === 'full' ? 'h-full' : 'rounded-2xl border border-zinc-200 dark:border-zinc-800',
          size === 'md' && 'max-w-xl',
          size === 'lg' && 'max-w-4xl',
        )}
      >
        <header className="flex items-center justify-between gap-3 border-b border-zinc-200 px-5 py-3 dark:border-zinc-800">
          <h2 className="min-w-0 truncate font-semibold">{title}</h2>
          <Button variant="ghost" size="sm" aria-label="Close" onClick={onClose}><X size={16} /></Button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-200 px-5 py-3 dark:border-zinc-800">{footer}</footer>}
      </div>
    </div>
  );
}
