import type { MaterialLocatorV1, MaterialSourceV1, MaterialTransferPayloadV1 } from '../../lcos/huabu/apps/web/src/lcos/ui/professional/donor/Gen1TextTransfer';

/** GUI source addresses on an already explicit material revision. No entity,
 * reference key, Core contract, content write or independent position store. */
export interface NativeTextRangeLocator {
  readonly kind: 'selection'; readonly label?: string;
  readonly textRange: { readonly start: number; readonly end: number; readonly quote: string };
}
export type NativeTextSingleLocator = MaterialLocatorV1 | NativeTextRangeLocator;
export interface NativeTextLocatorGroup {
  readonly kind: 'selection'; readonly label?: string;
  readonly locations: readonly NativeTextSingleLocator[]; readonly selected?: NativeTextSingleLocator;
}
export type NativeTextSourceLocator = NativeTextSingleLocator | NativeTextLocatorGroup;
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (value: Record<string, unknown>, key: string) => Object.hasOwn(value, key);
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const address = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
export function hasNativeTextLocationExtension(value: unknown): boolean {
  return record(value) && ['textRange', 'locations', 'selected'].some(key => own(value, key));
}
function single(value: unknown): NativeTextSingleLocator | undefined {
  if (!record(value) || own(value, 'locations') || own(value, 'selected') || value.label !== undefined && typeof value.label !== 'string') return;
  const label = value.label !== undefined ? { label: value.label as string } : {};
  if (own(value, 'textRange')) {
    const range = value.textRange;
    if (value.kind !== 'selection' || !record(range) || !integer(range.start) || !integer(range.end)
      || range.end <= range.start || typeof range.quote !== 'string' || !range.quote.trim()
      || range.quote.length !== range.end - range.start) return;
    return { kind: 'selection', ...label, textRange: { start: range.start, end: range.end, quote: range.quote } };
  }
  if (value.kind === 'lines' && integer(value.start) && integer(value.end) && value.end >= value.start)
    return { kind: 'lines', start: value.start, end: value.end, ...label };
  if (value.kind === 'page' && integer(value.pageNumber) && value.pageNumber > 0) return { kind: 'page', pageNumber: value.pageNumber, ...label };
  if (value.kind === 'slide' && integer(value.slideNumber) && value.slideNumber > 0) return { kind: 'slide', slideNumber: value.slideNumber, ...label };
  if (value.kind === 'selection') return { kind: 'selection', ...label };
}
export function nativeTextLocationKey(value: NativeTextSingleLocator): string {
  if ('textRange' in value) return JSON.stringify(['selection', value.textRange.start, value.textRange.end, value.textRange.quote]);
  if (value.kind === 'lines') return JSON.stringify(['lines', value.start, value.end]);
  if (value.kind === 'page') return JSON.stringify(['page', value.pageNumber]);
  if (value.kind === 'slide') return JSON.stringify(['slide', value.slideNumber]);
  return JSON.stringify(['selection', value.label ?? null]);
}
export function normalizeNativeTextLocations(value: unknown): readonly NativeTextSingleLocator[] | undefined {
  if (!Array.isArray(value)) return;
  const result: NativeTextSingleLocator[] = [], seen = new Set<string>();
  for (const raw of value) { const locator = single(raw); if (!locator) return;
    const key = nativeTextLocationKey(locator); if (!seen.has(key)) { seen.add(key); result.push(locator); } }
  return result;
}
export function normalizeNativeTextLocator(value: unknown): NativeTextSourceLocator | undefined {
  if (!record(value)) return;
  if (!own(value, 'locations')) return single(value);
  if (value.kind !== 'selection' || own(value, 'textRange') || value.label !== undefined && typeof value.label !== 'string') return;
  const locations = normalizeNativeTextLocations(value.locations); if (!locations?.length) return;
  const selected = own(value, 'selected') ? single(value.selected) : undefined;
  if (own(value, 'selected') && !selected) return;
  const match = selected && locations.find(row => nativeTextLocationKey(row) === nativeTextLocationKey(selected));
  if (selected && !match) return;
  return { kind: 'selection', ...(typeof value.label === 'string' ? { label: value.label } : {}), locations, ...(match ? { selected: match } : {}) };
}
export function nativeTextLocatorGroup(value: readonly NativeTextSingleLocator[], selected?: NativeTextSingleLocator): NativeTextSourceLocator | undefined {
  const locations = normalizeNativeTextLocations(value); if (!locations?.length) return;
  const chosen = selected === undefined ? undefined : single(selected);
  const match = chosen && locations.find(row => nativeTextLocationKey(row) === nativeTextLocationKey(chosen));
  if (selected !== undefined && !match) return;
  return locations.length === 1 ? locations[0] : { kind: 'selection', locations, ...(match ? { selected: match } : {}) };
}

const blocks = 'p,li,h1,h2,h3,h4,h5,h6,pre,blockquote,td,th';
export interface NativeTextSegment { readonly node: Text; readonly start: number; readonly end: number }
export interface NativeTextIndex { readonly text: string; readonly segments: readonly NativeTextSegment[] }
/** The same real CT text nodes on capture and reopening. UTF16 follows DOM Range
 * offsets; block boundaries get one separator, never visual/Markdown line guesses. */
export function createNativeTextIndex(root: HTMLElement): NativeTextIndex {
  const segments: NativeTextSegment[] = []; let text = '', previousBlock: Element | null = null;
  const walker = root.ownerDocument.createTreeWalker(root, 4);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement, value = node.textContent ?? '';
    if (!parent || !value) continue;
    const excluded = parent.closest('button,script,style,[aria-hidden="true"],[hidden],[inert]');
    // The original Viewer briefly marks its outer shell inert/aria-hidden
    // during entry. That presentation state is outside this document Root and
    // cannot change persisted text offsets. Semantic hidden fragments inside
    // the actual Root remain excluded from both capture and reopening.
    if (excluded && root.contains(excluded)) continue;
    const block = parent.closest(blocks);
    if (!block && !value.trim()) continue;
    if (segments.length && block !== previousBlock && !text.endsWith('\n') && !value.startsWith('\n')) text += '\n';
    const start = text.length; text += value; segments.push({ node: node as Text, start, end: text.length }); previousBlock = block;
  }
  return { text, segments };
}
const safeBoundary = (text: string, offset: number) => !(offset > 0 && offset < text.length
  && /[\uD800-\uDBFF]/.test(text[offset - 1]!) && /[\uDC00-\uDFFF]/.test(text[offset]!));
function boundaryIndex(root: HTMLElement, index: NativeTextIndex, container: Node, offset: number, end: boolean): number | undefined {
  if (!root.contains(container) || !integer(offset)) return;
  const exact = index.segments.find(segment => segment.node === container);
  if (exact) return offset <= exact.node.length ? exact.start + offset : undefined;
  if (container.nodeType !== 1 || offset > container.childNodes.length) return;
  const boundary = root.ownerDocument.createRange(); boundary.setStart(container, offset); boundary.collapse(true);
  let previous: NativeTextSegment | undefined;
  for (const segment of index.segments) {
    const before = boundary.comparePoint(segment.node, 0), after = boundary.comparePoint(segment.node, segment.node.length);
    if (before >= 0) return end && previous ? previous.end : segment.start;
    if (after === 0) return segment.end;
    if (after > 0) return;
    previous = segment;
  }
  return previous?.end;
}
function rangeForOffsets(root: HTMLElement, index: NativeTextIndex, start: number, end: number): Range | undefined {
  const first = index.segments.find(segment => segment.start <= start && segment.end > start);
  const last = index.segments.find(segment => segment.start < end && segment.end >= end);
  if (!first || !last || !safeBoundary(index.text, start) || !safeBoundary(index.text, end)) return;
  const range = root.ownerDocument.createRange(); range.setStart(first.node, start - first.start); range.setEnd(last.node, end - last.start); return range;
}
export function readNativeTextSelection(root: HTMLElement | null, source: MaterialSourceV1, selection: Selection | null = root?.ownerDocument.getSelection() ?? null): MaterialTransferPayloadV1 | null {
  if (!root?.isConnected || root.closest('[aria-hidden="true"],[hidden],[inert]') || !root.getClientRects().length
    || !selection || selection.isCollapsed || selection.rangeCount !== 1
    || ![source.projectId, source.artifactId, source.revisionId].every(address)) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const index = createNativeTextIndex(root), rawStart = boundaryIndex(root, index, range.startContainer, range.startOffset, false), rawEnd = boundaryIndex(root, index, range.endContainer, range.endOffset, true);
  if (rawStart === undefined || rawEnd === undefined || rawEnd <= rawStart) return null;
  const raw = index.text.slice(rawStart, rawEnd), quote = raw.trim(); if (!quote) return null;
  const start = rawStart + raw.length - raw.trimStart().length, end = rawEnd - (raw.length - raw.trimEnd().length);
  if (!safeBoundary(index.text, start) || !safeBoundary(index.text, end)) return null;
  const selected = rangeForOffsets(root, index, start, end); if (!selected) return null;
  const heading = [...root.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6')].reverse().find(node => node.contains(selected.startContainer)
    || !!(node.compareDocumentPosition(selected.startContainer) & 4))?.textContent?.trim();
  const locator: NativeTextRangeLocator = { kind: 'selection', ...(heading ? { label: heading } : {}), textRange: { start, end, quote } };
  return { schemaVersion: 1, kind: 'material-transfer', capturedAt: new Date().toISOString(), source: { ...source, locator }, content: { kind: 'text', text: quote } };
}
export type NativeTextLocationResolution = { readonly status: 'none' }
  | { readonly status: 'choice' | 'unavailable'; readonly message: string }
  | { readonly status: 'ready'; readonly range: Range; readonly locator: NativeTextSingleLocator };
const unavailable = (message = '所记录的摘录位置不在这份正文中，未跳到其他段落。'): NativeTextLocationResolution => ({ status: 'unavailable', message });
export function resolveNativeTextLocation(root: HTMLElement, value: unknown, markdown?: string): NativeTextLocationResolution {
  if (value === undefined) return { status: 'none' };
  const locator = normalizeNativeTextLocator(value); if (!locator) return unavailable('所记录的来源位置无法识别，正文和阅读版本保留。');
  if ('locations' in locator) return locator.selected ? resolveNativeTextLocation(root, locator.selected, markdown)
    : { status: 'choice', message: '这份材料有多处摘录，请在阅读操作中选择要查看的位置。' };
  const index = createNativeTextIndex(root);
  if ('textRange' in locator) {
    const { start, end, quote } = locator.textRange;
    if (end > index.text.length || index.text.slice(start, end) !== quote) return unavailable();
    const range = rangeForOffsets(root, index, start, end); return range ? { status: 'ready', range, locator } : unavailable();
  }
  if (locator.kind === 'selection') {
    if (!locator.label?.trim()) return unavailable('这份旧摘录没有记录具体位置，正文和阅读版本保留。');
    const headings = [...root.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6')].filter(node => node.textContent?.trim() === locator.label!.trim());
    if (headings.length !== 1) return unavailable('所记录的章节无法唯一定位，未跳到其他同名段落。');
    const range = root.ownerDocument.createRange(); range.selectNodeContents(headings[0]!); return { status: 'ready', range, locator };
  }
  if (locator.kind === 'lines') {
    if (markdown !== undefined && locator.end >= markdown.replace(/\r\n?/g, '\n').split('\n').length) return unavailable();
    const candidates = [...root.querySelectorAll<HTMLElement>('[data-native-source-start-line][data-native-source-end-line]')].map(node => ({ node,
      start: Number(node.getAttribute('data-native-source-start-line')), end: Number(node.getAttribute('data-native-source-end-line')) }))
      .filter(row => Number.isSafeInteger(row.start) && row.start > 0 && Number.isSafeInteger(row.end) && row.end >= row.start);
    // A source line can span several sibling CT nodes (plain/strong/link).
    // Pick the first and last real text segment on that line, rather than one
    // element per line, so inline formatting cannot silently truncate a quote.
    const mapped = index.segments.map(segment => ({ segment, source: candidates.filter(row => row.node.contains(segment.node))
      .sort((a, b) => a.end - a.start - (b.end - b.start))[0] }));
    const startLine = locator.start + 1, endLine = locator.end + 1;
    const begin = mapped.find(row => row.source?.start === startLine && row.source.end <= endLine)?.segment;
    const finish = [...mapped].reverse().find(row => row.source?.end === endLine && row.source.start >= startLine)?.segment;
    if (!begin || !finish || begin.start > finish.end) return unavailable('所记录的原文行在此版本中没有可定位的正文，未跳到其他行。');
    let end = finish.end;
    // The CT span keeps its original inter-line newline. It is a separator,
    // not the beginning of the following requested line.
    if (index.text[end - 1] === '\n') end--;
    if (index.text[end - 1] === '\r') end--;
    const range = rangeForOffsets(root, index, begin.start, end);
    return range ? { status: 'ready', range, locator } : unavailable();
  }
  return unavailable('所记录的来源位置不适用于当前文本正文，未跳到其他段落。');
}

export function attachNativeTextLocationRestore(viewport: HTMLElement, resolve: () => NativeTextLocationResolution,
  options: { readonly onState?: (state: NativeTextLocationResolution) => void; readonly isCurrent?: () => boolean; readonly onUserCancel?: () => void; readonly highlightName?: string } = {}) {
  const view = viewport.ownerDocument.defaultView!; let pending = true, disposed = false, frame = 0, highlight: unknown;
  const graphics = view as unknown as { CSS?: { highlights?: Map<string, unknown> }; Highlight?: new (...ranges: Range[]) => unknown };
  const images = [...viewport.querySelectorAll('img')], fonts = viewport.ownerDocument.fonts;
  const removeHighlight = () => { if (options.highlightName && graphics.CSS?.highlights?.get(options.highlightName) === highlight) graphics.CSS.highlights.delete(options.highlightName); highlight = undefined; };
  const detach = () => { view.cancelAnimationFrame(frame); observer?.disconnect(); images.forEach(image => { image.removeEventListener('load', schedule); image.removeEventListener('error', schedule); });
    viewport.removeEventListener('wheel', userCancel); viewport.removeEventListener('touchstart', userCancel); viewport.removeEventListener('pointerdown', userCancel); viewport.removeEventListener('keydown', onKey); };
  function cancel() { pending = false; detach(); }
  function userCancel() { if (!pending || disposed) return; cancel(); options.onUserCancel?.(); }
  function onKey(event: KeyboardEvent) { if (['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key)) userCancel(); }
  function attempt() {
    if (!pending || disposed || !viewport.isConnected || options.isCurrent?.() === false) { cancel(); return; }
    if (viewport.clientHeight <= 0) return;
    const state = resolve();
    if (state.status !== 'ready') { options.onState?.(state); cancel(); return; }
    const rect = state.range.getBoundingClientRect(), bounds = viewport.getBoundingClientRect();
    if (!rect.width && !rect.height) return;
    viewport.scrollTop = Math.max(0, Math.min(viewport.scrollHeight - viewport.clientHeight, viewport.scrollTop + rect.top - bounds.top - viewport.clientHeight / 3));
    if (options.highlightName && graphics.CSS?.highlights && graphics.Highlight) { removeHighlight(); highlight = new graphics.Highlight(state.range); graphics.CSS.highlights.set(options.highlightName, highlight); }
    options.onState?.(state);
    if (images.every(image => image.complete) && (!fonts || fonts.status === 'loaded')) cancel();
  }
  function schedule() { if (pending && !disposed) { view.cancelAnimationFrame(frame); frame = view.requestAnimationFrame(attempt); } }
  const Observer = (view as unknown as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
  const observer = Observer ? new Observer(schedule) : undefined;
  observer?.observe(viewport); const root = viewport.querySelector('.lcos-reader-measure'); if (root) observer?.observe(root);
  images.forEach(image => { image.addEventListener('load', schedule); image.addEventListener('error', schedule); });
  viewport.addEventListener('wheel', userCancel, { passive: true }); viewport.addEventListener('touchstart', userCancel, { passive: true });
  viewport.addEventListener('pointerdown', userCancel, { passive: true }); viewport.addEventListener('keydown', onKey); void fonts?.ready.then(schedule, schedule); schedule();
  return { isPending: () => pending, cancel, dispose() { disposed = true; cancel(); removeHighlight(); } };
}
