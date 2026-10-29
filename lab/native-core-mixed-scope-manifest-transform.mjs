import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestSource = 'lcos/apps/local-core/src/context-manifest-service.ts';
const composeSource = 'lcos/apps/local-core/src/compose.ts';
const runRoutesSource = 'lcos/apps/local-core/src/routes/runs.ts';
const once = (source, before, after) => {
  if (source.split(before).length !== 2) throw new Error('Mixed Scope manifest source seam changed: ' + before.slice(0, 80));
  return source.replace(before, after);
};
function original(source, sourcePath, relative, marker) {
  if (path.resolve(sourcePath ?? '').toLowerCase() !== path.resolve(root, relative).toLowerCase()) throw new Error('Exact original Core source required.');
  return source.includes(marker) ? null : source.replaceAll('\r\n', '\n');
}
function readerImport(relative, names) {
  const from = path.relative(path.dirname(path.resolve(root, relative)), path.resolve(root, 'lab/pilot/mixed-scope-context.ts')).replaceAll('\\', '/');
  return `import { ${names} } from ${JSON.stringify(from.startsWith('.') ? from : './' + from)}\n`;
}
export function transformNativeCoreMixedScopeManifest(source, { sourcePath } = {}) {
  let next = original(source, sourcePath, manifestSource, 'native-mixed-scope-manifest'); if (next === null) return source;
  next = readerImport(manifestSource, 'readMixedScopeContext, getRegisteredMixedScopeReadPort, type MixedScopeReading') + next;
  next = once(next, '    const seenOrders = new Set<number>()', `    // native-mixed-scope-manifest: complete read before the one original manifest write.
    const readScope = async (scopeId: string) => {
      const port = getRegisteredMixedScopeReadPort(this.repository);
      return readMixedScopeContext({ projectId: String(projectId), scopeId }, {
        ...port, readTextFile: async (file, revision) => {
          const value = await port.readTextFile(file, revision, { maxCharacters: MAX_ITEM_CHARACTERS });
          if (value.length > MAX_ITEM_CHARACTERS) throw new Error('上下文中有文件超过本任务的完整文本额度；没有截断或创建任务。');
          return value;
        },
      }, { maxCharacters: MAX_TOTAL_CHARACTERS, maxItemCharacters: MAX_ITEM_CHARACTERS });
    };
    const selectedScopes = new Map<number, MixedScopeReading>();
    for (const [index, item] of (input.orderedReferences ?? []).entries()) {
      if (item.ref.type !== 'scope') continue;
      if (item.mode !== undefined && item.mode !== 'full') throw new Error('整份 Scope 当前只支持完整正文；未创建任务。');
      selectedScopes.set(item.order, await readScope(item.ref.scopeId));
    }
    const savedScope = input.savedContextId === undefined ? undefined : await readScope(input.savedContextId);
    const mixedScopeContextActive = selectedScopes.size > 0 || savedScope !== undefined;
    const seenOrders = new Set<number>()`);
  next = once(next, '      const ref = item.ref\n', `      const ref = item.ref
      if (ref.type === 'scope') {
        if (!selectedScopes.has(item.order)) throw new Error('整份上下文未完整读出。');
        continue;
      }
`);
  next = once(next, '    const related = [...graph.relations].sort(byIdentity)', '    const related = [...(mixedScopeContextActive ? [] : graph.relations)].sort(byIdentity)');
  next = once(next, 'const siblingContextArtifacts = input.contextArtifactIds === undefined || input.contextArtifactIds.length === 0', 'const siblingContextArtifacts = !mixedScopeContextActive && (input.contextArtifactIds === undefined || input.contextArtifactIds.length === 0)');
  next = once(next, '    const stableItemIdentities: string[] = []', `    const appendMixedScope = (scope: MixedScopeReading, identity: string, role: ContextManifestOrderedItemV0['role']): ContextManifestArtifactRefV0[] => {
      const content = '<untrusted-context identity="' + identity + '">\\n' + scope.text + '\\n</untrusted-context>';
      if (content.length > remainingCharacters) throw new Error('完整上下文超过本次文本额度；没有省略成员或创建任务。');
      const item: ContextManifestOrderedItemV0 & { scopeContext: Pick<MixedScopeReading, 'projectId' | 'scopeId' | 'presentationId' | 'evidence'> } = {
        role, identity, title: scope.root.title, content,
        sourceAnchor: 'scope:' + scope.scopeId + '/presentation:' + scope.presentationId,
        scopeContext: { projectId: scope.projectId, scopeId: scope.scopeId, presentationId: scope.presentationId, evidence: scope.evidence },
      };
      orderedItems.push(item); lockedSource.push(...scope.evidence.flatMap(member => member.content === undefined ? [] : [member.content])); remainingCharacters -= content.length;
      const files: ContextManifestArtifactRefV0[] = [];
      for (const member of scope.evidence) {
        const fact = member.source.revision as { id?: string; artifactId?: string; fileRecordId?: string; contentHash?: string } | undefined;
        if (!fact) continue;
        const artifact = artifactById.get(String(fact.artifactId)), revision = revisionById.get(String(fact.id)), file = fileRecordById.get(String(fact.fileRecordId));
        if (!artifact || !revision || !file || String(artifact.projectId) !== String(projectId) || String(revision.artifactId) !== String(artifact.id)
          || String(revision.contentHash) !== String(fact.contentHash)) throw new Error('所选上下文的材料版本在读取期间已变化，未创建任务。');
        files.push(artifactRef(artifact, revision, file));
      }
      return files;
    };
    const stableItemIdentities: string[] = []`);
  next = once(next, 'for (const stable of input.stableContextItems ?? [])', 'for (const stable of savedScope ? [] : input.stableContextItems ?? [])');
  next = once(next, '    const references: ContextManifestArtifactRefV0[] = []', `    const references: ContextManifestArtifactRefV0[] = []
    if (savedScope) {
      const identity = 'saved-scope:' + savedScope.scopeId;
      references.push(...appendMixedScope(savedScope, identity, 'context')); stableItemIdentities.push(identity);
    }`);
  next = once(next, '    for (const [index, item] of explicitReferences.entries()) {', `    for (const [index, item] of [...explicitReferences, ...[...selectedScopes].map(([order, scope]) => ({ order, scope }))].sort((left, right) => left.order - right.order).entries()) {
      if ('scope' in item) {
        references.push(...appendMixedScope(item.scope, 'reference:' + item.order + ':scope:' + item.scope.scopeId, 'reference'));
        continue;
      }`);
  next = once(next, 'for (const note of [...graph.notes].sort(byIdentity))', 'for (const note of [...(mixedScopeContextActive ? [] : graph.notes)].sort(byIdentity))');
  next = once(next, 'for (const checkpoint of [...graph.checkpoints].sort(byIdentity))', 'for (const checkpoint of [...(mixedScopeContextActive ? [] : graph.checkpoints)].sort(byIdentity))');
  next = once(next, '        maxItemCharacters: MAX_ITEM_CHARACTERS,', '        maxItemCharacters: mixedScopeContextActive ? MAX_TOTAL_CHARACTERS : MAX_ITEM_CHARACTERS,');
  next = once(next, '    const canonicalJson = JSON.stringify(base)', `    if (mixedScopeContextActive && JSON.stringify(this.repository.get(String(projectId))) !== JSON.stringify(graph))
      throw new Error('项目内容在完整读取期间已变化，请重试；未创建任务。');
    const canonicalJson = JSON.stringify(base)`);
  return next;
}
export function transformNativeCoreMixedScopeComposition(source, { sourcePath } = {}) {
  let next = original(source, sourcePath, composeSource, 'native-mixed-scope-read-port'); if (next === null) return source;
  next = readerImport(composeSource, 'registerMixedScopeReadPort, createMixedScopeReadPort') + next;
  return once(next, '  return {\n    catalog: options.catalog', `  // native-mixed-scope-read-port: reuse the already composed history and identity readers.
  if (metadata) registerMixedScopeReadPort(metadata, createMixedScopeReadPort(metadata, conversations, conversationIdentity));
  return {
    catalog: options.catalog`);
}
export function transformNativeCoreMixedScopeRunErrors(source, { sourcePath } = {}) {
  let next = original(source, sourcePath, runRoutesSource, 'native-mixed-scope-content-error'); if (next === null) return source;
  next = readerImport(runRoutesSource, 'MixedScopeReadError') + next;
  return once(next, "      sendJson(response, 409, failure('CONFLICT', error instanceof Error ? error.message : 'Run could not be created.'))", `      // native-mixed-scope-content-error: preserve only the explicit unsupported-content reason.
      const unsupportedScopeContent = error instanceof MixedScopeReadError
        && ['content_type_unsupported', 'conversation_media_unsupported'].includes(error.code)
      sendJson(response, 409, failure(unsupportedScopeContent ? 'MIXED_SCOPE_CONTENT_UNSUPPORTED' : 'CONFLICT',
        unsupportedScopeContent ? '这份内容包含暂不能完整加入对话的文件；输入和引用已保留。'
          : error instanceof Error ? error.message : 'Run could not be created.'))`);
}
export function createNativeCoreMixedScopeManifestTransforms() {
  return { [manifestSource]: transformNativeCoreMixedScopeManifest, [composeSource]: transformNativeCoreMixedScopeComposition, [runRoutesSource]: transformNativeCoreMixedScopeRunErrors };
}
