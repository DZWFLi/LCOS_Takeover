/** Existing Composer presentation key, shared by pointer picking. This is a UI
 * input address, not a material identity or another draft/selection store. */
export function referencePickOwnerKey(projectId: string | null, target: {
  readonly nodeId: string;
  readonly intent?: string;
  readonly receiverConversationId?: string;
} | null): string | undefined {
  return target === null ? undefined : JSON.stringify([projectId, target.nodeId, target.intent, target.receiverConversationId]);
}
