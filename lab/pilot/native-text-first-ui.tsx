import { cloneElement, isValidElement, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
// @ts-expect-error served module queries the existing shipped Flow provider.
import { useViewport } from '/lcos/native-flow.js';
import useCanvasStore, { updateNativeTextPresentation } from './native-canvas-port';
import { readNativeTextReference, nativeTextWorldSize, nativeTextFacts } from './native-text-policy';
import { verifyNativeCanvasTextSave, acknowledgeNativeCanvasTextSave } from './native-text-save';
import { resolveNativeTextDensity, deriveNativeTextReadingMarkdown,
  nativeTextPendingMatchesContext, nativeTextSnapshotMatchesContext, nativeTextCarrierSize } from './native-text-first-policy';
// @ts-expect-error shared shipped owner, not a second bundled viewer registry.
import { nativeMaterialViewerAvailable, requestNativeMaterialView, hasNativeMindMapDraft } from '/lcos/agent-ui.js';
import { layoutTextMindMap, textMindMapEdgePath } from '../../lcos/huabu/apps/web/src/lcos/nodes/text/Gen1TextMindMap';
import { mindmapNodeSize } from '../../lcos/huabu/apps/web/src/lcos/nodes/text/MatureMindMapLayout';
import { textHierarchy, visibleTextHierarchy } from '../../lcos/huabu/apps/web/src/lcos/nodes/text/textHierarchy';
import type { CanvasTextSnapshot } from '../../lcos/apps/web-gen2/src/backend/artifacts';
import type { NativeTextSaveResult } from './native-text-save';
import { NativeTextNodeContext, LCOSUseNativeTextTools as usePrimaryNativeTextTools,
  type NativeTextNodeState, type NativeTextViewMenuItem } from './native-text-node-state';
import './native-text-first.css';
import './native-text-host.css';

type Props = { nodeId: string; data: Record<string, unknown>; width?: number; height?: number;
  selected?: boolean; dragging?: boolean; editable?: boolean; originalBody: ReactNode };
type OwnerProps = Omit<Props, 'originalBody'> & { children: ReactNode };

type NativeVersionReadingState = { versionView: boolean; openReading(): void };

function openNativeExactTextView(nodeId: string, expected?: ReturnType<typeof readNativeTextReference>): boolean {
  const canvas = useCanvasStore.getState(), host = window.__LCOS_NODE_LAB__;
  const node = canvas.nodes.find(value => value.id === nodeId), ref = readNativeTextReference(node?.data?.lcos_ref);
  if (canvas.status !== 'ready' || !canvas.canvasId || !canvas.rfInstance || host?.api !== canvas.rfInstance
    || typeof host.projectId !== 'string' || !host.projectId.trim() || !ref || ref.entityType !== 'view'
    || expected && ['entityType', 'entityId', 'artifactId', 'artifactViewId', 'revisionId'].some(key => ref[key as keyof typeof ref] !== expected[key as keyof typeof expected])) return false;
  if (!nativeMaterialViewerAvailable()) return false;
  requestNativeMaterialView({ projectId: host.projectId, artifactId: ref.artifactId, artifactViewId: ref.artifactViewId,
    revisionId: ref.revisionId, nodeId, sourceCanvasId: canvas.canvasId,
    ...(typeof node?.data?.title === 'string' ? { title: node.data.title } : {}) });
  return true;
}

/** Original t4 remains the command owner. A version View opens the exact
 * reader; only a primary/original donor Text can enter the native editor. */
export function LCOSRequestNativeTextEdit(nodeId: string, originalEdit: () => unknown): unknown {
  const node = useCanvasStore.getState().nodes.find(value => value.id === nodeId);
  if ((node?.data?.lcos_ref as Record<string, unknown> | undefined)?.entityType === 'view') return openNativeExactTextView(nodeId);
  return originalEdit();
}

/** Keep the original fullscreen slot and every other native action. Its
 * View branch reads a version; it does not add another menu or action band. */
export function LCOSUseNativeTextTools(nodeId: string, original: readonly (readonly any[])[], nativeIcon: ReactNode) {
  const state = useContext(NativeTextNodeContext) as (NativeTextNodeState & NativeVersionReadingState) | null;
  const primary = usePrimaryNativeTextTools(nodeId, original, nativeIcon);
  if (!state || state.nodeId !== nodeId || !state.versionView) return primary;
  return original.map(group => group.map(tool => tool.key === 'fullscreen'
    ? { ...tool, tooltip: '阅读正文', dataTestId: 'lcos-native-text-read-exact', handle: state.openReading } : tool));
}

/** Internal receipts remain in the port/developer log. Product feedback
 * describes what remains safe and the next real action, never raw IDs/errors. */
export function nativeTextSaveUserNotice(result: NativeTextSaveResult): string {
  if (result.contextCurrent === false || /context|scene|owner.changed/.test(result.status))
    return '原现场已变化，草稿仍留在原处；请回原文本核对。';
  if (result.status === 'conflict' || result.httpStatus === 409)
    return '原文已有新版本，当前草稿已保留；请先核对后再继续。';
  if (['unknown', 'unconfirmed', 'pending', 'waiting', 'blocked'].includes(result.status))
    return '保存结果尚未确认，草稿已保留；请核对原保存，不会重复提交。';
  if (/unavailable|network|readback|verify/.test(result.status))
    return '暂时无法核对保存结果，草稿已保留；请稍后再核对。';
  if (/identity|mismatch|invalid/.test(result.status))
    return '返回的保存记录与当前文本不一致，未采用；草稿已保留。';
  return '保存尚未完成，草稿已保留；请核对原保存后再继续。';
}

async function coreRead(path: string, signal?: AbortSignal): Promise<any> {
  const response = await fetch('/api/lcos/core' + path, { signal, cache: 'no-store', redirect: 'error' });
  const payload = await response.json();
  if (!response.ok || payload?.ok !== true) throw new Error(payload?.error?.message || 'Core 正文读取未确认。');
  return payload.value;
}

function NativeMapFace({ markdown, title, collapsed, onToggle }: {
  markdown: string; title: string; collapsed: readonly string[]; onToggle: (id: string) => void;
}) {
  const map = useMemo(() => layoutTextMindMap(visibleTextHierarchy(textHierarchy(markdown), collapsed), title), [markdown, title, collapsed]);
  const byId = useMemo(() => new Map(map.placements.map(item => [item.row.id, item])), [map]);
  return <div className="native-first-map-scroll nodrag nopan nowheel" onWheel={e => e.stopPropagation()}>
    <div className="native-first-map" role="tree" aria-label={`${title} 导图`} style={{ width: map.width, height: map.height }}>
      <svg width={map.width} height={map.height} aria-hidden="true">{map.placements.map(item =>
        <path key={item.row.id} d={textMindMapEdgePath(byId.get(item.row.parentId ?? '') ?? map.rootCenter, item)} />)}</svg>
      <span className="native-first-map-root" style={{ left: map.rootCenter.x, top: map.rootCenter.y, width: map.rootCenter.width }}>{title}</span>
      {map.placements.map(item => <button key={item.row.id} type="button" role="treeitem" aria-level={item.row.depth + 1}
        aria-expanded={item.row.hasChildren ? !collapsed.includes(item.row.id) : undefined}
        onClick={e => { e.stopPropagation(); if (item.row.hasChildren) onToggle(item.row.id); }}
        style={{ left: item.x, top: item.y, width: item.width, height: item.height, fontSize: item.fontSize }}>
        {item.displayText}{item.row.hasChildren ? collapsed.includes(item.row.id) ? ' ＋' : ' −' : ''}</button>)}
    </div>
  </div>;
}

/** The original r4/s4 renderer supplies one state owner for its native body
 * and existing sibling n4 toolbar. The provider adds no wrapper DOM. */
export function LCOSNativeTextNodeOwner(props: OwnerProps) {
  const canvas = useCanvasStore(s => s);
  const viewport = useViewport();
  const node = canvas.nodes.find(n => n.id === props.nodeId);
  const ref = readNativeTextReference(props.data.lcos_ref);
  const versionView = ref?.entityType === 'view';
  const project = window.__LCOS_NODE_LAB__?.projectId;
  const projectId = typeof project === 'string' ? project : '';
  const canvasId = canvas.canvasId;
  // Context identity is stable through this context's own save receipt; the
  // observed revision is checked separately so it cannot remount an editor.
  const key = JSON.stringify([projectId, canvasId, props.nodeId, ref?.entityType, ref?.entityId, ref?.artifactId, ref?.artifactViewId]);
  const api = canvas.rfInstance;
  type ScopedResult = { key: string; api: typeof api; result: NativeTextSaveResult };
  type ScopedNotice = { key: string; api: typeof api; message: string };
  type ReadState = { key: string; revisionId?: string; value?: CanvasTextSnapshot; error?: string };
  const [read, setRead] = useState<ReadState>({ key, revisionId: ref?.revisionId });
  const [tick, setTick] = useState(0);
  const [pendingTick, setPendingTick] = useState(0);
  const [pending, setPending] = useState<ScopedResult | null>(null);
  const [notice, setNotice] = useState<ScopedNotice | null>(null);
  const latest = useRef({ key, api: canvas.rfInstance });
  latest.current = { key, api: canvas.rfInstance };
  const currentPending = pending?.key === key && pending.api === api ? pending.result : null;
  const currentNotice = notice?.key === key && notice.api === api ? notice.message : '';
  const currentReadError = read.key === key && read.revisionId === ref?.revisionId ? read.error : undefined;
  const isCurrentContext = () => latest.current.key === key && latest.current.api === api;
  const setSceneNotice = (message: string) => setNotice(previous => isCurrentContext()
    ? { key, api, message } : previous);
  const clearSceneNotice = () => setNotice(previous => isCurrentContext()
    && previous?.key === key && previous.api === api ? null : previous);
  const setScenePending = (result: NativeTextSaveResult | null) => setPending(previous => {
    if (!isCurrentContext()) return previous;
    if (result) return { key, api, result };
    return previous?.key === key && previous.api === api ? null : previous;
  });
  const registeredPending = () => {
    if (!canvasId || !props.nodeId || !ref || !window.__LCOS_NATIVE_TEXT_SAVE_PORT__) return null;
    const operation = window.__LCOS_NATIVE_TEXT_SAVE_PORT__.getPending({ canvasId, nodeId: props.nodeId });
    return operation && nativeTextPendingMatchesContext(operation, { canvasId, nodeId: props.nodeId, reference: ref })
      ? operation : null;
  };
  const savePort = window.__LCOS_NATIVE_TEXT_SAVE_PORT__;
  // The original vZ queue and live node remain the only draft owners. The
  // port exposes presence/identity only; never copy its body into this state.
  const queued = savePort?.readQueuedAutosave?.(props.nodeId);
  const hasUnsavedDraft = !!queued && queued.count > 0 && queued.projectId === projectId
    && queued.canvasId === canvasId && queued.nodeId === props.nodeId && typeof props.data.text === 'string';
  useEffect(() => savePort?.subscribe(() => setPendingTick(value => value + 1)), [savePort, key, api]);
  useEffect(() => {
    const operation = registeredPending();
    const result = operation ? { status: operation.status, operationId: operation.operationId,
      reason: operation.reason || undefined } : null;
    setPending(previous => {
      if (latest.current.key !== key || latest.current.api !== api) return previous;
      if (result) return { key, api, result };
      return previous?.key === key && previous.api === api ? null : previous;
    });
  }, [key, api, canvasId, props.nodeId, ref?.entityType, ref?.entityId, ref?.artifactId, ref?.artifactViewId, pendingTick]);
  useEffect(() => {
    if (!ref || ref.entityType !== 'artifact' || !projectId || !canvasId || canvas.status !== 'ready') return;
    const revisionId = ref.revisionId;
    const controller = new AbortController();
    const query = new URLSearchParams({ canvasId, spatialId: props.nodeId });
    void Promise.all([coreRead('/projects/' + encodeURIComponent(projectId) + '/curation/canvas-text?' + query, controller.signal),
      coreRead('/artifacts/' + encodeURIComponent(ref.artifactId), controller.signal)])
      .then(([text, detail]) => {
        if (controller.signal.aborted || latest.current.key !== key || latest.current.api !== api) return;
        const live = useCanvasStore.getState();
        const liveRef = readNativeTextReference(live.nodes.find(n => n.id === props.nodeId)?.data?.lcos_ref);
        if (live.canvasId !== canvasId || live.rfInstance !== api || liveRef?.entityType !== ref.entityType
          || liveRef?.entityId !== ref.entityId || liveRef?.artifactViewId !== ref.artifactViewId
          || liveRef?.revisionId !== revisionId || text.revisionId !== liveRef.revisionId) return;
        nativeTextFacts({ projectId, canvasId, nodeId: props.nodeId, reference: ref, text, detail });
        setRead({ key, revisionId, value: text });
      }).catch(error => {
        if (!controller.signal.aborted && latest.current.key === key && latest.current.api === api) {
          console.debug('[LCOS native text read]', { projectId, canvasId, nodeId: props.nodeId, error });
          setRead({ key, revisionId, error: '正文版本暂时无法核对，原内容已保留；请稍后重读。' });
        }
      });
    return () => controller.abort();
  }, [key, ref?.revisionId, projectId, canvasId, props.nodeId, canvas.status, api, tick]);

  const ready = read.key === key && read.revisionId === ref?.revisionId && !!read.value
    && !currentReadError && read.value.revisionId === ref?.revisionId;
  const body = hasUnsavedDraft ? props.data.text as string : ready ? read.value!.body : typeof props.data.text === 'string' ? props.data.text : '';
  const title = ready ? read.value!.title : String(props.data.title || '文本');
  const mode = props.data.lcosTextViewMode === 'mindmap' ? 'mindmap' : 'text';
  const collapsed = useMemo(() => Array.isArray(props.data.lcosTextCollapsedIds)
    ? props.data.lcosTextCollapsedIds.filter((id): id is string => typeof id === 'string') : [], [props.data.lcosTextCollapsedIds]);
  const size = nativeTextWorldSize(node, props.width, props.height);
  const previous = useRef<any>(undefined);
  const densityInput = { worldWidth: size.width, worldHeight: size.height, zoom: viewport.zoom,
    dpr: window.devicePixelRatio || 1,
    phase: node?.resizing ? 'resizing' as const : props.dragging ? 'dragging' as const : props.selected ? 'selected' as const : 'rest' as const,
    previous: previous.current };
  const uncapped = resolveNativeTextDensity({ ...densityInput, nodeCount: 0 });
  const density = resolveNativeTextDensity({ ...densityInput, nodeCount: canvas.nodes.length });
  useEffect(() => { previous.current = uncapped; }, [uncapped]);
  const disabled = props.editable !== true || !ready || !!currentPending || !!registeredPending() || hasUnsavedDraft || ref?.entityType !== 'artifact';
  const canResumeMapDraft = () => {
    if (mode !== 'mindmap' || props.editable !== true || hasUnsavedDraft || !isCurrentContext()
      || !ref || ref.entityType !== 'artifact' || !projectId || !canvasId || !api) return false;
    const operation = registeredPending();
    return operation?.source === 'explicit'
      && hasNativeMindMapDraft(projectId, canvasId, props.nodeId, ref.artifactId, ref.artifactViewId!, operation.operationId)
      && savePort?.canResumeExplicitSave?.(operation.operationId, { projectId, canvasId, nodeId: props.nodeId,
        artifactId: ref.artifactId, artifactViewId: ref.artifactViewId!, revisionId: ref.revisionId!, api }) === true;
  };

  const consumeResult = (result: NativeTextSaveResult) => {
    const success = result.status === 'confirmed' || result.status === 'unchanged';
    const snapshotMatches = !!result.value && !!ref && nativeTextSnapshotMatchesContext(result.value,
      { projectId, canvasId, nodeId: props.nodeId, reference: ref! });
    if (!success || !snapshotMatches) console.debug('[LCOS native text receipt]', {
      operationId: result.operationId, status: result.status, reason: result.reason,
      httpStatus: result.httpStatus, errorCode: result.errorCode, contextCurrent: result.contextCurrent, snapshotMatches });
    if (success && snapshotMatches) {
      // A stale callback may release its own terminal port receipt, but must
      // never update this scene's read/editor/notice state.
      if (!isCurrentContext()) {
        if (result.operationId) acknowledgeNativeCanvasTextSave(result.operationId);
        return false;
      }
      setRead({ key, revisionId: result.value!.revisionId, value: result.value });
      setScenePending(null);
      clearSceneNotice();
      if (result.operationId) acknowledgeNativeCanvasTextSave(result.operationId);
      return true;
    }
    if (!isCurrentContext()) {
      if (!success && result.operationId && ref) {
        const staleOperation = window.__LCOS_NATIVE_TEXT_SAVE_PORT__?.getPending(result.operationId);
        if (staleOperation && nativeTextPendingMatchesContext(staleOperation,
          { canvasId, nodeId: props.nodeId, reference: ref })) {
          // A late terminal failure can remain in the registry after timeout.
          // acknowledge() is a no-op until settled, so unresolved work survives.
          acknowledgeNativeCanvasTextSave(result.operationId);
        }
      }
      return false;
    }
    const operation = result.operationId ? window.__LCOS_NATIVE_TEXT_SAVE_PORT__?.getPending(result.operationId) : null;
    const operationMatches = !!operation && !!ref && nativeTextPendingMatchesContext(operation,
      { canvasId, nodeId: props.nodeId, reference: ref });
    let retained = operationMatches && operation
      ? { status: operation.status, operationId: operation.operationId, reason: operation.reason || result.reason }
      : null;
    if (!success && result.operationId && operationMatches && acknowledgeNativeCanvasTextSave(result.operationId)) {
      retained = null;
    }
    setSceneNotice(success ? '返回的保存记录与当前文本不一致，未采用；草稿已保留。'
      : nativeTextSaveUserNotice(result));
    setScenePending(retained);
    return false;
  };
  const openMapEditor = () => {
    const resuming = canResumeMapDraft();
    if (!ref || !projectId || !canvasId || props.editable !== true || hasUnsavedDraft
      || (!ready || currentPending || registeredPending()) && !resuming) return;
    if (!nativeMaterialViewerAvailable()) { setSceneNotice('原阅读入口尚未就绪，导图仍保留。'); return; }
    clearSceneNotice();
    requestNativeMaterialView({ projectId, artifactId: ref.artifactId, revisionId: ref.revisionId,
      artifactViewId: ref.artifactViewId, nodeId: props.nodeId, sourceCanvasId: canvasId, title, editMode: 'mindmap' });
  };
  const switchMode = (next: 'text' | 'mindmap') => {
    if (disabled || next === mode || !node?.position) return;
    const before = props.data.lcosTextBeforeMindMapSize as { width?: number; height?: number } | undefined;
    const suggestedSize = next === 'mindmap' ? mindmapNodeSize(body, title)
      : { width: Number.isFinite(before?.width) && before!.width! > 0 ? before!.width! : 360,
          height: Number.isFinite(before?.height) && before!.height! > 0 ? before!.height! : 220 };
    const nextSize = nativeTextCarrierSize(suggestedSize);
    updateNativeTextPresentation(props.nodeId, { lcosTextViewMode: next,
      ...(next === 'mindmap' ? { lcosTextBeforeMindMapSize: size } : {}) }, {
      size: nextSize, position: { x: node.position.x + (size.width - nextSize.width) / 2,
        y: node.position.y + (size.height - nextSize.height) / 2 },
    });
    void api?.fitView?.({ nodes: [{ id: props.nodeId }], padding: .3, maxZoom: 1.3, duration: 180 });
  };
  const canResume = !currentPending && queued?.canResume === true && queued.count > 0
    && queued.projectId === projectId && queued.canvasId === canvasId && queued.nodeId === props.nodeId;
  const resumeQueued = () => {
    const live = savePort?.readQueuedAutosave?.(props.nodeId);
    if (!isCurrentContext() || registeredPending() || !live?.canResume || live.count <= 0
      || live.projectId !== projectId || live.canvasId !== canvasId || live.nodeId !== props.nodeId) {
      setSceneNotice('待保存内容或现场已变化，草稿仍留在原处；请重新核对。'); return;
    }
    if (savePort?.resumeAutosave?.(props.nodeId) !== true)
      setSceneNotice('暂时不能继续保存，草稿已保留；请稍后再核对。');
  };
  const menuItems: NativeTextViewMenuItem[] = [
    { key: 'native-first-text', label: '正文', disabled: disabled || mode === 'text',
      handle: () => switchMode('text') },
    { key: 'native-first-map', label: '导图', disabled: disabled || mode === 'mindmap',
      handle: () => switchMode('mindmap') },
    ...(mode === 'mindmap' ? [{ key: 'native-first-map-edit', label: '编辑导图', disabled: disabled && !canResumeMapDraft(),
      handle: openMapEditor }] : []),
    ...(currentPending?.operationId ? [{ key: 'native-first-verify', label: '核对原保存',
      handle: () => { if (canResumeMapDraft()) openMapEditor();
        else void verifyNativeCanvasTextSave(currentPending.operationId!).then(consumeResult); } }] : []),
    ...(canResume ? [{ key: 'native-first-resume', label: '继续保存', handle: resumeQueued }] : []),
  ];
  const openReading = () => {
    if (!isCurrentContext() || !ref || !openNativeExactTextView(props.nodeId, ref))
      setSceneNotice('这份正文的位置或版本暂时无法确认，请重新打开后阅读。');
  };
  const value: NativeTextNodeState & NativeVersionReadingState = { nodeId: props.nodeId, eligible: ref?.entityType === 'artifact',
    editable: props.editable === true && !versionView, versionView, openReading, mode, body, title, density, ready, readError: currentReadError,
    notice: currentNotice, pending: !!currentPending, hasUnsavedDraft, zoom: viewport.zoom, worldWidth: size.width, collapsed, menuItems,
    reread: () => setTick(n => n + 1),
    onToggle: id => { if (!disabled) updateNativeTextPresentation(props.nodeId, { lcosTextCollapsedIds: collapsed.includes(id)
      ? collapsed.filter(value => value !== id) : [...collapsed, id] }); } };
  return <NativeTextNodeContext.Provider value={value}>{props.children}</NativeTextNodeContext.Provider>;
}

/** Body and original tools consume the same occurrence without another read. */
export function LCOSNativeTextBodySlot(props: Props) {
  const state = useContext(NativeTextNodeContext) as (NativeTextNodeState & NativeVersionReadingState) | null;
  if (!state || state.nodeId !== props.nodeId) return props.originalBody;
  const { mode, body, title, density, ready, collapsed } = state;
  const original = isValidElement(props.originalBody) ? cloneElement(props.originalBody as any,
    { markdown: deriveNativeTextReadingMarkdown(body, title, density), ...(state.versionView ? { editable: false } : {}) }) : props.originalBody;
  return <div className="native-first-text" data-native-first-text-body={props.nodeId} data-native-first-density={density}
    data-native-first-mode={mode} data-native-first-state={state.versionView ? 'readonly' : ready ? 'ready' : state.readError ? 'error' : 'loading'}
    data-native-first-zoom={state.zoom} data-native-first-world-width={state.worldWidth}
    onDoubleClickCapture={state.versionView ? event => { event.stopPropagation(); state.openReading(); } : undefined}>
    {mode === 'mindmap' && density !== 'mark' && density !== 'summary' ? <NativeMapFace markdown={body} title={title} collapsed={collapsed}
      onToggle={state.onToggle} /> : original}
    {(state.notice || state.readError) && <div className="native-first-notice nodrag nopan nowheel" role="status" onWheel={event => event.stopPropagation()}>
      {state.notice && <span>{state.notice}</span>}
      {state.readError && state.readError !== state.notice && <span>{state.readError}</span>}
      {!state.pending && <button type="button" onClick={state.reread}>重读正文</button>}</div>}
  </div>;
}
