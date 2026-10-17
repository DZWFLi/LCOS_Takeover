import { ChevronDown, ChevronUp, Copy, GripVertical, List, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { useCloseOnEscape } from '@/hooks/useCloseOnEscape';

import { LCOS_MATERIAL_TRANSFER_MIME, materialCitationBlock, serializeMaterialTransfer } from './donor/Gen1TextTransfer';
import { readerTextRanges, readerTextSelection } from './readerTextRanges';

import type { MaterialSourceV1, MaterialTransferPayloadV1 } from './donor/Gen1TextTransfer';
import type { ClipboardEvent, DragEvent, KeyboardEvent, RefObject } from 'react';

export interface ReaderTextSection { readonly id: string; readonly label: string; readonly depth: number }

/** Adapt GEN1 TextViewer's navigation and SelectionDropHandle to the current
 * renderer. Exact revision identity comes from the Reader owner, never Current. */
export function useReaderTextFeatures({ containerRef, sections, prefix, source, onCiteSelection }: {
  readonly containerRef: RefObject<HTMLDivElement | null>;
  readonly sections: readonly ReaderTextSection[];
  readonly prefix: string;
  readonly source?: MaterialSourceV1;
  readonly onCiteSelection?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [ranges, setRanges] = useState<readonly Range[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [copyNote, setCopyNote] = useState('');
  const [selectionPoint, setSelectionPoint] = useState<{ left: number; top: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const draggedExcerpt = useRef<MaterialTransferPayloadV1 | null>(null);
  const searchName = `${prefix}-matches`;
  const activeName = `${prefix}-active`;
  const documentRoot = () => containerRef.current?.querySelector<HTMLElement>('.lcos-reader-measure') ?? null;

  useCloseOnEscape(outlineOpen || Boolean(query.trim()), () => {
    setQuery(''); setOutlineOpen(false); containerRef.current?.focus();
  });

  useEffect(() => {
    const root = containerRef.current?.querySelector<HTMLElement>('.lcos-reader-measure');
    setRanges(root ? readerTextRanges(root, query) : []);
    setActiveIndex(0);
  }, [containerRef, query, sections]);

  useEffect(() => {
    if (typeof CSS === 'undefined' || !CSS.highlights || typeof Highlight === 'undefined') return;
    CSS.highlights.set(searchName, new Highlight(...ranges));
    const active = ranges[activeIndex];
    CSS.highlights.set(activeName, new Highlight(...(active ? [active] : [])));
    return () => { CSS.highlights.delete(searchName); CSS.highlights.delete(activeName); };
  }, [ranges, activeIndex, searchName, activeName]);

  // GEN1 SelectionDropHandle update/containment logic, scoped and positioned
  // inside this Reader. Scrolling cannot leave a stray toolbar on the canvas.
  useEffect(() => {
    const update = () => {
      if (draggedExcerpt.current) return;
      const root = containerRef.current?.querySelector<HTMLElement>('.lcos-reader-measure') ?? null;
      const selected = readerTextSelection(root);
      const frame = containerRef.current?.closest<HTMLElement>('[data-lcos-reader-content-frame]');
      if (!source?.artifactId || !source.revisionId || !selected || !frame
        || typeof selected.range.getBoundingClientRect !== 'function') { setSelectionPoint(null); return; }
      const rect = selected.range.getBoundingClientRect();
      const bounds = frame.getBoundingClientRect();
      if (!rect.width || rect.bottom < bounds.top || rect.top > bounds.bottom) { setSelectionPoint(null); return; }
      setSelectionPoint({
        left: Math.max(4, Math.min(bounds.width - 230, rect.left - bounds.left)),
        top: Math.max(36, Math.min(bounds.height - 38, rect.bottom - bounds.top + 6)),
      });
    };
    const viewport = containerRef.current;
    document.addEventListener('selectionchange', update);
    viewport?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      document.removeEventListener('selectionchange', update);
      viewport?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [containerRef, source?.artifactId, source?.revisionId]);

  const payload = (): MaterialTransferPayloadV1 | null => {
    const selected = readerTextSelection(documentRoot());
    if (!selected || !source?.artifactId || !source.revisionId) return null;
    return {
      schemaVersion: 1, kind: 'material-transfer', capturedAt: new Date().toISOString(),
      source: { ...source, locator: { kind: 'selection', ...(selected.heading ? { label: selected.heading } : {}) } },
      content: { kind: 'text', text: selected.text },
    };
  };
  const citation = (transfer: MaterialTransferPayloadV1, includeAddress = false): string => materialCitationBlock(transfer.source,
    transfer.content.kind === 'text' ? transfer.content.text : '', {includeAddress});
  const onCopyCapture = (event: ClipboardEvent<HTMLDivElement>) => {
    const transfer = payload();
    if (!transfer || transfer.content.kind !== 'text') return;
    event.preventDefault(); event.stopPropagation();
    event.clipboardData.setData('text/plain', transfer.content.text);
    event.clipboardData.setData(LCOS_MATERIAL_TRANSFER_MIME, serializeMaterialTransfer(transfer));
  };
  const onDragStartCapture = (event: DragEvent<HTMLElement>) => {
    // Keep the shared renderer's ordinary link/image transport with its owner.
    if (event.target instanceof Element && event.target.closest('a,img')) return;
    const transfer = draggedExcerpt.current ?? payload();
    if (!transfer) { event.preventDefault(); return; }
    event.stopPropagation();
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData(LCOS_MATERIAL_TRANSFER_MIME, serializeMaterialTransfer(transfer));
    // Existing native Canvas text drop persists this readable source block.
    // Never send source-less text or invoke GEN1's unbound capture event.
    event.dataTransfer.setData('text/plain', citation(transfer));
  };
  const copyCitation = async () => {
    const transfer = payload();
    if (!transfer) return;
    try {
      await navigator.clipboard.writeText(citation(transfer, true));
      setCopyNote('已复制摘录与版本来源');
    } catch { setCopyNote('复制未成功，请用 Ctrl+C 复制选中文字'); }
  };
  const moveTo = (index: number) => {
    if (!ranges.length) return;
    const next = (index + ranges.length) % ranges.length;
    setActiveIndex(next);
    const range = ranges[next];
    const viewport = containerRef.current;
    if (!range || !viewport) return;
    if (typeof range.getBoundingClientRect === 'function') {
      const rect = range.getBoundingClientRect();
      viewport.scrollTop += rect.top - viewport.getBoundingClientRect().top - viewport.clientHeight / 3;
    } else range.startContainer.parentElement?.scrollIntoView?.({ block: 'center' });
    if (typeof CSS === 'undefined' || !CSS.highlights || typeof Highlight === 'undefined') {
      const selection = window.getSelection();
      selection?.removeAllRanges(); selection?.addRange(range);
    }
  };
  const onKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
      event.preventDefault(); event.stopPropagation(); inputRef.current?.focus(); inputRef.current?.select();
    }
  };

  return {
    onCopyCapture, onDragStartCapture, onKeyDownCapture,
    controls: <div className="lcos-reader-text-tools" data-lcos-reader-text-tools>
      <style>{`::highlight(${searchName}) { background:#f3dd8a; color:#262923; } ::highlight(${activeName}) { background:#ecad52; color:#262923; }`}</style>
      <button type="button" aria-label="文档目录" aria-expanded={outlineOpen} disabled={!sections.length}
        onClick={() => setOutlineOpen(value => !value)}><List size={15} /><span>目录</span></button>
      <label className="lcos-reader-search"><Search size={14} aria-hidden /><input ref={inputRef}
        aria-label="在文档中查找" placeholder="在文档中查找" value={query}
        onChange={event => setQuery(event.target.value)} onKeyDown={event => {
          if (event.key === 'Enter') { event.preventDefault(); moveTo(activeIndex + (event.shiftKey ? -1 : 1)); }
          if (event.key === 'Escape' && query) { event.preventDefault(); event.stopPropagation(); setQuery(''); }
        }} />
        {query && <button type="button" aria-label="清除查找" onClick={() => { setQuery(''); inputRef.current?.focus(); }}><X size={13} /></button>}
      </label>
      {query.trim() && <>
        <output data-lcos-reader-match-count aria-live="polite">{ranges.length ? `${activeIndex + 1}/${ranges.length}` : '0 处'}</output>
        <button type="button" aria-label="上一个匹配" disabled={!ranges.length} onClick={() => moveTo(activeIndex - 1)}><ChevronUp size={15} /></button>
        <button type="button" aria-label="下一个匹配" disabled={!ranges.length} onClick={() => moveTo(activeIndex + 1)}><ChevronDown size={15} /></button>
      </>}
      {copyNote && <span role="status" className="lcos-reader-copy-note">{copyNote}</span>}
    </div>,
    outline: outlineOpen && <nav aria-label="文档目录" className="lcos-reader-outline">
      {sections.map(section => <button type="button" key={section.id} style={{ paddingLeft: 10 + (section.depth - 1) * 10 }}
        onClick={() => [...(documentRoot()?.querySelectorAll<HTMLElement>('[id]') ?? [])]
          .find(heading => heading.id === section.id)?.scrollIntoView({ block: 'start', behavior: 'smooth' })}>
        {section.label}
      </button>)}
    </nav>,
    selectionToolbar: selectionPoint && <div data-lcos-reader-selection-tools className="lcos-reader-selection-tools" style={selectionPoint}
      onPointerDown={event => {
        event.stopPropagation();
        if ((event.target as Element).closest('[draggable="true"]')) draggedExcerpt.current = payload();
      }} onMouseDown={event => {
        if (!(event.target as Element).closest('[draggable="true"]')) event.preventDefault();
      }}>
      {onCiteSelection && <button type="button" onClick={onCiteSelection}>摘录到输入</button>}
      <button type="button" onClick={() => { void copyCitation(); }}><Copy size={13} />带来源复制</button>
      <button type="button" draggable aria-label="拖动摘录到画布" title="拖到画布，生成带来源的摘录"
        onDragStart={onDragStartCapture}
        onClick={() => { draggedExcerpt.current = null; setSelectionPoint(null); }}
        onDragEnd={() => { draggedExcerpt.current = null; setSelectionPoint(null); }}><GripVertical size={15} /></button>
    </div>,
  };
}
