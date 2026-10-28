import { useEffect, useMemo, useRef, useState } from 'react';
import useCanvasStore from './native-canvas-port';
import { useLcosShellStore } from '../../lcos/huabu/apps/web/src/lcos/shell/lcosShellStore';
import { useLcosReferenceStore } from '../../lcos/huabu/apps/web/src/lcos/lcosReferenceState';
import { composerInputKey } from '../../lcos/huabu/apps/web/src/lcos/composer/composerInputJourney';
import { prepareDraftReferences, runReferenceUnavailableReason } from '../../lcos/huabu/apps/web/src/lcos/composer/referenceSnapshot';
import { referencePickOwnerKey } from '../../lcos/huabu/apps/web/src/lcos/referencePickOwnership';
import { readNativeTextReference } from './native-text-policy';
import { requestNativeCurrentComposerInput, type NativeCurrentComposerViewRequest } from './native-task-route';
import type { NativeDropNotice } from './native-library-drop-feedback';

type Row = Record<string, any>;
export type NativeNodeComposerFacts = { graph: Row; bindings: readonly Row[] };
export type NativeNodeComposerAvailability = { supported: boolean; canUse: boolean; reason?: string };
export type NativeNodeComposerResult = { ok: true; added: number; notice: string } | { ok: false; reason: string };
export interface NativeNodeComposerPorts {
  shell(): Row;
  canvas(): Row;
  references(): Row;
  readFacts(projectId: string, signal?: AbortSignal): Promise<NativeNodeComposerFacts>;
  revealCurrentInput?(request: NativeCurrentComposerViewRequest): boolean;
}
type Capture = { projectId: string; canvasId: string; workspaceId: string; api: unknown; nodeId: string;
  identity: string; inputKey?: string; messageId?: string; continuationOperationId?: string; composerOpen: boolean };
type AdmissionLifecycle = { beginAdmission(): void; endAdmission(owner: Capture | undefined): void };
const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
const rows = (value: unknown): Row[] => Array.isArray(value) ? value : [];
const unavailable = (reason: string, supported = true): NativeNodeComposerAvailability => ({ supported, canUse: false, reason });
const fail = (reason: string): never => { throw new Error(reason); };
const typedFields = ['lcos_collection_ref', 'lcos_conversation_ref', 'lcos_execution_ref', 'lcos_run_ref', 'lcos_member_ref', 'lcos_result_ref'];

/** Ordinary, already-saved materials only. A Run/Scope/Collection carrier is
 * never relabelled as an Artifact just to display a usable More item. */
export function nativeNodeComposerCandidate(node: Row | undefined): NativeNodeComposerAvailability {
  if (!node || !['image', 'text', 'video', 'audio'].includes(node.type)) return unavailable('这个节点请沿其原查看或任务入口使用。', false);
  if (typedFields.some(key => node.data?.[key] !== undefined)) return unavailable('这类成员尚未接入这个材料引用动作，请沿原入口查看。', false);
  if (!text(node.id) || node.data?.id !== node.id || !readNativeTextReference(node.data?.lcos_ref))
    return unavailable('这个节点还没有准确的已保存材料版本。', false);
  if (node.data?.contentMissing === true || node.data?.artifactMissing === true) return unavailable('这份材料暂时无法核对，请先查看原材料。');
  return { supported: true, canUse: true };
}
/** A More item must not fetch the whole project once per mounted node. This
 * cheap hint uses only this occurrence and matching original descriptor; the
 * click always reads authoritative facts before admitting any reference. */
export function nativeNodeComposerLocalAvailability(node: Row | undefined, intent?: string, registered?: Row): NativeNodeComposerAvailability {
  const candidate = nativeNodeComposerCandidate(node);
  if (!candidate.canUse || !node) return candidate;
  const ref = readNativeTextReference(node.data.lcos_ref)!, descriptor = registered?.descriptor;
  const matchingDescriptor = registered?.entityType === 'artifact' && registered.entityId === ref.artifactId
    && descriptor?.entityType === 'artifact' && descriptor.entityId === ref.artifactId
    && descriptor.artifactViewId === ref.artifactViewId && descriptor.presentedRevisionId === ref.revisionId;
  const mimeType = matchingDescriptor && text(descriptor.mimeType) ? descriptor.mimeType
    : ({ image: 'image/*', video: 'video/*', audio: 'audio/*' } as Record<string, string>)[node.type];
  try {
    preparedReference({ entityType: 'artifact', entityId: ref.artifactId, artifactViewId: ref.artifactViewId,
      revisionId: ref.revisionId, ...(mimeType ? { mimeType } : {}) }, intent);
    return { supported: true, canUse: true };
  } catch (error) { return unavailable(error instanceof Error ? error.message : '这个输入暂不能使用该材料类型。'); }
}
function identity(node: Row | undefined): string {
  return JSON.stringify([node?.id, node?.type, node?.canvas_id, node?.data?.id, node?.data?.lcos_ref,
    ...typedFields.map(key => node?.data?.[key]), node?.data?.contentMissing, node?.data?.artifactMissing]);
}
function capture(ports: NativeNodeComposerPorts, nodeId: string): Capture {
  const shell = ports.shell(), canvas = ports.canvas(), refs = ports.references();
  if (!text(shell.projectId) || canvas.status !== 'ready' || !text(canvas.canvasId) || !canvas.rfInstance
    || !text(shell.activeWorkspaceId) || refs.projectId !== shell.projectId) fail('当前现场或输入所属项目尚未准备好。');
  const node = rows(canvas.nodes).find(row => row.id === nodeId), candidate = nativeNodeComposerCandidate(node);
  if (!candidate.canUse) fail(candidate.reason!);
  return { projectId: shell.projectId, canvasId: canvas.canvasId, workspaceId: shell.activeWorkspaceId, api: canvas.rfInstance,
    nodeId, identity: identity(node), inputKey: composerInputKey(shell.composerTarget),
    messageId: shell.composerTarget?.messageId, continuationOperationId: shell.composerTarget?.continuationOperationId,
    composerOpen: shell.composerOpen === true };
}
function isCurrent(ports: NativeNodeComposerPorts, owner: Capture): boolean {
  const shell = ports.shell(), canvas = ports.canvas();
  return shell.projectId === owner.projectId && ports.references().projectId === owner.projectId
    && canvas.status === 'ready' && canvas.canvasId === owner.canvasId && canvas.rfInstance === owner.api
    && shell.activeWorkspaceId === owner.workspaceId && identity(rows(canvas.nodes).find(row => row.id === owner.nodeId)) === owner.identity
    && composerInputKey(shell.composerTarget) === owner.inputKey && shell.composerTarget?.messageId === owner.messageId
    && shell.composerTarget?.continuationOperationId === owner.continuationOperationId && (shell.composerOpen === true) === owner.composerOpen;
}
function sending(ports: NativeNodeComposerPorts): boolean {
  const shell = ports.shell(), owner = referencePickOwnerKey(shell.projectId, shell.composerTarget), key = composerInputKey(shell.composerTarget);
  return !!owner && [...ports.references().referenceInputOperations.values()].some((operation: Row) => operation.owner === owner
    && operation.kind === 'sending' && (operation.inputKey === undefined || operation.inputKey === key));
}
const inputAddress = (shell: Row) => JSON.stringify([shell.projectId, composerInputKey(shell.composerTarget),
  shell.composerTarget?.messageId, shell.composerTarget?.continuationOperationId, shell.composerOpen === true]);

/** Join the actual occurrence, unique binding and explicit View/Revision. No
 * latest fallback, import, reconciliation, byte write or domain mutation. */
export function resolveNativeNodeComposerReference(node: Row, owner: Pick<Capture, 'projectId' | 'canvasId' | 'workspaceId'>, facts: NativeNodeComposerFacts): Row {
  const candidate = nativeNodeComposerCandidate(node);
  if (!candidate.canUse) fail(candidate.reason!);
  const graph = facts.graph, ref = readNativeTextReference(node.data.lcos_ref)!;
  if (graph?.project?.id !== owner.projectId || !['workspaces','scopes','artifacts','artifactViews','artifactRevisions','fileRecords'].every(key => Array.isArray(graph[key]))
    || !Array.isArray(facts.bindings)) fail('材料索引或绑定暂不可读取，原输入保留。');
  const one = (values: Row[], reason: string): Row => values.length === 1 ? values[0]! : fail(reason);
  const workspace = one(rows(graph.workspaces).filter(row => row.id === owner.workspaceId && row.canvasId === owner.canvasId
    && row.projectId === owner.projectId && !row.archivedAt), '当前现场的准确归属暂时无法核对。');
  one(rows(graph.scopes).filter(row => row.id === workspace.scopeId && row.projectId === owner.projectId && !row.archivedAt), '当前现场的范围暂时无法核对。');
  if (node.canvas_id !== undefined && node.canvas_id !== owner.canvasId) fail('材料节点已不在原现场。');
  const binding = one(facts.bindings.filter(row => row.canvasId === owner.canvasId && row.spatialKind === 'node' && row.spatialId === node.id), '原节点的唯一绑定尚未确认。');
  if (binding.projectId !== owner.projectId || binding.entityType !== ref.entityType || binding.entityId !== ref.entityId) fail('原节点绑定与这份材料不一致。');
  const artifact = one(rows(graph.artifacts).filter(row => row.id === ref.artifactId && row.projectId === owner.projectId), '原材料缺失或所属项目不一致。');
  if (artifact.archivedAt !== undefined) fail('这份材料已归档，请先沿原材料入口查看。');
  const view = one(rows(graph.artifactViews).filter(row => row.id === ref.artifactViewId && row.artifactId === ref.artifactId
    && (row.projectId === undefined || row.projectId === owner.projectId)), '原视图已变化，未换用其他视图。');
  if (view.scopeId !== workspace.scopeId || view.revisionId !== ref.revisionId
    || !['primary','explicit_additional'].includes(view.referenceKind)
    || ref.entityType === 'artifact' && (view.referenceKind !== 'primary' || artifact.currentRevisionId !== ref.revisionId))
    fail('原视图或所见版本已变化，未替换为最新版本。');
  const revision = one(rows(graph.artifactRevisions).filter(row => row.id === ref.revisionId && row.artifactId === ref.artifactId
    && (row.projectId === undefined || row.projectId === owner.projectId)), '所见版本暂时无法核对，未换用最新版本。');
  if (!['current','superseded'].includes(revision.status)) fail('这份材料版本尚未成为可引用的已保存版本。');
  const file = one(rows(graph.fileRecords).filter(row => row.id === revision.fileRecordId && row.projectId === owner.projectId), '这个版本的原文件暂不可读。');
  if (!text(file.mimeType) || file.availability !== 'current' || !text(file.observedHash)
    || !text(revision.contentHash) || revision.contentHash !== file.observedHash) fail('这个版本的文件事实尚未一致，请重读同一版本。');
  if (node.type === 'image' && (artifact.kind !== 'image' || !file.mimeType.toLowerCase().startsWith('image/'))
    || node.type === 'video' && !file.mimeType.toLowerCase().startsWith('video/')
    || node.type === 'audio' && !file.mimeType.toLowerCase().startsWith('audio/')) fail('原节点与材料格式不一致。');
  return { entityType: 'artifact', entityId: ref.artifactId, artifactViewId: ref.artifactViewId, revisionId: ref.revisionId,
    displayLabel: text(artifact.title) ? artifact.title : '材料', mimeType: file.mimeType };
}
function preparedReference(reference: Row, intent?: string): readonly Row[] {
  const prepared = prepareDraftReferences([reference as any], intent);
  if (!prepared.ok) fail(prepared.reason);
  const reason = intent === 'continue' ? undefined : runReferenceUnavailableReason(reference as any);
  if (reason) fail(reason);
  return prepared.references;
}
export async function readNativeNodeComposerFacts(projectId: string, signal?: AbortSignal): Promise<NativeNodeComposerFacts> {
  if (!text(projectId)) fail('当前项目尚未确认。');
  const read = async (suffix: string) => {
    try {
      const response = await fetch('/api/lcos/core/projects/' + encodeURIComponent(projectId) + suffix,
        { method: 'GET', signal, redirect: 'error', cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok || payload?.ok !== true || !Object.hasOwn(payload, 'value')) fail('材料事实暂不可读取，原输入保留。');
      return payload.value;
    } catch (cause) {
      if (signal?.aborted || (cause as { name?: string })?.name === 'AbortError') throw cause;
      throw new Error('材料暂时无法读取，原输入保留；可以重试。', { cause });
    }
  };
  const [graph, bindings] = await Promise.all([read('/graph'), read('/spatial/bindings')]);
  return { graph, bindings };
}
const defaultPorts: NativeNodeComposerPorts = { shell: () => useLcosShellStore.getState(), canvas: () => useCanvasStore.getState(),
  references: () => useLcosReferenceStore.getState(), readFacts: readNativeNodeComposerFacts, revealCurrentInput: requestNativeCurrentComposerInput };

/** Only the existing reference draft is changed. Original shell owns opening,
 * focus, per-input draft and caret; this service never writes prompt/caret. */
export function createNativeNodeComposerService(ports: NativeNodeComposerPorts = defaultPorts) {
  let active = false;
  return {
    async availability(nodeId: string, signal?: AbortSignal): Promise<NativeNodeComposerAvailability> {
      const candidate = nativeNodeComposerCandidate(rows(ports.canvas().nodes).find(row => row.id === nodeId));
      if (!candidate.canUse) return candidate;
      try {
        const owner = capture(ports, nodeId), facts = await ports.readFacts(owner.projectId, signal);
        if (!isCurrent(ports, owner)) return unavailable('现场或当前输入已变化，请重新选择材料。');
        const ref = resolveNativeNodeComposerReference(rows(ports.canvas().nodes).find(row => row.id === nodeId)!, owner, facts);
        preparedReference(ref, ports.shell().composerTarget?.intent);
        return sending(ports) ? unavailable('这条消息正在发送，请稍后再加入材料。') : { supported: true, canUse: true };
      } catch (error) { return unavailable(error instanceof Error ? error.message : '材料暂时无法核对，原输入保留。'); }
    },
    async useForCurrentInput(nodeId: string, signal?: AbortSignal, expected?: Capture, lifecycle?: AdmissionLifecycle): Promise<NativeNodeComposerResult> {
      if (active) return { ok: false, reason: '正在核对这份材料，请稍候。' };
      active = true; let token: symbol | undefined, admitting = false, settledOwner: Capture | undefined;
      try {
        if (signal?.aborted) fail('原输入已变化，未加入其他消息。');
        const owner = expected ?? capture(ports, nodeId); let admissionOwner = owner;
        if (owner.nodeId !== nodeId || !isCurrent(ports, owner)) fail('原现场、材料或输入已变化，未重试其他消息。');
        if (sending(ports)) fail('这条消息正在发送，请稍后再加入材料。');
        const inputOwner = referencePickOwnerKey(owner.projectId, ports.shell().composerTarget);
        if (inputOwner) token = ports.references().beginReferenceInputOperation(inputOwner, 'preparing');
        const facts = await ports.readFacts(owner.projectId, signal);
        if (signal?.aborted || !isCurrent(ports, owner)) fail('原现场、材料或输入已变化，未加入其他消息。');
        if (sending(ports)) fail('这条消息已开始发送，未改动本次输入。');
        const node = rows(ports.canvas().nodes).find(row => row.id === nodeId)!;
        const reference = resolveNativeNodeComposerReference(node, owner, facts);
        const references = preparedReference(reference, ports.shell().composerTarget?.intent);
        // No await inside admission. The original shell may synchronously open
        // this missing input or resume it; the feedback owner adopts only this
        // service-verified transition, never a later user-selected input.
        admitting = true; lifecycle?.beginAdmission();
        if (!ports.shell().composerTarget) {
          ports.shell().openComposer({ nodeId, title: reference.displayLabel, focusInput: true, intent: 'delegate',
            workspaceId: owner.workspaceId, anchor: { x: 0, y: 0, width: 0, height: 0 },
            targetNodeIds: [nodeId], targetReferences: references });
          const created = ports.shell().composerTarget;
          if (!created || created.nodeId !== nodeId || created.intent !== 'delegate' || created.workspaceId !== owner.workspaceId
            || created.targetReferences?.length !== 1 || JSON.stringify(created.targetReferences[0]) !== JSON.stringify(references[0]))
            fail('原输入未能确认打开，未加入其他消息。');
          const newOwner = referencePickOwnerKey(owner.projectId, created);
          token = ports.references().beginReferenceInputOperation(newOwner!, 'preparing');
          admissionOwner = capture(ports, nodeId);
          if (admissionOwner.projectId !== owner.projectId || admissionOwner.canvasId !== owner.canvasId || admissionOwner.api !== owner.api
            || admissionOwner.workspaceId !== owner.workspaceId || admissionOwner.identity !== owner.identity)
            fail('打开输入时原现场或材料已变化，未加入其他目标。');
        }
        const key = composerInputKey(ports.shell().composerTarget);
        if (!key || !isCurrent(ports, admissionOwner) || sending(ports)) fail('当前输入正在变化，请稍后再加入材料。');
        const result = ports.references().addEntitiesToDraft(references, ports.shell().composerTarget.intent);
        if (result.reason) fail(result.reason);
        if (isCurrent(ports, admissionOwner)) {
          ports.shell().resumeComposer(key);
          const resumedOwner = { ...admissionOwner, composerOpen: true };
          if (isCurrent(ports, resumedOwner)) ports.revealCurrentInput?.({ projectId: owner.projectId, canvasId: owner.canvasId, inputKey: key,
            messageId: ports.shell().composerTarget?.messageId, continuationOperationId: ports.shell().composerTarget?.continuationOperationId });
          if (isCurrent(ports, resumedOwner)) settledOwner = resumedOwner;
        }
        return { ok: true, added: result.added, notice: result.added ? '已用于当前输入，尚未发送。' : '这份版本已在当前输入中。' };
      } catch (error) { return { ok: false, reason: error instanceof Error ? error.message : '引用入稿尚未确认，请核对当前输入后重试。' }; }
      finally { if (admitting) lifecycle?.endAdmission(settledOwner); if (token) ports.references().finishReferenceInputOperation(token); active = false; }
    },
  };
}

export interface NativeNodeComposerFeedbackCallbacks {
  isMounted?(): boolean;
  onBusy?(busy: boolean, token: symbol): void;
  onResult?(result: NativeNodeComposerResult): void;
}
/** One action's lifetime on the already-shipped Rt instance. It is neither a
 * reference store nor a retry queue. Every old toast action closes over its
 * original capture and is invalidated even if someone retains the callback. */
export function createNativeNodeComposerFeedbackController(ports: NativeNodeComposerPorts = defaultPorts,
  notice?: NativeDropNotice, callbacks: NativeNodeComposerFeedbackCallbacks = {}) {
  type Held = { owner: Capture; nodeId: string; token: symbol; service: ReturnType<typeof createNativeNodeComposerService>; id?: string | number; reading?: AbortController;
    busy: boolean; committing: boolean; invalid: boolean };
  let held: Held | null = null, disposed = false;
  const mounted = () => !disposed && callbacks.isMounted?.() !== false;
  const dismiss = (value: Held) => { if (value.id !== undefined) { try { notice?.dismiss(value.id); } catch { /* Original menu feedback remains. */ } value.id = undefined; } };
  const invalidate = (value: Held) => { value.invalid = true; value.reading?.abort(); dismiss(value); if (held === value) held = null; };
  const current = (value: Held) => mounted() && held === value && !value.invalid && isCurrent(ports, value.owner) && !sending(ports);
  const sync = () => { if (held && !held.committing && !current(held)) invalidate(held); };
  const publish = (value: Held, result?: NativeNodeComposerResult) => {
    if (!current(value)) { invalidate(value); return; }
    const failed = result?.ok === false;
    try {
      value.id = notice?.({ id: value.id, title: result ? result.ok ? result.notice : result.reason : '正在核对材料，原输入保留…',
        duration: !result || failed ? 0 : 2500, dismissible: !!result,
        action: failed ? { label: '重试', onClick: event => {
          event?.preventDefault();
          if (!current(value)) { invalidate(value); return; }
          void run(value);
        } } : undefined });
    } catch { /* Failure to display Rt must not create a second feedback UI. */ }
  };
  const run = async (value: Held): Promise<NativeNodeComposerResult> => {
    if (!current(value)) { invalidate(value); return { ok: false, reason: '原输入已变化，这条重试已失效。' }; }
    if (value.busy) return { ok: false, reason: '正在核对这份材料，请稍候。' };
    const controller = new AbortController(); value.reading = controller; value.busy = true;
    callbacks.onBusy?.(true, value.token); publish(value);
    try {
      const result = await value.service.useForCurrentInput(value.nodeId, controller.signal, value.owner, {
        beginAdmission() { value.committing = true; },
        endAdmission(owner) { if (owner) value.owner = owner; value.committing = false; sync(); },
      });
      if (controller.signal.aborted || !current(value)) { invalidate(value); return result; }
      publish(value, result); callbacks.onResult?.(result); return result;
    } finally {
      value.busy = false; if (value.reading === controller) value.reading = undefined;
      if (mounted()) callbacks.onBusy?.(false, value.token);
    }
  };
  return { sync,
    async start(nodeId: string): Promise<NativeNodeComposerResult> {
      if (!mounted()) return { ok: false, reason: '原节点已关闭，请重新选择。' };
      if (held?.busy && current(held)) return { ok: false, reason: '正在核对这份材料，请稍候。' };
      if (held) invalidate(held);
      try {
        const value: Held = { owner: capture(ports, nodeId), nodeId, token: Symbol('node-reference'), service: createNativeNodeComposerService(ports), busy: false, committing: false, invalid: false };
        held = value; return await run(value);
      } catch (error) {
        const result: NativeNodeComposerResult = { ok: false, reason: error instanceof Error ? error.message : '材料暂时无法核对，原输入保留。' };
        if (mounted()) callbacks.onResult?.(result); return result;
      }
    },
    dispose() { if (disposed) return; disposed = true; if (held) invalidate(held); },
  };
}

export function LCOSUseNativeNodeComposer(nodeId: string, nativeNotice?: NativeDropNotice) {
  const node = useCanvasStore(state => state.nodes.find(row => row.id === nodeId));
  const canvasId = useCanvasStore(state => state.canvasId), canvasStatus = useCanvasStore(state => state.status), api = useCanvasStore(state => state.rfInstance);
  const projectId = useLcosShellStore(state => state.projectId), workspaceId = useLcosShellStore(state => state.activeWorkspaceId);
  const target = useLcosShellStore(state => state.composerTarget), composerOpen = useLcosShellStore(state => state.composerOpen), referenceProject = useLcosReferenceStore(state => state.projectId);
  const registered = useLcosReferenceStore(state => state.nodeEntityRefs.get(nodeId)), operations = useLcosReferenceStore(state => state.referenceInputOperations);
  const candidate = nativeNodeComposerCandidate(node);
  const inputOwner = referencePickOwnerKey(projectId, target), inputKey = composerInputKey(target);
  const isSending = !!inputOwner && [...operations.values()].some(operation => operation.owner === inputOwner && operation.kind === 'sending'
    && ((operation as Row).inputKey === undefined || (operation as Row).inputKey === inputKey));
  // The original physical toolbar survives its own input opening. Each action
  // and retry still has a stricter captured input owner, checked synchronously
  // by the original stores and by the service before and after its GETs.
  const key = JSON.stringify([nodeId, identity(node), canvasId, canvasStatus, projectId, workspaceId, referenceProject]);
  const owner = useMemo(() => ({ key, api }), [key, api]);
  const latest = useRef<typeof owner | null>(owner); latest.current = owner;
  const address = inputAddress({ projectId, composerTarget: target, composerOpen });
  const renderedInput = useMemo(() => ({ address, isSending }), [address, isSending]);
  const latestInput = useRef(renderedInput); latestInput.current = renderedInput;
  type Operation = { owner: typeof owner; token: symbol; address: string };
  const controller = useRef<{ owner: typeof owner; current: ReturnType<typeof createNativeNodeComposerFeedbackController> } | null>(null);
  const [operation, setOperation] = useState<Operation | null>(null), [feedback, setFeedback] = useState<{ owner: typeof owner; address: string; text: string }>();
  const busy = operation?.owner === owner && operation.address === address;
  useEffect(() => {
    // React development replay sets up this same effect again after its first
    // cleanup without another render. Restore only this otherwise-empty owner.
    if (latest.current === null) latest.current = owner;
    const current = createNativeNodeComposerFeedbackController(defaultPorts, nativeNotice, {
      isMounted: () => latest.current === owner,
      onBusy: (busy, token) => { if (latest.current !== owner) return;
        setOperation(value => busy ? { owner, token, address: inputAddress(defaultPorts.shell()) } : value?.token === token ? null : value); },
      onResult: result => { if (latest.current === owner) setFeedback({ owner, address: inputAddress(defaultPorts.shell()), text: result.ok ? result.notice : result.reason }); },
    });
    const installed = { owner, current }; controller.current = installed;
    const subscriptions = [useLcosShellStore.subscribe(current.sync), useLcosReferenceStore.subscribe(current.sync), useCanvasStore.subscribe(current.sync)];
    return () => {
      if (latest.current === owner) latest.current = null;
      subscriptions.forEach(unsubscribe => unsubscribe()); current.dispose();
      if (controller.current === installed) controller.current = null;
    };
  }, [owner, nativeNotice]);
  const value = !projectId || projectId !== referenceProject || canvasStatus !== 'ready' || !canvasId || !api || !workspaceId
    ? unavailable('当前现场或输入所属项目尚未准备好。', candidate.supported)
    : nativeNodeComposerLocalAvailability(node, target?.intent, registered);
  return { supported: candidate.supported, canUse: value.canUse && !busy && !isSending, busy, notice: feedback?.owner === owner && feedback.address === address ? feedback.text : undefined,
    reason: isSending ? '这条消息正在发送，请稍后再加入材料。' : value.reason,
    useForCurrentInput: async (): Promise<NativeNodeComposerResult> => {
      if (latest.current !== owner) return { ok: false, reason: '原节点已切换，请重新选择。' };
      if (latestInput.current !== renderedInput || inputAddress(defaultPorts.shell()) !== renderedInput.address
        || sending(defaultPorts) !== renderedInput.isSending || renderedInput.isSending)
        return { ok: false, reason: '原输入已变化，请从当前输入重新选择。' };
      const current = controller.current;
      if (!current || current.owner !== owner) return { ok: false, reason: '原输入还在准备，请稍后再试。' };
      setFeedback(undefined); return current.current.start(nodeId);
    } };
}
