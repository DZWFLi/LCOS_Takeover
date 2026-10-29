import type { ContinuationRecoveryProjectionV1 } from '../../lcos/packages/contracts/src/conversation-continuation';

/** Presentation only. Core remains the only authority for which recovery/cancel action can run. */
export function nativeConversationOperationNeedsAttention(operation: ContinuationRecoveryProjectionV1): boolean {
  if (operation.cancel === 'requested' || operation.cancel === 'outcome_unknown') return true;
  if (operation.cancel === 'confirmed' || operation.status === 'resolved' || operation.status === 'cancelled') return false;
  if (operation.status === 'recovering' || operation.status === 'outcome_unknown') return true;
  // Core retains the earlier transport error for inspection after a successful retry.
  // Only its confirmed original connection can settle it; current steps/messages below still win.
  if (operation.errorEvidence && !(operation.steps.external_create === 'confirmed'
    && operation.steps.core_bind === 'confirmed' && operation.externalEvidence?.externalSessionId)) return true;
  if (Object.values(operation.steps).some(step => step === 'failed' || step === 'outcome_unknown' || step === 'pending')) return true;
  if (![operation.steps.external_create, operation.steps.core_bind].every(step => step === 'confirmed' || step === 'not_applicable')) return true;
  if (operation.allowedActions.some(descriptor => descriptor.action !== 'cancel_request')) return true;
  return operation.promptReceipts?.some(message => {
    // A confirmed original send settles earlier attach/send failures for this same message.
    if (message.sendReceipt?.outcome === 'sent' || message.receipt.action === 'send' && message.receipt.outcome === 'sent') return false;
    return [message.receipt, message.attachReceipt, message.sendReceipt].some(receipt => receipt !== undefined
      && (receipt.error?.outcomeUnknown === true || ['failed', 'unsupported', 'unresolved', 'outcome_unknown'].includes(receipt.outcome)));
  }) ?? false;
}
export function nativeConversationRecoveryOperations(operations: readonly ContinuationRecoveryProjectionV1[] | undefined, target: {
  projectId: string; conversationId: string; requestedOperationId?: string; showAllRequests?: boolean;
}): readonly ContinuationRecoveryProjectionV1[] {
  return operations?.filter(operation => operation.projectId === target.projectId
    && (operation.connectedConversationId === target.conversationId || operation.requestConnectedConversationId === target.conversationId)
    && (target.showAllRequests === true || operation.operationId === target.requestedOperationId || nativeConversationOperationNeedsAttention(operation))) ?? [];
}

/** The original recovery command must fresh-read the actual bound target, even while its source request is being viewed. */
export function nativeConversationRecoveryExecutionTarget(operation: ContinuationRecoveryProjectionV1, projectId: string, conversationId: string): string | undefined {
  if (operation.projectId !== projectId || operation.connectedConversationId !== conversationId && operation.requestConnectedConversationId !== conversationId) return undefined;
  return operation.connectedConversationId ?? conversationId;
}
