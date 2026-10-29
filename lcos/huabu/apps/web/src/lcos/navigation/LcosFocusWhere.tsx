// T2 C2-2B: known identity -> complete bindings -> explicit destination -> exact projection.
import { SqliteBindingStore } from '@local-creative-os/web-gen2';
import { ArrowRight, Focus, MapPin, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useCloseOnEscape } from '@/hooks/useCloseOnEscape';
import useCanvasStore from '@/store/canvasStore';

import { projectFocusOccurrences, type FocusBinding, type FocusOccurrenceRow } from './focusOccurrenceProjection';
import { useNavigationHudSlot } from './NavigationHudSlot';
import { readProjectNavigationIndex } from './projectNavigationIndex';
import { readSemanticNavigationLocations, type NavigationEntityIdentity } from './semanticNavigationLocations';
import { useAvoidingHudPosition } from './useAvoidingHudPosition';
import { useHudViewport } from './useHudViewport';
import { waitForProjectedEntity } from './waitForProjectedEntity';
import { createLcosCoreSession } from '../app/lcosCoreClient';
import { useLcosWorksiteNav } from '../app/useLcosWorksiteNav';
import { useLcosReferenceStore } from '../lcosReferenceState';
import { lcosHudEdgeOffsets } from '../shell/lcosHudPlacement';
import { useLcosShellStore, type LcosSurfaceKey } from '../shell/lcosShellStore';
import { lcosGlassStyle, lcosTokens } from '../ui/lcosTokens';
export interface LcosFocusWhereProps {
  readonly projectId: string;
  readonly surfaceByWorkspace: Readonly<Map<string, LcosSurfaceKey>>;
  readonly canvasBySurface: Readonly<Partial<Record<LcosSurfaceKey, string>>>;
  readonly ensureCanvas: (surface: LcosSurfaceKey, force?: boolean) => Promise<string | undefined>;
}
export function LcosFocusWhere(props: LcosFocusWhereProps): React.JSX.Element {
  const { active: activeSlot, activate: activateSlot, close: closeSlot } = useNavigationHudSlot();
  const viewport = useHudViewport();
  const activeSurface = useLcosShellStore((s) => s.activeSurface);
  const environment = useLcosShellStore((s) => s.windowEnvironment);
  const requestLocate = useLcosShellStore((s) => s.requestLocate);
  const request = useLcosShellStore((s) => s.focusWhereRequest);
  const consume = useLcosShellStore((s) => s.consumeFocusWhere);
  const [rows, setRows] = useState<readonly FocusOccurrenceRow[]>([]);
  const [title, setTitle] = useState('当前对象');
  const [message, setMessage] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [arriving, setArriving] = useState(false);
  const generation = useRef(0);
  const arrival = useRef<AbortController | null>(null);
  const lastRequest = useRef<{ entityId: string; entityType: string; title?: string } | undefined>(undefined);
  const lastSelection = useRef<readonly NavigationEntityIdentity[]>([]);
  const membershipRead = useRef<AbortController | null>(null);
  const session = useMemo(() => createLcosCoreSession(), []);
  const bindings = useMemo(() => new SqliteBindingStore(session.http, props.projectId), [session, props.projectId]);
  const { switchWorksite } = useLcosWorksiteNav({ projectId: props.projectId, canvasBySurface: props.canvasBySurface, ensureCanvas: props.ensureCanvas });
  const invalidate = useCallback(() => { generation.current += 1; arrival.current?.abort(); membershipRead.current?.abort(); }, []);
  const close = useCallback(() => { invalidate(); setArriving(false); closeSlot('where'); }, [closeSlot, invalidate]);
  useCloseOnEscape(activeSlot === 'where', close, { canvasBlank: true });
  const collect = useCallback(async (requested?: { entityId: string; entityType: string; title?: string },
    retrySelection?: readonly NavigationEntityIdentity[]) => {
    invalidate(); const version = generation.current;
    const canvas = useCanvasStore.getState();
    const references = useLcosReferenceStore.getState().nodeEntityRefs;
    const selectedIds = new Set(canvas.nodes.filter(node => node.selected).map(node => node.id));
    const selectedRefs = [...selectedIds].flatMap(id => { const ref = references.get(id); return ref ? [ref] : []; });
    const selected = requested ? [requested] : retrySelection ?? selectedRefs;
    activateSlot('where'); setRows([]); setArriving(false); setMessage(undefined);
    setTitle(requested?.title ?? (selected.length > 1 ? `${selected.length} 个对象` : selectedRefs[0]?.descriptor?.title ?? '当前对象'));
    if (!selected.length) { setLoading(false); setMessage('先选择一个对象，再查看它的位置。'); return; }
    lastSelection.current = selected; lastRequest.current = requested;
    const liveIds = new Set(canvas.nodes.filter(node => !node.hidden).map(node => node.id));
    const ownCanvasId = canvas.canvasId;
    const own: FocusBinding[] = ownCanvasId ? [...references].flatMap(([nodeId, ref]) =>
      liveIds.has(nodeId) ? [{ projectId: props.projectId, canvasId: ownCanvasId, spatialKind: 'node', spatialId: nodeId,
        entityId: ref.entityId, entityType: ref.entityType }] : []) : [];
    const projectRows = (allBindings: readonly FocusBinding[], workspaces: Parameters<typeof projectFocusOccurrences>[0]['workspaces'],
      semanticLocations?: Parameters<typeof projectFocusOccurrences>[0]['semanticLocations']): FocusOccurrenceRow[] => projectFocusOccurrences({
      projectId: props.projectId, selected, bindings: allBindings, currentCanvasId: canvas.canvasId,
      currentNodeIds: liveIds, selectedNodeIds: selectedIds, activeSurface, workspaces, roots: props.canvasBySurface, semanticLocations,
    });
    setRows(projectRows(own, [])); setLoading(true);
    const controller = new AbortController(); membershipRead.current = controller;
    const [bindingResult, workspaceResult, semanticResult] = await Promise.allSettled([
      bindings.list(), session.projects.getWorkspaces(props.projectId),
      readProjectNavigationIndex(session, props.projectId, controller.signal)
        .then(index => readSemanticNavigationLocations(session, props.projectId, index, controller.signal)),
    ]);
    if (version !== generation.current) return;
    const workspaces = workspaceResult.status === 'fulfilled' ? workspaceResult.value : [];
    const remote = bindingResult.status === 'fulfilled' ? bindingResult.value : [];
    const semantic = semanticResult.status === 'fulfilled' ? semanticResult.value : undefined;
    const all = projectRows([...own, ...remote], workspaces, semantic?.locations);
    setRows(all); setLoading(false);
    if (bindingResult.status === 'rejected') setMessage('其他位置读取失败；当前现场的位置仍可使用。');
    else if (workspaceResult.status === 'rejected') setMessage('部分现场信息读取失败，可重试。');
    else if (semanticResult.status === 'rejected' || semantic?.issues.length) setMessage('部分语义位置读取失败；已读取的位置仍可使用。');
    else if (all.length === 0) setMessage('这个对象目前没有可定位的画布投影。');
  }, [activeSurface, activateSlot, bindings, invalidate, props.canvasBySurface, props.projectId, session]);
  useEffect(() => { if (activeSlot !== 'where') invalidate(); }, [activeSlot, invalidate]);
  useEffect(() => { close(); return invalidate; }, [props.projectId, close, invalidate]);
  useEffect(() => {
    if (!request) return;
    consume?.(); void collect(request);
  }, [request, consume, collect]);
  useEffect(() => {
    const key = (event: KeyboardEvent): void => {
      if (event.defaultPrevented) return;
      const target = event.target instanceof Element ? event.target : null;
      if (event.key.toLowerCase() === 'f' && !event.metaKey && !event.ctrlKey && !event.altKey && !target?.closest('input,textarea,[contenteditable="true"]')) {
        event.preventDefault(); void collect();
      }
    };
    window.addEventListener('keydown', key, true); return () => window.removeEventListener('keydown', key, true);
  }, [activeSlot, collect, close]);
  const go = async (row: FocusOccurrenceRow): Promise<void> => {
    if (arriving || (!row.local && row.destination === undefined)) return;
    const controller = new AbortController(); arrival.current = controller; setArriving(true); setMessage(undefined);
    try {
      const destination = row.destination;
      const surface = row.local ? activeSurface : destination?.surface;
      if (surface === undefined) return;
      if (!row.local && !await switchWorksite(surface, { canvasId: row.canvasId,
        ...(destination?.workspaceId ? { workspaceId: destination.workspaceId } : {}) })) {
        if (!controller.signal.aborted) setMessage('目标现场暂时无法打开，请重试。'); return;
      }
      if (controller.signal.aborted) return;
      const targets = row.anchor ? [{ ...row.anchor, nodeId: row.nodeId }] : row.members
        ? row.members.map(member => ({ ...member, nodeId: undefined })) : row.nodes;
      const nodeIds = await Promise.all(targets.map(target => waitForProjectedEntity({ projectId: props.projectId, canvasId: row.canvasId,
        entityType: target.entityType, entityId: target.entityId, nodeId: target.nodeId, signal: controller.signal })));
      if (controller.signal.aborted) return;
      if (nodeIds.some((id, index) => id === undefined || (targets[index]?.nodeId !== undefined && id !== targets[index]?.nodeId))) {
        setMessage('所选投影尚未就绪或已移除，请刷新位置后重试。'); return;
      }
      const resolved = nodeIds.filter((id): id is string => id !== undefined);
      requestLocate({ reqId: crypto.randomUUID(), surface, canvasId: row.canvasId, nodeId: resolved[0], nodeIds: resolved,
        status: 'projected', preserveSelection: true }); close();
    } catch (error) { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : '定位失败，请重试。'); }
    finally { if (arrival.current === controller) { arrival.current = null; setArriving(false); } }
  };
  const offsets = lcosHudEdgeOffsets(environment ?? null, viewport);
  const placement = useAvoidingHudPosition({ x: (offsets.left + viewport.width - offsets.right) / 2,
    y: offsets.top + 56, width: Math.min(380, viewport.width - offsets.left - offsets.right), height: 160 }, { x: 'center' }, '[data-lcos-shell-project-cluster],[data-lcos-navigator-island]');
  if (activeSlot !== 'where') return <div data-lcos-focus-where data-open="false" hidden />;
  return <div ref={placement.ref} data-lcos-focus-where data-open="true" role="dialog" aria-label="对象位置"
    className="pointer-events-auto fixed z-40 rounded-2xl p-2"
    style={{ ...lcosGlassStyle, width: Math.min(380, viewport.width - offsets.left - offsets.right), top: placement.rect.y,
      left: placement.rect.x }}>
    <div className="flex items-center gap-2 px-2 pb-2 text-sm"><Focus size={16} aria-hidden /><span className="min-w-0 flex-1 truncate">{title}</span>
      <button type="button" aria-label="关闭对象位置" onClick={close} className="rounded-full p-2"><X size={16} /></button></div>
    {loading && <p role="status" className="px-2 py-2 text-xs">正在查找全部位置…</p>}
    {message && <p role="status" className="px-2 py-2 text-xs" style={{ color: lcosTokens.color.muted }}>{message}
      {lastSelection.current.length > 0 && <button type="button" className="ml-2 underline" onClick={() => void collect(lastRequest.current,lastSelection.current)}>刷新位置</button>}</p>}
    <div className="max-h-[46vh] overflow-y-auto">{rows.map((row) => <button key={row.key} type="button"
      data-lcos-occurrence={row.nodeId} data-lcos-occurrence-canvas={row.canvasId}
      data-lcos-occurrence-location={row.key} data-lcos-occurrence-match={row.matchCount} data-lcos-occurrence-total={row.totalCount}
      disabled={arriving || (!row.local && !row.destination)} onClick={() => void go(row)}
      className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm disabled:opacity-50">
      <MapPin size={16} aria-hidden /><span className="min-w-0 flex-1 truncate">{row.label}</span>
      <span className="text-xs" style={{ color: lcosTokens.color.muted }}>{row.totalCount > 1 ? `${row.matchCount}/${row.totalCount} 项` : row.anchor || row.members ? '已保存成员位置' : row.current ? '当前投影' : row.local ? '当前现场' : ''}</span><ArrowRight size={15} aria-label="前往" />
    </button>)}</div>
  </div>;
}
