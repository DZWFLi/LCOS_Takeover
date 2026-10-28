import { conversationSendKey, hasUnconfirmedConversationMessage } from '../../lcos/huabu/apps/web/src/lcos/composer/conversationSendAttempt';

/** RecoverySection returns its pre-command projection. Read the same operation
 * after the receipt; that old projection is only an identity, never completion. */
export async function refreshNativeRecoveredComposer({ projectId, conversationId, receiptOperation, client, readShell, isCurrent }: any) {
  if (receiptOperation?.projectId !== projectId || receiptOperation.mode !== 'continue_existing'
    || receiptOperation.connectedConversationId !== conversationId) return;
  const expectedTarget = readShell().composerTarget;
  const [projection, diagnostics] = await Promise.all([
    client.readSession(projectId, conversationId), client.readDiagnostics(projectId, conversationId),
  ]);
  if (!isCurrent()) return;
  const operation = diagnostics?.operations.find((row: any) => row.operationId === receiptOperation.operationId
    && row.projectId === projectId && row.connectedConversationId === conversationId);
  if (!operation || operation.cancel !== 'none' || operation.steps.external_create !== 'confirmed'
    || operation.steps.core_bind !== 'confirmed' || projection?.capabilities.canSend !== true) return;
  const prepared = prepareNativeRecoveredComposer({ projectId, conversationId, operation, projection, diagnostics, expectedTarget, shell: readShell() });
  return { operation, prepared };
}

/** Prepare only the original unsent input after a same-owner recovery receipt.
 * Submitted/unknown turns keep their original message and operation identity. */
export function prepareNativeRecoveredComposer({ projectId, conversationId, operation, projection, diagnostics, expectedTarget, shell }: any): boolean {
  if (operation?.projectId !== projectId || operation.mode !== 'continue_existing'
    || operation.connectedConversationId !== conversationId || operation.requestConnectedConversationId !== conversationId
    || operation.cancel !== 'none' || operation.steps.external_create !== 'confirmed' || operation.steps.core_bind !== 'confirmed'
    || !operation.externalEvidence?.externalSessionId || operation.externalEvidence.runtimeScope !== projectId
    || projection?.projectId !== projectId || projection.conversationId !== conversationId || projection.capabilities.canSend !== true
    || diagnostics?.conversationId !== conversationId || shell.projectId !== projectId || !shell.composerOpen
    || !expectedTarget || shell.composerTarget !== expectedTarget || expectedTarget.intent !== 'continue'
    || expectedTarget.receiverConversationId !== conversationId
    || shell.conversationSendAttempts.has(conversationSendKey(projectId, conversationId))
    || hasUnconfirmedConversationMessage(projectId, conversationId, diagnostics)) return false;
  shell.prepareComposerContinuation(projectId, expectedTarget, operation.operationId);
  return true;
}
