import { composerInputKey } from '../composer/composerInputJourney';
import { useLcosReferenceStore } from '../lcosReferenceState';
import { useLcosShellStore } from '../shell/lcosShellStore';
import { takeWorkflowScopeMethodDraft } from '../surfaces/workflow/workflowMethodTake';

import type { DropComposerReferenceIntent } from './dropTypes';
import type { LcosCoreSession } from '../app/lcosCoreClient';

/** Composer's existing asynchronous reference owner, with actual method reads. */
export async function addWorkflowMethodDrop(session: Pick<LcosCoreSession, 'http' | 'projects'>,
  projectId: string, intent: DropComposerReferenceIntent, signal?: AbortSignal, isCurrent?: () => boolean): Promise<void> {
  const shell = useLcosShellStore.getState(), refs = useLcosReferenceStore.getState();
  const inputKey = intent.inputKey ?? composerInputKey(shell.composerTarget);
  if (intent.sourceRef?.kind !== 'workflow' || intent.reference.entityType !== 'scope'
    || intent.sourceRef.id !== intent.reference.entityId || !inputKey || shell.projectId !== projectId
    || refs.projectId !== projectId || inputKey !== composerInputKey(shell.composerTarget))
    throw new Error('工作流来源或当前输入目标已改变，原草稿保留。');
  await takeWorkflowScopeMethodDraft(session, projectId, intent.sourceRef.id, inputKey, signal, isCurrent);
}
