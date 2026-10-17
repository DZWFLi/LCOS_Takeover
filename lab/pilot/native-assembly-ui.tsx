import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentType } from 'react';
import { createLcosCoreSession } from '../../lcos/huabu/apps/web/src/lcos/app/lcosCoreClient';
import { useLcosShellStore } from '../../lcos/huabu/apps/web/src/lcos/shell/lcosShellStore';
import { useLcosReferenceStore } from '../../lcos/huabu/apps/web/src/lcos/lcosReferenceState';
import { composerInputKey } from '../../lcos/huabu/apps/web/src/lcos/composer/composerInputJourney';
import { referencePickOwnerKey } from '../../lcos/huabu/apps/web/src/lcos/referencePickOwnership';
import { assemblyDraftReferenceOf } from '../../lcos/huabu/apps/web/src/lcos/professional/assemblySourceRef';
import { readAssemblyArtifactMedia } from '../../lcos/huabu/apps/web/src/lcos/professional/assemblyArtifactMedia';
import { prepareDraftReferences, runReferenceUnavailableReason } from '../../lcos/huabu/apps/web/src/lcos/composer/referenceSnapshot';
import useCanvasStore from './native-canvas-port';
import { nativeAssemblyItem, nativeAssemblyVersion, sameNativeAssemblyInput, verifyNativeAssemblyVersion } from './native-assembly-policy';
import './native-assembly.css';
import { NativeMaterialRail } from './native-material-rail-ui';
import { cancelNativeMaterialNavigation } from './native-material-navigation';
import { captureNativeLibraryInputReturn, restoreNativeLibraryInputReturn, useNativeLibraryInputOrigin } from './native-library-contexts';
import { requestNativeMaterialView } from './native-material-viewer-port';
import { locateNativeMaterialNodes, placeNativeLibraryMaterial } from './native-material-placement-client';
import { useNativeLibraryPlacementStore, useNativeLibraryPlacementAttempt, nativeLibraryPlacementAddress,
  beginNativeLibraryPlacementAttempt, settleNativeLibraryPlacementAttempt } from './native-library-placement-state';

type Choice = { serial: number; projectId: string; canvasId: string; api: unknown; detail: any };
let choice: Choice | null = null;
let nextSerial = 0;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const snapshot = () => choice;
function publish(value: Choice | null) { choice = value; listeners.forEach(listener => listener()); }

/** Replaces only Library's create-and-insert callback. Selection is not a write. */
export function LCOSNativeAssemblyOpen(detail: any): boolean {
  if (!detail?.asset?.lcos_projection) return false;
  const canvas = useCanvasStore.getState();
  const projectId = window.__LCOS_NODE_LAB__?.projectId;
  if (typeof projectId !== 'string' || !canvas.canvasId || canvas.status !== 'ready') return true;
  cancelNativeMaterialNavigation();
  publish({ serial: ++nextSerial, projectId, canvasId: canvas.canvasId, api: canvas.rfInstance, detail });
  return true;
}

type MediaState = { key: string; serial: number; item: ReturnType<typeof nativeAssemblyVersion>; detail: any;
  revisions: { id: string; createdAt?: string }[]; fileRecordId: string; currentRevisionId?: string };

/** Adapt the original row Popover's preview/actions, without occupying the Library list. */
export function LCOSNativeAssemblyTools({ detail, onApply, onClose, NativeButton, NativePreview, NativeAssetRow, NativePopover }: {
  detail: any; onApply?: (detail: any) => void; onClose?: () => void;
  NativeButton: ComponentType<any>; NativePreview: ComponentType<any>; NativeAssetRow?: ComponentType<any>; NativePopover?: ComponentType<any>;
}) {
  const selected = useSyncExternalStore(subscribe, snapshot, () => null);
  const canvas = useCanvasStore(s => s);
  const target = useLcosShellStore(s => s.composerTarget);
  const projectId = useLcosShellStore(s => s.projectId);
  const workspaceId = useLcosShellStore(s => s.activeWorkspaceId);
  const inputOrigin = useNativeLibraryInputOrigin();
  const session = useMemo(() => createLcosCoreSession(), []);
  const [version, setVersion] = useState<{ serial: number; id: string } | null>(null);
  const [media, setMedia] = useState<MediaState | null>(null);
  const [notice, setNotice] = useState<{ key: string; message: string } | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [locationsOpen, setLocationsOpen] = useState(false);
  const [unconfirmedPlacement, setUnconfirmedPlacement] = useState<string | null>(null);
  const [placedTarget, setPlacedTarget] = useState<{ key: string; nodeId: string; artifactViewId: string; revisionId: string } | null>(null);
  const placementInFlight = useRef<string | null>(null);
  const ownedSerial = useRef<number | null>(null);
  const coreDetail = !!detail?.asset?.lcos_projection;
  const sameSource = selected?.detail?.asset?.lcos_projection && detail?.asset?.lcos_projection
    && ['project_id', 'artifact_id', 'artifact_view_id', 'presented_revision_id', 'file_record_id']
      .every(field => selected.detail.asset.lcos_projection[field] === detail.asset.lcos_projection[field]);
  const current = selected && selected.serial === ownedSerial.current && sameSource
    && selected.projectId === projectId && selected.projectId === window.__LCOS_NODE_LAB__?.projectId
    && selected.canvasId === canvas.canvasId && selected.api === canvas.rfInstance
    && selected.detail?.asset?.id === detail?.asset?.id ? selected : null;
  const revisionId = version && current && version.serial === current.serial ? version.id : '';
  const key = current ? JSON.stringify([current.serial, revisionId]) : '';
  const mounted = useRef(true);
  const latest = useRef({ selected, api: canvas.rfInstance, key }); latest.current = { selected, api: canvas.rfInstance, key };
  const ready = media?.key === key ? media : null;
  const placementStore = useNativeLibraryPlacementStore();
  const placementAddress = current && ready && workspaceId ? nativeLibraryPlacementAddress({ projectId: current.projectId,
    canvasId: current.canvasId, workspaceId, source: { kind: 'material', artifactId: ready.item.entityRef.id,
      revisionId: ready.item.presentedRevisionId!, fileRecordId: ready.fileRecordId, artifactViewId: ready.item.entityRef.viewId } }) : null;
  const placementAttempt = useNativeLibraryPlacementAttempt(placementStore, placementAddress);
  const placementBusy = placementAttempt?.status === 'pending';
  const placementNeedsCheck = unconfirmedPlacement === key || !!placementAttempt;
  const picker = media && current && media.serial === current.serial ? media : null;
  const activeNotice = notice?.key === key ? notice.message : '';
  const displayedNotice = /\bHTTP\s+\d+|failed to fetch|network error/i.test(activeNotice)
    ? '这个版本暂时打不开，请切换版本后重试。' : activeNotice.replace(/\bCurrent\b/g, '最新版本');
  const isCurrent = () => mounted.current && !!current && choice?.serial === current.serial && latest.current.selected?.serial === current.serial
    && ownedSerial.current === current.serial
    && latest.current.key === key
    && useLcosShellStore.getState().projectId === current.projectId && window.__LCOS_NODE_LAB__?.projectId === current.projectId
    && useCanvasStore.getState().canvasId === current.canvasId && useCanvasStore.getState().rfInstance === current.api;
  const say = (message: string) => { if (isCurrent()) setNotice({ key, message }); };
  useEffect(() => {
    if (!current) return;
    const controller = new AbortController();
    let objectUrl: string | undefined;
    const read = async () => {
      const item = nativeAssemblyItem(current.detail, current.projectId);
      const wanted = revisionId || item.presentedRevisionId!;
      const [revisions, graph] = await Promise.all([
        session.artifacts.listArtifactRevisions(item.entityRef.id, controller.signal),
        session.projects.getProjectGraph(current.projectId),
      ]);
      if (controller.signal.aborted || !isCurrent()) return;
      const revision = graph.artifactRevisions.find(row => String(row.id) === wanted && String(row.artifactId) === item.entityRef.id);
      const file = revision && graph.fileRecords.find(row => String(row.id) === String(revision.fileRecordId));
      if (!file?.mimeType) throw new Error('所选版本的真实文件类型未确认。');
      const mime = file.mimeType;
      const version = nativeAssemblyVersion(item, wanted, mime);
      // Invalid historical FileRecords are rejected before their bytes are requested.
      verifyNativeAssemblyVersion(graph, current.projectId, version, String(file.id));
      const value = await readAssemblyArtifactMedia(session.artifacts, current.projectId, item.entityRef.id, wanted, controller.signal);
      if (controller.signal.aborted || !isCurrent()) return;
      if (value.revisionId !== wanted || value.fileRecordId !== String(file.id)) throw new Error('预览版本或文件不一致，未采用 Current。');
      const asset = { ...current.detail.asset,
        content: value.kind === 'text' ? value.text : '',
        source_url: value.blob ? (objectUrl = URL.createObjectURL(value.blob)) : '',
        thumbnail_url: '', asset_type: value.kind === 'image' ? 1 : value.kind === 'video' ? 2 : value.kind === 'audio' ? 3 : value.kind === 'text' ? 4 : 0,
        lcos_projection: { ...current.detail.asset.lcos_projection, artifact_id: version.entityRef.id,
          artifact_view_id: version.entityRef.viewId ?? null, presented_revision_id: value.revisionId,
          file_record_id: value.fileRecordId, assembly_item: version, pinned_revision: true } };
      if (value.kind === 'image') asset.thumbnail_url = asset.source_url;
      const artifact = graph.artifacts.find(row => String(row.id) === version.entityRef.id);
      setMedia({ key, serial: current.serial, item: version, detail: { ...current.detail, asset }, revisions,
        fileRecordId: value.fileRecordId, currentRevisionId: artifact?.currentRevisionId ? String(artifact.currentRevisionId) : undefined });
      setNotice({ key, message: value.kind === 'unsupported' ? '小预览暂时打不开这类文件，可以点「查看」打开。' : '' });
    };
    void read().catch(error => { if (!controller.signal.aborted && isCurrent()) say(error instanceof Error ? error.message : '预览未确认。'); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [current?.serial, canvas.canvasId, canvas.rfInstance, projectId, key, session]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (choice?.serial === ownedSerial.current) publish(null);
    };
  }, []);
  useEffect(() => {
    if (coreDetail) {
      LCOSNativeAssemblyOpen(detail);
      ownedSerial.current = choice?.detail === detail && choice.api === canvas.rfInstance && choice.canvasId === canvas.canvasId ? choice.serial : null;
    } else ownedSerial.current = null;
    setLocationsOpen(false);
  }, [detail?.asset, canvas.canvasId, canvas.rfInstance, canvas.status, projectId]);

  const addReference = async () => {
    if (!current || !ready || !isCurrent() || pending === key) return;
    const shell = useLcosShellStore.getState(), beforeTarget = shell.composerTarget;
    const returnInput = captureNativeLibraryInputReturn(current.projectId);
    const input = { key: composerInputKey(beforeTarget), messageId: beforeTarget?.messageId,
      continuationOperationId: beforeTarget?.continuationOperationId };
    const owner = referencePickOwnerKey(current.projectId, beforeTarget);
    const refState = useLcosReferenceStore.getState();
    if (!owner || !input.key || shell.projectId !== current.projectId || refState.projectId !== current.projectId) {
      say('先打开要加入材料的本次输入；不会替你新建或发送任务。'); return;
    }
    const sending = () => [...useLcosReferenceStore.getState().referenceInputOperations.values()]
      .some(operation => operation.owner === owner && operation.kind === 'sending');
    if (sending()) { say('本条消息正在发送，原选择保留。'); return; }
    const stillSame = () => {
      const live = useLcosShellStore.getState(), liveTarget = live.composerTarget;
      return isCurrent() && live.projectId === current.projectId && useLcosReferenceStore.getState().projectId === current.projectId
        && sameNativeAssemblyInput(input, { key: composerInputKey(liveTarget), messageId: liveTarget?.messageId,
          continuationOperationId: liveTarget?.continuationOperationId }) && !sending();
    };
    const token = refState.beginReferenceInputOperation(owner, 'preparing');
    setPending(key);
    try {
      const graph = await session.projects.getProjectGraph(current.projectId);
      if (!stillSame()) throw new Error('原输入或现场已变化，未加入其他消息。');
      verifyNativeAssemblyVersion(graph, current.projectId, ready.item, ready.fileRecordId);
      const ref = assemblyDraftReferenceOf(ready.item);
      const prepared = prepareDraftReferences([ref], beforeTarget?.intent);
      if (!prepared.ok) throw new Error(prepared.reason);
      const unsupported = beforeTarget?.intent === 'continue' ? undefined : runReferenceUnavailableReason(prepared.references[0]);
      if (unsupported) throw new Error(unsupported);
      const result = useLcosReferenceStore.getState().addEntitiesToDraft(prepared.references, beforeTarget?.intent);
      if (result.reason) throw new Error(result.reason);
      if (stillSame()) {
        onClose?.();
        await restoreNativeLibraryInputReturn(returnInput);
      }
      say('已加入对话');
    } catch (error) { say(error instanceof Error ? error.message : '引用未完成，原输入保留。'); }
    finally { useLcosReferenceStore.getState().finishReferenceInputOperation(token); if (mounted.current) setPending(previous => previous === key ? null : previous); }
  };
  const place = async (readOnly = false) => {
    if (!current || !ready || !workspaceId || !isCurrent() || pending === key
      || placementInFlight.current !== null) return;
    const operation = beginNativeLibraryPlacementAttempt(placementStore, placementAddress, readOnly || placementNeedsCheck);
    if (!operation) return;
    const capturedWorkspace = workspaceId;
    const samePlace = () => isCurrent() && useLcosShellStore.getState().activeWorkspaceId === capturedWorkspace;
    placementInFlight.current = key;
    setPending(key);
    try {
      const result = await placeNativeLibraryMaterial({ projectId: current.projectId, canvasId: current.canvasId,
        workspaceId: capturedWorkspace, artifactId: ready.item.entityRef.id, revisionId: ready.item.presentedRevisionId!,
        artifactViewId: ready.item.entityRef.viewId, fileRecordId: ready.fileRecordId, title: ready.item.title },
      { api: current.api as NonNullable<typeof canvas.rfInstance>, isCurrent: samePlace, readOnly: operation.readOnly });
      settleNativeLibraryPlacementAttempt(placementStore, placementAddress, operation, result.status);
      if (!samePlace()) return;
      if (result.status === 'unconfirmed' || result.status === 'rejected' && operation.readOnly) setUnconfirmedPlacement(key);
      if (result.status === 'placed' || result.status === 'already-present') {
        setUnconfirmedPlacement(previous => previous === key ? null : previous);
        setPlacedTarget({ key, nodeId: result.nodeId, artifactViewId: result.artifactViewId, revisionId: result.revisionId });
        say(result.outsideVisible ? '已放在画布空白处，点「定位」查看。' : result.status === 'placed' ? '已放到画布。' : '这个版本已在画布上。');
      } else say(result.message);
    } catch {
      settleNativeLibraryPlacementAttempt(placementStore, placementAddress, operation, 'unconfirmed');
      if (samePlace()) {
        setUnconfirmedPlacement(key);
        say('放置结果暂未确认，已有内容保留；请重新读取画布后核对。');
      }
    } finally {
      placementInFlight.current = null;
      if (mounted.current) setPending(previous => previous === key ? null : previous);
    }
  };
  const locate = async () => {
    if (!current || !ready || !isCurrent()) return;
    const api = useCanvasStore.getState().rfInstance;
    const nodes = api?.getNodes().filter(node => {
      const ref = node.data?.lcos_ref as any;
      if (placedTarget?.key === key) return node.id === placedTarget.nodeId && ref?.artifactId === ready.item.entityRef.id
        && ref.revisionId === placedTarget.revisionId && ref.artifactViewId === placedTarget.artifactViewId;
      return ref?.artifactId === ready.item.entityRef.id && ref.revisionId === ready.item.presentedRevisionId
        && (!ready.item.entityRef.viewId || ref.artifactViewId === ready.item.entityRef.viewId);
    }) ?? [];
    if (!nodes.length) { say('当前画布没有这个版本，可在「使用位置」查看其他画布。'); return; }
    if (!api) return;
    const canvasId = current.canvasId, ownerProjectId = current.projectId;
    const stillSameCanvas = () => useCanvasStore.getState().canvasId === canvasId && useCanvasStore.getState().rfInstance === api
      && useLcosShellStore.getState().projectId === ownerProjectId;
    onClose?.();
    const fitted = await locateNativeMaterialNodes(nodes.map(({ id }) => id), { api, isCurrent: stillSameCanvas });
    if (!isCurrent()) return;
    say(fitted === false ? '位置暂未确认，材料和布局保留。' : `已定位 ${nodes.length} 处`);
  };
  const railEnabled = (import.meta.env as Record<string, unknown>).LCOS_NATIVE_RAIL_PILOT === true && NativeAssetRow && NativePopover;
  const collectingReferences = !!inputOrigin && inputOrigin.projectId === projectId && inputOrigin.canvasId === canvas.canvasId
    && inputOrigin.api === canvas.rfInstance && inputOrigin.inputKey === composerInputKey(target)
    && inputOrigin.messageId === target?.messageId && inputOrigin.continuationOperationId === target?.continuationOperationId;
  const supportsPlacement = ready && [1, 4].includes(ready.detail.asset.asset_type);
  if (!coreDetail) return <NativePreview detail={detail} onApply={onApply} />;
  const versionPicker = current && picker && picker.revisions.length > 1 && <select aria-label="材料版本"
    value={revisionId || current.detail.asset.lcos_projection.presented_revision_id} disabled={pending === key}
    onChange={event => { cancelNativeMaterialNavigation(); setLocationsOpen(false); setVersion({ serial: current.serial, id: event.target.value }); }}>
    {picker.revisions.map((row, index) => <option key={row.id} value={row.id}>{row.id === picker.currentRevisionId ? '最新版本' : `版本 ${index + 1}`}
      {row.createdAt && !Number.isNaN(Date.parse(row.createdAt)) ? ` · ${new Date(row.createdAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}` : ''}</option>)}
  </select>;
  const actions = <div className="native-assembly-actions">
    <div className="native-assembly-secondary">{versionPicker}
      <NativeButton type="button" aria-label="查看准确版本" title="查看" className="native-assembly-action" disabled={!ready || !current}
        onClick={() => {
          if (!ready || !current || !isCurrent()) return;
          if (collectingReferences) captureNativeLibraryInputReturn(current.projectId);
          requestNativeMaterialView({ projectId: current.projectId, artifactId: ready.item.entityRef.id,
            revisionId: ready.item.presentedRevisionId!, artifactViewId: ready.item.entityRef.viewId,
            title: ready.item.title, composerOriginKey: collectingReferences ? inputOrigin!.inputKey : undefined });
          onClose?.();
        }}>查看</NativeButton>
      <NativeButton type="button" aria-label="定位准确版本" title="在画布中查看" className="native-assembly-action" disabled={!ready} onClick={() => void locate()}>定位</NativeButton>
      {railEnabled && current && ready && <NativeButton type="button" aria-label="来源与使用位置" title="来源与使用位置"
        className="native-assembly-action" onClick={() => setLocationsOpen(true)}>位置</NativeButton>}
    </div>
    {collectingReferences ? <button type="button" aria-label="加入本次引用" title="加入当前对话" className="native-assembly-reference"
      disabled={!ready || !target || pending === key} onClick={() => void addReference()}>{pending === key ? '正在加入…' : '加入对话'}</button>
      : <>
        <button type="button" aria-label="放到画布" className="native-assembly-reference"
          disabled={!supportsPlacement || !workspaceId || pending === key || placementBusy || placementNeedsCheck}
          onClick={() => void place()}>{pending === key || placementBusy ? '正在放置…' : placementNeedsCheck ? '放置待确认' : '放到画布'}</button>
        {ready && !supportsPlacement && <p>这类材料暂时还不能放到画布，可以先查看。</p>}
        {placementNeedsCheck && <NativeButton type="button" aria-label="核对放置结果" className="native-assembly-action"
          disabled={pending === key || placementBusy} onClick={() => void place(true)}>核对放置结果</NativeButton>}
        {target && <NativeButton type="button" aria-label="加入本次引用" className="native-assembly-action"
          disabled={!ready || pending === key} onClick={() => void addReference()}>{pending === key ? '正在加入…' : '加入对话'}</NativeButton>}
      </>}
    {displayedNotice && <p role="status">{displayedNotice}</p>}
  </div>;
  return <section className="native-assembly-tools" aria-label="材料预览" data-native-assembly-state={ready ? 'ready' : activeNotice ? 'error' : 'loading'}>
    {locationsOpen && railEnabled && current && ready ? <div className="native-assembly-locations">
      <NativeButton type="button" aria-label="返回材料预览" className="native-assembly-back" onClick={() => setLocationsOpen(false)}>‹ 材料</NativeButton>
      <NativeMaterialRail key={key} projectId={current.projectId} canvasId={current.canvasId} api={current.api}
        artifactId={ready.item.entityRef.id} revisionId={ready.item.presentedRevisionId!} detail={ready.detail}
        NativeButton={NativeButton} NativePreview={NativePreview} NativeAssetRow={NativeAssetRow!} NativePopover={NativePopover!} />
    </div> : ready && current ? <div className="native-assembly-preview" data-native-assembly-revision={ready.item.presentedRevisionId} data-native-assembly-file={ready.fileRecordId}>
      <NativePreview key={JSON.stringify([current.projectId, ready.item.entityRef.id, ready.item.presentedRevisionId])} detail={ready.detail} lcosActions={actions} />
    </div> : <div className="native-assembly-pending"><p role="status">{displayedNotice || '正在打开…'}</p>{versionPicker}
      <NativeButton type="button" aria-label="取消材料预览" className="native-assembly-action" onClick={onClose}>返回</NativeButton></div>}
  </section>;
}
