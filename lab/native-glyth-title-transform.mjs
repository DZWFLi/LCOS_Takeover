import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
export const nativeGlythTitleSource = 'lcos/apps/local-core/src/metadata-repository.ts';
const marker = '/* LCOS original new conversation titles. */';
export function transformNativeGlythTitle(source, { sourcePath } = {}) {
  if (path.resolve(sourcePath ?? '').toLowerCase() !== path.resolve(root, nativeGlythTitleSource).toLowerCase())
    throw new Error('Original conversation title owner required.');
  if (source.includes(marker)) return source;
  const original = '`续工恢复 · ${current.provider}`';
  if (source.split(original).length !== 3) throw new Error('Original new-conversation title insertions changed.');
  const first = source.indexOf(original), second = source.indexOf(original, first + original.length);
  // Only the original INSERT defaults change. Existing user labels are never
  // renamed; the canonical session gets its connected conversation's label.
  return marker + '\n' + source.slice(0, first)
    + '(current.mode === "blank_new" || current.mode === "selected_context" ? "新对话" : ' + original + ')'
    + source.slice(first + original.length, second) + 'connected.label' + source.slice(second + original.length);
}
