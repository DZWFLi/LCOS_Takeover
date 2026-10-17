import { ChevronDown, ChevronRight } from 'lucide-react';
import { useMemo, useState, useRef, useEffect, type CSSProperties, type ReactNode, type PointerEvent } from 'react';


import { Button } from '@/components/Common/Button';
import { toast } from '@/components/Common/Toast';
import useCanvasStore from '@/store/canvasStore';

import { layoutTextMindMap, textMindMapEdgePath } from './Gen1TextMindMap';
import { mindmapNodeSize } from './MatureMindMapLayout';
import { MindMapEditor } from './MindMapEditor';
import { extractOutlineBranchText, parseOutline } from './outlineTree';
import { textHierarchy, visibleTextHierarchy, type TextHierarchyRow, type TextPresentationMode } from './textHierarchy';
import { useLcosReferenceStore } from '../../lcosReferenceState';
import { createProjectText } from '../creation/projectTextCreation';
import { renameCanvasNode } from '../nodeRename';

import type { PresentationDensity } from '@local-creative-os/web-gen2';
import './text-faces.css';

const EMPTY_COLLAPSED: readonly string[] = [];
const MODES = [{ id: 'text', label: '正文' }, { id: 'outline', label: '大纲' }, { id: 'mindmap', label: '脑图' }] as const;
const isMode = (value: unknown): value is TextPresentationMode => value === 'text' || value === 'outline' || value === 'mindmap';

/** Same canonical text, three derived faces. Only presentation preferences are
 * written to the existing spatial node through Huabu's data/undo/save owner. */
export function LcosTextFaces({ nodeId, markdown, title, density, disabled = false, onSaveText, children }: {
  readonly nodeId: string;
  readonly markdown: string;
  readonly title: string;
  readonly density: PresentationDensity;
  readonly disabled?: boolean;
  readonly children: ReactNode;
  readonly onSaveText?: (body: string) => Promise<boolean>;
}): React.JSX.Element {
  const storedMode = useCanvasStore((state) => state.nodes.find((node) => node.id === nodeId)?.data.lcosTextViewMode);
  const storedCollapsed = useCanvasStore((state) => state.nodes.find((node) => node.id === nodeId)?.data.lcosTextCollapsedIds);
  const mode = isMode(storedMode) ? storedMode : 'text';
  const [editingMap, setEditingMap] = useState(false);
  const previousBody = useRef(markdown);
  const mapRef = useRef<HTMLDivElement>(null);
  const branch = useRef<{ pointerId: number; x: number; y: number; text: string; moved: boolean; ghost?: HTMLDivElement } | undefined>(undefined);
  const suppressClick = useRef(false);
  useEffect(() => {
    if (previousBody.current === markdown) return;
    previousBody.current = markdown;
    if (Array.isArray(storedCollapsed) && storedCollapsed.length) useCanvasStore.getState().updateNodeData(nodeId, { lcosTextCollapsedIds: [] });
  }, [markdown, nodeId, storedCollapsed]);
  useEffect(() => () => branch.current?.ghost?.remove(), []);
  const collapsed = useMemo(() => Array.isArray(storedCollapsed) ? storedCollapsed.filter((id): id is string => typeof id === 'string') : EMPTY_COLLAPSED, [storedCollapsed]);
  const allRows = useMemo(() => textHierarchy(markdown), [markdown]);
  // The reading projection skips fenced code. Never serialize that partial
  // projection over the complete canonical document.
  const canEditMap = onSaveText && !/^ {0,3}(?:`{3,}|~{3,})/m.test(markdown);
  const rows = useMemo(() => visibleTextHierarchy(allRows, collapsed), [allRows, collapsed]);
  const map = useMemo(() => mode === 'mindmap' ? layoutTextMindMap(rows, title) : null, [mode, rows, title]);
  const mapById = useMemo(() => new Map(map?.placements.map((item) => [item.row.id, item]) ?? []), [map]);
  const write = (patch: Record<string, unknown>) => {
    if (!disabled) useCanvasStore.getState().updateNodeData(nodeId, patch);
  };
  const switchMode = (next: TextPresentationMode) => {
    if (disabled) return;
    const state = useCanvasStore.getState();
    const node = state.nodes.find((item) => item.id === nodeId);
    if (!node) return;
    const dimension = (values: readonly unknown[], fallback: number) => values.map(Number).find((value) => Number.isFinite(value) && value > 0) ?? fallback;
    const oldSize = { width: dimension([node.style?.width, node.width, node.measured?.width], 244),
      height: dimension([node.style?.height, node.height, node.measured?.height], 150) };
    const storedSize = node.data.lcosTextBeforeMindMapSize as { width?: unknown; height?: unknown } | undefined;
    const size = next === 'mindmap' ? mindmapNodeSize(markdown, title)
      : mode === 'mindmap' ? { width: dimension([storedSize?.width], 244), height: dimension([storedSize?.height], 150) } : undefined;
    state.beginNodeDataGesture();
    try {
      state.updateNodeData(nodeId, { lcosTextViewMode: next,
        ...(next === 'mindmap' && mode !== 'mindmap' ? { lcosTextBeforeMindMapSize: oldSize } : {}) });
      if (size) {
        state.setNodeGeometry([{ nodeId: nodeId as `node-${string}`, size,
          position: { x: node.position.x + (oldSize.width - size.width) / 2,
            y: node.position.y + (oldSize.height - size.height) / 2 } }]);
      }
    } finally { state.endNodeDataGesture(); }
  };
  const startBranch = (event: PointerEvent<HTMLButtonElement>, row: TextHierarchyRow) => {
    event.stopPropagation(); if (disabled || event.button !== 0) return;
    const text = extractOutlineBranchText(parseOutline(markdown), row.id); if (!text) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    branch.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, text, moved: false };
  };
  const moveBranch = (event: PointerEvent<HTMLButtonElement>) => {
    const active = branch.current; if (!active || active.pointerId !== event.pointerId) return;
    if (!active.moved && Math.hypot(event.clientX - active.x, event.clientY - active.y) < 4) return;
    active.moved = true;
    if (!active.ghost) { const ghost = document.createElement('div'); ghost.className = 'lcos-text-branch-ghost';
      ghost.textContent = active.text.split('\n')[0] ?? '文本分支'; document.body.appendChild(ghost); active.ghost = ghost; }
    active.ghost.style.transform = `translate(${event.clientX + 14}px, ${event.clientY + 16}px)`;
  };
  const finishBranch = (event: PointerEvent<HTMLButtonElement>, cancelled: boolean) => {
    const active = branch.current; branch.current = undefined; active?.ghost?.remove();
    if (!active || active.pointerId !== event.pointerId) return;
    suppressClick.current = active.moved;
    if (cancelled || !active.moved || disabled) return;
    const rect = mapRef.current?.getBoundingClientRect();
    if (rect && event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom) return;
    const projectId = useLcosReferenceStore.getState().projectId, canvasId = useCanvasStore.getState().canvasId;
    if (!projectId || !canvasId) return;
    const rf = useCanvasStore.getState().rfInstance;
    if (!rf) return;
    const position = rf.screenToFlowPosition({ x: event.clientX + 14, y: event.clientY + 16 });
    void createProjectText({ projectId, canvasId, position, body: active.text, focus: false })
      .then(() => toast('已摘成项目文本，原分支保留')).catch((error: unknown) => toast(error instanceof Error ? error.message : '摘取尚未确认。', { tone: 'danger' }));
  };
  const toggle = (row: TextHierarchyRow) => write({ lcosTextCollapsedIds: collapsed.includes(row.id)
    ? collapsed.filter((id) => id !== row.id) : [...collapsed, row.id] });
  if (density === 'mark' || density === 'summary') return <>{children}</>;
  return <div className="lcos-text-faces" data-lcos-text-face={mode}>
    <div className="lcos-text-face-tabs nodrag nopan" role="tablist" tabIndex={-1} aria-label="文本呈现" data-floating-chrome
      onPointerDown={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}>
      {MODES.map(({ id, label }) => <Button key={id} role="tab" aria-selected={mode === id} disabled={disabled}
        size="sm" variant="ghost" data-lcos-text-face-mode={id} onClick={() => switchMode(id)}>{label}</Button>)}
      {mode !== 'text' && canEditMap && <Button size="sm" variant="ghost" disabled={disabled} onClick={() => setEditingMap(true)}>编辑导图</Button>}
      {mode !== 'text' && onSaveText && !canEditMap && <span>含代码块，请在正文编辑</span>}
    </div>
    <div className={`lcos-text-face-content${mode === 'text' ? '' : ' nodrag nopan nowheel'}`}
      onWheel={mode === 'text' ? undefined : (event) => event.stopPropagation()}>
      {mode === 'text' ? children : <>
        {mode === 'outline' && <div className="lcos-text-outline" role="tree" aria-label={`${title} 大纲`}>
          {rows.map((row) => <div key={row.id} role="treeitem" aria-selected={false} aria-level={row.depth + 1}
            aria-expanded={row.hasChildren ? !collapsed.includes(row.id) : undefined}
            className="lcos-text-outline-row" style={{ paddingLeft: `${row.depth * 16}px` }}>
            <Button variant="ghost" size="sm" disabled={disabled || !row.hasChildren} iconOnly
              aria-label={`${collapsed.includes(row.id) ? '展开' : '折叠'} ${row.title}`} onClick={() => toggle(row)}>
              {row.hasChildren ? collapsed.includes(row.id) ? <ChevronRight /> : <ChevronDown /> : <span>·</span>}
            </Button><span>{row.title}</span>
          </div>)}
        </div>}
        {mode === 'mindmap' && map && <div ref={mapRef} className="lcos-text-mindmap" aria-label={`${title} 脑图`}
          style={{ width: map.width, height: map.height }}>
          <svg width={map.width} height={map.height} aria-hidden="true">
            {map.placements.map((item) => <path key={item.row.id}
              d={textMindMapEdgePath(mapById.get(item.row.parentId ?? '') ?? map.rootCenter, item)}
              className={`lcos-text-mindmap-branch branch-${item.branch % 4}`} />)}
          </svg>
          <div className="lcos-text-mindmap-root" style={{ left: map.rootCenter.x, top: map.rootCenter.y, width: map.rootCenter.width, height: map.rootCenter.height }}>{title}</div>
          {map.placements.map((item) => <button key={item.row.id} type="button"
            disabled={disabled} aria-expanded={item.row.hasChildren ? !collapsed.includes(item.row.id) : undefined}
            aria-label={`${item.row.hasChildren ? collapsed.includes(item.row.id) ? '展开 ' : '折叠 ' : ''}${item.row.title}`}
            className={`lcos-text-mindmap-node branch-${item.branch % 4}`}
            style={{ left: item.x, top: item.y, width: item.width, height: item.height, fontSize: item.fontSize } as CSSProperties}
            onPointerDown={(event) => startBranch(event, item.row)} onPointerMove={moveBranch}
            onPointerUp={(event) => finishBranch(event, false)} onPointerCancel={(event) => finishBranch(event, true)}
            onDoubleClick={(event) => { event.stopPropagation(); if (canEditMap && !disabled) setEditingMap(true); }}
            onClick={(event) => { event.stopPropagation(); if (suppressClick.current) { suppressClick.current = false; return; }
              if (item.row.hasChildren) toggle(item.row); }}>{item.displayText}{item.row.hasChildren && <span>{collapsed.includes(item.row.id) ? '+' : '−'}</span>}</button>)}
        </div>}
        {allRows.length === 0 && <span className="lcos-text-face-empty">正文暂无大纲内容</span>}
      </>}
    </div>
    {editingMap && onSaveText && <MindMapEditor title={title} outline={markdown} disabled={disabled} onCancel={() => setEditingMap(false)}
      onSave={async (value) => {
        if (disabled) return false;
        const saved = await onSaveText(value.body);
        if (saved && value.title !== title) await renameCanvasNode(nodeId, value.title);
        if (saved) setEditingMap(false);
        return saved;
      }} />}
  </div>;
}
