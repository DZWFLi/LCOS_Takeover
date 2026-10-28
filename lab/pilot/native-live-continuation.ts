import type { ContinuationModeV1, ContinuationRecoveryProjectionV1 } from '../../lcos/packages/contracts/src/conversation-continuation';
import type { CoreContinuationClient } from '../../lcos/apps/web-gen2/src/backend/continuation';

/** Temporary routing of an accepted original Composer request, never a second session store. */
export interface NativeLiveContinuationRequest {
  projectId: string;
  sourceConversationId: string;
  operationId: string;
  action: Extract<ContinuationModeV1, 'blank_new' | 'selected_context' | 'continue_existing'>;
}
export const nativeLiveContinuationEvent = 'lcos-native-connect-submitted-conversation';
const address = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
export function requestNativeLiveContinuation(request: NativeLiveContinuationRequest): boolean {
  if (!request || ![request.projectId, request.sourceConversationId, request.operationId].every(address)
    || !['blank_new', 'selected_context', 'continue_existing'].includes(request.action)) return false;
  return window.dispatchEvent(new CustomEvent(nativeLiveContinuationEvent, { detail: request }));
}
/** Busy comes from the original operation facts; known failure/cancellation never leaves a permanent UI lock. */
export function nativeContinuationCreationPending(operations: readonly ContinuationRecoveryProjectionV1[] | undefined,
  projectId: string, sourceConversationId: string | undefined): boolean {
  if (!sourceConversationId) return false;
  return operations?.some(operation => {
    if (operation.projectId !== projectId || !['blank_new', 'selected_context', 'continue_existing'].includes(operation.mode)
      || (operation.requestConnectedConversationId ?? operation.connectedConversationId) !== sourceConversationId) return false;
    if (operation.cancel === 'confirmed') return false;
    if (operation.cancel === 'requested' || operation.cancel === 'outcome_unknown') return true;
    if (operation.steps.external_create === 'confirmed' && operation.steps.core_bind === 'confirmed') return false;
    if (Object.values(operation.steps).includes('outcome_unknown')) return true;
    if (operation.steps.external_create === 'pending' || operation.steps.core_bind === 'pending') return true;
    if (operation.steps.external_create === 'failed' || operation.steps.core_bind === 'failed') return false;
    return true;
  }) ?? false;
}
export type NativeLiveContinuationResult = { status: 'ready'; conversationId: string }
  | { status: 'pending' | 'unconfirmed' | 'recoverable' | 'unavailable'; message: string };
type Client = Pick<CoreContinuationClient, 'get' | 'executeRecoveryAction'>;
export interface NativeLiveContinuationPorts {
  client: Client;
  isCurrent(): boolean;
  signal?: AbortSignal;
  onProgress?(phase: 'reading' | 'connecting' | 'binding' | 'checking'): void;
}
function current(ports: NativeLiveContinuationPorts): void {
  if (ports.signal?.aborted || !ports.isCurrent()) throw new DOMException('Original conversation owner changed.', 'AbortError');
}
/** Advance only the original Core operation and its fresh advertised actions. Network ambiguity never retries a mutation. */
export async function connectNativeLiveContinuation(request: NativeLiveContinuationRequest | (Omit<NativeLiveContinuationRequest, 'sourceConversationId' | 'action'> & { sourceConversationId: null; action: 'blank_new' }), ports: NativeLiveContinuationPorts,
  options: { verifyOnly?: boolean } = {}): Promise<NativeLiveContinuationResult> {
  let mutationStarted = false;
  const read = async (): Promise<ContinuationRecoveryProjectionV1 | undefined> => {
    current(ports);
    const row = await ports.client.get(request.projectId, request.operationId, ports.signal); current(ports);
    if (row && (row.projectId !== request.projectId || row.operationId !== request.operationId || row.mode !== request.action
      || (row as ContinuationRecoveryProjectionV1 & { requestConnectedConversationId?: string | null }).requestConnectedConversationId !== request.sourceConversationId)) {
      throw new Error('Original continuation request identity was not confirmed.');
    }
    return row;
  };
  const resolved = (row: ContinuationRecoveryProjectionV1): NativeLiveContinuationResult | undefined => {
    if (row.cancel !== 'none') return { status: 'unavailable', message: '这次连接已停止，已有对话和输入保留。' };
    if (row.steps.external_create === 'confirmed' && row.steps.core_bind === 'confirmed') {
      if (!row.externalEvidence?.externalSessionId || !row.connectedConversationId || (request.action === 'continue_existing' ? row.connectedConversationId !== request.sourceConversationId : row.connectedConversationId === request.sourceConversationId)) {
        return { status: 'unavailable', message: '会话的连接尚未确认，原对话和输入保留。' };
      }
      return { status: 'ready', conversationId: row.connectedConversationId };
    }
    return undefined;
  };
  const unknown = (row: ContinuationRecoveryProjectionV1) => row.status === 'outcome_unknown'
    || Object.values(row.steps).includes('outcome_unknown');
  const pending = (row: ContinuationRecoveryProjectionV1) => row.steps.external_create === 'pending' || row.steps.core_bind === 'pending';
  const waiting = (): NativeLiveContinuationResult => ({ status: 'unconfirmed', message: '连接结果尚未确认，请核对连接；不会重复创建。' });
  try {
    current(ports); ports.onProgress?.('reading');
    let row = await read();
    if (!row) return { status: 'unavailable', message: '暂未读到这次连接，原请求和输入保留。' };
    const initial = resolved(row); if (initial) return initial;
    if (unknown(row)) {
      if (options.verifyOnly && row.allowedActions.some(item => item.action === 'reconcile')) {
        current(ports); ports.onProgress?.('checking'); mutationStarted = true;
        await ports.client.executeRecoveryAction(request.projectId, request.operationId, 'reconcile', row.revision, ports.signal);
        row = await read(); if (!row) return waiting();
        const verified = resolved(row); if (verified) return verified;
        return unknown(row) || pending(row) ? waiting() : { status: 'recoverable', message: '已核对原请求，可以继续连接；已有输入保留。' };
      }
      return waiting();
    }
    if (pending(row)) return { status: 'pending', message: '连接仍在进行中，请稍后核对；不会重复创建。' };
    if (options.verifyOnly) return { status: 'recoverable', message: '已核对原请求，可以继续连接；已有输入保留。' };
    if (row.steps.external_create !== 'confirmed') {
      if (!row.allowedActions.some(item => item.action === 'recover_external')) return { status: 'unavailable', message: '暂时无法连接会话，原请求和输入保留。' };
      current(ports); ports.onProgress?.('connecting'); mutationStarted = true;
      await ports.client.executeRecoveryAction(request.projectId, request.operationId, 'recover_external', row.revision, ports.signal);
      row = await read(); if (!row) return waiting();
      const created = resolved(row); if (created) return created;
      if (unknown(row) || pending(row)) return waiting();
      if (row.steps.external_create !== 'confirmed') return { status: 'recoverable', message: '会话暂未连接成功，可以重试连接；原请求和输入保留。' };
    }
    // A second original GET after create supplies the bind identity and CAS revision.
    if (!row.allowedActions.some(item => item.action === 'recover_bind')) return { status: 'unavailable', message: '会话已建立，连接尚待确认；原请求和输入保留。' };
    current(ports); ports.onProgress?.('binding'); mutationStarted = true;
    await ports.client.executeRecoveryAction(request.projectId, request.operationId, 'recover_bind', row.revision, ports.signal);
    row = await read(); if (!row) return waiting();
    return resolved(row) ?? (unknown(row) || pending(row) ? waiting()
      : { status: 'recoverable', message: '会话已建立，可以重试连接；不会重复创建。' });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    current(ports);
    return mutationStarted ? waiting() : { status: 'unavailable', message: '暂时无法读取连接状态，原请求和输入保留。' };
  }
}
