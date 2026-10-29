import type { AssemblyApplyRequestV1, AssemblyApplyResultV1, AssemblyTargetRefV1 } from '../../lcos/packages/contracts/src/assembly.js'
import { CoreAssemblyClient } from '../../lcos/apps/web-gen2/src/backend/assembly.js'
import { CoreConversationClient } from '../../lcos/apps/web-gen2/src/backend/conversations.js'
import { CoreProjectClient } from '../../lcos/apps/web-gen2/src/backend/projects.js'
import { HttpClient } from '../../lcos/apps/web-gen2/src/backend/client.js'
import type { LcosNodeRefV1 } from './node-lifecycle.js'

export interface NativeContextReferenceNodeV1 {
  /** Current Huabu node ID; selection identity is never used as a Core ID. */
  readonly nodeId: string
  /** Only the original image/text carrier types are accepted by this port. */
  readonly type: string
  /** Current Canvas node data, including the exact persisted node-lifecycle receipt. */
  readonly data?: { readonly lcos_ref?: unknown }
}

export type NativeContextReferenceTargetV1 =
  | { readonly kind: 'conversation'; readonly id: string; readonly projectId: string }
  /** `id` is the exact Core Scope ID; only an existing kind=context scope is accepted. */
  | { readonly kind: 'context'; readonly id: string; readonly projectId: string }

export interface NativeContextReferenceSelectionV1 {
  /** Project and selected nodes are read from the current Canvas owner at preview time. */
  readonly projectId: string
  /** Already-selected current Canvas nodes, not DataTransfer payloads or saved selection state. */
  readonly selectedNodes: readonly NativeContextReferenceNodeV1[]
  readonly target: NativeContextReferenceTargetV1
}

export type NativeContextReferenceRejectionCode =
  | 'project-mismatch'
  | 'empty-selection'
  | 'ambiguous-selection'
  | 'wrong-node-type'
  | 'missing-view-reference'
  | 'invalid-lcos-reference'
  | 'incompatible-target'
  | 'target-not-found'
  | 'conversation-not-confirmed'
  | 'conversation-not-linked'
  | 'binding-mismatch'

export type NativeContextReferencePreviewV1 =
  | {
      readonly status: 'ready'
      readonly projectId: string
      readonly sourceNodeIds: readonly string[]
      readonly request: AssemblyApplyRequestV1
    }
  | {
      readonly status: 'rejected'
      readonly projectId: string
      readonly code: NativeContextReferenceRejectionCode
      readonly message: string
    }
  | {
      readonly status: 'error'
      readonly projectId: string
      readonly code: string
      readonly message: string
      readonly httpStatus?: number
    }

export interface NativeContextReferencePortOptions {
  /** Existing Core HTTP client; its baseUrl must be an explicit loopback origin. No token/env default is added. */
  readonly http: HttpClient
  readonly projectId: string
}

interface ExactLcosReference extends LcosNodeRefV1 {}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isLoopbackHttpOrigin(value: string): boolean {
  try {
    const url = new URL(value)
    const loopback = url.hostname === '127.0.0.1' || url.hostname === 'localhost'
      || url.hostname === '::1' || url.hostname === '[::1]'
    const registeredCorePrefix = url.pathname === '/api/lcos/core'
      && value === `${url.origin}/api/lcos/core`
    const originOnly = url.pathname === '/' && value === url.origin
    return url.protocol === 'http:' && loopback && url.username === '' && url.password === ''
      && url.search === '' && url.hash === '' && (originOnly || registeredCorePrefix)
  } catch {
    return false
  }
}

function parseExactLcosReference(value: unknown): ExactLcosReference | undefined {
  if (!isRecord(value) || value.version !== 1
    || (value.entityType !== 'artifact' && value.entityType !== 'view')
    || !nonEmpty(value.entityId) || !nonEmpty(value.artifactId)
    || !nonEmpty(value.artifactViewId) || !nonEmpty(value.revisionId)) return undefined
  if (value.entityType === 'artifact' && value.entityId !== value.artifactId) return undefined
  if (value.entityType === 'view' && value.entityId !== value.artifactViewId) return undefined
  return value as unknown as ExactLcosReference
}

function rejected(
  projectId: string,
  code: NativeContextReferenceRejectionCode,
  message: string,
): NativeContextReferencePreviewV1 {
  return { status: 'rejected', projectId, code, message }
}

function readFailure(projectId: string, error: unknown): NativeContextReferencePreviewV1 {
  const candidate = error as { code?: unknown; message?: unknown; status?: unknown }
  return {
    status: 'error',
    projectId,
    code: typeof candidate?.code === 'string' ? candidate.code : 'CORE_READ_ERROR',
    message: error instanceof Error ? error.message : String(error),
    ...(typeof candidate?.status === 'number' ? { httpStatus: candidate.status } : {}),
  }
}

/**
 * Narrow bridge from the current Huabu selection to existing Core Assembly.
 * Preview performs canonical reads only. `apply` is the sole POST boundary and
 * returns the untouched AssemblyApplyResultV1 receipt from Core.
 */
export function createNativeContextReferencePort(options: NativeContextReferencePortOptions) {
  if (!nonEmpty(options.projectId)) throw new Error('projectId is required.')
  if (!isLoopbackHttpOrigin(options.http.config.baseUrl)) {
    throw new Error('Core HttpClient must use an explicit loopback HTTP origin.')
  }

  const projectId = options.projectId
  const assembly = new CoreAssemblyClient(options.http)
  const projects = new CoreProjectClient(options.http)
  const conversations = new CoreConversationClient(options.http)
  const readyRequests = new WeakMap<object, AssemblyApplyRequestV1>()

  return {
    async preview(input: NativeContextReferenceSelectionV1, signal?: AbortSignal): Promise<NativeContextReferencePreviewV1> {
      if (!input || input.projectId !== projectId || input.target?.projectId !== projectId) {
        return rejected(projectId, 'project-mismatch', '当前 Canvas、目标与 Core 项目必须完全一致。')
      }
      if (!Array.isArray(input.selectedNodes) || input.selectedNodes.length === 0) {
        return rejected(projectId, 'empty-selection', '请从当前画布选中图文材料。')
      }

      const sourceNodeIds: string[] = []
      const sourceRefs: { readonly kind: 'artifactView'; readonly id: string }[] = []
      const seenNodeIds = new Set<string>()
      const seenViewIds = new Set<string>()
      for (const node of input.selectedNodes) {
        if (!isRecord(node) || !nonEmpty(node.nodeId) || seenNodeIds.has(node.nodeId)) {
          return rejected(projectId, 'ambiguous-selection', '当前选区包含缺少或重复的画布节点身份。')
        }
        seenNodeIds.add(node.nodeId)
        if (node.type !== 'text' && node.type !== 'image') {
          return rejected(projectId, 'wrong-node-type', `节点 ${node.nodeId} 不是受支持的图文材料。`)
        }
        const data = isRecord(node.data) ? node.data : undefined
        if (!data || data.lcos_ref === undefined) {
          return rejected(projectId, 'missing-view-reference', `节点 ${node.nodeId} 没有当前 Core lcos_ref。`)
        }
        const ref = parseExactLcosReference(data.lcos_ref)
        if (ref === undefined) {
          return rejected(projectId, 'invalid-lcos-reference', `节点 ${node.nodeId} 的 lcos_ref 不完整或内部身份不一致。`)
        }
        if (seenViewIds.has(ref.artifactViewId)) {
          return rejected(projectId, 'ambiguous-selection', `多个选中节点映射到同一个 ArtifactView：${ref.artifactViewId}。`)
        }
        seenViewIds.add(ref.artifactViewId)
        sourceNodeIds.push(node.nodeId)
        sourceRefs.push({ kind: 'artifactView', id: ref.artifactViewId })
      }

      if (!input.target || !nonEmpty(input.target.id)
        || (input.target.kind !== 'context' && input.target.kind !== 'conversation')) {
        return rejected(projectId, 'incompatible-target', '目标必须是当前项目中真实的 Saved Context 或已确认 Conversation。')
      }

      try {
        const graph = await projects.getProjectGraph(projectId)
        if (graph === undefined || String(graph.project.id) !== projectId) {
          return rejected(projectId, 'target-not-found', 'Core 没有返回当前项目的 canonical graph。')
        }

        // A local binding whose view exists in this project must agree on its
        // Artifact owner. A missing/foreign exact view is left to Assembly so
        // Core returns its real item-level failure instead of us inventing one.
        for (const node of input.selectedNodes) {
          const ref = parseExactLcosReference(isRecord(node.data) ? node.data.lcos_ref : undefined)
          if (!ref) continue
          const view = graph.artifactViews.find((candidate) => String(candidate.id) === ref.artifactViewId)
          if (view !== undefined && String(view.artifactId) !== ref.artifactId) {
            return rejected(projectId, 'binding-mismatch', `节点 ${node.nodeId} 的 ArtifactView 与 Artifact lcos_ref 不一致。`)
          }
        }

        let targetRef: AssemblyTargetRefV1
        if (input.target.kind === 'context') {
          const matchingScopes = graph.scopes.filter((scope) => String(scope.id) === input.target.id)
          if (matchingScopes.length !== 1 || String(matchingScopes[0]?.projectId) !== projectId) {
            return rejected(projectId, 'target-not-found', 'Saved Context ID 不属于当前 Core 项目。')
          }
          if (matchingScopes[0]?.kind !== 'context') {
            return rejected(projectId, 'incompatible-target', '目标 Scope 的 Core kind 不是 context。')
          }
          targetRef = { kind: 'context', id: String(matchingScopes[0].id) }
        } else {
          const matchingConversations = (await conversations.listConnectedConversations(projectId, signal))
            .filter((conversation) => conversation.id === input.target.id && conversation.projectId === projectId)
          if (matchingConversations.length !== 1) {
            return rejected(projectId, 'conversation-not-confirmed', 'Conversation ID 必须精确命中当前项目的 ConnectedConversation。')
          }
          const identity = await conversations.getIdentity(projectId, input.target.id, signal)
          if (identity === undefined || identity.projectId !== projectId
            || identity.connectedConversation.id !== input.target.id
            || identity.connectedConversation.projectId !== projectId) {
            return rejected(projectId, 'conversation-not-confirmed', 'Core 未确认该 Conversation 的 canonical 身份。')
          }
          if (!nonEmpty(identity.conversationArtifactId) || identity.conversationSession === undefined
            || identity.conversationSession.projectId !== projectId
            || identity.connectedConversation.conversationSessionId !== identity.conversationSession.id
            || identity.conversationSession.conversationArtifactId !== identity.conversationArtifactId) {
            return rejected(projectId, 'conversation-not-linked', 'Conversation 尚未显式链接到有 Artifact 端点的 ConversationSession。')
          }
          targetRef = { kind: 'conversation', id: identity.connectedConversation.id }
        }

        const request: AssemblyApplyRequestV1 = {
          schemaVersion: 1,
          projectId,
          sourceRefs: sourceRefs.map((sourceRef) => ({ ...sourceRef })),
          targetRef: { ...targetRef },
        }
        const preview: NativeContextReferencePreviewV1 = {
          status: 'ready',
          projectId,
          sourceNodeIds: [...sourceNodeIds],
          // Preview DTO is a detached display copy. apply uses the private
          // canonical request produced by this preview, not caller mutations.
          request: {
            ...request,
            sourceRefs: request.sourceRefs.map((sourceRef) => ({ ...sourceRef })),
            targetRef: { ...request.targetRef },
          },
        }
        readyRequests.set(preview, request)
        return preview
      } catch (error: unknown) {
        return readFailure(projectId, error)
      }
    },

    async apply(preview: NativeContextReferencePreviewV1, signal?: AbortSignal): Promise<AssemblyApplyResultV1> {
      if (!preview || typeof preview !== 'object' || preview.status !== 'ready') {
        throw new Error('Only a ready preview returned by this port can be applied.')
      }
      const request = readyRequests.get(preview)
      if (request === undefined) {
        throw new Error('Only a ready preview returned by this port can be applied.')
      }
      return assembly.apply(projectId, request, signal)
    },
  }
}
