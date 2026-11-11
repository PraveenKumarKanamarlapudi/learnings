import { createContext, useContext } from 'react';
import type { Category, Prompt } from '../shared/schema';
import type { Filters } from './lib/filter';

export type View = 'dashboard' | 'prompts' | 'categories' | 'platforms' | 'favorites' | 'used' | 'added' | 'data' | 'settings';

export interface AppCtx {
  prompts: Prompt[];
  categories: Category[];
  reload: () => Promise<void>;
  toast: (msg: string, kind?: 'ok' | 'error') => void;
  author: string;
  setAuthor: (a: string) => void;
  openPrompt: (id: string) => void;
  editPrompt: (p: Prompt | 'new') => void;
  /** Quick copy: asks for variable values first when the prompt has placeholders. */
  copyPrompt: (p: Prompt) => void;
  usePrompt: (p: Prompt) => void;
  toggleFavorite: (p: Prompt) => void;
  /** Navigate to a view; `patch` presets the library filters. */
  go: (view: View, patch?: Partial<Filters>) => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

export const Ctx = createContext<AppCtx>(null as never);
export const useApp = () => useContext(Ctx);
