import { readWorkflowScopeMethodDraft } from './workflowMethodDraft';
import { composerInputKey } from '../../composer/composerInputJourney';
import { draftReferenceUnavailableReason, runReferenceUnavailableReason } from '../../composer/referenceSnapshot';
import { useLcosReferenceStore } from '../../lcosReferenceState';
import { useLcosShellStore } from '../../shell/lcosShellStore';

import type { WorkflowMethodDraft } from './workflowMethodDraft';
import type { LcosCoreSession } from '../../app/lcosCoreClient';

export function workflowMethodReferenceReason(method: Extract<WorkflowMethodDraft, { status: 'ready' }>, intent?: string) {
  return method.references.map((ref) => draftReferenceUnavailableReason(ref, intent)
    ?? (intent === 'continue' ? undefined : runReferenceUnavailableReason(ref))).find((reason) => reason !== undefined);
}

/** Existing button and drop share one append into the original unsent input. */
export function appendWorkflowMethodDraft(method: WorkflowMethodDraft, projectId: string, inputKey?: string): void {
  if (method.status !== 'ready') throw new Error(method.reason);
  const shell = useLcosShellStore.getState(), references = useLcosReferenceStore.getState();
  if (shell.projectId !== projectId || references.projectId !== projectId
    || inputKey !== undefined && composerInputKey(shell.composerTarget) !== inputKey)
    throw new Error('当前输入目标已改变，方法没有加入其他任务。');
  const reason = workflowMethodReferenceReason(method, shell.composerTarget?.intent);
  if (reason) throw new Error(reason);
  if (method.references.length) {
    const result = references.addEntitiesToDraft(method.references, shell.composerTarget?.intent);
    if (result.reason) throw new Error(result.reason);
  }
  if (!shell.composerPrompt.includes(method.prompt))
    shell.setComposerPrompt(`${shell.composerPrompt}${shell.composerPrompt.trim() ? '\n\n' : ''}${method.prompt}`);
}

/** Assembly and native Drop read the same method and append to the same input. */
export async function takeWorkflowScopeMethodDraft(session: Pick<LcosCoreSession, 'http' | 'projects'>,
  projectId: string, scopeId: string, inputKey: string, signal?: AbortSignal, isCurrent?: () => boolean): Promise<void> {
  const before = useLcosShellStore.getState();
  if (!inputKey || before.projectId !== projectId || useLcosReferenceStore.getState().projectId !== projectId
    || composerInputKey(before.composerTarget) !== inputKey)
    throw new Error('工作流来源或当前输入目标已改变，原草稿保留。');
  const method = await readWorkflowScopeMethodDraft(session, projectId, scopeId, signal);
  const target = useLcosShellStore.getState().composerTarget;
  if (signal?.aborted || isCurrent?.() === false) throw new Error('工作流方法取用已取消，原草稿保留。');
  if (target?.messageId !== before.composerTarget?.messageId
    || target?.continuationOperationId !== before.composerTarget?.continuationOperationId)
    throw new Error('原消息已改变，方法未加入后续输入。');
  appendWorkflowMethodDraft(method, projectId, inputKey);
}
