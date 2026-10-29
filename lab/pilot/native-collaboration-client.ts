import { collaborationProductErrorV1 } from '../../lcos/packages/contracts/src/index.ts'
import type { CollaborationCommandResultV1, RuntimeProviderStatus } from '../../lcos/packages/contracts/src/index.ts'
import { CoreCollaborationClient } from '../../lcos/apps/web-gen2/src/backend/collaboration.ts'
import { CoreConversationClient } from '../../lcos/apps/web-gen2/src/backend/conversations.ts'
import { coreRequest } from '../../lcos/apps/web-gen2/src/backend/coreTypes.ts'
import type { HttpClient } from '../../lcos/apps/web-gen2/src/backend/client.ts'
import type { CreateRunInputV1 } from '../../lcos/apps/web-gen2/src/backend/runs.ts'

const unavailable = (message: string): CollaborationCommandResultV1 => ({
  ok: false,
  error: collaborationProductErrorV1('unavailable', message),
})

/** Only prepare an existing delegate request, using the same canonical identity
 * lookup as the original resume path. Core still owns the one Run/Dispatch and
 * every execution/recovery decision. No provider transport or registry lives here. */
export class NativeCoreCollaborationClient extends CoreCollaborationClient {
  private readonly routingConversations: CoreConversationClient

  constructor(private readonly routingHttp: HttpClient) {
    super(routingHttp)
    this.routingConversations = new CoreConversationClient(routingHttp)
  }

  override async delegate(projectId: string, input: CreateRunInputV1, signal?: AbortSignal,
    isCurrent?: () => boolean): Promise<CollaborationCommandResultV1> {
    const cancelled = (): CollaborationCommandResultV1 => ({ ok: false,
      error: collaborationProductErrorV1('cancelled', '输入已关闭、切换或取消，任务未创建；原输入保留。') })
    const isCancelled = () => signal?.aborted || isCurrent?.() === false
    if (isCancelled()) return cancelled()
    // Standalone tasks retain the original API behavior; do not infer a receiver
    // or mutate a historical Run to repair its old provider selection.
    if (input.receiverRef === undefined) return super.delegate(projectId, input, signal)

    let prepared: CreateRunInputV1
    try {
      const conversations = await this.routingConversations.listConnectedConversations(projectId, signal)
      if (isCancelled()) return cancelled()
      const matches = conversations.filter(item => item.id === input.receiverRef!.connectedConversationId && item.projectId === projectId)
      if (matches.length !== 1) return unavailable('所选会话不存在或身份尚未确认，任务未创建；原输入保留。')
      const conversation = matches[0]!
      if (input.requestedProvider !== undefined && input.requestedProvider !== 'auto'
        && input.requestedProvider !== conversation.provider) {
        return unavailable('所选执行端不能投递到这个会话，未替你改选；任务未创建，原输入保留。')
      }
      const providers = await coreRequest<readonly RuntimeProviderStatus[]>(this.routingHttp, 'GET', '/runtime/providers', { signal })
      const registered = Array.isArray(providers)
        ? providers.filter(item => item?.provider !== 'auto' && item?.provider === conversation.provider)
        : []
      if (registered.length !== 1) return unavailable('这个会话的任务执行端尚未适配，未转交其他执行端；原输入保留。')
      if (isCancelled()) return cancelled()
      // Registration is not availability. An offline provider may own a planned
      // journal entry, but this path never dispatches it or reports it as ready.
      prepared = { ...input, requestedProvider: conversation.provider }
    } catch {
      return isCancelled()
        ? cancelled()
        : { ok: false, error: collaborationProductErrorV1('provider_offline', '会话执行端暂时无法确认，任务未创建；原输入保留，请稍后重试。', { retryable: true }) }
    }
    // Keep the original POST, exact receipt validation and unknown-outcome error
    // handling. No retry or alternate-provider attempt is added around it.
    return super.delegate(projectId, prepared, signal)
  }
}
