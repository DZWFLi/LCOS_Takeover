/** Only settled canonical Collection-membership receipts refresh a Collection body.
 * This is a UI invalidation signal, NOT an alternative membership write.
 */
export function collectionMembershipRefreshTransaction(
  feedback: {
    readonly originalIntent: { readonly intent: { readonly kind: string; readonly collectionId?: string } };
    readonly receipt: { readonly transactionId: string; readonly status: string; readonly projectId?: string };
  } | null,
  projectId: string,
  collectionId: string | undefined,
): string | undefined {
  if (!feedback || !collectionId || !projectId || (feedback.receipt.projectId !== undefined && feedback.receipt.projectId !== projectId)) {
    return undefined;
  }
  if (feedback.originalIntent.intent.kind !== 'collection-membership'
    || feedback.originalIntent.intent.collectionId !== collectionId) return undefined;
  if (feedback.receipt.status !== 'success' && feedback.receipt.status !== 'partial') return undefined;
  return feedback.receipt.transactionId;
}
