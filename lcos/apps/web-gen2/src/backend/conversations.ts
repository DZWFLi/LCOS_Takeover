// Sprint 2B（T4）：Conversation / Work View 的唯一 typed HTTP facade（React-free）。
//
// 只消费既有 Core routes（receiver / conversation-identity / f6-assembly 的
// identity·reach），按 connectedConversationId 定位；不新建第二 Conversation truth。
// Work View 聚合 route 属 T6 PLANNED，缺失时前端保持 identity/reach 可读的 partial 状态。

import type {
  ConnectedConversationV1,
  ConversationIdentityChainV1,
  ConversationSessionV1,
  ConversationReachResultV0,
  ConversationWorkViewAggregateV1,
  CompleteConversationImportResultV1,
  ImportManualConversationInputV1,
  ProjectReceiverBindingV1,
  ConversationImportSessionV1,
  CreateConversationImportSessionInputV1,
  CompleteConversationImportInputV1,
} from '@local-creative-os/contracts';
import { HttpClient } from './client.js';
import { coreRequest } from './coreTypes.js';

export class CoreConversationClient {
  constructor(private readonly http: HttpClient) {}

  /** Existing Core chunk-import pipeline, also used by Gen1. */
  createImportSession(projectId: string, input: CreateConversationImportSessionInputV1, signal?: AbortSignal): Promise<ConversationImportSessionV1> {
    return coreRequest(this.http, 'POST', `/projects/${encodeURIComponent(projectId)}/conversation-import-sessions`, { body: input, signal });
  }

  uploadImportChunk(projectId: string, importSessionId: string, chunkIndex: number, bytes: Blob, signal?: AbortSignal): Promise<ConversationImportSessionV1> {
    return coreRequest(this.http, 'PUT', `/projects/${encodeURIComponent(projectId)}/conversation-import-sessions/${encodeURIComponent(importSessionId)}/chunks/${chunkIndex}`, { rawBody: bytes, signal });
  }

  completeImportSession(projectId: string, importSessionId: string, input: CompleteConversationImportInputV1, signal?: AbortSignal): Promise<CompleteConversationImportResultV1> {
    return coreRequest(this.http, 'POST', `/projects/${encodeURIComponent(projectId)}/conversation-import-sessions/${encodeURIComponent(importSessionId)}/complete`, { body: input, signal });
  }

  /** GET /projects/:pid/connected-conversations → 承接关系列表。 */
  listConnectedConversations(
    projectId: string,
    signal?: AbortSignal,
  ): Promise<ConnectedConversationV1[]> {
    return coreRequest<ConnectedConversationV1[]>(
      this.http,
      'GET',
      `/projects/${encodeURIComponent(projectId)}/connected-conversations`,
      { signal },
    );
  }

  /** GET /projects/:pid/conversations → project-owned imported conversation sessions. */
  listSessions(projectId: string, signal?: AbortSignal): Promise<ConversationSessionV1[]> {
    return coreRequest<ConversationSessionV1[]>(
      this.http,
      'GET',
      `/projects/${encodeURIComponent(projectId)}/conversations`,
      { signal },
    );
  }

  /** POST /projects/:pid/conversations/import-manual → create from user-provided timeline entries. */
  importManual(
    projectId: string,
    input: ImportManualConversationInputV1,
    signal?: AbortSignal,
  ): Promise<CompleteConversationImportResultV1> {
    return coreRequest<CompleteConversationImportResultV1>(
      this.http,
      'POST',
      `/projects/${encodeURIComponent(projectId)}/conversations/import-manual`,
      { body: input, signal },
    );
  }

  /** Explicitly link an existing imported session to a ConnectedConversation. */
  linkSession(
    projectId: string,
    connectedConversationId: string,
    conversationSessionId: string,
    signal?: AbortSignal,
  ): Promise<ConversationIdentityChainV1> {
    return coreRequest<ConversationIdentityChainV1>(
      this.http,
      'POST',
      `/projects/${encodeURIComponent(projectId)}/connected-conversations/${encodeURIComponent(connectedConversationId)}/link-session`,
      { body: { conversationSessionId }, signal },
    );
  }

  /** GET /projects/:pid/receiver-binding → 当前 canonical active receiver。 */
  getReceiverBinding(
    projectId: string,
    signal?: AbortSignal,
  ): Promise<ProjectReceiverBindingV1> {
    return coreRequest<ProjectReceiverBindingV1>(
      this.http,
      'GET',
      `/projects/${encodeURIComponent(projectId)}/receiver-binding`,
      { signal },
    );
  }

  /** GET .../connected-conversations/:cid/identity → 身份链；404 → undefined（不猜）。 */
  getIdentity(
    projectId: string,
    connectedConversationId: string,
    signal?: AbortSignal,
  ): Promise<ConversationIdentityChainV1 | undefined> {
    return this.getOrUndefined<ConversationIdentityChainV1>(
      `/projects/${encodeURIComponent(projectId)}/connected-conversations/${encodeURIComponent(connectedConversationId)}/identity`,
      signal,
    );
  }

  /** GET .../connected-conversations/:cid/reach → 可达性；404 → undefined。 */
  getReach(
    projectId: string,
    connectedConversationId: string,
    signal?: AbortSignal,
  ): Promise<ConversationReachResultV0 | undefined> {
    return this.getOrUndefined<ConversationReachResultV0>(
      `/projects/${encodeURIComponent(projectId)}/connected-conversations/${encodeURIComponent(connectedConversationId)}/reach`,
      signal,
    );
  }

  /** GET .../connected-conversations/:cid/work-view → T6 聚合（identity-only 也返回 200 partial）。 */
  getWorkView(
    projectId: string,
    connectedConversationId: string,
    signal?: AbortSignal,
  ): Promise<ConversationWorkViewAggregateV1 | undefined> {
    return this.getOrUndefined<ConversationWorkViewAggregateV1>(
      `/projects/${encodeURIComponent(projectId)}/connected-conversations/${encodeURIComponent(connectedConversationId)}/work-view`,
      signal,
    );
  }

  private async getOrUndefined<T>(path: string, signal?: AbortSignal): Promise<T | undefined> {
    try {
      return await coreRequest<T>(this.http, 'GET', path, { signal });
    } catch (error: unknown) {
      const status = (error as { status?: number }).status;
      if (status === 404) return undefined;
      throw error;
    }
  }
}
