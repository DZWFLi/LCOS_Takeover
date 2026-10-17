// Project navigation: Core V1 identity/order; existing Huabu preview, Drop and navigation owners.
import { announceCreationHost, CREATION_FINISHED } from '../nodes/creation/creationPresentationHost';
import { railwayStableKeyV1 } from '@local-creative-os/contracts';
import { CoreConversationClient, CoreRailwayClient, moveRailwayDestination } from '@local-creative-os/web-gen2';
import { ArrowDown, ArrowUp, Eye, MoreHorizontal, Pencil, Plus, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { createId } from '@huabu/shared';

import { Popover } from '@/components/Common/Popover';
import useCanvasStore from '@/store/canvasStore';

import { lcosHudEdgeOffsets, lcosHudSafeCenterY } from './lcosHudPlacement';
import { useLcosShellStore, type LcosSurfaceKey } from './lcosShellStore';
import { createLcosCoreSession } from '../app/lcosCoreClient';
import { useCollaborationSessionStore } from '../collaboration/collaborationSessionStore';
import { useCollaborationSession } from '../collaboration/useCollaborationSession';
import { LcosReceiverIdentity } from '../composer/LcosReceiverIdentity';
import { isDropPointExposed } from '../drop/dropOcclusion';
import { rectFromDomRect } from '../drop/dropTargetRegistry';
import { createRailwayPointerDropController } from '../drop/railwayPointerDrop';
import { useLcosHostStore } from '../host/lcosHostState';
import { useLcosDropStore } from '../lcosDropState';
import { useLcosReferenceStore } from '../lcosReferenceState';
import { createRailwayWorksiteFromDrop } from '../navigation/createRailwayWorksiteFromDrop';
import { locateSpatialDestination } from '../navigation/locateSpatialDestination';
import { placeExistingWorkspacePortal } from '../navigation/portalPlacement';
import { readProjectNavigationIndex, withProjectSpatialCandidates, type ProjectNavigationIndex } from '../navigation/projectNavigationIndex';
import { RailwayCollectionPeek } from '../navigation/RailwayCollectionPeek';
import { RailwayDestinationSidebar } from '../navigation/RailwayDestinationSidebar';
import { railwayDropGestureActive, railwayDynamicCapacity, railwayHiddenDestinations, railwayVisibleDestinations } from '../navigation/railwayDynamicLayout';
import { railwayColumnCount } from '../navigation/railwayDynamicLayout';
import { railwayIdentityCapabilities, renameRailwayIdentity, removeRailwayWorkspace } from '../navigation/railwayIdentityManagement';
import { RailwayPeek } from '../navigation/RailwayPeek';
import { createRailwayPointerReorder } from '../navigation/railwayPointerReorder';
import { readRailwayPresentationPreference, saveRailwayPresentationPreference } from '../navigation/railwayPresentationPreferences';
import { railwayDestinationCanReceive, railwayDestinationGlyph, railwayReceiveLabel, railwayReceivePresentation } from '../navigation/railwayReceivePresentation';
import { railwayReceiveRegions } from '../navigation/railwayReceiveRegions';
import { railwayReceiveSemantic } from '../navigation/railwayReceiveSemantic';
import { RailwayScopePeek } from '../navigation/RailwayScopePeek';
import { railwaySpatialProjection } from '../navigation/railwaySpatialProjection';
import { useAvoidingHudPosition } from '../navigation/useAvoidingHudPosition';
import { useHudViewport } from '../navigation/useHudViewport';
import { useRailwayDestinations } from '../navigation/useRailwayDestinations';
import { LcosRailwayView } from '../ui/families/LcosRailwayView';
import { FigmaShellGlyph } from '../ui/FigmaShellGlyph';
import { lcosGlassStyle } from '../ui/lcosTokens';
import { LcosIconButton } from '../ui/primitives/LcosIconButton';

import type { RailwayReorderPreview } from '../navigation/railwayPointerReorder';
import type { LcosRailwayViewItem } from '../ui/families/LcosRailwayView';
import type { ConnectedConversationV1, RailwayDestinationV1, RailwaySnapshotV1, RailwayStoredRefV1 } from '@local-creative-os/contracts';
import '../ui/nearfield/railway-destinations.css';

const targetId = (projectId: string, key: string) => `railway:${projectId}:${key}`;
function isResumableContextWorksite(item: RailwayDestinationV1, projectId: string): boolean {
  return !item.available && item.role === 'worksite' && item.ref.kind === 'worksite'
    && item.ref.projectId === projectId && item.workspaceId === item.ref.worksiteId
    && item.surface === 'context' && item.canvasId === undefined
    && item.reason === '这个现场还没有画布，暂不能进入或接收材料。';
}
export interface LcosRailwayProps {
  readonly projectId: string;
  readonly surfaceByWorkspace: ReadonlyMap<string,LcosSurfaceKey>;
  readonly ensureWorkspaceCanvas: (workspaceId: string) => Promise<string | undefined>;
  readonly activateDestination: (destination: RailwayDestinationV1) => Promise<void> | void;
  readonly mainCanvasId?: string;
  readonly onNavigateMain?: () => Promise<boolean>;
}
export function LcosRailway(props: LcosRailwayProps): React.JSX.Element {
  return <ProjectRailway key={props.projectId} {...props} />;
}

function ProjectRailway({projectId,ensureWorkspaceCanvas,activateDestination,mainCanvasId,onNavigateMain}: LcosRailwayProps): React.JSX.Element {
  const session = useMemo(() => createLcosCoreSession(),[]);
  const railway = useMemo(() => new CoreRailwayClient(session.http),[session]);
  const conversations = useMemo(() => new CoreConversationClient(session.http),[session]);
  const alive = useRef(true);
  const [spatialIndex,setSpatialIndex] = useState<ProjectNavigationIndex>();
  const completeSnapshot = useCallback(async (value: RailwaySnapshotV1, signal?: AbortSignal): Promise<RailwaySnapshotV1> => {
    const index = await readProjectNavigationIndex(session,projectId,signal);
    if (alive.current && !signal?.aborted) setSpatialIndex(index);
    return withProjectSpatialCandidates(value,index.destinations);
  },[session,projectId]);
  const data = useRailwayDestinations(projectId,railway,completeSnapshot);
  const {snapshot,status,busy,notice,setNotice,reload,update,readFresh} = data;
  const activeWorkspaceId = useLcosShellStore((s) => s.activeWorkspaceId);
  const activeSurface = useLcosShellStore((s) => s.activeSurface);
  const environment = useLcosShellStore((s) => s.windowEnvironment);
  const openWindow = useLcosShellStore((s) => s.openWindow);
  const canvasId = useCanvasStore((s) => s.canvasId);
  const watch = useCollaborationSessionStore((s) => s.watchProjectChanges);
  const drop = useLcosDropStore((s) => s.state);
  const receiptVersion = useLcosDropStore((s) => s.feedback?.receipt.transactionId);
  const resolution = useLcosDropStore((s) => s.resolution);
  const feedback = useLcosDropStore((s) => s.feedback);
  const pointerDrop = useRef<ReturnType<typeof createRailwayPointerDropController> | undefined>(undefined);
  useEffect(() => {
    const controller=createRailwayPointerDropController();pointerDrop.current=controller;
    return ()=>{controller.dispose();if(pointerDrop.current===controller)pointerDrop.current=undefined;};
  },[projectId]);
  useEffect(()=>{
    if(feedback?.receipt.status==='success'&&[ `railway-bookmark:${projectId}`, `railway-new-view:${projectId}` ].includes(feedback.receipt.targetId)) void reload();
  },[feedback,projectId,reload]);
  const [receiver,setReceiver] = useState<ConnectedConversationV1>();
  const [receiverError,setReceiverError] = useState<string>();
  const receiverEntry = useCollaborationSession(projectId,receiver?.id);
  const [peek,setPeek] = useState<string>();
  const [addOpen,setAddOpen] = useState(false);
  const toolsHost = useRef<HTMLElement | null>(null);
  const toolsHostRef = useCallback((element: HTMLDivElement | null) => { toolsHost.current = element; announceCreationHost(element); }, []);
  const [itemActionsOpen,setItemActionsOpen] = useState(false);
  const [overflowPeek,setOverflowPeek] = useState(false);
  const [presentation,setPresentation] = useState(() => readRailwayPresentationPreference(projectId));
  const [identityEdit,setIdentityEdit] = useState<{ item: RailwayDestinationV1; name: string }>();
  const [confirmRemove,setConfirmRemove] = useState<RailwayDestinationV1>();
  const [identityBusy,setIdentityBusy] = useState(false);
  const identityLock = useRef(false);
  const columnsGesture = useRef<{ pointerId: number; x: number; columns: 1 | 2; preference: typeof presentation.columns } | null>(null);
  useEffect(() => { saveRailwayPresentationPreference(projectId,presentation); },[projectId,presentation]);

  const [activating,setActivating] = useState<string>();
  const activateLock = useRef(false);
  const [createWorksiteBusy,setCreateWorksiteBusy] = useState(false);
  const createWorksiteLock = useRef(false);
  const [placing, setPlacing] = useState(false);
  const portalPlacement = useRef<AbortController | null>(null);
  useEffect(() => () => { portalPlacement.current?.abort(); portalPlacement.current = null; }, [projectId,canvasId]);
  const placePortal = async (item: RailwayDestinationV1) => {
    if (portalPlacement.current || !canvasId) return;
    const controller = new AbortController(); portalPlacement.current = controller; setPlacing(true); setNotice(undefined);
    const host = useLcosHostStore.getState().host;
    try {
      if (!host || host.projectId !== projectId) throw new Error('当前画布身份尚未确认。');
      const current = () => useLcosShellStore.getState().projectId === projectId && useCanvasStore.getState().canvasId === canvasId
        && useLcosHostStore.getState().host === host;
      const result = await placeExistingWorkspacePortal(projectId,canvasId,item, {
        current, nodes: () => useCanvasStore.getState().nodes,
        bindings: () => host.bindings.list(),
        readTarget: (id, signal) => railway.portalTarget(projectId,id,signal),
        create: (targetCanvasId,label) => {
          const id = createId('node');
          useCanvasStore.getState().addNodes([{id,nodeType:'spacePreview',data:{targetCanvasId,label,origin:{type:'user-created'}}}]);
          return id;
        },
        save: () => useCanvasStore.getState().saveCanvas(),
        claim: (id,nodeId,targetCanvasId) => railway.claimPortal(projectId,id,canvasId,nodeId,targetCanvasId),
      },controller.signal);
      if (current()) {
        useLcosReferenceStore.getState().requestNodeBindingRefresh();
        if (!controller.signal.aborted) {
          useLcosShellStore.getState().requestLocate({reqId:crypto.randomUUID(),surface:useLcosShellStore.getState().activeSurface,
            canvasId,nodeId:result.nodeId,status:'projected',preserveSelection:true});
          setNotice(result.status === 'existing' ? '已定位已有入口，没有重复创建。' : '入口已保存；预览不离开当前现场。');
        }
      }
    } catch (error) { if (!controller.signal.aborted) setNotice(error instanceof Error ? error.message : '入口尚未确认，请重试核对同一节点。'); }
    finally { if (portalPlacement.current === controller) portalPlacement.current = null; if (alive.current) setPlacing(false); }
  };
  const navigationArrival = useRef<AbortController | null>(null);
  useEffect(() => () => navigationArrival.current?.abort(),[projectId]);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const overflowHideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mutedFocus = useRef<string | undefined>(undefined);
  const drag = useRef<string | undefined>(undefined);
  const [reorderTarget,setReorderTarget] = useState<{readonly key:string;readonly where:'before'|'after'}>();
  const [reorderPreview,setReorderPreview] = useState<RailwayReorderPreview | null>(null);
  const reorderPointer = useRef<ReturnType<typeof createRailwayPointerReorder> | null>(null);
  const reorderScope = useRef<number | undefined>(undefined);
  const [receiverRefresh,setReceiverRefresh] = useState(0);
  const [elementVersion,setElementVersion] = useState(0);
  const elementCallbacks = useRef(new Map<string,(element:HTMLButtonElement | null)=>void>());
  const elements = useRef(new Map<string,HTMLButtonElement>());
  const panelRef = useRef<HTMLDivElement | null>(null);
  const overflowPanelRef = useRef<HTMLDivElement | null>(null);
  const bookmarkRef = useRef<HTMLButtonElement | null>(null);
  const newViewRegionRef = useRef<HTMLDivElement | null>(null);
  const receiverRef = useRef<HTMLButtonElement | null>(null);
  const columnsRef = useRef<HTMLButtonElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const editingKey = identityEdit?.item.key;
  useEffect(() => {
    if (!editingKey) return;
    const frame=requestAnimationFrame(()=>{renameInputRef.current?.focus({preventScroll:true});renameInputRef.current?.select();});
    return()=>cancelAnimationFrame(frame);
  },[editingKey]);
  const viewport = useHudViewport();
  const destinations = railwaySpatialProjection(snapshot, projectId);
  const receiverDestinationId = receiver?.id;
  const visibleDestinations = destinations.filter(item => !presentation.hiddenKeys.includes(item.key));
  const orderedKeys = new Set(snapshot?.destinations.map(item => item.key));
  // A candidate without a usable address is not a destination button. Preserve
  // explicitly stored unavailable entries (and their reasons) for recovery.
  const addressableDestinations = visibleDestinations.filter(item => item.available || orderedKeys.has(item.key));
  const railDestinations = receiverDestinationId
    ? addressableDestinations.filter((item) => !(item.ref.kind === 'receiver_conversation' && item.ref.connectedConversationId === receiverDestinationId))
    : addressableDestinations;
  const offsets = lcosHudEdgeOffsets(environment,viewport);
  const safeHeight = environment?.safeRect.height ?? Math.max(1, viewport.height - offsets.top - offsets.bottom);
  const dropActive = railwayDropGestureActive(drop.status);
  const reservedHeight = 44 + (receiver ? 36 : 0) + (railDestinations.length ? 36 : 0) + 32;
  const capacity = Math.min(railwayDynamicCapacity({safeHeight,reservedHeight}),
    Math.max(1,Math.floor((Math.min(viewport.height*.7,556)-10)/42)));
  const columns = railwayColumnCount({ itemCount: railDestinations.length, rowCapacity: capacity,
    availableWidth: environment?.safeRect.width ?? viewport.width, preference: presentation.columns });
  const primary = railwayVisibleDestinations(railDestinations,capacity*columns,activeWorkspaceId ?? undefined);
  const hidden = railwayHiddenDestinations(railDestinations,primary);
  const receiveOverflowOpen = dropActive && hidden.length > 0;
  useEffect(() => {
    if (!dropActive) return;
    setAddOpen(false);setItemActionsOpen(false);
    setOverflowPeek(false);
    setIdentityEdit(undefined);setConfirmRemove(undefined);
  },[dropActive]);
  const focused = destinations.find((d) => d.key === peek);
  const railWidth = columns === 2 ? 94 : 52;
  const primaryHeight = primary.length ? 10 + Math.ceil(primary.length/columns) * 42 : 0;
  const hostHeight = Math.max(52,primaryHeight) + (hidden.length ? 36 : 0) + (receiver ? 36 : 0) + 44;
  const placement = useAvoidingHudPosition({x:offsets.left,y:lcosHudSafeCenterY(environment,viewport.height),width:railWidth,height:hostHeight},{y:'center'});
  const cancelHide = useCallback(() => { if (hideTimer.current) clearTimeout(hideTimer.current); },[]);
  const cancelOverflowHide = useCallback(() => { if (overflowHideTimer.current) clearTimeout(overflowHideTimer.current); },[]);
  const dismiss = useCallback((restore = false) => {
    cancelHide(); cancelOverflowHide(); setAddOpen(false); setItemActionsOpen(false); setPeek(undefined); setOverflowPeek(false); setIdentityEdit(undefined); setConfirmRemove(undefined);
    if (restore) { mutedFocus.current = peek; (peek ? elements.current.get(`rail:${peek}`) ?? elements.current.get(`overflow:${peek}`) : bookmarkRef.current)?.focus(); }
  },[cancelHide,cancelOverflowHide,peek]);
  const enterPeek = (key: string) => {
    if (mutedFocus.current === key) { mutedFocus.current = undefined; return; }
    if (addOpen || drag.current || dropActive || identityEdit || confirmRemove) return;
    cancelHide(); if (peek !== key) setItemActionsOpen(false); setPeek(key);
  };
  const leavePeek = () => {
    cancelHide(); hideTimer.current = setTimeout(() => {
      if (!panelRef.current?.contains(document.activeElement) && !identityEdit && !confirmRemove) setPeek(undefined);
    },220);
  };
  useEffect(() => { alive.current = true; return () => { alive.current = false; cancelHide(); cancelOverflowHide(); }; },[cancelHide,cancelOverflowHide]);
  const refresh = useCallback(() => { void reload(); setReceiverRefresh((n) => n+1); },[reload]);
  useEffect(() => watch(projectId,refresh),[watch,projectId,refresh]);
  useEffect(() => {
    const visible = () => { if (document.visibilityState === 'visible') refresh(); };
    const cancelDrag = () => { reorderPointer.current?.cancel();drag.current=undefined;setReorderPreview(null);setReorderTarget(undefined); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') cancelDrag(); };
    window.addEventListener('focus',refresh); window.addEventListener('blur',cancelDrag); window.addEventListener('keydown',key);
    document.addEventListener('visibilitychange',visible);
    return () => { window.removeEventListener('focus',refresh);window.removeEventListener('blur',cancelDrag);window.removeEventListener('keydown',key);document.removeEventListener('visibilitychange',visible); };
  },[refresh]);
  useEffect(() => {
    const controller = new AbortController(); let current=true;
    void Promise.all([conversations.listConnectedConversations(projectId,controller.signal),conversations.getReceiverBinding(projectId,controller.signal)])
      .then(([list,binding]) => { if (!current) return; setReceiver(list.find((c) => c.id === binding.activeReceiverId));setReceiverError(undefined); })
      .catch(() => { if (current) {setReceiver(undefined);setReceiverError('承接会话读取失败');} });
    return () => {current=false;controller.abort();};
  },[conversations,projectId,receiverRefresh]);
  // Element refs describe GUI regions; receiver identity belongs to the destination.
  const onElement = useCallback((key: string,element: HTMLButtonElement | null) => {
    if (elements.current.get(key) === element || (!element && !elements.current.has(key))) return;
    if (element) elements.current.set(key,element); else elements.current.delete(key);
    setElementVersion((n) => n+1);
  },[]);
  const elementRef = (key: string) => {
    let callback=elementCallbacks.current.get(key);
    if (!callback) { callback=(element)=>onElement(key,element);elementCallbacks.current.set(key,callback); }
    return callback;
  };
  useEffect(() => {
    const store = useLcosDropStore.getState();
    const cleanups: (() => void)[]=[];
    const receiverRegions = new Map<string,HTMLElement[]>();
    for (const [elementKey,element] of elements.current) {
      const key = elementKey.slice(elementKey.indexOf(':')+1);
      const regions = receiverRegions.get(key) ?? [];
      regions.push(element);receiverRegions.set(key,regions);
    }
    if (dropActive && focused && panelRef.current) {
      const regions = receiverRegions.get(focused.key) ?? [];
      regions.push(panelRef.current);receiverRegions.set(focused.key,regions);
    }
    for (const [key,elements] of receiverRegions) {
      const destination = railwaySpatialProjection(snapshot, projectId).find((d) => d.key === key);
      if (!destination || !snapshot) continue;
      const regions = railwayReceiveRegions(elements);
      const rect = regions.readRect();
      if (!rect) continue;
      const semantic = railwayReceiveSemantic(destination, canvasId, snapshot, status === 'ready' && !busy);
      cleanups.push(store.registerTarget({targetId:targetId(projectId,`rail:${key}`),kind:semantic.kind,label:destination.label,
        rect,readRect:regions.readRect,acceptsPoint:regions.acceptsPoint,priority:30,enabled:true,semantic}));
    }
    const newViewRegion=newViewRegionRef.current;
    const railHost=placement.ref.current;
    if(newViewRegion && railHost && canvasId) cleanups.push(store.registerTarget({targetId:`railway-new-view:${projectId}`,kind:'railway-new-view',label:'新工作现场',
      rect:rectFromDomRect(railHost.getBoundingClientRect()),readRect:()=>railHost.isConnected?rectFromDomRect(railHost.getBoundingClientRect()):undefined,
      acceptsPoint:point=>{
        if(!isDropPointExposed(railHost,point)) return false;
        const front=document.elementFromPoint?.(point.x,point.y);
        if(front?.closest('[data-lcos-railway-entry],[data-lcos-railway-receiver-shell],[data-lcos-railway-overflow-shell],[data-lcos-railway-column-grip],[data-lcos-railway-footer]')) return false;
        return !front?.closest('button') || newViewRegion.contains(front);
      },priority:40,enabled:status==='ready'&&!busy,
      semantic:{kind:'railway-new-view',projectId,sourceCanvasId:canvasId,surface:activeSurface}}));
    for (const [id,element] of [['panel',dropActive?null:panelRef.current],['overflow',overflowPanelRef.current],['receiver',receiverRef.current],['columns',columnsRef.current]] as const) {
      if (!element) continue;
      cleanups.push(store.registerTarget({targetId:`railway-control:${projectId}:${id}`,kind:'drop-exclusion',label:'导航操作',
        rect:rectFromDomRect(element.getBoundingClientRect()),readRect:()=>element.isConnected ? rectFromDomRect(element.getBoundingClientRect()) : undefined,
        acceptsPoint:(point)=>isDropPointExposed(element,point),priority:5,enabled:true,
        semantic:{kind:'drop-exclusion',reason:'请放到明确的现场目的地上；这里不会投到背景画布。'}}));
    }
    return () => { for (const close of cleanups) close(); };
  },[snapshot,status,busy,canvasId,activeSurface,elementVersion,projectId,addOpen,peek,focused,receiver,columns,overflowPeek,receiveOverflowOpen,dropActive,placement.ref]);

  const activate = async (item: RailwayDestinationV1) => {
    if (!item.available || activateLock.current || busy || status !== 'ready') return;
    activateLock.current=true;setActivating(item.key);setNotice(undefined);
    try {
      const controller = new AbortController(); navigationArrival.current?.abort(); navigationArrival.current = controller;
      const fresh = await readFresh(controller.signal);
      if (!alive.current) return;
      const target = [...fresh.destinations,...fresh.candidates].find((d) => d.key === item.key);
      if (!target?.available) throw new Error(target?.reason ?? '目的地已被移出导航。');
      if (target.canvasId !== item.canvasId) { void reload(); throw new Error('目标画布已变化，请重新预览后进入。'); }
      if (target.ref.kind === 'receiver_conversation') {
        openWindow('conversation',`会话窗口 · ${target.label}`,target.ref.connectedConversationId);
      } else if (target.ref.kind === 'spatial') {
        if (!await locateSpatialDestination(projectId,target,{mainCanvasId,onNavigateMain,signal:controller.signal}))
          throw new Error('这个空间的主画布投影尚未就绪；原空间保留，可重新读取后定位。');
      } else if (target.workspaceId !== activeWorkspaceId) {
        await activateDestination(target);
      }
      if (alive.current) dismiss();
    } catch (error) { if (alive.current) setNotice(error instanceof Error ? error.message : '进入失败，仍保留当前现场。'); }
    finally {activateLock.current=false;if(alive.current)setActivating(undefined);}
  };
  const resolveAndEnterContextWorksite = async (workspaceId: string): Promise<void> => {
    const ref: RailwayStoredRefV1 = { kind: 'worksite', projectId, worksiteId: workspaceId };
    const key = railwayStableKeyV1(ref);
    let latest = await reload();
    if (!latest || latest.projectId !== projectId) throw new Error('Railway 读取失败，现场仍已保存。');
    const inOrder = () => latest?.order.orderedRefs.some((item) => railwayStableKeyV1(item) === key) ?? false;
    const findDestination = (): RailwayDestinationV1 | undefined => latest?.destinations.find((item) => railwayStableKeyV1(item.ref) === key);
    const findCandidate = (): RailwayDestinationV1 | undefined => latest?.candidates.find((item) => railwayStableKeyV1(item.ref) === key);
    let target = inOrder() ? findDestination() : findCandidate();
    if (!target) throw new Error('上下文现场尚未出现在Railway候选中，重试会沿用同一现场。');
    if (!target.available) {
      if (!isResumableContextWorksite(target, projectId)) throw new Error(target.reason ?? '现场身份未就绪，未尝试进入。');
      const canvasId = await ensureWorkspaceCanvas(workspaceId);
      if (!canvasId) throw new Error(`上下文现场「${target.label}」已保存，但画布未建立；重试会继续同一现场。`);
      latest = await reload();
      if (!latest || latest.projectId !== projectId) throw new Error('画布已建立，但Railway回读失败；重试会继续同一现场。');
      target = inOrder() ? findDestination() : findCandidate();
    }
    if (!target || !target.available || target.workspaceId !== workspaceId || !target.canvasId || target.surface !== 'context')
      throw new Error(target?.reason ?? '上下文现场仍缺少可确认的画布，未加入Railway。');
    if (!target || !target.available || target.workspaceId !== workspaceId || !target.canvasId || target.surface !== 'context')
      throw new Error(target?.reason ?? '现场尚未恢复，未进入。');
    await activate(target);
  };
  const continueExistingContextWorksite = async (item: RailwayDestinationV1): Promise<void> => {
    if (!isResumableContextWorksite(item, projectId) || !item.workspaceId
      || createWorksiteLock.current || createWorksiteBusy || busy || status !== 'ready') return;
    createWorksiteLock.current = true;
    setCreateWorksiteBusy(true);
    setNotice(undefined);
    try {
      await resolveAndEnterContextWorksite(item.workspaceId);
    } catch (error) {
      const message = error instanceof Error ? error.message : '现场画布尚未就绪。';
      setNotice(`上下文现场「${item.label}」已保留；${message}重试会继续同一现场。`);
    } finally {
      createWorksiteLock.current = false;
      setCreateWorksiteBusy(false);
    }
  };
  const createBlankView = async (): Promise<void> => {
    if (createWorksiteLock.current || busy || status !== 'ready' || dropActive || !canvasId) return;
    createWorksiteLock.current = true; setCreateWorksiteBusy(true); dismiss(); setNotice(undefined);
    const selection = useCanvasStore.getState().nodes.filter(node => node.selected).map(node => node.id).sort();
    try {
      const result = await createRailwayWorksiteFromDrop(session, { projectId, operationId: crypto.randomUUID(),
        surface: activeSurface, sourceRefs: [], createBlank: true }, ensureWorkspaceCanvas, undefined,
        () => alive.current && useLcosShellStore.getState().projectId === projectId && useCanvasStore.getState().canvasId === canvasId);
      if (!alive.current) return;
      await reload();
      if (result.status === 'created' && useCanvasStore.getState().canvasId === canvasId
        && JSON.stringify(useCanvasStore.getState().nodes.filter(node => node.selected).map(node => node.id).sort()) === JSON.stringify(selection))
        useCanvasStore.getState().selectNodes([]);
      setNotice(result.status === 'created' ? `「${result.name}」已加入导航，点击进入空白现场。` : result.message);
    } catch (error) { if (alive.current) setNotice(error instanceof Error ? error.message : '空白现场尚未建立。'); }
    finally { createWorksiteLock.current = false; if (alive.current) setCreateWorksiteBusy(false); }
  };
  const remove = (key: string) => update((s) => s.order.orderedRefs.filter((ref) => railwayStableKeyV1(ref)!==key),'已取消固定，原空间与内容保留。');
  const hideDestination = (item: RailwayDestinationV1): void => {
    setPresentation(value => ({ ...value,hiddenKeys: [...new Set([...value.hiddenKeys,item.key])] }));
    setNotice('已从导航收起；对象保留，仍可搜索和查找位置。'); dismiss();
  };
  const applyIdentityEdit = async (): Promise<void> => {
    if (!identityEdit || identityLock.current) return;
    identityLock.current=true; setIdentityBusy(true); setNotice(undefined);
    try { await renameRailwayIdentity(session,projectId,identityEdit.item.ref,identityEdit.name);
      if(alive.current){setIdentityEdit(undefined);await reload();useLcosHostStore.getState().host?.notifyMutationSuccess();setNotice('空间名称已保存。');}
    } catch(error){if(alive.current)setNotice(error instanceof Error?error.message:'更名未确认，原名称保留。');}
    finally{identityLock.current=false;if(alive.current)setIdentityBusy(false);}
  };
  const applyWorkspaceRemove = async (): Promise<void> => {
    if (!confirmRemove || identityLock.current) return;
    const item=confirmRemove; identityLock.current=true;setIdentityBusy(true);setNotice(undefined);
    try {
      if(item.workspaceId===useLcosShellStore.getState().activeWorkspaceId && (!onNavigateMain || !await onNavigateMain()))throw new Error('先返回主画布后才能移除当前现场。');
      await removeRailwayWorkspace(session,projectId,item.ref);
      if(alive.current){
        setConfirmRemove(undefined);
        const cleaned = await update(s=>s.order.orderedRefs.filter(ref=>railwayStableKeyV1(ref)!==item.key),'工作现场已移除；项目材料与源文件保留。');
        if(!cleaned) throw new Error('工作现场已移除，导航收起尚未确认；项目材料与源文件保留。');
        useLcosHostStore.getState().host?.notifyMutationSuccess();
      }
    } catch(error){if(alive.current)setNotice(error instanceof Error?error.message:'移除未确认，原现场保留。');}
    finally{identityLock.current=false;if(alive.current)setIdentityBusy(false);}
  };
  const identityActions = (item: RailwayDestinationV1): React.JSX.Element => {
    const capability=railwayIdentityCapabilities(item);
    const worksiteId=item.ref.kind==='worksite'?item.ref.worksiteId:undefined;
    const protectedRoot=worksiteId!==undefined && spatialIndex?.graph?.workspaces.some(workspace => String(workspace.id)===worksiteId
      && spatialIndex.graph?.scopes.some(scope=>scope.id===workspace.scopeId&&scope.kind==='root'));
    const managed=snapshot?.destinations.filter(destination=>destination.role!=='surface') ?? [];
    const index=managed.findIndex(destination=>destination.key===item.key);
    const pinned=snapshot?.order.orderedRefs.some(ref=>railwayStableKeyV1(ref)===item.key);
    return <div className="lcos-railway-identity-actions" role="group" aria-label={`${item.label} 的空间操作`}>
      {capability.remove&&!protectedRoot&&<button type="button" aria-label={`移除现场 ${item.label}`} disabled={identityBusy||busy} onClick={()=>{cancelHide();setConfirmRemove(item);}}>移除现场</button>}
      <button type="button" aria-label={`从导航隐藏 ${item.label}`} disabled={identityBusy||busy} onClick={()=>hideDestination(item)}>从导航隐藏</button>
      {pinned&&<>
        <button type="button" aria-label={`上移 ${item.label}`} disabled={busy||status!=='ready'||index<=0} onClick={()=>{const prev=managed[index-1];if(prev)void move(item.key,prev.key,'before');}}><ArrowUp size={14}/>上移</button>
        <button type="button" aria-label={`下移 ${item.label}`} disabled={busy||status!=='ready'||index===managed.length-1} onClick={()=>{const next=managed[index+1];if(next)void move(item.key,next.key,'after');}}><ArrowDown size={14}/>下移</button>
        <button type="button" aria-label={`取消固定 ${item.label}`} disabled={busy||status!=='ready'} onClick={()=>void remove(item.key)}>取消固定</button>
      </>}
    </div>;
  };
  const move = (key: string,target: string,where:'before'|'after') => update(
    // Reordering bookmarks must not pin unrelated candidate spaces.
    (s) => moveRailwayDestination(s.order.orderedRefs,key,target,where),
    '空间顺序已保存。',
  );
  const reorderable = (item: RailwayDestinationV1) => (item.role === 'worksite'||item.role==='spatial') && item.available && !snapshot?.migrationRequired
    && Boolean(snapshot?.order.orderedRefs.some(ref => railwayStableKeyV1(ref) === item.key));
  const startPointer = (event: React.PointerEvent<HTMLElement>,item: RailwayDestinationV1) => {
    if (pointerDrop.current?.onPointerDown(event,item,projectId)) return;
    reorderScope.current = snapshot?.order.version;
    reorderPointer.current?.onPointerDown(event,item.key);
  };
  const reorderLive = useRef({snapshot,status,busy,dropActive,projectId,destinations,move});
  reorderLive.current = {snapshot,status,busy,dropActive,projectId,destinations,move};
  useEffect(() => {
    const controller = createRailwayPointerReorder({
      items: () => {
        const state = reorderLive.current;
        return state.destinations.flatMap(item => {
          if (!item.available || (item.role !== 'worksite' && item.role !== 'spatial')
            || !state.snapshot?.order.orderedRefs.some(ref=>railwayStableKeyV1(ref)===item.key)) return [];
          const element = elements.current.get(`rail:${item.key}`) ?? elements.current.get(`overflow:${item.key}`);
          if (!element?.isConnected) return [];
          return [{key:item.key,element,readRect:()=>element.isConnected
            ? rectFromDomRect((element.parentElement ?? element).getBoundingClientRect()) : undefined}];
        });
      },
      isCurrent: key => {
        const state = reorderLive.current;
        return state.projectId===projectId && state.status==='ready' && !state.busy && !state.dropActive
          && !state.snapshot?.migrationRequired && state.snapshot?.order.version===reorderScope.current
          && state.destinations.some(item=>item.key===key&&item.available)
          && Boolean(state.snapshot?.order.orderedRefs.some(ref=>railwayStableKeyV1(ref)===key));
      },
      onStart: key => {drag.current=key;cancelHide();cancelOverflowHide();setPeek(undefined);setItemActionsOpen(false);},
      onUpdate: preview => {setReorderPreview(preview);setReorderTarget(preview?{key:preview.targetKey,where:preview.where}:undefined);},
      onFinish: intent => {drag.current=undefined;setReorderPreview(null);setReorderTarget(undefined);
        if(intent) void reorderLive.current.move(intent.key,intent.targetKey,intent.where);},
    });
    reorderPointer.current=controller;
    return()=>{controller.dispose();if(reorderPointer.current===controller)reorderPointer.current=null;};
  },[projectId,cancelHide,cancelOverflowHide]);
  const consumeReorderClick = (event: React.MouseEvent<HTMLButtonElement>,key:string) => {
    if(event.detail>0&&reorderPointer.current?.consumeClick(key)){event.preventDefault();event.stopPropagation();}
  };
  const receiveState = (item:RailwayDestinationV1,_elementKey:string) => {
    const id = targetId(projectId,`rail:${item.key}`);
    return railwayReceivePresentation({targetId:id,enabled:status==='ready' && !busy && railwayDestinationCanReceive(item,canvasId),
      dropState:drop,resolution,candidate:useLcosDropStore.getState().targets().find(target=>target.targetId===id)});
  };
  const openAdd = () => {
    if (dropActive) return;
    cancelHide();cancelOverflowHide();setOverflowPeek(false);setPeek(undefined);setItemActionsOpen(false);setAddOpen(true);
  };
  const openItemActions = (item: RailwayDestinationV1) => {
    if (dropActive) return;
    cancelHide();setAddOpen(false);setPeek(item.key);setItemActionsOpen(true);
  };
  const showOverflow = () => {
    cancelOverflowHide();
    if (!addOpen && !dropActive) setOverflowPeek(true);
  };
  // Hover keeps its GEN1 220ms grace. Escape / deliberate toggle close now.
  const dismissOverflow = () => {
    cancelOverflowHide();
    if (!dropActive) setOverflowPeek(false);
  };
  const toggleOverflow = () => {
    cancelOverflowHide();
    if (!addOpen && !dropActive) setOverflowPeek((open) => !open);
  };
  const hideOverflow = () => {
    if (dropActive) return;
    cancelOverflowHide();
    overflowHideTimer.current = setTimeout(() => setOverflowPeek(false), 220);
  };
  const items: LcosRailwayViewItem[] = primary.map((item) => ({key:item.key,label:item.label,icon:Eye,
    onPointerDown:item.sourceRef||reorderable(item)||item.role==='worksite' ? event=>startPointer(event,item) : undefined,
    onClickCapture:event=>consumeReorderClick(event,item.key),
    reorderOffset:reorderPreview?.shifts.find(shift=>shift.key===item.key),
    reordering:drag.current===item.key,
    glyph:railwayDestinationGlyph(item),
    selected:item.canvasId===canvasId,disabled:!item.available||busy||!!activating||status!=='ready',
    draggable:false,reorderDropTarget:reorderTarget?.key===item.key,reorderDropPosition:reorderTarget?.key===item.key?reorderTarget.where:undefined,receivePresentation:receiveState(item,`rail:${item.key}`),
    onElement:elementRef(`rail:${item.key}`),onPeekEnter:()=>enterPeek(item.key),onPeekLeave:leavePeek,onManage:()=>openItemActions(item)}));
  const anchor = focused ? (elements.current.get(`rail:${focused.key}`) ?? elements.current.get(`overflow:${focused.key}`))?.getBoundingClientRect() : bookmarkRef.current?.getBoundingClientRect();
  const focusedScopeId = focused?.ref.kind === 'spatial' && focused.ref.entityType === 'scope' ? focused.ref.entityId : undefined;
  const scopeWorksiteIds = focusedScopeId
    ? new Set(spatialIndex?.graph?.workspaces.filter(item => String(item.scopeId) === focusedScopeId).map(item => String(item.id))) : new Set<string>();
  const scopeWorksites = destinations.filter(item => item.ref.kind === 'worksite' && item.available && scopeWorksiteIds.has(item.ref.worksiteId));
  const showReceiver=Boolean(receiver);
  const receiverState=receiverEntry?.projection?.userState;
  const receiverLabel=receiverState ? ({ready:'可以继续',thinking:'正在理解',working:'正在执行',needs_user:'等你回应',done:'本轮完成',unavailable:'暂时不可用'}[receiverState]) : '状态读取中';
  const resumable=(snapshot?.candidates ?? []).filter(item=>isResumableContextWorksite(item,projectId));
  const tuckedAway=destinations.filter(item=>presentation.hiddenKeys.includes(item.key));
  const reorderSource = destinations.find(item=>item.key===reorderPreview?.key);
  useEffect(() => {
    const host = toolsHost.current; if (!host || !addOpen) return;
    const close = () => dismiss(true);
    host.addEventListener(CREATION_FINISHED, close);
    return () => host.removeEventListener(CREATION_FINISHED, close);
  }, [addOpen]);
  return <div ref={placement.ref} data-lcos-railway data-lcos-railway-version={snapshot?.order.version}
    data-lcos-railway-receive-map={dropActive || undefined}
    className="lcos-railway-host" style={{left:placement.rect.x,top:placement.rect.y,width:railWidth}}>
    <LcosRailwayView items={items} columns={columns}
      onSelect={(key)=>{if(dropActive)return;const item=destinations.find((d)=>d.key===key);if(item)void activate(item);}}
      canonicalTotal={destinations.length} overflowCount={hidden.length} overflowOpen={receiveOverflowOpen||overflowPeek} onOverflowToggle={toggleOverflow} onOverflowDismiss={()=>focused?dismiss(true):dismissOverflow()}
      onOverflowEnter={showOverflow} onOverflowLeave={hideOverflow}
      overflow={receiveOverflowOpen||overflowPeek ? <Popover
        position={{x:placement.rect.x+railWidth,y:placement.rect.y+primaryHeight+8}}
        offset={{x:10,y:0}} style={{...lcosGlassStyle,width:Math.min(280,viewport.width-24),maxHeight:viewport.height-24}}
        className="lcos-railway-popover" contentRef={overflowPanelRef} dismissOnEscape={false}
        onDismiss={()=>focused?dismiss(true):dismissOverflow()} zIndex={80}>
        <div data-lcos-railway-overflow data-lcos-railway-receive-map={receiveOverflowOpen||undefined} role="dialog" aria-label={receiveOverflowOpen?'更多可接收空间':'更多项目空间'}
          data-popover-dismiss-ignore style={{position:'static',width:'auto',maxHeight:'none',padding:0,border:0,background:'transparent',boxShadow:'none'}}
          onMouseEnter={showOverflow} onMouseLeave={hideOverflow} onFocusCapture={showOverflow}>
        <span data-lcos-railway-overflow-summary>{receiveOverflowOpen?'继续拖动到具体现场。':'已有项目现场，直接打开。'}</span>
        <div data-lcos-railway-overflow-list>
          <RailwayDestinationSidebar
            activeKey={hidden.find((item)=>item.workspaceId===activeWorkspaceId)?.key}
            busy={busy||!!activating||status!=='ready'}
            onSelect={(key)=>{const item=hidden.find((destination)=>destination.key===key);if(item)void activate(item);}}
            items={hidden.map((item)=>({key:item.key,label:item.label,draggable:false,
              onPointerDown:item.sourceRef||reorderable(item)||item.role==='worksite' ? event=>startPointer(event,item) : undefined,
              onClickCapture:event=>consumeReorderClick(event,item.key),
              onManage:()=>openItemActions(item),onPeekEnter:()=>enterPeek(item.key),onPeekLeave:leavePeek,
              reorderDropTarget:reorderTarget?.key===item.key,reorderDropPosition:reorderTarget?.key===item.key?reorderTarget.where:undefined,
              description:railwayReceiveLabel(receiveState(item,`overflow:${item.key}`),item.reason),
              disabled:!item.available,receivePresentation:receiveState(item,`overflow:${item.key}`),
              onElement:elementRef(`overflow:${item.key}`)}))}
          />
        </div>
      </div></Popover> : undefined}
      receiver={showReceiver && receiver ? <div data-lcos-railway-receiver-shell><button type="button" ref={receiverRef} data-lcos-railway-receiver={receiver.id} data-lcos-drop-policy="open-only"
        aria-label={`打开承接会话 ${receiver.label} · ${receiverLabel}`} title={`${receiver.label} · ${receiverLabel}`}
        onClick={()=>openWindow('conversation',`会话窗口 · ${receiver.label}`,receiver.id)}>
        <LcosReceiverIdentity projectId={projectId} conversationId={receiver.id} size={28}/>
      </button></div>:undefined}
      footer={notice||receiverError ? <span role="status">{notice??receiverError}{status==='error'&&<button type="button" onClick={refresh}>重试</button>}</span>:undefined}/>
    <button ref={columnsRef} type="button" role="slider" data-lcos-railway-column-grip aria-label="调整空间导航列数"
      aria-valuemin={1} aria-valuemax={2} aria-valuenow={columns} title="拖动调整列数；双击恢复自动"
      className="lcos-railway-column-grip" disabled={dropActive}
      onPointerDown={event=>{if(event.button!==0||dropActive)return;event.currentTarget.focus({preventScroll:true});event.preventDefault();event.stopPropagation();columnsGesture.current={pointerId:event.pointerId,x:event.clientX,columns,preference:presentation.columns};event.currentTarget.setPointerCapture?.(event.pointerId);}}
      onPointerMove={event=>{const gesture=columnsGesture.current;if(!gesture||gesture.pointerId!==event.pointerId)return;const dx=event.clientX-gesture.x;if(Math.abs(dx)<4)return;
        const next=gesture.columns===1?(dx>=22?2:1):(dx<=-22?1:2);setPresentation(value=>value.columns===next?value:{...value,columns:next});}}
      onPointerUp={event=>{columnsGesture.current=null;if(event.currentTarget.hasPointerCapture?.(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}}
      onPointerCancel={()=>{const gesture=columnsGesture.current;columnsGesture.current=null;if(gesture)setPresentation(value=>({...value,columns:gesture.preference}));}}
      onLostPointerCapture={()=>{const gesture=columnsGesture.current;columnsGesture.current=null;if(gesture)setPresentation(value=>({...value,columns:gesture.preference}));}}
      onDoubleClick={()=>setPresentation(value=>({...value,columns:'auto'}))}
      onKeyDown={event=>{if(event.nativeEvent.isComposing)return;const next=event.key==='ArrowLeft'?1:event.key==='ArrowRight'?2:event.key==='Home'?'auto':undefined;
        if(next===undefined)return;event.preventDefault();event.stopPropagation();setPresentation(value=>({...value,columns:next}));}} />
    {reorderPreview && reorderSource && <div data-lcos-railway-reorder-ghost aria-hidden style={{...lcosGlassStyle,position:'fixed',left:reorderPreview.pointer.x+16,top:reorderPreview.pointer.y+12,
      width:40,height:40,borderRadius:12,display:'grid',placeItems:'center',zIndex:90,pointerEvents:'none'}}>
      <FigmaShellGlyph name={railwayDestinationGlyph(reorderSource)} size={22}/>
    </div>}
    <div ref={newViewRegionRef} data-lcos-railway-new-view data-lcos-railway-new-view-active={dropActive||undefined}
      data-lcos-railway-new-view-hot={drop.status==='preview'&&drop.destination.targetId===`railway-new-view:${projectId}`||undefined}>
      <LcosIconButton ref={bookmarkRef} appearance="oreo" variant="secondary" shape="circle" size="md" floating
        aria-label="添加与创建" title="添加节点、智能体和新现场 · 1 / 2 / 3 / 4 / A" aria-expanded={addOpen}
        disabled={createWorksiteBusy||dropActive} onClick={()=>{if(addOpen)dismiss();else openAdd();}}
        onContextMenu={event=>{event.preventDefault();event.stopPropagation();if(!dropActive){if(addOpen)dismiss();else openAdd();}}}><Plus size={19}/></LcosIconButton>
    </div>
    {(addOpen||focused) && <Popover position={{x:anchor?.right??placement.rect.x+52,y:anchor?.top??placement.rect.y}}
      offset={{x:10,y:0}} style={{...lcosGlassStyle,width:Math.min(280,viewport.width-24),maxHeight:viewport.height-24}}
      className={`lcos-railway-popover${focused && !addOpen ? ' lcos-railway-compact-peek' : ''}`} contentRef={panelRef} onDismiss={()=>dismiss(true)} zIndex={80}>
      <section role="dialog" data-popover-dismiss-ignore={focused!==undefined||undefined} aria-label={addOpen?'添加与创建':`${focused?.label} 目的地预览`}
        onMouseEnter={()=>{cancelHide();cancelOverflowHide();}}
        onMouseLeave={addOpen?undefined:()=>{leavePeek();if(overflowPeek)hideOverflow();}}
        onFocusCapture={()=>{cancelHide();cancelOverflowHide();}}>
        <header><strong>{addOpen?'添加与创建':focused?.label}</strong>
          {focused&&railwayIdentityCapabilities(focused).rename&&<button type="button" aria-label={`更名 ${focused.label}`} title="更名" disabled={identityBusy||busy} onClick={()=>{cancelHide();setIdentityEdit({item:focused,name:focused.label});}}><Pencil size={14}/></button>}
          {addOpen && <button type="button" aria-label="关闭目的地面板" onClick={()=>dismiss(true)}><X size={17}/></button>}</header>
        {addOpen ? <>
          <div ref={toolsHostRef} data-lcos-creation-tools-host />
          <button type="button" className="lcos-railway-create-worksite" aria-label="新建空白现场" disabled={busy||createWorksiteBusy||status!=='ready'} onClick={()=>void createBlankView()}><Plus size={15}/>新建空白现场</button>
          {status==='loading' && !snapshot && <p role="status">正在读取目的地…</p>}
          {snapshot?.migrationRequired && <div className="lcos-railway-migration"><p>旧导航已按原身份列出，未识别的记录保留。确认后使用新版顺序。</p>
            <button type="button" disabled={busy||status!=='ready'} onClick={()=>void update((s)=>s.order.orderedRefs,'旧记录已保留并更新，未创建任何现场。')}>保留记录并更新</button></div>}
          {tuckedAway.length>0&&<div className="lcos-railway-candidates" aria-label="已从导航收起的空间">{tuckedAway.map(item=>
            <button type="button" key={item.key} aria-label={`显示在导航 ${item.label}`} onClick={()=>{setPresentation(value=>({...value,hiddenKeys:value.hiddenKeys.filter(key=>key!==item.key)}));dismiss();}}>
              <FigmaShellGlyph name={railwayDestinationGlyph(item)} size={18}/><strong>{item.label}</strong><Plus size={14}/>
            </button>)}</div>}
          {resumable.length>0&&<div className="lcos-railway-candidates" aria-label="继续已有上下文现场">{resumable.map(item=><button type="button" key={item.key}
            disabled={busy||createWorksiteBusy||status!=='ready'||Boolean(snapshot?.migrationRequired)} aria-label={`继续建立并进入 ${item.label}`}
            onClick={()=>void continueExistingContextWorksite(item)}><span><strong>{item.label}</strong><small>继续已有现场</small></span><Plus size={14}/></button>)}</div>}
          {tuckedAway.length===0&&resumable.length===0&&!snapshot?.migrationRequired&&status==='ready'&&<p>长期现场和会话自动显示。把集合、上下文或工作流拖到 ＋ 上，就会留在导航里。</p>}
        </> : focused && <>
        {focused.canvasId&&focused.available ? <RailwayPeek canvasId={focused.canvasId}/>
            : focused.ref.kind === 'spatial' && focused.ref.entityType === 'collection' && focused.available
              ? <RailwayCollectionPeek projectId={projectId} collectionId={focused.ref.entityId} graph={spatialIndex?.graph} refreshKey={`${receiptVersion ?? ''}:${receiverRefresh}`} />
            : focused.ref.kind === 'spatial' && focused.ref.entityType === 'scope' && focused.available
              ? <RailwayScopePeek projectId={projectId} scopeId={focused.ref.entityId} index={spatialIndex}
                  refreshKey={`${receiptVersion ?? ''}:${receiverRefresh}`}
                  worksiteDestinations={scopeWorksites} onOpenWorksite={item=>void activate(item)} />
            : focused.ref.kind === 'spatial' ? <p>{focused.reason ?? '原空间暂不可读取。'}</p>
            : <p>{focused.reason??'这是原会话入口；内容在会话窗口中读取。'}</p>}
          <p>{focused.role==='receiver'?'这里只打开原会话，不更改当前接收者。':railwayReceiveLabel(receiveState(focused,`rail:${focused.key}`),focused.reason)}</p>
          <div className="lcos-railway-peek-actions"><button type="button" disabled={!focused.available||busy||!!activating||status!=='ready'} onClick={()=>void activate(focused)}><Eye size={15}/>{focused.ref.kind==='spatial'?'定位':'打开'}</button>
            {focused.receiveTarget?.owner === 'assembly' && <button type="button" onClick={()=>{
              const receiver=focused.receiveTarget;
              if(receiver?.owner==='assembly')useLcosShellStore.getState().openAssembly(receiver.targetRef,`取材 · ${focused.label}`,false);
              dismiss();
            }}>取材</button>}
            {focused.ref.kind === 'worksite' && focused.canvasId !== canvasId && <button type="button" disabled={placing||busy||!!activating||!focused.available||status!=='ready'} onClick={()=>void placePortal(focused)}><Plus size={15}/>{placing ? '保存入口…' : '放置入口'}</button>}
            <button type="button" aria-label={`空间操作 ${focused.label}`} aria-expanded={itemActionsOpen} onClick={()=>{cancelHide();setItemActionsOpen(value=>!value);}}><MoreHorizontal size={15}/></button></div>
          {itemActionsOpen&&identityActions(focused)}
        </>}
        {identityEdit&&<form data-lcos-railway-rename onSubmit={event=>{event.preventDefault();void applyIdentityEdit();}}>
          <label>空间名称<input ref={renameInputRef} value={identityEdit.name} aria-label="空间名称" disabled={identityBusy}
            onChange={event=>{const name=event.currentTarget.value;setIdentityEdit(value=>value?{...value,name}:undefined);}}
            onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setIdentityEdit(undefined);}}} /></label>
          <button type="submit" disabled={identityBusy||!identityEdit.name.trim()}>保存名称</button><button type="button" disabled={identityBusy} onClick={()=>setIdentityEdit(undefined)}>取消</button>
        </form>}
        {confirmRemove&&<div role="alertdialog" aria-label="确认移除工作现场" data-lcos-railway-remove-confirm>
          <p>移除工作现场「{confirmRemove.label}」？项目材料与源文件保留。</p>
          <button type="button" disabled={identityBusy} onClick={()=>void applyWorkspaceRemove()}>移除工作现场</button>
          <button type="button" disabled={identityBusy} onClick={()=>setConfirmRemove(undefined)}>取消</button>
        </div>}
        {notice&&<p role="status">{notice}</p>}
        {spatialIndex?.issues.length ? <p role="status">{spatialIndex.issues.join('；')}，已读取的入口仍可使用。<button type="button" onClick={refresh}>重新读取空间</button></p> : null}
        {status==='error'&&<button type="button" onClick={refresh}>重新读取目的地</button>}
      </section>
    </Popover>}
  </div>;
}
