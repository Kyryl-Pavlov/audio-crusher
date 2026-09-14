export function $<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
}

/** Like {@link $}, but returns null instead of throwing when the element is absent —
 *  for controls that only some hosts (e.g. the extension's trimmed side panel) render. */
export function $opt<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}
