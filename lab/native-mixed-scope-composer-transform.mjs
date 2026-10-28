import path from 'node:path';
import { createRequire } from 'node:module';
import { installedRoot } from './pilot/build-pilot.mjs';

const root = path.resolve(import.meta.dirname, '..');
const ts = createRequire(path.join(installedRoot, 'package.json'))('typescript');
const base = 'lcos/huabu/apps/web/src/lcos/composer/';
const owners = { snapshot: base + 'referenceSnapshot.ts', submission: base + 'composerSubmission.ts', host: base + 'LcosComposerHost.tsx', collaboration: 'lcos/apps/web-gen2/src/backend/collaboration.ts' };
const marker = '/* LCOS whole Scope in the original Composer. */';
function nodes(owner, predicate) {
  const found = []; const visit = node => { if (predicate(node)) found.push(node); ts.forEachChild(node, visit); };
  visit(owner); return found;
}
function one(values, label) {
  if (values.length !== 1) throw new Error(`Native mixed Scope ${label} seam changed (${values.length}).`);
  return values[0];
}
function parsed(source, sourcePath) {
  const file = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  if (file.parseDiagnostics.length) throw new Error('Native mixed Scope owner must parse as TypeScript.');
  return file;
}
function owner(file, name) { return one(nodes(file, node => ts.isFunctionDeclaration(node) && node.name?.text === name), name); }
function transform(source, { sourcePath } = {}, kind) {
  if (typeof sourcePath !== 'string' || path.relative(root, path.resolve(sourcePath)).replaceAll('\\', '/').toLowerCase() !== owners[kind].toLowerCase())
    throw new Error('Native mixed Scope transform requires its exact existing sourcePath.');
  if (source.includes(marker)) return source;
  const file = parsed(source, sourcePath), edits = [];
  const text = node => node.getText(file);
  const replace = (node, replacement) => edits.push({ start: node.getStart(file), end: node.end, text: replacement });
  let addition = marker + '\n';
  if (kind === 'snapshot') {
    const draft = owner(file, 'draftReferenceUnavailableReason'), run = owner(file, 'runReferenceUnavailableReason');
    const continuationGuard = one(nodes(draft, node => ts.isIfStatement(node)
      && text(node.expression).includes("intent === 'continue'") && text(node.expression).includes("mapped.type !== 'artifact'")), 'continuation type guard');
    replace(continuationGuard.expression, `(${text(continuationGuard.expression)}) && mapped.type !== 'scope'`);
    const invalid = one(nodes(draft, node => ts.isIfStatement(node) && text(node.expression) === '!mapped'), 'mapped identity guard');
    edits.push({ start: invalid.end, end: invalid.end, text: `\n  if (mapped.type === 'scope' && ((ref.mode !== undefined && ref.mode !== 'full')\n    || ref.revisionId !== undefined || ref.artifactId !== undefined || ref.artifactViewId !== undefined || ref.mimeType !== undefined)) {\n    return '整份内容请使用全文范围地址；材料版本和文件信息不能替代 Scope，原输入保留。';\n  }` });
    const runGuard = one(nodes(run, node => ts.isIfStatement(node)
      && text(node.expression).includes("mapped?.type !== 'artifact'") && text(node.expression).includes("mapped?.type !== 'view'")), 'Run type guard');
    replace(runGuard.expression, `(${text(runGuard.expression)}) && mapped?.type !== 'scope'`);
  } else if (kind === 'submission') {
    const foreground = owner(file, 'composerForegroundUnavailableReason');
    const resultSlot = one(nodes(foreground, node => ts.isIfStatement(node) && text(node.expression) === "ref.entityType === 'result-slot'"), 'foreground result slot');
    edits.push({ start: resultSlot.end, end: resultSlot.end,
      text: "\n  if (ref.entityType === 'scope') return runReferenceUnavailableReason(ref);" });
    const run = owner(file, 'buildComposerRunInput');
    const snapshots = one(nodes(run, node => ts.isVariableDeclaration(node) && text(node.name) === 'foregroundSnapshots'), 'foreground snapshots');
    const filter = one(nodes(snapshots, node => ts.isArrowFunction(node)), 'foreground snapshot filter');
    replace(filter.body, `ref.entityType === 'scope' || (${text(filter.body)})`);
    const contextIds = one(nodes(run, node => ts.isPropertyAssignment(node) && text(node.name) === 'contextArtifactIds'), 'foreground Artifact identity list');
    const identityMap = one(nodes(contextIds, node => ts.isCallExpression(node) && text(node.expression) === 'contextRefs.map'), 'foreground Artifact map');
    replace(identityMap.expression, "contextRefs.filter(ref => ref.entityType === 'artifact').map");
  } else if (kind === 'collaboration') {
    const errorOwner = owner(file, 'toProductError');
    const typedError = one(nodes(errorOwner, node => ts.isIfStatement(node)
      && text(node.expression) === 'error instanceof CoreApiError'), 'original typed collaboration error');
    if (!ts.isBlock(typedError.thenStatement)) throw new Error('Native mixed Scope typed error block changed.');
    edits.push({ start: typedError.thenStatement.getStart(file) + 1, end: typedError.thenStatement.getStart(file) + 1,
      text: `\n    if (error.code === 'MIXED_SCOPE_CONTENT_UNSUPPORTED') {
      return { ok: false, error: collaborationProductErrorV1('unavailable', '这份内容包含暂不能完整加入对话的图片、PDF 或其他文件；输入和引用已保留。', { retryable: false, diagnosticsRef: error.code }) };
    }` });
  } else {
    const host = owner(file, 'LcosComposerHost');
    const inspect = one(nodes(host, node => ts.isVariableDeclaration(node) && text(node.name) === 'inspectReference'), 'reference inspection');
    const body = one(nodes(inspect, node => ts.isTryStatement(node)), 'existing inspection try');
    edits.push({ start: body.tryBlock.getStart(file) + 1, end: body.tryBlock.getStart(file) + 1, text: `\n      if (ref.entityType === 'scope') {\n        const unavailable = draftReferenceUnavailableReason(ref, composerTarget?.intent);\n        if (unavailable) throw new Error(unavailable);\n        const current = useLcosShellStore.getState();\n        if (request.signal.aborted || current.projectId !== projectId || composerInputKey(current.composerTarget) !== inputKey
          || current.composerTarget?.messageId !== composerTarget?.messageId || current.composerTarget?.continuationOperationId !== composerTarget?.continuationOperationId) return;\n        await requestNativeScopeReferenceView({ projectId, scopeId: ref.entityId, title, composerOriginKey: inputKey, signal: request.signal,
          ...(composerTarget?.messageId === undefined ? {} : { messageId: composerTarget.messageId }),
          ...(composerTarget?.continuationOperationId === undefined ? {} : { continuationOperationId: composerTarget.continuationOperationId }) });\n        return;\n      }` });
    const inspectionCleanup = one(nodes(host, node => ts.isCallExpression(node) && text(node.expression) === 'useEffect'
      && node.arguments[0] && text(node.arguments[0]).includes('inspectRequest.current?.abort()')), 'original inspection cleanup');
    if (text(inspectionCleanup.arguments[1]) !== '[projectId, inputKey]') throw new Error('Native mixed Scope inspection ownership dependencies changed.');
    replace(inspectionCleanup.arguments[1], '[projectId, inputKey, composerTarget?.messageId, composerTarget?.continuationOperationId]');
    const inspectionError = one(nodes(body.catchClause, node => ts.isIfStatement(node) && text(node.expression) === '!request.signal.aborted'), 'original inspection error owner');
    edits.push({ start: body.catchClause.block.getStart(file) + 1, end: body.catchClause.block.getStart(file) + 1,
      text: '\n      const errorOwner = useLcosShellStore.getState();' });
    replace(inspectionError.expression, `!request.signal.aborted && !(error instanceof Error && error.name === 'AbortError') && inspectRequest.current === request
      && errorOwner.projectId === projectId && composerInputKey(errorOwner.composerTarget) === inputKey
      && errorOwner.composerTarget?.messageId === composerTarget?.messageId
      && errorOwner.composerTarget?.continuationOperationId === composerTarget?.continuationOperationId`);
    const onOpen = one(nodes(host, node => ts.isPropertyAssignment(node) && text(node.name) === 'onOpen'
      && text(node.initializer).includes('inspectReference(ref, label)')), 'existing reference chip');
    if (!ts.isConditionalExpression(onOpen.initializer)) throw new Error('Native mixed Scope reference open branch changed.');
    replace(onOpen.initializer.condition, `ref.entityType === 'scope' || (${text(onOpen.initializer.condition)})`);
    const labels = one(nodes(file, node => ts.isVariableDeclaration(node) && text(node.name) === 'ENTITY_LABEL'), 'reference labels');
    edits.push({ start: labels.initializer.getStart(file) + 1, end: labels.initializer.getStart(file) + 1, text: "\n  scope: '内容范围'," });
    let specifier = path.relative(path.dirname(sourcePath), path.join(root, 'lab/pilot/native-scope-reference-port.ts')).replaceAll('\\', '/');
    if (!specifier.startsWith('.')) specifier = './' + specifier;
    addition += `import { requestNativeScopeReferenceView } from ${JSON.stringify(specifier)};\n`;
  }
  let result = source;
  for (const edit of edits.sort((a, b) => b.start - a.start)) result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  result = addition + result; parsed(result, sourcePath); return result;
}
export const nativeMixedScopeComposerTransforms = Object.fromEntries(Object.entries(owners).map(([kind, file]) => [file, (source, options) => transform(source, options, kind)]));
export function withNativeMixedScopeComposerTransforms(existing = {}) {
  const result = { ...existing };
  for (const [file, adapt] of Object.entries(nativeMixedScopeComposerTransforms)) {
    const before = result[file]; result[file] = before ? (source, options) => adapt(before(source, options), options) : adapt;
  }
  return result;
}






