// GEN1 TextViewer/highlightReaderMatch search semantics, adapted to the shared
// rendered Markdown DOM. Ranges preserve inline formatting and read-only bytes.
const blockSelector = 'p, li, h1, h2, h3, h4, h5, h6, pre, blockquote, td, th';

export function readerTextRanges(root: HTMLElement, query: string): Range[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];
  const segments: { node: Text; start: number; end: number }[] = [];
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_ALL);
  let text = '';
  let previousBlock: Element | null = null;
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (node.nodeType !== Node.TEXT_NODE) continue;
    const parent = node.parentElement;
    if (!parent || parent.closest('button, script, style, [aria-hidden="true"]')) continue;
    const block = parent.closest(blockSelector);
    if (segments.length > 0 && block !== previousBlock) text += '\n';
    const start = text.length;
    text += node.textContent ?? '';
    segments.push({ node: node as Text, start, end: text.length });
    previousBlock = block;
  }
  const lower = text.toLocaleLowerCase();
  const ranges: Range[] = [];
  for (let start = lower.indexOf(needle); start >= 0; start = lower.indexOf(needle, start + needle.length)) {
    const end = start + needle.length;
    const first = segments.find(segment => segment.start <= start && segment.end > start);
    const last = segments.find(segment => segment.start < end && segment.end >= end);
    if (!first || !last) continue;
    const range = root.ownerDocument.createRange();
    range.setStart(first.node, start - first.start);
    range.setEnd(last.node, end - last.start);
    ranges.push(range);
  }
  return ranges;
}

/** Same GEN1 containment rule; reject selections from another Reader or chrome. */
export function readerTextSelection(root: HTMLElement | null): { text: string; range: Range; heading?: string } | null {
  const selection = root?.ownerDocument.getSelection();
  if (!root || !selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  for (let index = 0; index < selection.rangeCount; index += 1) {
    const range = selection.getRangeAt(index);
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  }
  const text = selection.toString().trim();
  if (!text) return null;
  const range = selection.getRangeAt(0);
  const headings = [...root.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6')];
  const heading = headings.reverse().find(candidate => candidate.contains(range.startContainer)
    || Boolean(candidate.compareDocumentPosition(range.startContainer) & Node.DOCUMENT_POSITION_FOLLOWING))?.textContent?.trim();
  return { text, range, ...(heading ? { heading } : {}) };
}
