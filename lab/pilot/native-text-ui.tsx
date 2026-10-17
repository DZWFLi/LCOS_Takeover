// Original TapNow owns the shell, node identity, camera and history. This slot
// mounts the existing LCOS body only after its exact primary text is read back.
import { useEffect, useMemo, useState, type JSX, type ReactNode } from 'react';
// @ts-expect-error served compatibility module re-exports the shipped provider.
import { useViewport } from '/lcos/native-flow.js';
import { describeProjectedEntity } from '../../lcos/apps/web-gen2/src/presentation/projectedNodeDescriptor.ts';
import { LcosCanvasTextBody } from '../../lcos/huabu/apps/web/src/lcos/nodes/LcosCanvasTextBody.tsx';
import { createLcosCoreSession } from '../../lcos/huabu/apps/web/src/lcos/app/lcosCoreClient.ts';
import { useLcosReferenceStore } from '../../lcos/huabu/apps/web/src/lcos/lcosReferenceState.ts';
import { LcosNodePresentationProvider, resolveInteractionPhase } from '../../lcos/huabu/apps/web/src/lcos-seam/nodePresentation.tsx';
import useCanvasStore from './native-canvas-port.ts';
import { nativeTextFacts, nativeTextWorldSize, readNativeTextReference } from './native-text-policy.ts';
import './native-text-host.css';
// Use the existing LCOS localization owner for reused editor controls; the
// vendor Canvas remains mounted in its own original translation environment.
import '../../lcos/huabu/apps/web/src/i18n/index.ts';

export { LcosCanvasTextBody as NativeTextUi };
export type { CanvasNodeBodySlotInput as NativeTextUiProps } from '../../lcos/huabu/apps/web/src/lcos-seam/types.ts';

export interface LCOSNativeTextBodySlotProps {
  readonly nodeId: string; readonly data: Readonly<Record<string, unknown>>;
  readonly width?: number; readonly height?: number; readonly selected?: boolean;
  readonly dragging?: boolean; readonly editable?: boolean; readonly originalBody: ReactNode;
}

/** Original t4 command retains its policy and fallback, but bound text edits in place. */
export function LCOSRequestNativeTextEdit(nodeId: string, originalEdit: () => unknown): unknown {
  const canvas = useCanvasStore.getState();
  const node = canvas.nodes.find(item => item.id === nodeId);
  const reference = readNativeTextReference(node?.data?.lcos_ref);
  if (canvas.status !== 'ready' || reference?.entityType !== 'artifact') return originalEdit();
  return canvas.requestInlineEdit(nodeId);
}

export function LCOSNativeTextBodySlot(props: LCOSNativeTextBodySlotProps): JSX.Element {
  const { nodeId, data, originalBody } = props;
  const canvas = useCanvasStore(state => state);
  const projectId = useLcosReferenceStore(state => state.projectId);
  const refreshVersion = useLcosReferenceStore(state => state.bindingRefreshVersion);
  const viewport = useViewport();
  const reference = readNativeTextReference(data.lcos_ref);
  const session = useMemo(() => createLcosCoreSession(), []);
  const key = JSON.stringify([projectId, canvas.canvasId, nodeId, reference?.entityType,
    reference?.entityId, reference?.artifactViewId]);
  const [read, setRead] = useState<{ key: string; status: 'loading' | 'ready' | 'error'; message?: string }>({ key, status: 'loading' });

  useEffect(() => {
    if (!projectId || canvas.status !== 'ready' || !canvas.canvasId || reference?.entityType !== 'artifact') return;
    const canvasId = canvas.canvasId;
    const controller = new AbortController();
    // A metadata refresh keeps the active Milkdown component mounted.
    setRead(previous => previous.key === key && previous.status === 'ready' ? previous : { key, status: 'loading' });
    void Promise.all([
      session.artifacts.getArtifactDetail(reference.artifactId, controller.signal),
      session.artifacts.readCanvasText(projectId, { canvasId, spatialId: nodeId }, controller.signal),
    ]).then(([detail, text]) => {
      if (controller.signal.aborted) return;
      const current = useCanvasStore.getState();
      const liveReference = readNativeTextReference(current.nodes.find(node => node.id === nodeId)?.data?.lcos_ref);
      if (current.status !== 'ready' || current.canvasId !== canvasId
        || useLcosReferenceStore.getState().projectId !== projectId
        || liveReference?.entityType !== reference.entityType || liveReference.entityId !== reference.entityId
        || liveReference.artifactViewId !== reference.artifactViewId
        || liveReference.revisionId !== reference.revisionId) return;
      const facts = nativeTextFacts({ projectId, canvasId, nodeId, reference, detail, text });
      useLcosReferenceStore.getState().registerNodeEntity(nodeId, {
        entityType: facts.entityType, entityId: facts.entityId, descriptor: describeProjectedEntity(facts),
      });
      setRead({ key, status: 'ready' });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setRead({ key, status: 'error',
        message: error instanceof Error ? error.message : '原节点正文未读回。' });
    });
    return () => controller.abort();
  }, [projectId, canvas.canvasId, canvas.status, nodeId, key, reference?.entityType, reference?.entityId,
    reference?.artifactViewId, reference?.revisionId, refreshVersion, session]);

  if (!reference || reference.entityType !== 'artifact') return <div data-lcos-native-text-unavailable>
    {originalBody}<span role="status">{reference?.entityType === 'view'
      ? '额外显示引用的正文改写尚未映射，原材料保留。' : '等待原生文本创建回执；未另建正文。'}</span>
  </div>;
  if (read.key !== key || read.status !== 'ready') return <div className="lcos-native-text-host nodrag nopan" role="status"
    data-lcos-native-text-read-state={read.key === key ? read.status : 'loading'}>
    {read.key === key && read.status === 'error' ? read.message : '正在确认原节点与 Core 正文…'}
    {read.status === 'error' && <button type="button" onClick={() => useLcosReferenceStore.getState().requestNodeBindingRefresh()}>重读原正文</button>}
  </div>;
  const node = canvas.nodes.find(item => item.id === nodeId);
  const size = nativeTextWorldSize(node, props.width, props.height);
  const zoom = viewport.zoom;
  const phase = resolveInteractionPhase({ editing: false, isResizing: node?.resizing === true,
    isDragging: props.dragging === true, selected: props.selected === true, hovered: false });
  const content = typeof data.text === 'string' ? data.text : typeof data.content === 'string' ? data.content : '';
  return <LcosNodePresentationProvider value={{ worldWidth: size.width, worldHeight: size.height,
    zoom, dpr: window.devicePixelRatio || 1, screenWidth: size.width * zoom, screenHeight: size.height * zoom, phase }}>
    <div className="lcos-native-text-host" style={{ height: size.height }}
      data-lcos-native-text-body={nodeId} data-lcos-native-text-zoom={zoom}>
      <LcosCanvasTextBody nodeId={nodeId} nodeType="text" data={{ ...data, content, lcosNativeReadOnly: props.editable !== true }} />
    </div>
  </LcosNodePresentationProvider>;
}
