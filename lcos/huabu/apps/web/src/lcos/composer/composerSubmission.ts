import { prepareDraftReferences, draftReferenceUnavailableReason, runReferenceUnavailableReason, snapshotDraftReference } from './referenceSnapshot';
import { buildSelectedContextReferences } from '../professional/conversationContinuationActions';

import type { CoreEntityRefLike } from '../referenceBridge';
import type { PresentedReference } from './referenceSnapshot';
import type { LcosComposerTarget } from '../shell/lcosShellStore';
import type { CollaborationSendInputV1 } from '@local-creative-os/contracts';
import type { CreateRunInputV1 } from '@local-creative-os/web-gen2';



export interface ComposerSubmissionInput {
  readonly projectId: string;
  readonly instruction: string;
  readonly workspaceId: string;
  readonly target: LcosComposerTarget;
  readonly refs: readonly CoreEntityRefLike[];
}

export interface ComposerContinuationSubmissionInput {
  readonly conversationId: string;
  readonly continuationOperationId: string;
  readonly messageId: string;
  readonly text: string;
  readonly refs: readonly CoreEntityRefLike[];
}

/** Current binary context is identity-based; it cannot silently substitute a historical page/file. */
export function composerForegroundUnavailableReason(ref: PresentedReference): string | undefined {
  if (ref.entityType === 'result-slot') return undefined;
  if (ref.entityType !== 'artifact') return '该类型暂不能用于本次输入；请打开其中的实际材料或取用工作流方法，原草稿保留。';
  const snapshot = snapshotDraftReference(ref);
  const invalid = draftReferenceUnavailableReason(snapshot, 'delegate');
  if (invalid) return invalid;
  if (snapshot.mode !== undefined && snapshot.mode !== 'full') return runReferenceUnavailableReason(snapshot);
  if (snapshot.revisionId && runReferenceUnavailableReason(snapshot)
    && (ref.descriptor?.entityType !== 'artifact' || ref.descriptor.entityId !== ref.entityId
      || ref.descriptor.currentRevisionId !== snapshot.revisionId)) {
    return '当前任务不能读取这个历史文件版本，未改用最新版；原草稿保留。';
  }
  return undefined;
}

/** Build the exact Core Run payload; receiver identity is never inferred from labels or node ids. */
export function buildComposerRunInput(input: ComposerSubmissionInput): CreateRunInputV1 {
  // Gen1 commandDraft: foreground selection and explicit references are separate.
  // Current Core uses contextArtifactIds for foreground materials; orderedReferences
  // preserve the user's independently picked versions/modes. A result slot is output.
  const foreground = input.target.targetReferences ?? [];
  const slots = [...new Set([...(input.target.resultSlotId ? [input.target.resultSlotId] : []),
    ...foreground.filter(ref => ref.entityType === 'result-slot').map(ref => ref.entityId)])];
  if (slots.length > 1) throw new Error('一次任务只能使用一个空白结果位；原草稿保留。');
  const contextRefs = foreground.filter(ref => ref.entityType !== 'result-slot');
  const foregroundBlocked = contextRefs.map(composerForegroundUnavailableReason).find(Boolean);
  if (foregroundBlocked) throw new Error(foregroundBlocked);
  // Text foreground with a visible version also travels as an exact material
  // snapshot. That transport address does not turn selection into UI Reference.
  const foregroundSnapshots = contextRefs.filter(ref => ref.revisionId && !runReferenceUnavailableReason(ref));
  const inputs = [...foregroundSnapshots, ...input.refs];
  // Check every offered input before identity deduplication can hide a conflict.
  const blocked = inputs.map(runReferenceUnavailableReason).find(Boolean);
  if (blocked) throw new Error(blocked);
  const prepared = inputs.length ? prepareDraftReferences(inputs, 'delegate') : { ok: true as const, references: inputs };
  if (!prepared.ok) throw new Error(prepared.reason);
  const selected = buildSelectedContextReferences(prepared.references);
  if (selected.unsupportedEntityTypes.length > 0) throw new Error('本轮含暂不支持的引用，请先移除或转换为可读取的材料。');
  return {
    instruction: input.instruction,
    outputIntent: slots.length ? 'create' : 'analyze',
    ...(slots[0] ? { resultSlotId: slots[0] } : {}),
    contextArtifactIds: [...new Set([...contextRefs.map(ref => ref.entityId),
      ...prepared.references.filter((ref) => ref.entityType === 'artifact').map((ref) => ref.entityId)])],
    orderedReferences: selected.orderedReferences,
    ...(input.target.receiverConversationId === undefined
      ? {}
      : { receiverRef: { connectedConversationId: input.target.receiverConversationId } }),
    workspaceId: input.workspaceId,
  };
}

export function canSubmitComposerTarget(
  target: LcosComposerTarget,
  instruction: string,
  workspaceId: string | undefined,
): boolean {
  return (
    instruction.trim().length > 0 &&
    workspaceId !== undefined &&
    target.receiverBlockedReason === undefined &&
    (target.targetReferences ?? []).every((ref) => !composerForegroundUnavailableReason(ref))
  );
}

/**
 * Continue has a narrower identity contract than delegate and deliberately
 * does not require workspaceId. References are blocked until the continuation
 * attach protocol exists; dropping them would make the user's draft lie.
 */
export function canSubmitComposerContinuation(
  target: LcosComposerTarget,
  instruction: string,
  refs: readonly CoreEntityRefLike[],
): boolean {
  const selected = buildSelectedContextReferences(refs);
  return (
    target.intent === 'continue' &&
    instruction.trim().length > 0 &&
    target.receiverConversationId !== undefined &&
    target.continuationOperationId !== undefined &&
    target.messageId !== undefined &&
    refs.every((ref) => !draftReferenceUnavailableReason(ref, 'continue')) &&
    selected.unsupportedEntityTypes.length === 0 &&
    target.receiverBlockedReason === undefined
  );
}

export function buildComposerContinuationInput(
  input: ComposerContinuationSubmissionInput,
): CollaborationSendInputV1 {
  const prepared = input.refs.length ? prepareDraftReferences(input.refs, 'continue') : { ok: true as const, references: input.refs };
  if (!prepared.ok) throw new Error(prepared.reason);
  const selected = buildSelectedContextReferences(prepared.references);
  return {
    conversationId: input.conversationId,
    text: input.text.trim(),
    ...(selected.orderedReferences.length === 0 ? {} : { orderedReferences: selected.orderedReferences }),
    continuationOperationId: input.continuationOperationId,
    messageId: input.messageId,
  };
}
