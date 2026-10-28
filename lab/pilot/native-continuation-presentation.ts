import type { ConversationContinuationAction } from '../../lcos/huabu/apps/web/src/lcos/professional/conversationContinuationActions';
import type { CollaborationProductErrorV1 } from '../../lcos/packages/contracts/src/collaboration-contract';

/** Product copy only. Original modes, capability admission and request data stay with their owners. */
const modeCopy = {
  continue_existing: { short: '接着聊', label: '继续当前对话', history: '保留当前对话历史',
    context: '沿用原有上下文，不附加这次草稿中的材料', unavailable: '目前不能继续连接这段对话；原对话和输入保留。' },
  selected_context: { short: '带材料', label: '用所选材料新建对话', history: '不带入原对话历史',
    context: '只带入下方确认的材料', unavailable: '目前不能用所选材料新建对话；原对话和材料保留。' },
  blank_new: { short: '空白', label: '新建空白对话', history: '不带入原对话历史',
    context: '不带入当前材料或草稿', unavailable: '目前不能新建空白对话；原对话和输入保留。' },
  native_full_fork: { short: '历史分支', label: '从历史创建分支', history: '仅带入已完成、且协作者支持分支的历史',
    context: '原对话保留，不自动附加这次草稿', unavailable: '目前不能从完整历史创建分支；原对话和历史保留。' },
} as const;
export function nativeContinuationModeCopy(action: ConversationContinuationAction) {
  return modeCopy[action];
}

/** Capability true is the only available result, exactly like the original control.
 * A false/unknown capability is described by its selected user goal, never by a
 * provider probe string. This does not change, infer or write any capability. */
export function nativeContinuationCapabilityReason(action: ConversationContinuationAction,
  capability: boolean | undefined, readStatus?: 'loading' | 'ready' | 'error'): string | undefined {
  if (capability === true) return undefined;
  if (readStatus === 'error') return '暂时无法读取会话选项，已有对话和输入保留。';
  if (readStatus !== 'ready') return '正在读取会话可用选项…';
  return modeCopy[action].unavailable;
}

/** Present the existing product error semantics, never rewrite its evidence,
 * revision, retryability, operation identity or original recovery handler. */
export function nativeContinuationErrorMessage(action: ConversationContinuationAction,
  error: Pick<CollaborationProductErrorV1, 'code' | 'retryable'>): string {
  if (error.code === 'operation_unknown') return '这次请求的结果还没有确认。请查看原请求，不要重复新建对话；原内容保留。';
  if (error.code === 'cancelled') return '这次请求已取消，原对话和材料保留。';
  if (error.code === 'permission_required') return '继续前需要确认授权，请查看原请求并处理；原内容保留。';
  if (error.code === 'input_required') return '还有需要补充的信息，请先查看原对话中的问题；原内容保留。';
  if (error.code === 'needs_recovery') return '这次连接需要先核对原请求。请查看原请求，确认后再继续；原内容保留。';
  const retry = error.retryable === true ? '可以重试原请求。' : '请先查看原请求后再继续。';
  if (error.code === 'provider_offline') return `暂时无法连接协作者，原对话和输入保留。${retry}`;
  if (error.code === 'unavailable') return `${modeCopy[action].label}目前不可用，原对话和材料保留。${retry}`;
  if (error.code === 'operation_failed') return `${modeCopy[action].label}暂时没有完成，原对话和材料保留。${retry}`;
  return `这次请求暂时没有得到可确认的结果，原对话和材料保留。${retry}`;
}


