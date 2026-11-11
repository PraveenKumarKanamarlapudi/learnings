// {{NAME}} placeholders. Names: letter/underscore first, then word chars, dot or dash.
const RE = /\{\{\s*([A-Za-z_][\w.-]*)\s*\}\}/g;

export const VARIABLE_RE_SOURCE = RE.source;

/** Unique variable names in first-appearance order. */
export function extractVariables(...texts: string[]): string[] {
  const seen = new Set<string>();
  for (const t of texts) for (const m of t.matchAll(RE)) seen.add(m[1]);
  return [...seen];
}

/** Replace variables that have a non-empty value; leave the rest as-is. */
export function fillVariables(text: string, values: Record<string, string>): string {
  return text.replace(RE, (whole, name: string) => (values[name] ? values[name] : whole));
}
