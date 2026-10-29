import type { CollaborationDiagnosticsV1 } from '@local-creative-os/contracts';

/** Only consume the provider owner that Core has actually confirmed for this conversation. */
export function selectConfirmedSendOperation(
  diagnostics: CollaborationDiagnosticsV1 | undefined,
  conversationId: string,
  preferredOperationId?: string,
) {
  if (diagnostics?.conversationId !== conversationId) return undefined;
  return diagnostics.operations.find((operation) =>
    operation.connectedConversationId === conversationId
      && (preferredOperationId === undefined || operation.operationId === preferredOperationId)
      && Boolean(operation.externalEvidence?.externalSessionId)
      && operation.cancel === 'none'
      && operation.status !== 'recovering'
      && operation.status !== 'outcome_unknown'
      && operation.status !== 'cancelled',
  );
}
