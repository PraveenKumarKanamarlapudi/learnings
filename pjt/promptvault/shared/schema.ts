import { z } from 'zod';

export const PLATFORMS = [
  'Claude / Claude Code',
  'OpenAI ChatGPT / Codex',
  'Google Gemini',
  'GitHub Copilot',
  'Cursor',
  'Platform Independent',
  'Other',
] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_SHORT: Record<Platform, string> = {
  'Claude / Claude Code': 'Claude',
  'OpenAI ChatGPT / Codex': 'ChatGPT',
  'Google Gemini': 'Gemini',
  'GitHub Copilot': 'Copilot',
  Cursor: 'Cursor',
  'Platform Independent': 'Any',
  Other: 'Other',
};

export const PROMPT_TYPES = [
  'System Prompt',
  'User Prompt',
  'Agent Instructions',
  'Workflow Prompt',
  'Role-based Prompt',
  'Reusable Template',
] as const;
export type PromptType = (typeof PROMPT_TYPES)[number];

/** Editable fields. A new version is recorded whenever any of these change. */
export const PromptInput = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  description: z.string().max(1000).default(''),
  content: z.string().min(1, 'Prompt content is required'),
  categoryId: z.number().int().nullable().default(null),
  promptType: z.enum(PROMPT_TYPES).default('User Prompt'),
  platforms: z.array(z.enum(PLATFORMS)).default([]),
  tags: z.array(z.string().trim().min(1)).default([]),
  notes: z.string().default(''),
  expectedOutput: z.string().default(''),
  // Platform-specific variations of the base prompt: platform name -> full text.
  variants: z.record(z.string(), z.string()).default({}),
  author: z.string().trim().default('Me'),
});
export type PromptInputT = z.infer<typeof PromptInput>;

/** One prompt as it appears in an import / export file. Categories are portable names, not database ids. */
export const ImportPrompt = PromptInput.omit({ categoryId: true }).extend({
  id: z.string().optional(),
  category: z.string().nullish(),
  subcategory: z.string().nullish(),
  version: z.number().int().positive().optional(),
  isFavorite: z.boolean().optional(),
  usageCount: z.number().int().nonnegative().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type ImportPromptT = z.infer<typeof ImportPrompt>;

export const CategoryInput = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  parentId: z.number().int().nullable().default(null),
});

export interface Prompt {
  id: string;
  title: string;
  description: string;
  content: string;
  categoryId: number | null;
  category: string | null; // top-level category name
  subcategory: string | null;
  promptType: PromptType;
  platforms: Platform[];
  tags: string[];
  variables: string[];
  variants: Record<string, string>;
  version: number;
  author: string;
  isFavorite: boolean;
  usageCount: number;
  lastUsedAt: string | null;
  notes: string;
  expectedOutput: string;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: number;
  name: string;
  parentId: number | null;
  position: number;
}

export type Snapshot = Omit<PromptInputT, 'author'>;
export interface VersionRow {
  version: number;
  createdAt: string;
  note: string;
  snapshot: Snapshot;
}

export const DEFAULT_CATEGORIES: Record<string, string[]> = {
  'Software Development': ['Code Generation', 'Code Review', 'Code Refactoring', 'Debugging', 'Unit Testing', 'Documentation', 'Code Optimization'],
  'Embedded Systems': ['Embedded C/C++', 'RTOS', 'ARM / NEON', 'Device Drivers', 'Hardware Abstraction', 'Memory Optimization', 'Performance Analysis'],
  'AI & Machine Learning': ['Edge AI', 'LLM Integration', 'Model Optimization', 'AI Agents', 'RAG', 'Computer Vision', 'Speech Processing'],
  'Architecture & Engineering': ['System Architecture', 'Design Reviews', 'Technical Planning', 'Repository Analysis', 'Architecture Documentation', 'Technical Decision Making'],
  'Productivity & Management': ['Team Management', 'Communication', 'Meeting Preparation', 'Task Planning', 'Project Management', 'Performance Reviews'],
  'Research & Learning': ['Technical Research', 'Learning Roadmaps', 'Interview Preparation', 'Technology Comparison', 'Market Research'],
  'Finance & Business': ['Stock Market Analysis', 'Investment Research', 'Financial Planning', 'Business Analysis'],
  'Creative & Content': ['Image Generation', 'Video Generation', 'Content Writing', 'Social Media', 'Presentation Creation'],
};
