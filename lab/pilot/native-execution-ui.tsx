import { useEffect, useMemo, type JSX } from 'react';
import { executionStatusLabel } from '@local-creative-os/web-gen2';
import type { ProjectedEntityFacts } from '../../lcos/apps/web-gen2/src/presentation/projectedNodeDescriptor.ts';
import { describeProjectedEntity } from '../../lcos/apps/web-gen2/src/presentation/projectedNodeDescriptor.ts';
import { ExecutionMark, ExecutionNodeBody } from '../../lcos/huabu/apps/web/src/lcos/nodes/ExecutionNodeBody.tsx';
import { useLcosDensity } from '../../lcos/huabu/apps/web/src/lcos/nodes/useLcosDensity.ts';
import { LcosTextFaces } from '../../lcos/huabu/apps/web/src/lcos/nodes/text/LcosTextFaces.tsx';
import { DocumentSourceView } from '../../lcos/huabu/apps/web/src/lcos/ui/source/DocumentSourceView.tsx';
import { ImageSourceView } from '../../lcos/huabu/apps/web/src/lcos/ui/source/ImageSourceView.tsx';
import type { LcosNodeEntityRef } from '../../lcos/huabu/apps/web/src/lcos/lcosReferenceState.ts';
import { useLcosReferenceStore } from '../../lcos/huabu/apps/web/src/lcos/lcosReferenceState.ts';
import { useLcosShellStore } from '../../lcos/huabu/apps/web/src/lcos/shell/lcosShellStore.ts';
import useCanvasStore, { type NativeCanvasSnapshot } from './native-canvas-port.ts';
import { requestNativeMaterialView } from './native-material-viewer-port';

type ExecutionEntityType = 'run' | 'result-slot';

interface NativeExecutionReference {
  readonly projectId: string;
  readonly canvasId: string;
  readonly workspaceId: string;
  readonly entityType: ExecutionEntityType;
  readonly entityId: string;
}

interface NativeResultReference {
  readonly projectId: string;
  readonly canvasId: string;
  readonly workspaceId: string;
  readonly slotId: string;
  readonly artifactId: string;
  readonly artifactViewId: string;
  readonly revisionId: string;
}

interface ParsedExecutionNode {
  readonly reference: NativeExecutionReference;
  readonly facts: ProjectedEntityFacts;
}

interface ParsedResultMaterialNode {
  readonly reference: NativeResultReference;
  readonly facts: ProjectedEntityFacts;
  readonly media: { readonly kind: 'text'; readonly markdown: string }
    | { readonly kind: 'image'; readonly src: string };
}

interface OwnerCheck {
  readonly ready: boolean;
  readonly reason: string;
}

export interface LCOSExecutionNodeProps {
  readonly id?: string;
  readonly selected?: boolean;
  readonly data?: Readonly<Record<string, unknown>>;
}

export interface LCOSResultMaterialNodeProps {
  readonly id?: string;
  readonly selected?: boolean;
  readonly data?: Readonly<Record<string, unknown>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseResultMaterialNode(id: string | undefined, data: Readonly<Record<string, unknown>> | undefined): ParsedResultMaterialNode | undefined {
  if (!nonEmptyString(id) || !data || data.id !== id || !nonEmptyString(data.title)) return undefined;
  const projectedRef = data.lcos_ref;
  const resultRef = data.lcos_result_ref;
  const rawFacts = data.lcos_result_facts;
  if (!isRecord(projectedRef) || !isRecord(resultRef) || !isRecord(rawFacts)
    || projectedRef.version !== 1 || projectedRef.entityType !== 'artifact'
    || !nonEmptyString(projectedRef.artifactId ?? projectedRef.entityId)
    || !nonEmptyString(projectedRef.artifactViewId) || !nonEmptyString(projectedRef.revisionId)
    || !nonEmptyString(resultRef.projectId) || !nonEmptyString(resultRef.canvasId)
    || !nonEmptyString(resultRef.workspaceId) || !nonEmptyString(resultRef.slotId)
    || !nonEmptyString(resultRef.artifactId) || !nonEmptyString(resultRef.artifactViewId)
    || !nonEmptyString(resultRef.revisionId)) return undefined;

  const artifactId = projectedRef.artifactId ?? projectedRef.entityId;
  if ((projectedRef.artifactId !== undefined && projectedRef.entityId !== undefined
      && projectedRef.artifactId !== projectedRef.entityId)
    || projectedRef.artifactId !== resultRef.artifactId
    || projectedRef.artifactViewId !== resultRef.artifactViewId
    || projectedRef.revisionId !== resultRef.revisionId
    || (projectedRef.artifactViewReferenceKind !== undefined
      && projectedRef.artifactViewReferenceKind !== 'explicit_additional')) return undefined;

  if (rawFacts.entityType !== 'artifact' || rawFacts.entityId !== artifactId
    || rawFacts.artifactViewId !== resultRef.artifactViewId
    || rawFacts.presentedRevisionId !== resultRef.revisionId
    || rawFacts.artifactViewReferenceKind !== 'explicit_additional'
    || rawFacts.title !== data.title
    || rawFacts.canvasTextEditable === true || rawFacts.canvasTextSourceAddress !== undefined) return undefined;

  const mimeType = typeof rawFacts.mimeType === 'string' ? rawFacts.mimeType.toLowerCase() : '';
  const artifactKind = typeof rawFacts.artifactKind === 'string' ? rawFacts.artifactKind.toLowerCase() : '';
  const markdown = typeof data.content === 'string' && typeof data.text === 'string'
    ? data.content === data.text ? data.content : undefined
    : typeof data.content === 'string' ? data.content
      : typeof data.text === 'string' ? data.text : undefined;
  const isText = artifactKind === 'markdown' || artifactKind === 'text' || mimeType.startsWith('text/');
  const isImage = artifactKind === 'image' || mimeType.startsWith('image/');
  let media: ParsedResultMaterialNode['media'];
  if (isText && typeof markdown === 'string' && data.src === undefined) {
    media = { kind: 'text', markdown };
  } else if (isImage && nonEmptyString(data.src) && sameOriginMediaSource(data.src)) {
    media = { kind: 'image', src: data.src };
  } else return undefined;

  return {
    reference: {
      projectId: resultRef.projectId,
      canvasId: resultRef.canvasId,
      workspaceId: resultRef.workspaceId,
      slotId: resultRef.slotId,
      artifactId,
      artifactViewId: resultRef.artifactViewId,
      revisionId: resultRef.revisionId,
    },
    facts: rawFacts as unknown as ProjectedEntityFacts,
    media,
  };
}

function sameOriginMediaSource(value: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const parsed = new URL(value, window.location.origin);
    return parsed.origin === window.location.origin
      && (parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'blob:');
  } catch {
    return false;
  }
}

function parseExecutionNode(id: string | undefined, data: Readonly<Record<string, unknown>> | undefined): ParsedExecutionNode | undefined {
  if (!nonEmptyString(id) || !data || data.id !== id || !nonEmptyString(data.title)) return undefined;
  const rawReference = data.lcos_execution_ref;
  const rawFacts = data.lcos_execution_facts;
  if (!isRecord(rawReference) || !isRecord(rawFacts)
    || !nonEmptyString(rawReference.projectId)
    || !nonEmptyString(rawReference.canvasId)
    || !nonEmptyString(rawReference.workspaceId)
    || !nonEmptyString(rawReference.entityId)
    || (rawReference.entityType !== 'run' && rawReference.entityType !== 'result-slot')) return undefined;

  const execution = rawFacts.execution;
  if (!isRecord(execution)
    || rawFacts.entityType !== rawReference.entityType
    || rawFacts.entityId !== rawReference.entityId
    || !nonEmptyString(rawFacts.title)
    || rawFacts.title !== data.title
    || !nonEmptyString(execution.status)
    || typeof execution.pendingReturnCount !== 'number'
    || !Number.isFinite(execution.pendingReturnCount)
    || execution.pendingReturnCount < 0) return undefined;

  if (execution.runId !== undefined && !nonEmptyString(execution.runId)) return undefined;
  if (execution.resultSlotId !== undefined && !nonEmptyString(execution.resultSlotId)) return undefined;
  if (rawReference.entityType === 'run' && execution.runId !== rawReference.entityId) return undefined;
  if (rawReference.entityType === 'result-slot' && execution.resultSlotId !== rawReference.entityId) return undefined;

  return {
    reference: {
      projectId: rawReference.projectId,
      canvasId: rawReference.canvasId,
      workspaceId: rawReference.workspaceId,
      entityType: rawReference.entityType,
      entityId: rawReference.entityId,
    },
    facts: rawFacts as unknown as ProjectedEntityFacts,
  };
}

function hostCanvasId(host: Window['__LCOS_NODE_LAB__']): string | undefined {
  const value = nonEmptyString(host?.currentCanvasId) ? host.currentCanvasId : host?.canvasId;
  return nonEmptyString(value) ? value : undefined;
}

function sameReference(left: NativeExecutionReference, right: NativeExecutionReference | undefined): boolean {
  return right !== undefined
    && left.projectId === right.projectId
    && left.canvasId === right.canvasId
    && left.workspaceId === right.workspaceId
    && left.entityType === right.entityType
    && left.entityId === right.entityId;
}

function sameFacts(left: unknown, right: ProjectedEntityFacts): boolean {
  if (!isRecord(left)) return false;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function checkCurrentOwner(
  nodeId: string | undefined,
  data: Readonly<Record<string, unknown>> | undefined,
  parsed: ParsedExecutionNode | undefined,
  canvas: NativeCanvasSnapshot,
): OwnerCheck {
  if (!parsed || !nonEmptyString(nodeId)) return { ready: false, reason: '节点引用或执行事实不完整/不匹配。' };
  if (typeof window === 'undefined') return { ready: false, reason: '浏览器原画布尚未就绪。' };

  const { reference, facts } = parsed;
  const host = window.__LCOS_NODE_LAB__;
  if (canvas.status !== 'ready' || canvas.canvasId !== reference.canvasId || canvas.rfInstance === null
    || host?.api !== canvas.rfInstance || hostCanvasId(host) !== reference.canvasId) {
    return { ready: false, reason: '当前原 TapNow Canvas/API 尚未映射到此执行节点。' };
  }
  if (typeof host.projectId === 'string' && host.projectId !== reference.projectId) {
    return { ready: false, reason: '原画布宿主项目与执行引用不一致。' };
  }

  const referenceState = useLcosReferenceStore.getState();
  const shell = useLcosShellStore.getState();
  if (referenceState.projectId !== reference.projectId || shell.projectId !== reference.projectId) {
    return { ready: false, reason: 'LCOS 项目映射尚未就绪或已切换。' };
  }
  if (shell.surfaceCanvasId[shell.activeSurface] !== reference.canvasId
    || shell.activeWorkspaceId !== reference.workspaceId) {
    return { ready: false, reason: 'Core Workspace/Surface 与当前原画布不一致或尚未就绪。' };
  }

  const liveNode = canvas.nodes.find((node) => node.id === nodeId);
  const liveData = liveNode?.data;
  if (!liveNode || liveNode.type !== 'lcos-execution' || !isRecord(liveData)
    || liveData.id !== nodeId || data?.id !== nodeId
    || !sameReference(reference, isRecord(liveData.lcos_execution_ref)
      ? liveData.lcos_execution_ref as unknown as NativeExecutionReference : undefined)
    || !sameFacts(liveData.lcos_execution_facts, facts)
    || liveData.title !== data?.title) {
    return { ready: false, reason: '节点已离开当前原画布，或其 Core 执行身份已更新。' };
  }

  return { ready: true, reason: '' };
}

function sameResultReference(left: NativeResultReference, right: NativeResultReference | undefined): boolean {
  return right !== undefined
    && left.projectId === right.projectId
    && left.canvasId === right.canvasId
    && left.workspaceId === right.workspaceId
    && left.slotId === right.slotId
    && left.artifactId === right.artifactId
    && left.artifactViewId === right.artifactViewId
    && left.revisionId === right.revisionId;
}

function checkCurrentResultOwner(
  nodeId: string | undefined,
  data: Readonly<Record<string, unknown>> | undefined,
  parsed: ParsedResultMaterialNode | undefined,
  canvas: NativeCanvasSnapshot,
): OwnerCheck {
  if (!parsed || !nonEmptyString(nodeId)) return { ready: false, reason: '结果材料引用或精确版本事实不完整。' };
  if (typeof window === 'undefined') return { ready: false, reason: '浏览器原画布尚未就绪。' };

  const { reference, facts, media } = parsed;
  const host = window.__LCOS_NODE_LAB__;
  if (canvas.status !== 'ready' || canvas.canvasId !== reference.canvasId || canvas.rfInstance === null
    || host?.api !== canvas.rfInstance || hostCanvasId(host) !== reference.canvasId) {
    return { ready: false, reason: '当前原 TapNow Canvas/API 尚未映射到此结果材料。' };
  }
  if (typeof host.projectId === 'string' && host.projectId !== reference.projectId) {
    return { ready: false, reason: '原画布宿主项目与结果材料引用不一致。' };
  }

  const referenceState = useLcosReferenceStore.getState();
  const shell = useLcosShellStore.getState();
  if (referenceState.projectId !== reference.projectId || shell.projectId !== reference.projectId) {
    return { ready: false, reason: 'LCOS 项目映射尚未就绪或已切换。' };
  }
  if (shell.surfaceCanvasId[shell.activeSurface] !== reference.canvasId
    || shell.activeWorkspaceId !== reference.workspaceId) {
    return { ready: false, reason: 'Core Workspace/Surface 与当前原画布不一致或尚未就绪。' };
  }

  const liveNode = canvas.nodes.find((node) => node.id === nodeId);
  const liveData = liveNode?.data;
  const liveParsed = liveNode?.type === 'lcos-result-material' && isRecord(liveData)
    ? parseResultMaterialNode(nodeId, liveData) : undefined;
  if (!liveNode || !isRecord(liveData) || liveData.id !== nodeId || data?.id !== nodeId
    || liveData.title !== data?.title || !liveParsed
    || !sameResultReference(reference, liveParsed.reference)
    || !sameFacts(liveParsed.facts, facts)
    || JSON.stringify(liveParsed.media) !== JSON.stringify(media)) {
    return { ready: false, reason: '节点已离开当前原画布，或其 Core Artifact/View/Revision 身份已更新。' };
  }

  return { ready: true, reason: '' };
}

function sameRegisteredReference(current: LcosNodeEntityRef | undefined, desired: LcosNodeEntityRef): boolean {
  return current === desired;
}

/**
 * Existing TapNow node mechanics remain the owner. This leaf only projects the
 * canonical Run/ResultSlot facts into the existing LCOS reference cache and
 * mounts the original execution body after the current scene is verified.
 */
export function LCOSExecutionNode({ id, selected, data }: LCOSExecutionNodeProps): JSX.Element {
  const canvas = useCanvasStore((state) => state);
  const referenceProjectId = useLcosReferenceStore((state) => state.projectId);
  const currentRef = useLcosReferenceStore((state) => state.nodeEntityRefs.get(id ?? ''));
  const shellProjectId = useLcosShellStore((state) => state.projectId);
  const activeSurface = useLcosShellStore((state) => state.activeSurface);
  const activeWorkspaceId = useLcosShellStore((state) => state.activeWorkspaceId);
  const activeSurfaceCanvasId = useLcosShellStore((state) => state.surfaceCanvasId[state.activeSurface]);

  const parsed = useMemo(() => parseExecutionNode(id, data), [id, data]);
  const descriptor = useMemo(() => parsed ? describeProjectedEntity(parsed.facts) : undefined, [parsed]);
  const desiredRef = useMemo<LcosNodeEntityRef | undefined>(() => parsed && descriptor ? ({
    entityType: parsed.reference.entityType,
    entityId: parsed.reference.entityId,
    descriptor,
  }) : undefined, [parsed, descriptor]);

  const owner = checkCurrentOwner(id, data, parsed, canvas);
  const sameProjectedScene = parsed !== undefined
    && referenceProjectId === parsed.reference.projectId
    && shellProjectId === parsed.reference.projectId
    && activeSurfaceCanvasId === parsed.reference.canvasId
    && activeWorkspaceId === parsed.reference.workspaceId;
  const ready = owner.ready && sameProjectedScene && desiredRef !== undefined
    && sameRegisteredReference(currentRef, desiredRef);

  useEffect(() => {
    if (!id || !parsed || !desiredRef || !owner.ready) return;
    const currentOwner = checkCurrentOwner(id, data, parsed, useCanvasStore.getState());
    if (!currentOwner.ready) return;
    const references = useLcosReferenceStore.getState();
    if (references.nodeEntityRefs.get(id) !== desiredRef) references.registerNodeEntity(id, desiredRef);
  }, [id, data, parsed, desiredRef, owner.ready, canvas.canvasId, canvas.status, canvas.rfInstance,
    referenceProjectId, shellProjectId, activeSurface, activeWorkspaceId, activeSurfaceCanvasId, currentRef]);

  useEffect(() => {
    if (!id || !parsed || !desiredRef || !owner.ready) return;
    return () => {
      const references = useLcosReferenceStore.getState();
      if (references.nodeEntityRefs.get(id) === desiredRef) references.forgetNode(id);
    };
  }, [id, parsed, desiredRef, owner.ready]);

  const unavailableReason = !parsed
    ? '执行引用不可用：节点 DTO 与 Core 执行事实不匹配。'
    : !owner.ready || !sameProjectedScene
      ? owner.reason || '执行引用不可用：当前 Canvas/API/Project/Workspace 已切换。'
      : '执行状态正在映射到 LCOS ReferenceStore。';
  const currentInvocationOwner = (): boolean => {
    if (!id || !parsed || !desiredRef) return false;
    const live = useCanvasStore.getState();
    const current = checkCurrentOwner(id, data, parsed, live);
    return current.ready
      && useLcosReferenceStore.getState().nodeEntityRefs.get(id) === desiredRef;
  };
  const blockStaleOpen = (event: { preventDefault(): void; stopPropagation(): void }): void => {
    if (currentInvocationOwner()) return;
    event.preventDefault();
    event.stopPropagation();
  };

  return <div data-lcos-native-execution-node={id ?? ''}
    data-lcos-native-execution-availability={ready ? 'ready' : 'unavailable'}
    data-lcos-native-execution-selected={selected || undefined}
    aria-label={ready ? undefined : `执行节点不可用：${unavailableReason}`}
    title={ready ? undefined : unavailableReason}
    onDoubleClickCapture={blockStaleOpen}
    onKeyDownCapture={(event) => {
      if (event.key === 'Enter') blockStaleOpen(event);
    }}
    style={{ width: '100%', height: '100%' }}>
    {ready && id
      ? <ExecutionNodeBody nodeId={id} nodeType="lcos-execution" data={data ?? {}} />
      : <div data-lcos-species-body data-lcos-execution-state="unavailable" data-lcos-density="reading"
        className="lcos-execution-body" tabIndex={0} aria-label={`任务 · 状态暂不可用 · ${executionStatusLabel('unavailable')}`}>
        <ExecutionMark status="unavailable" />
        <span className="lcos-execution-label">{executionStatusLabel('unavailable')}</span>
        <span className="sr-only" role="status" data-lcos-native-execution-unavailable>{unavailableReason}</span>
      </div>}
  </div>;
}

/**
 * Canonical Run output remains an additional ArtifactView. This body reuses
 * LCOS's text/image source leaves and the original reader window, but never
 * installs the primary text writer or changes Artifact/View ownership.
 */
export function LCOSResultMaterialNode({ id, selected, data }: LCOSResultMaterialNodeProps): JSX.Element {
  const canvas = useCanvasStore((state) => state);
  const referenceProjectId = useLcosReferenceStore((state) => state.projectId);
  const currentRef = useLcosReferenceStore((state) => state.nodeEntityRefs.get(id ?? ''));
  const shellProjectId = useLcosShellStore((state) => state.projectId);
  const activeSurface = useLcosShellStore((state) => state.activeSurface);
  const activeWorkspaceId = useLcosShellStore((state) => state.activeWorkspaceId);
  const activeSurfaceCanvasId = useLcosShellStore((state) => state.surfaceCanvasId[state.activeSurface]);
  const density = useLcosDensity();

  const parsed = useMemo(() => parseResultMaterialNode(id, data), [id, data]);
  const descriptor = useMemo(() => parsed ? describeProjectedEntity(parsed.facts) : undefined, [parsed]);
  const desiredRef = useMemo<LcosNodeEntityRef | undefined>(() => parsed && descriptor ? ({
    entityType: 'artifact', entityId: parsed.reference.artifactId, descriptor,
  }) : undefined, [parsed, descriptor]);

  const owner = checkCurrentResultOwner(id, data, parsed, canvas);
  const sameProjectedScene = parsed !== undefined
    && referenceProjectId === parsed.reference.projectId
    && shellProjectId === parsed.reference.projectId
    && activeSurfaceCanvasId === parsed.reference.canvasId
    && activeWorkspaceId === parsed.reference.workspaceId;
  const ready = owner.ready && sameProjectedScene && desiredRef !== undefined
    && sameRegisteredReference(currentRef, desiredRef);

  useEffect(() => {
    if (!id || !parsed || !desiredRef || !owner.ready) return;
    const currentOwner = checkCurrentResultOwner(id, data, parsed, useCanvasStore.getState());
    if (!currentOwner.ready) return;
    const references = useLcosReferenceStore.getState();
    if (references.nodeEntityRefs.get(id) !== desiredRef) references.registerNodeEntity(id, desiredRef);
  }, [id, data, parsed, desiredRef, owner.ready, canvas.canvasId, canvas.status, canvas.rfInstance,
    referenceProjectId, shellProjectId, activeSurface, activeWorkspaceId, activeSurfaceCanvasId, currentRef]);

  useEffect(() => {
    if (!id || !parsed || !desiredRef || !owner.ready) return;
    return () => {
      const references = useLcosReferenceStore.getState();
      if (references.nodeEntityRefs.get(id) === desiredRef) references.forgetNode(id);
    };
  }, [id, parsed, desiredRef, owner.ready]);

  const unavailableReason = !parsed
    ? '材料不可用：必须是与结果位关联的 explicit_additional ArtifactView 精确 Revision。'
    : !owner.ready || !sameProjectedScene
      ? owner.reason || '材料不可用：当前 Canvas/API/Project/Workspace 已切换。'
      : '材料引用正在映射到 LCOS ReferenceStore。';
  const currentInvocationOwner = (): boolean => {
    if (!id || !parsed || !desiredRef) return false;
    const current = checkCurrentResultOwner(id, data, parsed, useCanvasStore.getState());
    return current.ready && useLcosReferenceStore.getState().nodeEntityRefs.get(id) === desiredRef;
  };
  const blockStaleOpen = (event: { preventDefault(): void; stopPropagation(): void }): void => {
    if (currentInvocationOwner()) return;
    event.preventDefault();
    event.stopPropagation();
  };

  let body: JSX.Element;
  if (!ready || !parsed) {
    body = <div data-lcos-native-result-material-unavailable role="status">{unavailableReason}</div>;
  } else if (parsed.media.kind === 'text') {
    // No writer is passed and all face controls are disabled. The bundled
    // narrow source transform also makes that existing disabled policy cover
    // its legacy collapse-cleanup effect.
    body = <LcosTextFaces nodeId={id!} markdown={parsed.media.markdown}
      title={parsed.facts.title} density={density} disabled>
      <DocumentSourceView family="document" title={parsed.facts.title} density={density}
        canonicalMarkdown={parsed.media.markdown} />
    </LcosTextFaces>;
  } else {
    body = <ImageSourceView family="image" title={parsed.facts.title} density={density} mediaSrc={parsed.media.src} />;
  }

  return <div data-lcos-native-result-material-node={id ?? ''}
    data-lcos-native-result-material-availability={ready ? 'ready' : 'unavailable'}
    data-lcos-native-result-material-selected={selected || undefined}
    aria-label={ready ? undefined : `结果材料不可用：${unavailableReason}`}
    title={ready ? undefined : unavailableReason}
    onDoubleClickCapture={blockStaleOpen}
    onKeyDownCapture={(event) => {
      if (event.key === 'Enter') blockStaleOpen(event);
    }}
    style={{ width: '100%', height: '100%', minHeight: 0, overflow: 'hidden' }}>
    {ready && parsed
      ? <div data-lcos-native-result-material-kind={parsed.media.kind} data-artifact-view-reference-kind="explicit_additional"
        data-artifact-id={parsed.reference.artifactId} data-artifact-view-id={parsed.reference.artifactViewId}
        data-revision-id={parsed.reference.revisionId} onDoubleClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!currentInvocationOwner()) return;
          requestNativeMaterialView({ projectId: parsed.reference.projectId, artifactId: parsed.reference.artifactId,
            revisionId: parsed.reference.revisionId, artifactViewId: parsed.reference.artifactViewId, nodeId: id,
            title: parsed.facts.title });
        }} onKeyDown={(event) => {
          if (event.key !== 'Enter' || event.repeat || event.nativeEvent.isComposing) return;
          event.preventDefault();
          event.stopPropagation();
          if (currentInvocationOwner()) requestNativeMaterialView({ projectId: parsed.reference.projectId,
            artifactId: parsed.reference.artifactId, revisionId: parsed.reference.revisionId,
            artifactViewId: parsed.reference.artifactViewId, nodeId: id, title: parsed.facts.title });
        }} tabIndex={0} aria-label={`打开原材料阅读器：${parsed.facts.title}`}
        style={{ width: '100%', height: '100%', minHeight: 0 }}>
        {body}
      </div>
      : body}
    {!ready && <span className="sr-only" role="status" data-lcos-native-result-material-unavailable-reason>
      {unavailableReason}
    </span>}
  </div>;
}
