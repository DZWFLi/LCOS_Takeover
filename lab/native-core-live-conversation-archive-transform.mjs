import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const importerSource = 'lcos/apps/local-core/src/conversation-import-service.ts'
const continuationSource = 'lcos/apps/local-core/src/conversation-continuation-service.ts'
const collaborationSource = 'lcos/apps/local-core/src/routes/collaboration.ts'
const conversationRoutesSource = 'lcos/apps/local-core/src/routes/conversations.ts'

function original(source, sourcePath, relative, marker) {
  if (typeof source !== 'string' || typeof sourcePath !== 'string'
    || path.resolve(sourcePath).toLowerCase() !== path.resolve(root, relative).toLowerCase())
    throw new Error('Live archive adaptation requires its exact original source owner.')
  return source.includes(marker) ? null : source.replaceAll('\r\n', '\n')
}
function once(source, before, after) {
  if (source.split(before).length !== 2) throw new Error('The original live archive producer seam changed; no original source was written.')
  return source.replace(before, after)
}

const archiveMethod = String.raw`
  /** native-core-live-archive: the original Core timeline owner also owns its
   * source archive. This is Core realtime evidence, never a provider export or
   * a claim to provider events that were not returned to Core. */
  async reconcileContinuationArchive(projectId: string, conversationId: string): Promise<{ readonly sourceContentHash: string; readonly sourcePath: string; readonly messageCount: number } | undefined> {
    const readSnapshot = () => {
      const row = this.#database.prepare('SELECT * FROM conversation_sessions WHERE id=? AND project_id=?').get(conversationId, projectId) as Row | undefined
      if (row === undefined) throw new Error('Conversation not found.')
      if (row.conversation_artifact_id != null || row.conversation_view_id != null) return undefined
      const origin = json<Record<string, unknown>>(row.origin_meta_json, {})
      const present = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '' && value.trim() === value
      const liveKeys = ['continuationExternalSessionId', 'continuationProvider', 'continuationThreadId', 'continuationTransportSessionId', 'continuationAgentletId'] as const
      if (!liveKeys.every(key => present(origin[key])) || origin.continuationRuntimeScope !== projectId) return undefined
      if (origin.continuationProvider !== String(row.provider)) throw new Error('实时记录与原对话来源不一致；原归档保留。')
      const connected = this.#repository.listConnectedConversations(projectId).filter(item => item.conversationSessionId === conversationId)
      if (connected.length !== 1 || connected[0]!.conversationRef !== origin.continuationExternalSessionId || connected[0]!.provider !== row.provider)
        throw new Error('实时对话没有唯一可核的原连接；原归档保留。')
      const messages = this.#mapMessages(this.#database.prepare('SELECT * FROM conversation_messages WHERE session_id=? ORDER BY seq').all(conversationId) as Row[])
      if (messages.length !== Number(row.message_count) || messages.some((message, index) => message.seq !== index || message.sessionId !== conversationId))
        throw new Error('实时消息尚未连续保存；没有生成不完整归档。')
      const journals = [...this.#repository.listContinuationOperationJournals(projectId)]
        .filter(journal => journal.connectedConversationId === connected[0]!.id && journal.provider === row.provider)
        .sort((a, b) => a.operationId.localeCompare(b.operationId))
      const sourcesFor = (messageId: string) => journals.flatMap(journal => (journal.promptReceipts ?? [])
        .filter(receipt => receipt.messageId === messageId)
        .map(receipt => ({ operationId: journal.operationId, provider: journal.provider, runtimeThreadId: journal.runtimeThreadId,
          externalEvidence: journal.externalEvidence, promptReceipt: receipt })))
      const messageKey = (message: ConversationMessageV1): string | undefined => {
        const match = /^continuation-message:(.*):(user|assistant)$/.exec(message.id)
        return match && message.sourceEventId === match[1] + ':' + match[2] ? match[1] : undefined
      }
      const records = messages.map(message => {
        const messageId = messageKey(message)
        const contextSources = messageId === undefined ? [] : sourcesFor(messageId)
        if (message.eventKind !== 'continuation_prompt_pending' && messageId !== undefined) {
          const confirmed = contextSources.filter(source => source.promptReceipt.sendReceipt?.outcome === 'sent')
          if (confirmed.length !== 1 || (message.role === 'assistant' && confirmed[0]!.promptReceipt.sendReceipt!.responseText?.trim() !== message.contentText))
            throw new Error('已保存实时消息缺少一致的原发送回执；没有猜测或重建对话。')
        }
        return { type: 'core_message' as const, message, contextSources }
      })
      const identity = { projectId, conversationId, provider: String(row.provider),
        externalSessionId: origin.continuationExternalSessionId, threadId: origin.continuationThreadId,
        agentletId: origin.continuationAgentletId, runtimeScope: origin.continuationRuntimeScope }
      const header = { type: 'session_meta', producer: 'lcos-core-realtime', identity, originMeta: origin,
        createdAt: String(row.created_at), messageCount: messages.length,
        coverage: 'Core-saved messages and original continuation context receipts; not unreturned provider internal events.' }
      return { row, messages, records, journals, sourcesFor, messageKey, header }
    }
    const snapshot = readSnapshot()
    if (snapshot === undefined) return undefined // Imported/manual/provider raw sources are never rebuilt.
    const project = this.#repository.getProject(projectId)
    if (project === undefined || basename(conversationId) !== conversationId) throw new Error('Conversation project is unavailable.')
    const projectRoot = await realpath(project.rootPath)
    const sourceDir = resolve(project.rootPath, '.creative-os', 'conversations', conversationId)
    let directory = projectRoot
    for (const part of ['.creative-os', 'conversations', conversationId]) {
      directory = join(directory, part)
      await mkdir(directory, { recursive: false }).catch((error: unknown) => {
        if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST')) throw error
      })
      directory = await realpath(directory)
      if (!isInside(projectRoot, directory)) throw new Error('实时归档目录越过原项目边界；没有写入。')
    }
    if (directory !== await realpath(sourceDir)) throw new Error('实时归档目录与原项目不一致。')
    const sourceName = 'core-realtime-conversation.jsonl'
    const currentPath = snapshot.row.source_path == null ? undefined : String(snapshot.row.source_path)
    const currentHash = snapshot.row.source_content_hash == null ? undefined : String(snapshot.row.source_content_hash)
    if ((currentPath === undefined) !== (currentHash === undefined)
      || (currentPath === undefined && snapshot.row.source_file_name != null)) throw new Error('实时归档来源记录不完整；原消息保留。')
    const released: Record<string, unknown>[] = []
    let previousText: string | undefined
    if (currentPath !== undefined) {
      if (snapshot.row.source_file_name !== sourceName || !isInside(directory, await realpath(currentPath)))
        throw new Error('这份来源不是原 Core 实时归档；没有覆盖原始文件。')
      await this.#inspectStoredContextSource(projectId, conversationId)
      previousText = await readFile(currentPath, 'utf8')
      if (sha256(previousText) !== currentHash) throw new Error('原实时归档已改变；没有用规范化文字覆盖损坏来源。')
      let previous: Record<string, unknown>[]
      try { previous = previousText.trimEnd().split('\n').map(line => JSON.parse(line) as Record<string, unknown>) }
      catch { throw new Error('原实时归档含无法核对的记录；原文件保留。') }
      if (previous[0]?.type !== 'session_meta' || previous[0]?.producer !== 'lcos-core-realtime'
        || JSON.stringify(previous[0]?.identity) !== JSON.stringify(snapshot.header.identity))
        throw new Error('原实时归档与当前对话身份不一致；原文件保留。')
      const stableMessage = (message: ConversationMessageV1) => {
        const { pinnedAsDecision: _pin, decisionArtifactId: _decision, ...content } = message
        return { ...content, eventKind: content.eventKind === 'continuation_prompt_pending' ? 'user_message' : content.eventKind }
      }
      for (const record of previous.slice(1)) {
        if (record.type === 'core_prompt_released') { released.push(record); continue }
        if (record.type !== 'core_message' || !record.message || typeof record.message !== 'object')
          throw new Error('原实时归档包含未知记录；没有丢弃其内容。')
        const oldMessage = record.message as unknown as ConversationMessageV1
        const current = snapshot.records.find(item => item.message.id === oldMessage.id)
        if (current === undefined) {
          const messageId = snapshot.messageKey(oldMessage)
          const failed = messageId === undefined ? [] : snapshot.sourcesFor(messageId).filter(source =>
            ['failed', 'unsupported'].includes((source.promptReceipt.sendReceipt ?? source.promptReceipt.receipt).outcome))
          if (oldMessage.eventKind !== 'continuation_prompt_pending' || failed.length !== 1)
            throw new Error('原归档已有消息从实时记录中缺失；没有用新快照掩盖差异。')
          released.push({ type: 'core_prompt_released', message: oldMessage, contextSources: failed })
          continue
        }
        if (JSON.stringify(stableMessage(oldMessage)) !== JSON.stringify(stableMessage(current.message)))
          throw new Error('原归档已有消息正文或附件发生冲突；没有覆盖原始内容。')
        const oldSources = Array.isArray(record.contextSources) ? record.contextSources : []
        for (const oldSource of oldSources as { operationId: string; promptReceipt: { contextResolution?: unknown; orderedReferences?: unknown; explicitReferences?: unknown; sendReceipt?: { outcome?: string } } }[]) {
          const currentSource = current.contextSources.find(source => source.operationId === oldSource.operationId)
          if (currentSource === undefined || ['contextResolution', 'orderedReferences', 'explicitReferences'].some(key =>
            oldSource.promptReceipt[key as 'contextResolution'] !== undefined
            && JSON.stringify(oldSource.promptReceipt[key as 'contextResolution']) !== JSON.stringify(currentSource.promptReceipt[key as 'contextResolution'])))
            throw new Error('原归档的上下文来源已改变；原引用与文件保留。')
          if (oldSource.promptReceipt.sendReceipt?.outcome === 'sent'
            && JSON.stringify(oldSource.promptReceipt.sendReceipt) !== JSON.stringify(currentSource.promptReceipt.sendReceipt))
            throw new Error('原归档的已发送回执发生冲突；没有改写已保存对话。')
        }
      }
    }
    const text = [snapshot.header, ...released, ...snapshot.records].map(record => JSON.stringify(record)).join('\n') + '\n'
    if (Buffer.byteLength(text, 'utf8') > MAX_IMPORT_BYTES) throw new Error('实时归档超过原会话文件额度；本次未截断保存。')
    const comparable = (value: typeof snapshot | undefined) => value === undefined ? undefined :
      JSON.stringify({ row: value.row, messages: value.messages, journals: value.journals })
    if (text === previousText) {
      if (comparable(readSnapshot()) !== comparable(snapshot)) throw new Error('实时记录在归档核对期间已更新；请沿原操作重试。')
      return { sourceContentHash: currentHash!, sourcePath: currentPath!, messageCount: snapshot.messages.length }
    }
    const sourceContentHash = sha256(text) // Existing archive hash and source_* columns; no new identity/hash scheme.
    const candidate = join(directory, 'core-live-' + randomUUID() + '.jsonl')
    let committed = false
    try {
      const output = await open(candidate, 'wx', 0o600)
      try { await output.writeFile(text, 'utf8'); await output.sync() } finally { await output.close() }
      if (sha256(await readFile(candidate)) !== sourceContentHash) throw new Error('实时归档写入未能读回核对；原来源保留。')
      this.#database.exec('BEGIN IMMEDIATE;')
      try {
        const current = readSnapshot()
        if (comparable(current) !== comparable(snapshot)) throw new Error('实时记录在归档期间已更新；请沿原操作重试，未覆盖新消息。')
        const result = this.#database.prepare('UPDATE conversation_sessions SET source_content_hash=?, source_file_name=?, source_path=? WHERE id=? AND project_id=? AND source_path IS ? AND source_content_hash IS ?')
          .run(sourceContentHash, sourceName, candidate, conversationId, projectId, snapshot.row.source_path ?? null, snapshot.row.source_content_hash ?? null)
        if (Number(result.changes) !== 1) throw new Error('实时归档来源已经更新；没有覆盖其他提交。')
        this.#database.exec('COMMIT;'); committed = true
      } catch (error: unknown) { this.#database.exec('ROLLBACK;'); throw error }
      return { sourceContentHash, sourcePath: candidate, messageCount: snapshot.messages.length }
    } finally {
      if (!committed) await rm(candidate, { force: true }).catch(() => {})
    }
  }
`

export function transformNativeCoreLiveConversationArchiveImporter(source, { sourcePath } = {}) {
  let next = original(source, sourcePath, importerSource, 'native-core-live-archive:')
  if (next === null) return source
  next = once(next, 'readFile, rename, rm, writeFile', 'readFile, realpath, rename, rm, writeFile')
  next = once(next, '  close(): void {', archiveMethod + '\n  close(): void {')
  return once(next, '  async inspectContextSource(projectId: string, conversationId: string): Promise<{ readonly sourceContentHash: string; readonly unsupportedMediaKinds: readonly string[] }> {', [
    '  async inspectContextSource(projectId: string, conversationId: string): Promise<{ readonly sourceContentHash: string; readonly unsupportedMediaKinds: readonly string[] }> {',
    '    await this.reconcileContinuationArchive(projectId, conversationId)',
    '    return this.#inspectStoredContextSource(projectId, conversationId)',
    '  }',
    '',
    '  async #inspectStoredContextSource(projectId: string, conversationId: string): Promise<{ readonly sourceContentHash: string; readonly unsupportedMediaKinds: readonly string[] }> {',
  ].join('\n'))
}

export function transformNativeCoreLiveConversationArchiveContinuation(source, { sourcePath } = {}) {
  let next = original(source, sourcePath, continuationSource, 'native-core-live-archive-bind')
  if (next === null) return source
  next = once(next, '        return projectContinuationRecoveryV1(bound.journal, CONTINUATION_CAPABILITIES)', [
    '        // native-core-live-archive-bind: identity remains confirmed if local archive persistence needs retry.',
    '        const archive = this.conversationReader as typeof this.conversationReader & { reconcileContinuationArchive?: (projectId: string, conversationId: string) => Promise<unknown> }',
    '        if (archive?.reconcileContinuationArchive && bound.connectedConversation.conversationSessionId !== undefined)',
    '          await archive.reconcileContinuationArchive(projectId, bound.connectedConversation.conversationSessionId)',
    '        return projectContinuationRecoveryV1(bound.journal, CONTINUATION_CAPABILITIES)',
  ].join('\n'))
  return once(next, '        return this.advanceStep(projectId, operationId, {\n          step: \'core_bind\',\n          outcome: \'failed\',', [
    '        if (this.metadata.getContinuationOperationJournal(projectId, operationId)?.steps.core_bind === "confirmed") throw error',
    '        return this.advanceStep(projectId, operationId, {',
    "          step: 'core_bind',",
    "          outcome: 'failed',",
  ].join('\n'))
}

export function transformNativeCoreLiveConversationArchiveCollaboration(source, { sourcePath } = {}) {
  let next = original(source, sourcePath, collaborationSource, 'native-core-live-archive-send')
  if (next === null) return source
  next = once(next, '      const reserved = ctx.conversations.reserveContinuationPrompt(', [
    '      // native-core-live-archive-send: repair an old committed turn before any provider boundary.',
    '      await ctx.conversations.reconcileContinuationArchive(projectId, connected.conversationSessionId)',
    '      const reserved = ctx.conversations.reserveContinuationPrompt(',
  ].join('\n'))
  next = once(next, '          ctx.conversations.releaseContinuationPrompt(projectId, connected.conversationSessionId, raw.messageId)', [
    '          ctx.conversations.releaseContinuationPrompt(projectId, connected.conversationSessionId, raw.messageId)',
    '          await ctx.conversations.reconcileContinuationArchive(projectId, connected.conversationSessionId)',
  ].join('\n'))
  return once(next, '      ctx.continuation.publishTimelineAppended(projectId, connectedConversationId, raw.messageId)', [
    '      await ctx.conversations.reconcileContinuationArchive(projectId, connected.conversationSessionId)',
    '      ctx.continuation.publishTimelineAppended(projectId, connectedConversationId, raw.messageId)',
  ].join('\n'))
}

export function transformNativeCoreLiveConversationArchiveRoutes(source, { sourcePath } = {}) {
  let next = original(source, sourcePath, conversationRoutesSource, 'native-core-live-archive-refresh')
  if (next === null) return source
  return once(next, '    try { sendJson(response, 200, { ok: true, value: service.refreshSections(projectId, decodeURIComponent(conversationSectionsRefreshMatch[2] ?? \'\')) }) }', [
    '    // native-core-live-archive-refresh: existing maintenance action uses the same archive owner.',
    '    try {',
    '      await service.reconcileContinuationArchive(projectId, decodeURIComponent(conversationSectionsRefreshMatch[2] ?? ""))',
    '      sendJson(response, 200, { ok: true, value: service.refreshSections(projectId, decodeURIComponent(conversationSectionsRefreshMatch[2] ?? "")) })',
    '    }',
  ].join('\n'))
}

/** Apply after the existing mixed Scope and live identity transforms. */
export function createNativeCoreLiveConversationArchiveTransforms() {
  return {
    [importerSource]: transformNativeCoreLiveConversationArchiveImporter,
    [continuationSource]: transformNativeCoreLiveConversationArchiveContinuation,
    [collaborationSource]: transformNativeCoreLiveConversationArchiveCollaboration,
    [conversationRoutesSource]: transformNativeCoreLiveConversationArchiveRoutes,
  }
}
