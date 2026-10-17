import { describeProjectedEntity } from '@local-creative-os/web-gen2';

import useCanvasStore from '@/store/canvasStore';

import { createLcosCoreSession } from '../../app/lcosCoreClient';
import { useLcosReferenceStore } from '../../lcosReferenceState';
import { canvasTextReplyMatches, canvasTextCarrierMatches } from '../canvasTextSave';

import type { CanvasTextSnapshot } from '@local-creative-os/web-gen2';

export interface ProjectTextClaimGuard {
  readonly signal?: AbortSignal;
  readonly isCurrent?: () => boolean;
}

/** Confirm the original carrier's real Core identity before requesting editing. */
async function confirmProjectText(input: { readonly projectId: string; readonly canvasId: string; readonly nodeId: string; readonly body: string;
  readonly focus?: boolean }, guard?: ProjectTextClaimGuard): Promise<CanvasTextSnapshot> {
  const session = createLcosCoreSession();
  const current = () => useLcosReferenceStore.getState().projectId === input.projectId && useCanvasStore.getState().canvasId === input.canvasId
    && useCanvasStore.getState().nodes.some((node) => node.id === input.nodeId && node.data.content === input.body);
  const assertClaimCurrent = () => {
    if (!current() || guard?.signal?.aborted || guard?.isCurrent?.() === false)
      throw new Error('取用现场或正文已变化，原节点与输入保留。');
  };
  assertClaimCurrent();
  const address = { canvasId: input.canvasId, spatialId: input.nodeId };
  const prior = await session.artifacts.readCanvasText(input.projectId, address, guard?.signal);
  const sent = { ...address, body: input.body, expectedRevisionId: null };
  let value = prior;
  if (!value) {
    assertClaimCurrent();
    if (!await useCanvasStore.getState().saveCanvas()) throw new Error('原画布节点尚未保存，未创建项目文本。');
    assertClaimCurrent();
    value = await session.artifacts.saveCanvasText(input.projectId, sent);
    if (!canvasTextReplyMatches(input.projectId, sent, value)) throw new Error('文本创建回执与原节点不一致，等待核对。');
  }
  if (value.projectId !== input.projectId || value.canvasId !== input.canvasId || value.spatialId !== input.nodeId) throw new Error('原创建身份未确认。');
  if (current()) {
    if (!canvasTextCarrierMatches(useLcosReferenceStore.getState().nodeEntityRefs.get(input.nodeId), value)) throw new Error('创建已确认，但原节点已呈现另一份材料，没有覆盖它。');
    useLcosReferenceStore.getState().registerNodeEntity(input.nodeId, { entityType: 'artifact', entityId: value.artifactId,
      descriptor: describeProjectedEntity({ entityType: 'artifact', entityId: value.artifactId, title: value.title, artifactKind: 'markdown', managed: true,
        currentRevisionId: value.revisionId, presentedRevisionId: value.revisionId, revisionStatus: 'current', artifactViewId: value.viewId, fileRecordId: value.fileRecordId }) });
    useCanvasStore.getState().updateNodeData(input.nodeId, { lcosProjectTextCreating: false, lcosProjectTextCreateError: undefined });
    if (input.focus !== false && !guard?.signal?.aborted && guard?.isCurrent?.() !== false) useCanvasStore.getState()._setStateNoAutosave({ pendingInlineEditNodeId: input.nodeId });
    useLcosReferenceStore.getState().requestNodeBindingRefresh();
  }
  return value;
}

// Only pending operations, removed on settlement. A restored carrier can
// explicitly recover its original Core creation without parallel writes.
const pendingClaims = new Map<string, Promise<CanvasTextSnapshot>>();
export function claimProjectText(input: Parameters<typeof confirmProjectText>[0], guard?: ProjectTextClaimGuard): Promise<CanvasTextSnapshot> {
  const key = JSON.stringify([input.projectId,input.canvasId,input.nodeId]);
  const pending = pendingClaims.get(key); if (pending) return pending;
  const task = confirmProjectText(input, guard).finally(() => pendingClaims.delete(key));
  pendingClaims.set(key,task); return task;
}

/** Uses the existing Huabu carrier + canonical canvas-text producer. This
 * producer binds that same carrier atomically, avoiding a second projection. */
export async function createProjectText(input: { readonly projectId: string; readonly canvasId: string; readonly nodeType?: 'note' | 'text';
  readonly position: { x: number; y: number }; readonly body?: string; readonly focus?: boolean; readonly origin?: 'user-created' | 'user-pasted' }): Promise<CanvasTextSnapshot> {
  const state = useCanvasStore.getState();
  if (state.canvasId !== input.canvasId || useLcosReferenceStore.getState().projectId !== input.projectId) throw new Error('文本创建现场已变化。');
  const existing = new Set(state.nodes.map((node) => node.id));
  const body = input.body ?? '';
  // Project notes and text use the same native text carrier. Its inline edit
  // request waits behind the creation state; native Note's preview-window
  // creation side effect must not summon a second editor.
  state.addNode({ nodeType: 'text', placementPoint: input.position,
    size: { width: 244, height: 150 },
    data: { content: body, origin: { type: input.origin ?? 'user-created' }, lcosProjectTextCreating: true } });
  const node = useCanvasStore.getState().nodes.find((candidate) => !existing.has(candidate.id));
  if (!node) throw new Error('画布未创建文本节点。');
  useCanvasStore.getState()._setStateNoAutosave({ pendingInlineEditNodeId: null });
  try { return await claimProjectText({ ...input, nodeId: node.id, body }); }
  catch (error) {
    if (useCanvasStore.getState().canvasId === input.canvasId && useCanvasStore.getState().nodes.some((candidate) => candidate.id === node.id)) {
      const hasIdentity = useLcosReferenceStore.getState().nodeEntityRefs.has(node.id);
      useCanvasStore.getState().updateNodeData(node.id, { lcosProjectTextCreating: false,
        lcosProjectTextCreateError: hasIdentity ? undefined : error instanceof Error ? error.message : '原创建未确认。' });
    }
    throw error;
  }
}
