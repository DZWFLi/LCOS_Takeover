import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';
import { readCurrentGen2Resource } from '../lab/current-gen2-resources.mjs';

const root = process.cwd();
const output = path.join(root, 'output/混合Scope取用_20261022/共享读取器', new Date().toISOString().replaceAll(':', '-'));
await fs.mkdir(output, { recursive: true });
const report = { passed: false, checks: [], modelRequests: 0, runDispatches: 0, realBrowserVerified: false };
const adoptedTextSource = readCurrentGen2Resource(path.join(root, 'lcos/apps/local-core/src/search-artifact-body.ts'));
assert.ok(adoptedTextSource?.contents.includes('export async function readArtifactTextContent'));
report.textReaderSource = { sourcePath: adoptedTextSource.sourcePath, owner: adoptedTextSource.owner, readOnly: adoptedTextSource.readOnly,
  exports: ['artifactUtf8TextCapability', 'readArtifactTextContent'] };
await buildPilotEntry('lab/pilot/mixed-scope-context.ts', path.join(output, 'reader.mjs'), 'node');
const { readMixedScopeContext, createMixedScopeReadPort, registerMixedScopeReadPort, getRegisteredMixedScopeReadPort, MixedScopeReadError } = await import(pathToFileURL(path.join(output, 'reader.mjs')));
const sha = text => createHash('sha256').update(text).digest('hex');
const copy = value => structuredClone(value);
const now = '2026-10-22T10:00:00Z';
async function fixture() {
  const bodies = ['明确旧版本正文', '明确新版本正文', '任务真实已有产物'];
  const files = [];
  for (const [i, body] of bodies.entries()) {
    const observedPath = path.join(output, `fixture-${i}.md`); await fs.writeFile(observedPath, body);
    files.push({ id: `f${i}`, projectId: 'p', mimeType: 'text/markdown', availability: 'current', observedPath, observedHash: sha(body), size: Buffer.byteLength(body), modifiedAt: now, observedAt: now });
  }
  const graph = { project: { id: 'p' }, scopes: [{ id: 's', projectId: 'p', kind: 'context', name: '完整混合 Scope', updatedAt: now }],
    artifacts: [{ id: 'a', projectId: 'p', title: '同一材料', kind: 'markdown', currentRevisionId: 'r1' }, { id: 'out', projectId: 'p', title: '已有产物', kind: 'markdown', currentRevisionId: 'r2' }],
    artifactViews: [{ id: 'v0', artifactId: 'a', scopeId: 's', revisionId: 'r0' }, { id: 'v1', artifactId: 'a', scopeId: 's', revisionId: 'r1' }],
    artifactRevisions: files.map((file, i) => ({ id: `r${i}`, artifactId: i === 2 ? 'out' : 'a', fileRecordId: file.id, contentHash: file.observedHash })), fileRecords: files,
    notes: [{ id: 'n', projectId: 'p', body: '选中的附注全文', updatedAt: now }, { id: 'unselected', projectId: 'p', body: '未选择附注不得混入', updatedAt: now }],
    collections: [{ id: 'c', projectId: 'p', title: '外层集合' }, { id: 'inner', projectId: 'p', title: '内层集合' }],
    collectionMemberships: [
      { collectionId: 'c', relationId: 'rel0', memberRef: { type: 'collection', id: 'inner' } },
      { collectionId: 'c', relationId: 'rel1', memberRef: { type: 'scope', id: 's' } },
      { collectionId: 'inner', relationId: 'rel2', memberRef: { type: 'note', id: 'n' } },
      { collectionId: 'inner', relationId: 'rel3', memberRef: { type: 'artifact', id: 'a' } },
      { collectionId: 'inner', relationId: 'rel4', memberRef: { type: 'run', id: 'run' } }],
    workspaces: [{ id: 'w', projectId: 'p', scopeId: 's', name: '实际工作集', viewport: { x: 902, y: 888, zoom: 1 }, updatedAt: now }],
    workspaceMemberships: [{ workspaceId: 'w', artifactViewId: 'v0', addedAt: now }],
    workspaceEntityMemberships: [{ workspaceId: 'w', entityType: 'note', entityId: 'n', addedAt: now }] };
  const presentations = [{ id: 'presentation:context:s', projectId: 'p', scopeId: 's', capability: 'context', version: 4, updatedAt: now,
    state: { memberViewIds: ['v0', 'v1'], memberEntityRefs: [{ type: 'collection', id: 'c' }, { type: 'note', id: 'n' }, { type: 'conversation', id: 'cc' }, { type: 'run', id: 'run' }, { type: 'workspace', id: 'w' }] } }];
  const connected = { id: 'cc', projectId: 'p', label: '原链接对话', conversationSessionId: 'history', updatedAt: now };
  const messages = Array.from({ length: 5 }, (_, i) => ({ id: `m${i}`, sessionId: 'history', seq: i, role: i % 2 ? 'assistant' : 'user', contentText: `第 ${i} 条完整历史`, fileRefs: [], contentHash: `existing-message-hash-${i}` }));
  const session = { id: 'history', projectId: 'p', status: 'ready', messageCount: messages.length, updatedAt: now, title: '已导入历史', sourceContentHash: 'existing-import-source-hash' };
  const run = { id: 'run', projectId: 'p', instruction: '既有任务全文', status: 'completed', outputIntent: 'create', resultSummary: '实际已存结果', updatedAt: now };
  const returns = [{ id: 'return0', runId: 'run', targetArtifactId: 'out', returnedFileId: 'f2', draftRevisionId: 'r2', contentHash: files[2].observedHash, status: 'adopted', updatedAt: now }];
  const calls = { pages: [], reads: 0 };
  const metadata = { get: () => copy(graph), listPresentationViews: () => copy(presentations), getConnectedConversation: (_p, id) => id === connected.id ? copy(connected) : undefined,
    getRun: id => id === run.id ? copy(run) : undefined, getArtifactReturns: id => id === run.id ? copy(returns) : [] };
  const archive = { sourceContentHash: session.sourceContentHash, unsupportedMediaKinds: [] };
  const conversations = { getProjection: (p, id) => p === 'p' && id === session.id ? { session: copy(session) } : undefined,
    inspectContextSource: async () => copy(archive),
    getMessages: (id, page) => { calls.pages.push({ id, ...page }); return id === session.id ? copy(messages.slice(page.offset, page.offset + page.limit)) : []; } };
  const port = createMixedScopeReadPort(metadata, conversations);
  const read = port.readTextFile;
  port.readTextFile = async (...args) => { calls.reads++; return read(...args); };
  return { graph, presentations, connected, session, messages, run, returns, calls, port, metadata, archive };
}
const read = (f, options = {}) => readMixedScopeContext({ projectId: 'p', scopeId: 's' }, f.port, { conversationPageSize: 2, ...options });
async function workflowFixture() {
  const f = await fixture();
  f.graph.scopes[0].kind = 'workflow'; f.graph.scopes[0].name = '整份多组混合方法';
  const first = f.presentations[0]; first.id = 'presentation:workflow:s:a'; first.capability = 'workflow';
  first.state.memberViewIds.push('legacy-structure');
  first.state.workflowActions = [{ id: 'step-a', label: 'A组第一步', description: 'A组步骤说明', attachedViewIds: ['v1'] }, { id: 'step-a-next', label: 'A组第二步', attachedViewIds: [] }];
  first.state.workflowActionEdges = [{ id: 'edge-a', fromActionId: 'step-a', toActionId: 'step-a-next', label: 'A组连接' }];
  first.state.workflowOperators = { v0: { kind: 'condition', label: 'A组结构', branches: [{ id: 'branch-a', label: 'A组分支', predicateText: '保留A组判断说明', targetViewId: 'v1' }] }, 'legacy-structure': { kind: 'parallel-split', label: '旧结构标记', branches: [] } };
  f.graph.notes.push({ id: 'note-b', projectId: 'p', body: 'B组独有附注全文', updatedAt: now });
  f.graph.collections.push({ id: 'collection-b', projectId: 'p', title: 'B组外层集合' }, { id: 'inner-b', projectId: 'p', title: 'B组内层集合' });
  f.graph.collectionMemberships.push({ collectionId: 'collection-b', relationId: 'b-outer', memberRef: { type: 'collection', id: 'inner-b' } },
    { collectionId: 'inner-b', relationId: 'b-note', memberRef: { type: 'note', id: 'note-b' } },
    { collectionId: 'inner-b', relationId: 'b-run', memberRef: { type: 'run', id: 'run-b' } },
    { collectionId: 'inner-b', relationId: 'b-cycle', memberRef: { type: 'scope', id: 's' } });
  const second = { id: 'presentation:workflow:s:b', projectId: 'p', scopeId: 's', capability: 'workflow', version: 8, updatedAt: now,
    state: { memberViewIds: ['v1'], memberEntityRefs: [{ type: 'collection', id: 'collection-b' }, { type: 'note', id: 'note-b' }, { type: 'conversation', id: 'cc-b' }, { type: 'run', id: 'run-b' }],
      workflowActions: [{ id: 'step-b', label: 'B组第一步', description: 'B组步骤说明', attachedViewIds: [] }, { id: 'step-b-next', label: 'B组第二步', attachedViewIds: ['v1'] }],
      workflowActionEdges: [{ id: 'edge-b', fromActionId: 'step-b', toActionId: 'step-b-next', label: 'B组连接' }],
      workflowOperators: { 'operator-b': { kind: 'condition', label: 'B组结构', branches: [{ id: 'branch-b', label: 'B组分支', predicateText: '保留B组判断说明', targetViewId: 'v1' }] } } } };
  f.presentations.unshift(second); // Deliberately reverse storage-port order.
  f.connectedB = { ...f.connected, id: 'cc-b', label: 'B组当前接收会话', conversationSessionId: 'history-b' };
  f.messagesB = [
    { id: 'b-user', sessionId: 'history-b', seq: 0, role: 'user', contentText: 'B组原用户内容', fileRefs: [] },
    { id: 'b-assistant', sessionId: 'history-b', seq: 1, role: 'assistant', contentText: 'B组原助手内容', fileRefs: [] },
    { id: 'b-pending', sessionId: 'history-b', seq: 2, role: 'user', contentText: 'B组本轮真实pending用户输入', fileRefs: [] },
  ];
  f.sessionB = { ...f.session, id: 'history-b', messageCount: f.messagesB.length, title: 'B组会话归档', sourceContentHash: 'existing-b-source' };
  f.archiveB = { sourceContentHash: f.sessionB.sourceContentHash, unsupportedMediaKinds: [] };
  f.runB = { ...f.run, id: 'run-b', instruction: 'B组独有原任务指令', resultSummary: 'B组既有结果' };
  f.returnsB = [{ ...f.returns[0], id: 'return-b', runId: 'run-b' }];
  for (const [name, wrapped] of [
    ['resolveConversation', previous => (project, id) => id === 'cc-b' ? copy({ connected: f.connectedB, session: f.sessionB }) : previous(project, id)],
    ['inspectConversationSource', previous => (project, id) => id === 'history-b' ? copy(f.archiveB) : previous(project, id)],
    ['getConversationMessages', previous => (id, page) => id === 'history-b' ? copy(f.messagesB.slice(page.offset, page.offset + page.limit)) : previous(id, page)],
    ['getRun', previous => id => id === 'run-b' ? copy(f.runB) : previous(id)],
    ['getRunReturns', previous => id => id === 'run-b' ? copy(f.returnsB) : previous(id)],
  ]) f.port[name] = wrapped(f.port[name]);
  return f;
}
async function rejects(f, mutate, code) {
  await mutate(f);
  await assert.rejects(read(f), error => { assert.ok(error instanceof MixedScopeReadError); assert.equal(error.code, code); assert.ok(error.path.length); return true; });
}
try {
  let f = await fixture(); const before = copy({ graph: f.graph, presentations: f.presentations, messages: f.messages, run: f.run, returns: f.returns });
  const result = await read(f);
  assert.equal(result.complete, true); assert.equal(result.presentationId, 'presentation:context:s');
  assert.deepEqual(result.root.children.map(node => node.ref.type), ['view', 'view', 'collection', 'note', 'conversation', 'run', 'workspace']);
  assert.deepEqual(result.root.children.slice(0, 2).map(node => [node.source.revision.id, node.content]), [['r0', '明确旧版本正文'], ['r1', '明确新版本正文']]);
  assert.equal(result.root.children[2].children[1].backReference.join('/'), 'scope:s');
  assert.equal(result.root.children[2].children[0].children[1].source.revision.id, 'r1');
  assert.equal(result.root.children[2].children[0].children[2].children[0].content, '任务真实已有产物');
  assert.equal(result.root.children[5].source.run.status, 'completed');
  assert.equal(result.root.children[6].children[0].content, '明确旧版本正文');
  assert.equal(result.root.children[6].source.workspace.viewport, undefined, 'Camera is not user context.');
  assert.equal(result.root.children[4].source.messages.length, 5); assert.match(result.root.children[4].content, /第 4 条完整历史/);
  assert.deepEqual(f.calls.pages.slice(0, 4).map(page => [page.offset, page.limit]), [[0, 2], [2, 2], [4, 1], [5, 1]]);
  assert.doesNotMatch(result.text, /未选择附注不得混入/);
  assert.equal(result.evidence.filter(row => row.ref.type === 'note' && row.ref.id === 'n').length, 3, 'Repeated paths stay repeated, no global dedupe.');
  assert.deepEqual(before, { graph: f.graph, presentations: f.presentations, messages: f.messages, run: f.run, returns: f.returns });
  report.checks.push('All seven Scope member kinds, nested canonical Collection, selected Note only, full paginated explicit-linked history, Run status/real outputs and Workspace working-set; exact v1/v2 and repeated provenance retained, ancestor cycle explicit.');

  for (const [mutate, code] of [
    [f => f.graph.notes.splice(0, 1), 'member_missing'],
    [f => f.graph.notes.push(copy(f.graph.notes[0])), 'identity_duplicate'],
    [f => f.graph.notes[0].projectId = 'foreign', 'member_outside_project'],
    [f => f.graph.artifactViews[0].revisionId = undefined, 'view_revision_missing'],
    [f => f.graph.artifactRevisions[0].artifactId = 'out', 'revision_owner_conflict'],
    [f => f.graph.fileRecords[0].observedHash = 'changed', 'content_stale'],
    [f => f.presentations[0].state.memberEntityRefs.push({ type: 'unknown', id: 'kept' }), 'member_type_unsupported'],
    [f => f.graph.collectionMemberships.push(copy(f.graph.collectionMemberships[0])), 'membership_identity_duplicate'],
    [f => f.connected.conversationSessionId = 'unlinked', 'conversation_identity_unlinked'],
    [f => f.messages.splice(2, 1), 'conversation_history_conflict'],
    [f => f.messages[3].id = f.messages[0].id, 'conversation_history_conflict'],
    [f => f.messages[3].role = 'invented_role', 'conversation_history_conflict'],
    [f => f.returns[0].runId = 'other', 'run_return_conflict'],
    [f => f.returns[0].draftRevisionId = 'r0', 'run_return_conflict'],
  ]) await rejects(await fixture(), mutate, code);
  report.checks.push('Missing, duplicate, foreign, unsupported and broken identity-chain members explicitly fail whole read; no Current substitution, message-role invention or partial result.');

  f = await fixture(); f.graph.fileRecords[0].mimeType = 'image/png';
  await assert.rejects(read(f), error => error.code === 'content_type_unsupported');
  assert.equal(f.calls.reads, 0, 'Unsupported MIME is explicit before the byte-reader port.');
  for (const mutate of [f => f.graph.fileRecords[0].availability = 'missing', f => f.graph.fileRecords[0].observedHash = 'stale-existing-version']) {
    f = await fixture(); f.graph.fileRecords[0].mimeType = 'image/png'; mutate(f);
    await assert.rejects(read(f), error => error.code === 'content_stale');
  }
  f = await fixture(); await fs.writeFile(f.graph.fileRecords[0].observedPath, '磁盘正文已被替换');
  await assert.rejects(read(f), error => error.code === 'content_unavailable' && /变化/.test(error.message));
  f = await fixture(); await assert.rejects(read(f, { maxCharacters: 100 }), error => error.code === 'context_budget_exceeded');
  report.checks.push('Existing text MIME, UTF-8 and exact Revision/FileRecord byte verification preserved; unsupported MIME has explicit content_type_unsupported before the read port, while missing/stale/corrupt versions keep their distinct errors; no metadata substitution/truncation.');

  for (const [mimeType, extension, body] of [
    ['text/markdown', 'md', '# 原 Markdown 全文'], ['text/plain', 'txt', '原纯文本全文'],
    ['text/csv; charset=utf-8', 'csv', '名称,数值\n完整行,42\n最后一行,7'],
    ['application/json', 'json', '{"完整字段":"没有只读取开头","count":42}'],
    ['application/yaml', 'yaml', '名称: 完整 YAML\n数值: 42'],
    ['application/xml', 'xml', '<root><item>完整 XML</item></root>'],
    ['text/html; charset="utf-8"', 'html', '<!doctype html><p>完整 HTML 正文</p>'],
  ]) {
    f = await fixture(); const file = f.graph.fileRecords[0];
    file.observedPath = path.join(output, `actual-source-full-read.${extension}`); file.mimeType = mimeType;
    file.observedHash = sha(body); f.graph.artifactRevisions[0].contentHash = file.observedHash;
    await fs.writeFile(file.observedPath, body);
    assert.equal((await read(f)).root.children[0].content, body);
  }
  f = await fixture(); f.graph.fileRecords[0].mimeType = 'text/csv; charset=gbk';
  await assert.rejects(read(f), error => error.code === 'content_unavailable' && /编码/.test(error.message));
  f = await fixture(); const oversized = 'x'.repeat(32_001); await fs.writeFile(f.graph.fileRecords[0].observedPath, oversized);
  f.graph.fileRecords[0].observedHash = sha(oversized); f.graph.artifactRevisions[0].contentHash = sha(oversized);
  await assert.rejects(read(f, { maxItemCharacters: 32_000 }), error => error.code === 'context_budget_exceeded');
  f = await fixture(); const nul = '首部\0二进制'; await fs.writeFile(f.graph.fileRecords[0].observedPath, nul);
  f.graph.fileRecords[0].observedHash = sha(nul); f.graph.artifactRevisions[0].contentHash = sha(nul);
  await assert.rejects(read(f), error => error.code === 'content_unavailable' && /NUL/.test(error.message));
  f = await fixture(); f.graph.fileRecords[0].mimeType = 'application/pdf';
  await assert.rejects(read(f), error => error.code === 'content_type_unsupported');
  report.checks.push('Adopted Core UTF-8 capability/full-byte helper reads all seven original formats, including actual CSV/JSON files and charset UTF-8; GBK declarations, NUL, PDF and 32k caller per-file quota reject without MIME guessing or partial reads.');

  for (const [mutate, code] of [
    [f => f.session.sourceContentHash = undefined, 'conversation_source_unavailable'],
    [f => f.port.inspectConversationSource = async () => { throw new Error('原历史 owner：原始文件已缺失'); }, 'conversation_source_unavailable'],
    [f => f.port.inspectConversationSource = async () => { throw new Error('原历史 owner：归档原始字节被篡改'); }, 'conversation_source_unavailable'],
    [f => f.archive.sourceContentHash = 'different-existing-source', 'conversation_source_conflict'],
    [f => f.archive.unsupportedMediaKinds.push('image_url'), 'conversation_media_unsupported'],
    [f => f.session.messageCount = 0, 'conversation_history_unavailable'],
    [f => f.messages[0].fileRefs.push({ raw: '未匹配附件.txt', inProject: false }), 'conversation_attachment_unresolved'],
    [f => f.messages[0].fileRefs.push({ raw: '只匹配了项目', inProject: true }), 'conversation_attachment_unresolved'],
    [f => f.messages[0].fileRefs.push({ raw: '同路径不等于历史版本.md', inProject: true, artifactId: 'a' }), 'conversation_attachment_revision_unconfirmed'],
    [f => f.messages[0].fileRefs.push({ raw: '已删除的附件.md', inProject: true, artifactId: 'deleted', revisionId: 'r0' }), 'member_missing'],
  ]) await rejects(await fixture(), mutate, code);
  f = await fixture(); f.messages[0].fileRefs.push({ raw: '已确认原版附件.md', inProject: true, artifactId: 'a', revisionId: 'r0' });
  const withAttachment = await read(f), attached = withAttachment.root.children[4].children[0];
  assert.equal(attached.content, '明确旧版本正文'); assert.equal(attached.source.revision.id, 'r0');
  assert.equal(f.graph.artifacts[0].currentRevisionId, 'r1', 'Attachment never silently follows Artifact Current.');
  assert.match(attached.path.join('/'), /message:m0:attachment\[0\]/);
  assert.equal(withAttachment.root.children[4].source.fileReferences[0].revisionId, 'r0');
  f = await fixture(); f.messages[0].fileRefs.push({ raw: '图片附件.png', inProject: true, artifactId: 'out', revisionId: 'r2' }); f.graph.fileRecords[2].mimeType = 'image/png';
  await assert.rejects(read(f), error => error.code === 'content_type_unsupported');
  f = await fixture(); let sourceInspections = 0; const inspectSource = f.port.inspectConversationSource;
  f.port.inspectConversationSource = async (...args) => { if (++sourceInspections === 2) f.archive.sourceContentHash = 'changed-during-read'; return inspectSource(...args); };
  await assert.rejects(read(f), error => error.code === 'conversation_source_conflict');
  report.checks.push('Existing archive inspector is mandatory and read twice: absent/mismatched source hash, owner missing/corrupt archive refusals, media and empty history fail; unmatched or unversioned fileRefs fail, explicit text attachment revision reads full old bytes with message/ordinal provenance, binary attachment refuses.');

  for (const change of [f => f.graph.notes[0].body = '更新时间不变但正文变更', f => f.graph.collectionMemberships.reverse(), f => f.presentations[0].state.memberEntityRefs.reverse()]) {
    f = await fixture(); const oldRead = f.port.readTextFile; let changed = false;
    f.port.readTextFile = async (...args) => { const text = await oldRead(...args); if (!changed) { changed = true; change(f); } return text; };
    await assert.rejects(read(f), error => error.code === 'member_changed');
  }
  f = await fixture(); let pages = 0; const pageRead = f.port.getConversationMessages;
  f.port.getConversationMessages = (...args) => { pages++; if (pages === 5) f.messages[0].contentText = '同更新时间被替换的历史'; return pageRead(...args); };
  await assert.rejects(read(f), error => error.code === 'member_changed');
  f = await fixture(); const fileRead = f.port.readTextFile;
  f.port.readTextFile = async (...args) => { const value = await fileRead(...args); if (args[0].id === 'f2') f.run.status = 'failed'; return value; };
  await assert.rejects(read(f), error => error.code === 'member_changed');
  report.checks.push('Same-timestamp Note/history edits, Run status and selected membership/presentation reorder during reads fail explicitly; unrelated project Notes never leak.');

  f = await fixture(); f.presentations[0].state.memberViewIds = []; f.presentations[0].state.memberEntityRefs = [];
  const empty = await read(f); assert.equal(empty.root.children.length, 0); assert.doesNotMatch(empty.text, /选中的附注全文/);
  registerMixedScopeReadPort(f.metadata, f.port); assert.equal(getRegisteredMixedScopeReadPort(f.metadata), f.port);
  report.checks.push('Empty actual Presentation stays empty; registry shares the same repository and existing history reader without constructing a DB or service.');

  f = await workflowFixture(); const method = await read(f);
  assert.equal(method.presentationId, 'presentation:workflow:s:a');
  assert.deepEqual(method.root.source.presentations.map(row => [row.id, row.version]), [['presentation:workflow:s:a', 4], ['presentation:workflow:s:b', 8]]);
  assert.deepEqual(method.root.source.presentation, method.root.source.presentations[0]);
  for (const [presentationId, refs] of [
    ['presentation:workflow:s:a', [['collection', 'c'], ['note', 'n'], ['conversation', 'cc'], ['run', 'run']]],
    ['presentation:workflow:s:b', [['collection', 'collection-b'], ['note', 'note-b'], ['conversation', 'cc-b'], ['run', 'run-b']]],
  ]) for (const [type, id] of refs) assert.ok(method.evidence.some(row => row.ref.type === type && row.ref.id === id && row.path.includes('presentation:' + presentationId)), presentationId + ' includes ' + type + ':' + id);
  assert.equal(method.root.children[0].ref.id, 'v0'); assert.equal(method.root.children[0].content, '明确旧版本正文');
  assert.equal(method.evidence.some(row => row.ref.id === 'legacy-structure'), false);
  assert.match(method.text, /A组第一步/); assert.match(method.text, /B组第一步/); assert.match(method.text, /A组连接/); assert.match(method.text, /B组连接/); assert.match(method.text, /保留A组判断说明/); assert.match(method.text, /保留B组判断说明/);
  const self = method.evidence.find(row => row.ref.type === 'conversation' && row.ref.id === 'cc-b');
  assert.equal(self.source.messages.length, 3); assert.equal(self.source.messages.at(-1).id, 'b-pending'); assert.equal(self.source.messages.filter(row => row.role === 'assistant').length, 1);
  assert.ok(method.evidence.filter(row => row.backReference).length >= 2); assert.doesNotMatch(method.text, /未选择附注不得混入/);
  assert.deepEqual((await read(f)).text, method.text);
  report.checks.push('Whole Workflow Scope reads every Presentation in stable existing-id order. Each group retains its own nested Collection/Note/conversation/Run, complete actions/edges/operators and distinct provenance paths; a real View sharing an operator key survives while a legacy non-View marker is skipped. The compatible primary Presentation anchor does not select away other groups.');

  const oneMethod = await readMixedScopeContext({ projectId: 'p', scopeId: 's', presentationId: 'presentation:workflow:s:b' }, f.port);
  assert.equal(oneMethod.presentationId, 'presentation:workflow:s:b'); assert.equal(oneMethod.root.source.presentations, undefined);
  assert.ok(oneMethod.evidence.some(row => row.ref.id === 'cc-b')); assert.equal(oneMethod.evidence.some(row => row.ref.id === 'cc'), false);
  assert.equal(oneMethod.root.children.every(row => row.path.length === 2), true);
  await assert.rejects(readMixedScopeContext({ projectId: 'p', scopeId: 's', presentationId: 'missing' }, f.port), error => error.code === 'presentation_ambiguous');
  await assert.rejects(readMixedScopeContext({ projectId: 'p', scopeId: 's', presentationId: '' }, f.port), error => error.code === 'presentation_ambiguous');
  f.presentations.push({ ...copy(f.presentations[0]), id: 'wrong-capability', capability: 'context' });
  await assert.rejects(readMixedScopeContext({ projectId: 'p', scopeId: 's', presentationId: 'wrong-capability' }, f.port), error => error.code === 'presentation_ambiguous');
  const contextFixture = await fixture(); contextFixture.presentations.push({ ...copy(contextFixture.presentations[0]), id: 'another-context' }); await assert.rejects(read(contextFixture), error => error.code === 'presentation_ambiguous');
  report.checks.push('Explicit Presentation selection reads exactly that Workflow group with the original single-Presentation shape; missing/wrong-capability ids reject. Context still requires its one canonical Presentation. Self-referenced conversation content retains the actual pending user row and never invents a pending assistant.');

  for (const [mutate, code] of [
    [f => f.graph.notes.splice(f.graph.notes.findIndex(row => row.id === 'note-b'), 1), 'member_missing'],
    [f => f.graph.notes.find(row => row.id === 'note-b').projectId = 'foreign', 'member_outside_project'],
    [f => f.connectedB.conversationSessionId = 'wrong-history', 'conversation_identity_unlinked'],
    [f => f.archiveB.unsupportedMediaKinds.push('image_url'), 'conversation_media_unsupported'],
    [f => f.graph.fileRecords[1].mimeType = 'image/png', 'content_type_unsupported'],
    [f => f.presentations[0].state.memberEntityRefs.push({ type: 'unknown', id: 'keep-and-refuse' }), 'member_type_unsupported'],
    [f => f.presentations.push(copy(f.presentations[0])), 'presentation_ambiguous'],
  ]) await rejects(await workflowFixture(), mutate, code);
  for (const mutate of [
    f => f.presentations[0].state.workflowActions[0].label = '读取中修改另一组步骤',
    f => f.presentations[0].version++,
    f => f.presentations.push({ ...copy(f.presentations[0]), id: 'presentation:workflow:s:c' }),
    f => f.graph.notes.find(row => row.id === 'note-b').body = '同时间戳修改B组附注',
  ]) { f = await workflowFixture(); const originalRead = f.port.readTextFile; let changed = false; f.port.readTextFile = async (...args) => { const value = await originalRead(...args); if (!changed) { changed = true; mutate(f); } return value; }; await assert.rejects(read(f), error => error.code === 'member_changed'); }
  f = await workflowFixture(); const pageB = f.port.getConversationMessages; let readingB = 0; f.port.getConversationMessages = (...args) => { if (args[0] === 'history-b' && ++readingB === 4) f.messagesB[0].contentText = '读取中改写自身历史'; return pageB(...args); }; await assert.rejects(read(f), error => error.code === 'member_changed');
  report.checks.push('Missing, foreign, unsupported or wrong-identity content in any Workflow group fails the whole read. Any selected group/version/addition, same-timestamp Note edit or self-history change during reading also fails; no first-group-only success or partial method is returned.');
  await fs.writeFile(path.join(output, 'workflow-reading.json'), JSON.stringify(method, null, 2));
  await fs.writeFile(path.join(output, 'reading.json'), JSON.stringify(result, null, 2));
  report.passed = true;
} catch (error) {
  report.error = { name: error.name, code: error.code, message: error.message, stack: error.stack };
  process.exitCode = 1;
} finally {
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ report: path.join(output, 'report.json'), ...report }, null, 2));
}
