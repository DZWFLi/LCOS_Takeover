import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentType } from 'react';
import { RailwayPeek } from '../../lcos/huabu/apps/web/src/lcos/navigation/RailwayPeek';
import { createLcosCoreSession } from '../../lcos/huabu/apps/web/src/lcos/app/lcosCoreClient';
import { useLcosShellStore } from '../../lcos/huabu/apps/web/src/lcos/shell/lcosShellStore';
import { readAssemblyArtifactMedia } from '../../lcos/huabu/apps/web/src/lcos/professional/assemblyArtifactMedia';
import useCanvasStore from './native-canvas-port';
import { readNativeMaterialContext } from './native-material-context-client';
import { verifyNativeMaterialLocation, type NativeMaterialLocationRow } from './native-material-context';
import { verifyNativeAssemblyVersion } from './native-assembly-policy';
import { materialNavigationSnapshot, subscribeMaterialNavigation, navigateNativeMaterialLocation } from './native-material-navigation';
import './native-material-rail.css';

type Native = ComponentType<any>;
type Read = Awaited<ReturnType<typeof readNativeMaterialContext>>;
const keyOf = (row: NativeMaterialLocationRow) => JSON.stringify([row.projectId, row.workspaceId, row.scopeId,
  row.canvasId, row.nodeId, row.artifactId, row.artifactViewId, row.revisionId, row.fileRecordId]);
const ownerMatches = (projectId: string, canvasId: string, api: unknown) => {
  const canvas = useCanvasStore.getState();
  return useLcosShellStore.getState().projectId === projectId && window.__LCOS_NODE_LAB__?.projectId === projectId
    && canvas.status === 'ready' && canvas.canvasId === canvasId && canvas.rfInstance === api;
};

/** Local operation feedback only; no new window, route or camera owner. */
export function NativeMaterialNavigationNotice() {
  const value = useSyncExternalStore(subscribeMaterialNavigation, materialNavigationSnapshot, () => null);
  const projectId = useLcosShellStore(s => s.projectId);
  const canvasId = useCanvasStore(s => s.canvasId);
  if (!value || value.projectId !== projectId || value.state === 'located' && value.canvasId !== canvasId) return null;
  return <div className="native-material-navigation-notice" role="status" aria-live="polite"
    data-native-rail-navigation-state={value.state} data-native-rail-navigation-canvas={value.canvasId}
    data-native-rail-navigation-node={value.nodeId} data-native-rail-arrival-api-renewed={String(value.arrivalApiRenewed ?? false)}>{value.state === 'located' ? '已定位' : value.state === 'pending' ? '正在前往…' : '暂时无法前往，当前位置已保留。'}</div>;
}

function NativeLocationPeek({ active, projectId, canvasId, api, artifactId, revisionId, location,
  detail, NativePreview, NativeButton, onLocate, onBack }: {
  active: boolean; projectId: string; canvasId: string; api: unknown; artifactId: string; revisionId: string;
  location: NativeMaterialLocationRow; detail: any; NativePreview: Native; NativeButton: Native; onLocate: () => void; onBack: () => void;
}) {
  const session = useMemo(() => createLcosCoreSession(), []);
  const [load, setLoad] = useState<{ key: string; api: unknown; detail?: any; scene?: any; error?: string } | null>(null);
  const key = JSON.stringify([projectId, canvasId, artifactId, revisionId, active, keyOf(location)]);
  const latest = useRef(key); latest.current = key;
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    let url: string | undefined;
    const current = () => !controller.signal.aborted && latest.current === key && ownerMatches(projectId, canvasId, api);
    void (async () => {
      const read = await readNativeMaterialContext(session, projectId, artifactId, revisionId, controller.signal);
      if (!current()) return;
      const target = read.context.locations.find(row => keyOf(row) === keyOf(location));
      if (!target || !verifyNativeMaterialLocation(read.context, target).canNavigate) throw new Error('这个位置已不再对应所选版本，未改用 Current。');
      const file = read.input.graph.fileRecords.find(row => String(row.id) === target.fileRecordId);
      const item = { ...detail.asset.lcos_projection.assembly_item, entityRef: { type: 'artifact', id: artifactId, viewId: target.artifactViewId },
        presentedRevisionId: revisionId, mimeType: file?.mimeType };
      verifyNativeAssemblyVersion(read.input.graph, projectId, item, target.fileRecordId);
      const [media, response] = await Promise.all([
        readAssemblyArtifactMedia(session.artifacts, projectId, artifactId, revisionId, controller.signal),
        fetch(`/api/canvas/${encodeURIComponent(target.canvasId)}/preview-scene`, { signal: controller.signal, cache: 'no-store', credentials: 'same-origin' }),
      ]);
      if (!response.ok) throw new Error('这个现场的布局预览暂不可用；没有使用其他现场。');
      const payload = await response.json();
      const scene = payload.code === 0 ? payload.data : undefined;
      if (!scene || scene.canvasId !== target.canvasId || !Array.isArray(scene.nodes)) throw new Error('返回的场景身份不一致。');
      if (!scene.nodes.some((node: { id: string }) => node.id === target.nodeId)) throw new Error('布局快照没有包含这个准确节点；未拿其他节点代替。');
      if (!current()) return;
      if (media.revisionId !== revisionId || media.fileRecordId !== target.fileRecordId) throw new Error('预览文件或版本不一致。');
      const source = media.blob ? (url = URL.createObjectURL(media.blob)) : '';
      const asset = { ...detail.asset, content: media.text ?? '', source_url: source,
        thumbnail_url: media.kind === 'image' ? source : '',
        asset_type: media.kind === 'image' ? 1 : media.kind === 'text' ? 4 : media.kind === 'video' ? 2 : media.kind === 'audio' ? 3 : 0,
        lcos_projection: { ...detail.asset.lcos_projection, project_id: projectId, artifact_id: artifactId,
          artifact_view_id: target.artifactViewId, presented_revision_id: revisionId, file_record_id: target.fileRecordId,
          assembly_item: item, pinned_revision: true } };
      setLoad({ key, api, detail: { ...detail, asset }, scene });
    })().catch(error => { if (current()) setLoad({ key, api, error: error instanceof Error ? error.message : '准确预览未确认。' }); });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [active, projectId, canvasId, api, artifactId, revisionId, key, session]);
  const ready = load?.key === key && load.api === api ? load : null;
  if (!active) return null;
  return <section className="native-material-peek" aria-label="位置预览" data-native-material-peek={location.canvasId}
    data-native-material-peek-node={location.nodeId} data-native-material-peek-revision={revisionId}
    data-native-material-peek-state={ready?.error ? 'error' : ready?.scene ? 'ready' : 'loading'}>
    <NativeButton aria-label="返回使用位置" className="native-material-back" onClick={onBack}>‹ 使用位置</NativeButton>
    {!ready ? <p role="status">正在打开…</p> : ready.error ? <p role="status">这个位置暂时无法预览，请返回后重试。</p> : <>
      <div className="native-material-scene"><RailwayPeek canvasId={location.canvasId} nativeScene={ready.scene} highlightNodeId={location.nodeId} /></div>
      <div className="native-material-peek-preview" data-native-material-peek-file={location.fileRecordId}><NativePreview detail={ready.detail} /></div>
      <NativeButton aria-label="定位这个准确位置" className="native-material-locate" onClick={onLocate}>前往画布</NativeButton>
    </>}
  </section>;
}

/** The original Library remains the left carrier. Rows, buttons and HoverPopover
 * are the shipped TapNow leaves; Core memberships and evidenced nodes stay separate. */
export function NativeMaterialRail({ projectId, canvasId, api, artifactId, revisionId, detail,
  NativeButton, NativePreview, NativeAssetRow, NativePopover }: {
  projectId: string; canvasId: string; api: unknown; artifactId: string; revisionId: string; detail: any;
  NativeButton: Native; NativePreview: Native; NativeAssetRow: Native; NativePopover: Native;
}) {
  const session = useMemo(() => createLcosCoreSession(), []);
  const [read, setRead] = useState<Read | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [peek, setPeek] = useState<string | null>(null);
  const live = useRef(true);
  const current = () => live.current && ownerMatches(projectId, canvasId, api);
  useEffect(() => {
    live.current = true;
    const controller = new AbortController();
    setRead(null); setError(''); setPeek(null);
    void readNativeMaterialContext(session, projectId, artifactId, revisionId, controller.signal).then(value => {
      if (value.context.status !== 'ready') throw new Error(value.context.issues.join('；') || '来源与位置身份未确认。');
      if (current() && !controller.signal.aborted) setRead(value);
    }).catch(reason => { if (current() && !controller.signal.aborted) setError(reason instanceof Error ? reason.message : '来源与使用位置暂不可用。'); });
    return () => { live.current = false; controller.abort(); };
  }, [projectId, canvasId, api, artifactId, revisionId, attempt, session]);
  const locate = (row: NativeMaterialLocationRow) => {
    if (!current() || !read || !verifyNativeMaterialLocation(read.context, row).canNavigate) return;
    setPeek(null);
    void navigateNativeMaterialLocation({ projectId, location: row,
      isSourceCurrent: current,
      read: (signal?: AbortSignal) => readNativeMaterialContext(session, projectId, artifactId, revisionId, signal) });
  };
  const source = read?.context.source;
  const registered = source?.registeredSource;
  const locations = read?.context.locations ?? [];
  const count = locations.filter(row => row.sameVersion).length;
  const sourceKind = ({ import: '本地导入', run: '生成内容', external: '外部修改' } as Record<string, string>)[source?.revision.source ?? ''] ?? '来源未确认';
  const peekLocation = locations.find(row => keyOf(row) === peek && row.sameVersion);
  if (peekLocation) return <NativeLocationPeek active projectId={projectId} canvasId={canvasId} api={api}
    artifactId={artifactId} revisionId={revisionId} location={peekLocation} detail={detail}
    NativePreview={NativePreview} NativeButton={NativeButton} onLocate={() => locate(peekLocation)} onBack={() => setPeek(null)} />;
  return <section className="native-material-rail" aria-label="材料来源与使用位置" data-native-material-context-state={error ? 'error' : read ? 'ready' : 'loading'}>
    <h3>使用位置</h3>
    <NativeButton aria-label="刷新材料来源与位置" className="native-material-refresh" onClick={() => setAttempt(value => value + 1)}>刷新</NativeButton>
    {error ? <p role="status">位置暂时打不开，请重试。</p> : !read ? <p role="status">正在查找…</p> : <div className="native-material-context-body">
      <div className="native-material-source" data-native-material-source><span>{sourceKind}</span>{registered?.status === 'registered'
          ? <span title={registered.path}>{registered.path.split(/[\\/]/).at(-1)}{!registered.isUrl && !registered.exists ? ' · 源文件不可用' : ''}</span>
          : registered?.status === 'unavailable' ? <span>源文件暂不可读取</span> : null}</div>
      <p data-native-material-location-count>{count} 个位置{locations.length > count ? ` · ${locations.length - count} 个位置使用其他版本` : ''}</p>
      <nav aria-label="使用位置" data-native-material-locations
        onDragStartCapture={event => event.preventDefault()} onContextMenuCapture={event => { event.preventDefault(); event.stopPropagation(); }}>
        {locations.map(row => {
          const key = keyOf(row), workspace = read.input.workspaces.find(item => String(item.id) === row.workspaceId);
          const label = workspace?.name || '未命名画布';
          // The shipped row's thumbnail resizer expects an HTTP URL, not a session Blob.
          // This is the exact already-verified FileRecord, never a cloud thumbnail or Current fallback.
          const thumbnail = `${window.location.origin}/api/surface-core/file-records/${encodeURIComponent(row.fileRecordId)}/content`;
          const asset = { ...detail.asset, name: label, source_url: thumbnail, thumbnail_url: thumbnail };
          return <div className="native-material-location" key={key} data-native-material-location={row.canvasId}
            data-native-material-location-node={row.nodeId} data-native-material-location-version={row.revisionId} data-native-material-location-exact={String(row.sameVersion)}>
            {row.sameVersion ? <div className="native-material-location-row"><NativeAssetRow asset={asset} detail={{ ...detail, asset }}
              subtitle={row.canvasId === canvasId ? '当前画布' : '前往画布'}
              hideDelete onApply={() => locate(row)} /></div>
              : <span>{label} · 其他版本</span>}
            {row.sameVersion &&
              <NativeButton className="native-material-peek-trigger" aria-label={`预览${label}`}
                onClick={() => setPeek(key)}>预览</NativeButton>}
          </div>;
        })}
      </nav>
      {!locations.length && <p role="status">还没有放到画布上</p>}
      <div data-native-material-memberships>{read.context.memberships.filter(row => !row.placed).map((row, index) =>
        <small key={`${row.kind}:${row.workspaceId ?? row.presentationId}:${row.artifactViewId}:${index}`}>已收录到 {row.kind === 'workspace'
          ? read.input.workspaces.find(workspace => String(workspace.id) === row.workspaceId)?.name || '画布'
          : String(read.input.presentations.find(presentation => String(presentation.id) === row.presentationId)?.state?.title || '内容集合')}</small>)}</div>
      {read.context.rejectedLocations.length > 0 && <small role="status">{read.context.rejectedLocations.length} 个位置暂不可用</small>}
      {read.context.issues.length > 0 && <small role="status">部分位置信息暂不可用，可稍后刷新。</small>}
    </div>}
  </section>;
}
