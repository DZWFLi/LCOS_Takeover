import { artifactUtf8TextCapability, readArtifactTextContent } from '../../lcos/apps/local-core/src/search-artifact-body';
import type { ProjectGraphSnapshot, PresentationViewV0 } from '../../lcos/packages/contracts/src/index';
import type { ArtifactRevision, FileRecord } from '../../lcos/packages/domain/src/index';

type Awaitable<T> = T | Promise<T>;
type RecordValue = Record<string, any>;
export interface MixedScopeRef { readonly type: string; readonly id: string; readonly revisionId?: string }
export interface MixedScopeSource { readonly projectId: string; readonly scopeId: string; readonly presentationId?: string }
export interface MixedScopeNode {
  readonly ref: MixedScopeRef;
  readonly path: readonly string[];
  readonly title: string;
  readonly content?: string;
  /** The values actually read, not invented file identities for non-file members. */
  readonly source: Readonly<Record<string, unknown>>;
  readonly children: readonly MixedScopeNode[];
  readonly backReference?: readonly string[];
}
export interface MixedScopeEvidence {
  readonly ref: MixedScopeRef;
  readonly path: readonly string[];
  readonly title: string;
  readonly source: Readonly<Record<string, unknown>>;
  readonly content?: string;
  readonly backReference?: readonly string[];
}
export interface MixedScopeReading {
  readonly complete: true;
  readonly projectId: string;
  readonly scopeId: string;
  /** Existing transport anchor. For a whole multi-Presentation Workflow this
   * is the first real id; root.source.presentations carries every selected
   * group and its versions/steps, not a second domain entity or frozen input. */
  readonly presentationId: string;
  readonly root: MixedScopeNode;
  readonly text: string;
  readonly evidence: readonly MixedScopeEvidence[];
}
export interface MixedScopeReadPort {
  getGraph(projectId: string): Awaitable<ProjectGraphSnapshot | undefined>;
  listPresentations(projectId: string): Awaitable<readonly PresentationViewV0[]>;
  /** Must use the existing explicit ConnectedConversation -> archived session link. */
  resolveConversation(projectId: string, connectedConversationId: string): Awaitable<{ connected: RecordValue; session?: RecordValue } | undefined>;
  inspectConversationSource(projectId: string, sessionId: string): Awaitable<{ readonly sourceContentHash: string; readonly unsupportedMediaKinds: readonly string[] }>;
  getConversationMessages(sessionId: string, input: { offset: number; limit: number }): Awaitable<readonly RecordValue[]>;
  getRun(runId: string): Awaitable<RecordValue | undefined>;
  getRunReturns(runId: string): Awaitable<readonly RecordValue[]>;
  /** Must validate the exact bytes against the existing Revision/FileRecord content hash. */
  readTextFile(file: FileRecord, revision: { readonly contentHash: string }, limits?: { readonly maxCharacters: number }): Awaitable<string>;
}
export class MixedScopeReadError extends Error {
  constructor(readonly code: string, message: string, readonly path: readonly string[], readonly ref?: MixedScopeRef) {
    super(message); this.name = 'MixedScopeReadError';
  }
}
const clone = <T>(value: T): T => structuredClone(value);
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

/** This read operation either produces every selected member, or fails as one operation.
 * Repeated references stay repeated; only an ancestor cycle becomes an explicit back-reference. */
export async function readMixedScopeContext(input: MixedScopeSource, port: MixedScopeReadPort,
  limits: { readonly maxCharacters?: number; readonly maxItemCharacters?: number; readonly conversationPageSize?: number } = {}): Promise<MixedScopeReading> {
  const projectId = input.projectId, maxCharacters = limits.maxCharacters ?? 128_000;
  const maxItemCharacters = limits.maxItemCharacters ?? 200_000;
  const pageSize = Math.max(1, Math.min(1000, Math.floor(limits.conversationPageSize ?? 200)));
  const graph = clone(await port.getGraph(projectId));
  const presentations = clone(await port.listPresentations(projectId));
  const rootRef = { type: 'scope', id: input.scopeId };
  const fail = (code: string, message: string, path: readonly string[], ref?: MixedScopeRef): never => {
    throw new MixedScopeReadError(code, `${message}；原引用保留，未发送半份内容。`, path, ref);
  };
  if (!graph || String(graph.project.id) !== projectId) fail('project_missing', '所选项目暂不可读取', [], rootRef);
  const selectedGraph = graph!;
  const checks: { path: readonly string[]; ref: MixedScopeRef; expected: unknown; read: (graph: ProjectGraphSnapshot, presentations: readonly PresentationViewV0[]) => unknown }[] = [];
  const postChecks: (() => Promise<void>)[] = [];
  const evidence: MixedScopeEvidence[] = [];
  let characterCount = 0;
  const guardSize = (value: unknown, path: readonly string[], ref: MixedScopeRef) => {
    characterCount += JSON.stringify(value).length;
    if (characterCount > maxCharacters) fail('context_budget_exceeded', '整份上下文超过本次文本额度，请缩小选择；没有自动截断成员', path, ref);
  };
  const capture = (path: readonly string[], ref: MixedScopeRef, read: (graph: ProjectGraphSnapshot, presentations: readonly PresentationViewV0[]) => unknown) => {
    const expected = clone(read(selectedGraph, presentations)); checks.push({ path, ref, expected, read }); return expected;
  };
  const one = (rows: readonly any[] | undefined, id: string, path: readonly string[], ref: MixedScopeRef, owned = false) => {
    const matches = (rows ?? []).filter(row => String(row.id) === id);
    if (matches.length !== 1) return fail(matches.length > 1 ? 'identity_duplicate' : 'member_missing', '所选成员缺失或身份重复', path, ref);
    if (owned && String(matches[0].projectId) !== projectId) return fail('member_outside_project', '所选成员不属于当前项目', path, ref);
    return matches[0];
  };
  const table = (key: keyof ProjectGraphSnapshot, ref: MixedScopeRef, path: readonly string[], owned = false) => {
    const rows = capture(path, ref, g => (g[key] as unknown as any[] ?? []).filter(row => String(row.id) === ref.id)) as any[];
    return one(rows, ref.id, path, ref, owned);
  };
  const finish = (node: MixedScopeNode): MixedScopeNode => {
    const row: MixedScopeEvidence = { ref: node.ref, path: node.path, title: node.title, source: node.source,
      ...(node.content === undefined ? {} : { content: node.content }), ...(node.backReference ? { backReference: node.backReference } : {}) };
    evidence.push(row); guardSize(row, node.path, node.ref); return node;
  };
  const readFile = async (file: FileRecord, expected: string, path: readonly string[], ref: MixedScopeRef) => {
    if (String(file.projectId) !== projectId || !['current', 'stale'].includes(file.availability) || String(file.observedHash) !== expected)
      return fail('content_stale', '所选文件与已存版本不一致或不可读取', path, ref);
    const capability = artifactUtf8TextCapability(file.mimeType);
    if (!capability.ok && capability.code === 'context_format_unsupported')
      return fail('content_type_unsupported', '这份内容含当前尚不能完整读取的文件类型，没有省略成员后发送', path, ref);
    try {
      const text = await port.readTextFile(file, { contentHash: expected }, { maxCharacters: maxItemCharacters });
      if (typeof text !== 'string') return fail('content_unavailable', '所选文件没有返回完整文本正文', path, ref);
      if (text.length > maxItemCharacters) return fail('context_budget_exceeded', '材料全文超过本次单文件文本额度；没有自动截断', path, ref);
      return text;
    }
    catch (error) {
      if (error instanceof MixedScopeReadError) throw error;
      return fail((error as any)?.code === 'context_budget_exceeded' ? 'context_budget_exceeded' : 'content_unavailable', error instanceof Error ? error.message : '所选文件暂不可读取', path, ref);
    }
  };
  const readHistory = async (session: RecordValue, path: readonly string[], ref: MixedScopeRef) => {
    if (session.status !== 'ready' || !Number.isSafeInteger(session.messageCount) || session.messageCount < 1)
      return fail('conversation_history_unavailable', '对话历史尚未完整导入', path, ref);
    const messages: RecordValue[] = [], ids = new Set<string>(), sequences = new Set<number>();
    for (let offset = 0; offset < session.messageCount; ) {
      const rows = clone(await port.getConversationMessages(session.id, { offset, limit: Math.min(pageSize, session.messageCount - offset) }));
      if (!rows.length || rows.length > Math.min(pageSize, session.messageCount - offset))
        return fail('conversation_history_incomplete', '对话历史分页不完整', path, ref);
      for (const row of rows) {
        if (row.sessionId !== session.id || typeof row.id !== 'string' || ids.has(row.id) || !Number.isSafeInteger(row.seq) || sequences.has(row.seq)
          || typeof row.contentText !== 'string' || !['user', 'assistant', 'tool', 'system', 'event'].includes(row.role)
          || row.seq !== messages.length || !Array.isArray(row.fileRefs))
          return fail('conversation_history_conflict', '对话历史身份、顺序或角色不一致', path, ref);
        ids.add(row.id); sequences.add(row.seq); messages.push(row);
      }
      offset += rows.length;
    }
    if ((await port.getConversationMessages(session.id, { offset: session.messageCount, limit: 1 })).length)
      return fail('conversation_history_changed', '读取期间对话历史已变化，请重新读取', path, ref);
    return messages;
  };
  const walk = async (ref: MixedScopeRef, path: readonly string[], ancestors: ReadonlyMap<string, readonly string[]>): Promise<MixedScopeNode> => {
    if (!ref || typeof ref.type !== 'string' || typeof ref.id !== 'string' || !ref.id)
      return fail('member_identity_invalid', '成员地址不完整', path, ref);
    const identity = JSON.stringify([ref.type, ref.id]), previous = ancestors.get(identity);
    if (previous) return finish({ ref, path, title: '回指已出现的上层内容', source: {}, children: [], backReference: previous });
    const next = new Map(ancestors); next.set(identity, path);
    const children = async (refs: readonly MixedScopeRef[], label: string) => {
      const rows: MixedScopeNode[] = [];
      for (const [index, child] of refs.entries()) rows.push(await walk(child, [...path, `${label}[${index}]:${child.type}:${child.id}`], next));
      return rows;
    };
    if (ref.type === 'scope') {
      const scope = table('scopes', ref, path, true);
      const matches = capture(path, ref, (_g, ps) => ps.filter(p => p.projectId === projectId && p.scopeId === ref.id
        && p.capability === scope.kind && (!(path.length === 1 && input.presentationId !== undefined) || p.id === input.presentationId))
        .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0)) as PresentationViewV0[];
      if (!matches.length || new Set(matches.map(presentation => presentation.id)).size !== matches.length
        || scope.kind !== 'workflow' && matches.length !== 1
        || scope.kind === 'context' && matches[0].id !== `presentation:context:${ref.id}`)
        return fail('presentation_ambiguous', '无法确认这份上下文的原 Presentation', path, ref);
      const presentationSource = (presentation: PresentationViewV0) => ({ id: presentation.id, version: presentation.version, updatedAt: presentation.updatedAt,
        memberViewIds: presentation.state.memberViewIds, memberEntityRefs: presentation.state.memberEntityRefs ?? [], ...(scope.kind === 'workflow' ? {
          actions: (presentation.state.workflowActions ?? []).map(action => ({ id: action.id, label: action.label, description: action.description, attachedViewIds: action.attachedViewIds })),
          actionEdges: presentation.state.workflowActionEdges ?? [], operators: presentation.state.workflowOperators ?? {} } : {}) });
      const memberRefs = (presentation: PresentationViewV0): MixedScopeRef[] => {
        const operators = presentation.state.workflowOperators ?? {};
        const refs: MixedScopeRef[] = [
          // Legacy structural markers are not materials. An actual View with
          // the same primary key still is, and must not disappear from a send.
          ...presentation.state.memberViewIds.filter(id => !(id in operators) || selectedGraph.artifactViews.some(view => String(view.id) === id)).map(id => ({ type: 'view', id })),
          ...(presentation.state.memberEntityRefs ?? []),
        ];
        if (scope.kind === 'workflow') {
          for (const action of presentation.state.workflowActions ?? []) {
            for (const id of action.attachedViewIds) refs.push({ type: 'view', id });
          }
          for (const operator of Object.values(operators)) for (const branch of operator.branches ?? []) if (branch.targetViewId) refs.push({ type: 'view', id: branch.targetViewId });
        }
        return refs;
      };
      const members: MixedScopeNode[] = [];
      if (matches.length === 1) members.push(...await children(memberRefs(matches[0]), 'member'));
      else for (const presentation of matches) {
        for (const [index, child] of memberRefs(presentation).entries()) members.push(await walk(child,
          [...path, `presentation:${presentation.id}`, `member[${index}]:${child.type}:${child.id}`], next));
      }
      // Existing transports retain one real Presentation id as the compatible
      // source anchor. For a whole multi-group method it is not a selection:
      // every source id/version and semantic step remains in the same evidence.
      return finish({ ref, path, title: scope.name, source: { scope: { id: scope.id, kind: scope.kind, name: scope.name, updatedAt: scope.updatedAt },
        presentation: presentationSource(matches[0]), ...(matches.length > 1 ? { presentations: matches.map(presentationSource) } : {}) },
        children: members });
    }
    if (ref.type === 'collection') {
      const collection = table('collections', ref, path, true);
      const membership = capture(path, ref, g => (g.collectionMemberships ?? []).filter(row => String(row.collectionId) === ref.id)) as any[];
      const relationIds = new Set<string>(), memberIds = new Set<string>();
      for (const row of membership) {
        const memberId = JSON.stringify(row.memberRef);
        if (!row.relationId || relationIds.has(String(row.relationId)) || memberIds.has(memberId)) return fail('membership_identity_duplicate', '集合成员关系身份缺失或重复', path, ref);
        relationIds.add(String(row.relationId)); memberIds.add(memberId);
      }
      return finish({ ref, path, title: collection.title, source: { collection, membership }, children: await children(membership.map(row => row.memberRef), 'member') });
    }
    if (ref.type === 'view' || ref.type === 'artifact') {
      let artifactId = ref.id, revisionId: string | undefined = ref.revisionId, view: any;
      if (ref.type === 'view') {
        view = table('artifactViews', ref, path);
        table('scopes', { type: 'scope', id: String(view.scopeId) }, path, true);
        artifactId = String(view.artifactId); revisionId = view.revisionId === undefined ? undefined : String(view.revisionId);
        if (!revisionId) return fail('view_revision_missing', '所存 View 没有明确版本；未换用 Current', path, ref);
      }
      const artifact = table('artifacts', { type: 'artifact', id: artifactId }, path, true);
      revisionId ??= artifact.currentRevisionId === undefined ? undefined : String(artifact.currentRevisionId);
      if (!revisionId) return fail('revision_missing', '所选材料没有可读取版本', path, ref);
      const revision = table('artifactRevisions', { type: 'revision', id: revisionId }, path) as ArtifactRevision;
      if (String(revision.artifactId) !== artifactId) return fail('revision_owner_conflict', '所存版本不属于所选材料', path, ref);
      const file = table('fileRecords', { type: 'file', id: String(revision.fileRecordId) }, path, true) as FileRecord;
      const content = await readFile(file, String(revision.contentHash), path, ref);
      return finish({ ref, path, title: artifact.title, content, source: { artifact: { id: artifactId, title: artifact.title, kind: artifact.kind, projectId },
        ...(view ? { view: { id: view.id, scopeId: view.scopeId, revisionId: view.revisionId } } : {}),
        revision: { id: revision.id, artifactId: revision.artifactId, fileRecordId: revision.fileRecordId, contentHash: revision.contentHash },
        file: { id: file.id, mimeType: file.mimeType, observedHash: file.observedHash } }, children: [] });
    }
    if (ref.type === 'note') {
      const note = table('notes', ref, path, true);
      if (typeof note.body !== 'string') return fail('note_unavailable', '所选附注正文暂不可读取', path, ref);
      return finish({ ref, path, title: note.body.split('\n').find((line: string) => line.trim())?.slice(0, 72).trim() || '空白附注',
        content: note.body, source: { note: { id: note.id, projectId: note.projectId, anchor: note.anchor, updatedAt: note.updatedAt } }, children: [] });
    }
    if (ref.type === 'conversation') {
      const chain = clone(await port.resolveConversation(projectId, ref.id));
      if (!chain || chain.connected.id !== ref.id || chain.connected.projectId !== projectId || !chain.connected.conversationSessionId || !chain.session
        || chain.connected.conversationSessionId !== chain.session.id || chain.session.projectId !== projectId)
        return fail('conversation_identity_unlinked', '对话尚未通过原身份链链接完整历史', path, ref);
      if (!chain.session.sourceContentHash) return fail('conversation_source_unavailable', '历史原内容未保存，无法确认完整读取；没有用入口摘要替代原历史', path, ref);
      const inspectSource = async () => {
        let source;
        try { source = clone(await port.inspectConversationSource(projectId, chain.session!.id)); }
        catch (error) { return fail('conversation_source_unavailable', error instanceof Error ? error.message : '原始历史暂不可核对', path, ref); }
        if (!source || source.sourceContentHash !== chain.session!.sourceContentHash || !Array.isArray(source.unsupportedMediaKinds))
          return fail('conversation_source_conflict', '历史原始来源与已保存归档不一致，未只取规范化文字', path, ref);
        if (source.unsupportedMediaKinds.length) return fail('conversation_media_unsupported', '这段历史含当前尚不能完整读取的图片、音视频或文件内容，未丢弃它们后发送', path, ref);
        return source;
      };
      const archiveSource = await inspectSource();
      const messages = await readHistory(chain.session, path, ref);
      const files: { messageId: string; messageSequence: number; ordinal: number; artifactId: string; revisionId: string; raw: string; normalized?: string; relationId?: string }[] = [];
      const attachments: MixedScopeNode[] = [];
      for (const message of messages) for (const [ordinal, fileRef] of message.fileRefs.entries()) {
        if (!fileRef.inProject || typeof fileRef.artifactId !== 'string' || !fileRef.artifactId)
          return fail('conversation_attachment_unresolved', '对话中的文件引用尚无可读取项目来源，未丢弃附件后发送', [...path, `message:${message.id}:attachment[${ordinal}]`], ref);
        // A matched pathname/Artifact is not proof of the bytes attached to an old
        // message. Never replace that historical attachment with Artifact Current.
        if (typeof fileRef.revisionId !== 'string' || !fileRef.revisionId)
          return fail('conversation_attachment_revision_unconfirmed', '对话附件尚无可核对的原版本，未用材料 Current 替代历史附件', [...path, `message:${message.id}:attachment[${ordinal}]`], ref);
        files.push({ messageId: message.id, messageSequence: message.seq, ordinal, artifactId: fileRef.artifactId, revisionId: fileRef.revisionId,
          raw: fileRef.raw, ...(fileRef.normalized ? { normalized: fileRef.normalized } : {}), ...(fileRef.relationId ? { relationId: fileRef.relationId } : {}) });
        attachments.push(await walk({ type: 'artifact', id: fileRef.artifactId, revisionId: fileRef.revisionId }, [...path, `message:${message.id}:attachment[${ordinal}]:artifact:${fileRef.artifactId}:revision:${fileRef.revisionId}`], next));
      }
      postChecks.push(async () => {
        const latest = await port.resolveConversation(projectId, ref.id);
        if (!same(chain, latest) || !same(messages, await readHistory(chain.session!, path, ref)) || !same(archiveSource, await inspectSource())) fail('member_changed', '读取期间所选对话已变化，请重新读取', path, ref);
      });
      return finish({ ref, path, title: chain.connected.label ?? chain.session.title, source: {
        connectedConversation: { id: chain.connected.id, projectId: chain.connected.projectId, label: chain.connected.label, conversationSessionId: chain.connected.conversationSessionId },
        session: { id: chain.session.id, projectId: chain.session.projectId, title: chain.session.title, status: chain.session.status, messageCount: chain.session.messageCount,
          sourceKind: chain.session.sourceKind, sourceContentHash: chain.session.sourceContentHash, conversationArtifactId: chain.session.conversationArtifactId, conversationViewId: chain.session.conversationViewId, updatedAt: chain.session.updatedAt },
        archive: archiveSource, fileReferences: files,
        messages: messages.map(row => ({ id: row.id, sessionId: row.sessionId, seq: row.seq, role: row.role, eventKind: row.eventKind,
          contentText: row.contentText, createdAt: row.createdAt, toolName: row.toolName, toolCall: row.toolCall, fileRefs: row.fileRefs,
          parentId: row.parentId, sourceEventId: row.sourceEventId, contentHash: row.contentHash })) },
        content: messages.map(row => `[${row.seq}] ${row.role}${row.toolName ? ` (${row.toolName})` : ''}\n${row.contentText}`).join('\n\n'), children: attachments });
    }
    if (ref.type === 'run') {
      const run = clone(await port.getRun(ref.id));
      if (!run || String(run.id) !== ref.id || String(run.projectId) !== projectId) return fail('run_missing', '所选任务缺失或不属于当前项目', path, ref);
      const returns = clone(await port.getRunReturns(ref.id));
      if (new Set(returns.map(row => row.id)).size !== returns.length || returns.some(row => String(row.runId) !== ref.id))
        return fail('run_return_conflict', '任务已有产物身份不一致', path, ref);
      postChecks.push(async () => { if (!same(run, await port.getRun(ref.id)) || !same(returns, await port.getRunReturns(ref.id))) fail('member_changed', '读取期间任务或已有产物已变化，请重新读取', path, ref); });
      const outputs: MixedScopeNode[] = [];
      for (const [index, row] of returns.entries()) {
        const outputRef = { type: 'run-return', id: String(row.id) }, outputPath = [...path, `return[${index}]:${row.id}`];
        const artifact = table('artifacts', { type: 'artifact', id: String(row.targetArtifactId) }, outputPath, true);
        const file = table('fileRecords', { type: 'file', id: String(row.returnedFileId) }, outputPath, true) as FileRecord;
        const content = await readFile(file, String(row.contentHash), outputPath, outputRef);
        if (row.draftRevisionId) {
          const revision = table('artifactRevisions', { type: 'revision', id: String(row.draftRevisionId) }, outputPath);
          if (String(revision.artifactId) !== String(row.targetArtifactId) || String(revision.fileRecordId) !== String(row.returnedFileId) || String(revision.contentHash) !== String(row.contentHash))
            return fail('run_return_conflict', '任务已有产物与所存版本不一致', outputPath, outputRef);
        }
        outputs.push(finish({ ref: outputRef, path: outputPath, title: artifact.title, source: { return: { id: row.id, runId: row.runId, targetArtifactId: row.targetArtifactId,
          baseRevisionId: row.baseRevisionId, draftRevisionId: row.draftRevisionId, returnedFileId: row.returnedFileId, contentHash: row.contentHash,
          action: row.action, status: row.status, createdAt: row.createdAt, updatedAt: row.updatedAt },
          file: { id: file.id, mimeType: file.mimeType, observedHash: file.observedHash } }, content, children: [] }));
      }
      return finish({ ref, path, title: run.instruction?.split('\n')[0]?.slice(0, 72) || '任务',
        source: { run: { id: run.id, projectId: run.projectId, instruction: run.instruction, status: run.status, outputIntent: run.outputIntent,
          resultSummary: run.resultSummary, shortSummary: run.shortSummary, errorCode: run.errorCode, errorMessage: run.errorMessage, updatedAt: run.updatedAt } },
        content: [run.instruction, `任务状态：${run.status}`, run.resultSummary, run.shortSummary, run.errorMessage].filter(value => value !== undefined).join('\n\n'), children: outputs });
    }
    if (ref.type === 'workspace') {
      const workspace = table('workspaces', ref, path, true);
      const views = capture(path, ref, g => (g.workspaceMemberships ?? []).filter(row => String(row.workspaceId) === ref.id)) as any[];
      const entities = capture(path, ref, g => (g.workspaceEntityMemberships ?? []).filter(row => String(row.workspaceId) === ref.id)) as any[];
      if (new Set(views.map(row => String(row.artifactViewId))).size !== views.length
        || new Set(entities.map(row => JSON.stringify([row.entityType, row.entityId]))).size !== entities.length)
        return fail('membership_identity_duplicate', '工作集成员关系身份重复', path, ref);
      return finish({ ref, path, title: workspace.name,
        source: { workspace: { id: workspace.id, projectId: workspace.projectId, name: workspace.name, scopeId: workspace.scopeId }, membership: views, entityMembership: entities },
        children: await children([...views.map(row => ({ type: 'view', id: String(row.artifactViewId) })), ...entities.map(row => ({ type: row.entityType, id: String(row.entityId) }))], 'working-set') });
    }
    return fail('member_type_unsupported', `这种成员的完整内容读取尚未接通：${ref.type}`, path, ref);
  };
  try {
    const root = await walk(rootRef, [`scope:${input.scopeId}`], new Map());
    const latestGraph = await port.getGraph(projectId), latestPresentations = await port.listPresentations(projectId);
    if (!latestGraph || String(latestGraph.project.id) !== projectId) fail('member_changed', '读取期间项目已变化', root.path, rootRef);
    for (const check of checks) if (!same(check.expected, check.read(latestGraph!, latestPresentations))) fail('member_changed', '读取期间所选成员或顺序已变化，请重新读取', check.path, check.ref);
    for (const check of postChecks) await check();
    const text = JSON.stringify({ projectId, scopeId: input.scopeId, root }, null, 2);
    if (text.length > maxCharacters) fail('context_budget_exceeded', '整份上下文超过本次文本额度，请缩小选择；没有自动截断成员', root.path, rootRef);
    return { complete: true, projectId, scopeId: input.scopeId, presentationId: String((root.source.presentation as any).id), root, text, evidence };
  } catch (error) {
    if (error instanceof MixedScopeReadError) throw error;
    return fail('context_read_failed', error instanceof Error ? error.message : '完整内容读取失败，请重新读取', [`scope:${input.scopeId}`], rootRef);
  }
}

/** Reuses the adopted Core UTF-8 capability and complete-byte Revision/FileRecord
 * reader. build-pilot resolves this dependency through readCurrentGen2Resource;
 * no MIME guessing, index prefix, new hash rule or synthetic file is involved. */
async function readExactTextFile(file: FileRecord, revision: { readonly contentHash: string }, limits = { maxCharacters: 200_000 }): Promise<string> {
  const capability = artifactUtf8TextCapability(file.mimeType);
  if (!capability.ok) throw new Error(`所选文件类型 ${file.mimeType}：${capability.message}`);
  return readArtifactTextContent({ fileRecord: file, expectedRevisionHash: String(revision.contentHash), maxChars: limits.maxCharacters });
}

export function createMixedScopeReadPort(metadata: any, conversations?: any, identity?: any): MixedScopeReadPort {
  return {
    getGraph: projectId => metadata.get(projectId),
    listPresentations: projectId => metadata.listPresentationViews(projectId),
    resolveConversation: async (projectId, id) => {
      if (identity) {
        let chain = identity.resolveChain(projectId, id);
        if (chain?.conversationSession && typeof conversations?.reconcileContinuationArchive === 'function') {
          await conversations.reconcileContinuationArchive(projectId, chain.conversationSession.id);
          chain = identity.resolveChain(projectId, id);
        }
        return chain ? { connected: chain.connectedConversation, session: chain.conversationSession } : undefined;
      }
      const connected = metadata.getConnectedConversation(projectId, id);
      if (!connected) return undefined;
      // The original live producer owns repair. Capture its stable source hash
      // after reconciliation; imported sources are never regenerated here.
      if (connected.conversationSessionId && typeof conversations?.reconcileContinuationArchive === 'function')
        await conversations.reconcileContinuationArchive(projectId, connected.conversationSessionId);
      // This is the same explicit link used by ConversationIdentityService, without constructing another service or DB.
      const session = connected.conversationSessionId && conversations?.getProjection(projectId, connected.conversationSessionId)?.session;
      return { connected, ...(session ? { session } : {}) };
    },
    getConversationMessages: (sessionId, input) => {
      if (!conversations) throw new Error('原对话历史读取所有者尚未提供，未省略对话成员');
      return conversations.getMessages(sessionId, input);
    },
    inspectConversationSource: (projectId, sessionId) => {
      if (typeof conversations?.inspectContextSource !== 'function') throw new Error('原历史归档核对所有者尚未提供，未只发送规范化文字');
      return conversations.inspectContextSource(projectId, sessionId);
    },
    getRun: id => metadata.getRun(id), getRunReturns: id => metadata.getArtifactReturns(id), readTextFile: readExactTextFile,
  };
}
const registeredPorts = new WeakMap<object, MixedScopeReadPort>();
export function registerMixedScopeReadPort(metadata: object, port: MixedScopeReadPort): void { registeredPorts.set(metadata, port); }
export function getRegisteredMixedScopeReadPort(metadata: object): MixedScopeReadPort { return registeredPorts.get(metadata) ?? createMixedScopeReadPort(metadata); }
