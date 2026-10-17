import type { ConversationReachItemV0, OrderedRunReferenceV2 } from '@local-creative-os/contracts'
import type { SqliteMetadataRepository } from './metadata-repository.js'

/** Derived from existing conversation_context relations; no new persistence owner. */
function boundRelations(metadata: SqliteMetadataRepository, projectId: string, conversationId: string) {
  const connected = metadata.getConnectedConversation(projectId, conversationId)
  if (connected === undefined) return []
  const keys = new Set([conversationId, connected.conversationRef])
  if (connected.conversationSessionId !== undefined) {
    keys.add(connected.conversationSessionId)
    const session = metadata.getConversationSessionRuntimeIdentity(projectId, connected.conversationSessionId)
    if (session?.conversationArtifactId !== undefined) keys.add(session.conversationArtifactId)
  }
  return [...metadata.getRelations(projectId)]
    .filter((relation) => keys.has(String(relation.sourceEntityId)) && ['conversation_context', 'conversation-context'].includes(relation.kind))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || String(a.id).localeCompare(String(b.id)))
}

export function readBoundConversationContext(metadata: SqliteMetadataRepository, projectId: string, conversationId: string): readonly ConversationReachItemV0[] {
  const result: ConversationReachItemV0[] = []
  for (const relation of boundRelations(metadata, projectId, conversationId)) {
    const id = String(relation.targetEntityId)
    let entityRef: ConversationReachItemV0['entityRef'] | undefined
    if (relation.targetEntityType === 'view') {
      const view = metadata.getArtifactView(id)
      const artifact = view === undefined ? undefined : metadata.getArtifact(String(view.artifactId))
      if (artifact !== undefined && String(artifact.projectId) === projectId) entityRef = { type: 'artifact', id: String(artifact.id), viewId: id }
    } else if (relation.targetEntityType === 'artifact') {
      if (String(metadata.getArtifact(id)?.projectId ?? '') === projectId) entityRef = { type: 'artifact', id }
    } else if (relation.targetEntityType === 'note') {
      if (String(metadata.getNote(id)?.projectId ?? '') === projectId) entityRef = { type: 'note', id }
    } else if (relation.targetEntityType === 'scope') {
      if (metadata.getScopes(projectId).some((scope) => String(scope.id) === id)) entityRef = { type: 'scope', id }
    } else if (relation.targetEntityType === 'workspace') {
      if (String(metadata.getWorkspace(id)?.projectId ?? '') === projectId) entityRef = { type: 'workspace', id }
    }
    if (entityRef !== undefined) result.push({ entityRef, tier: 'bound', reason: 'explicit conversation_context binding', createdAt: relation.createdAt, sourceRef: `relation:${String(relation.id)}` })
  }
  return result
}

/** Explicit per-message choices win over equivalent persistent defaults. */
export function mergeBoundConversationContext(metadata: SqliteMetadataRepository, projectId: string, conversationId: string | null, explicit: readonly OrderedRunReferenceV2[]): { references: readonly OrderedRunReferenceV2[]; unsupported?: string } {
  if (conversationId === null) return { references: explicit }
  const references = [...explicit]
  const bound = readBoundConversationContext(metadata, projectId, conversationId)
  if (bound.length !== boundRelations(metadata, projectId, conversationId).length) {
    return { references, unsupported: '会话绑定的材料已缺失或不属于当前项目，请修复或移除该绑定后再发送。' }
  }
  const key = (reference: OrderedRunReferenceV2): string => {
    const ref = reference.ref
    if (ref.type === 'artifact') return `artifact:${ref.artifactId}:${ref.revisionId ?? metadata.getArtifact(ref.artifactId)?.currentRevisionId ?? ''}`
    if (ref.type === 'view') {
      const view = metadata.getArtifactView(ref.viewId)
      if (view !== undefined) return `artifact:${String(view.artifactId)}:${view.revisionId ?? metadata.getArtifact(String(view.artifactId))?.currentRevisionId ?? ''}`
    }
    return JSON.stringify(ref)
  }
  const seen = new Set(references.map(key))
  let order = references.reduce((maximum, value) => Math.max(maximum, value.order), -1) + 1
  for (const item of bound) {
    const entity = item.entityRef
    let ref: OrderedRunReferenceV2['ref']
    if (entity.type === 'artifact') ref = entity.viewId === undefined ? { type: 'artifact', artifactId: entity.id } : { type: 'view', viewId: entity.viewId }
    else if (entity.type === 'scope') ref = { type: 'scope', scopeId: entity.id }
    else if (entity.type === 'workspace') ref = { type: 'workspace', workspaceId: entity.id }
    else return { references, unsupported: `会话上下文已保存，但当前发送通道尚不支持旧式${entity.type === 'note' ? '笔记' : entity.type}，本次未发送。` }
    const candidate = { order, ref }
    const identity = key(candidate)
    if (seen.has(identity)) continue
    seen.add(identity); references.push(candidate); order += 1
  }
  return { references }
}
