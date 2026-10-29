import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { installedRoot } from './pilot/build-pilot.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ts = createRequire(path.join(installedRoot, 'package.json'))('typescript');
const marker = '/* LCOS native Chatbox secondary routes. */';
const ownerFiles = {
  composer: 'lcos/huabu/apps/web/src/lcos/composer/LcosComposerHost.tsx',
  execution: 'lcos/huabu/apps/web/src/lcos/nodes/ExecutionNodeBody.tsx',
  returns: 'lcos/huabu/apps/web/src/lcos/professional/ArtifactReturnSection.tsx',
  arc: 'lcos/huabu/apps/web/src/lcos/navigation/LcosActionArc.tsx',
  continuation: 'lcos/huabu/apps/web/src/lcos/professional/ConversationContinuationControls.tsx',
  run: 'lcos/huabu/apps/web/src/lcos/professional/RunWorkViewBody.tsx',
};
function nodes(root, predicate) {
  const result = [];
  const visit = node => { if (predicate(node)) result.push(node); ts.forEachChild(node, visit); };
  visit(root); return result;
}
function one(found, label) {
  if (found.length !== 1) throw new Error(`Native secondary route: expected one ${label}, got ${found.length}.`);
  return found[0];
}
const specifier = (sourcePath, file) => {
  const result = path.relative(path.dirname(path.resolve(sourcePath)), path.join(root, file)).replaceAll('\\', '/');
  return result.startsWith('.') ? result : './' + result;
};
function transform(source, sourcePath, kind) {
  if (path.relative(root, path.resolve(sourcePath)).replaceAll('\\', '/').toLowerCase() !== ownerFiles[kind].toLowerCase())
    throw new Error('Native secondary route requires its exact copied source owner.');
  const file = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  if (file.parseDiagnostics.length) throw new Error('Native secondary route source is not valid TSX.');
  if (source.includes(marker)) return source;
  const edits = [];
  const replace = (node, text) => edits.push({ start: node.getStart(file), end: node.end, text });
  const calls = name => nodes(file, node => ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === name);
  const text = node => node.getText(file);
  if (kind === 'run') {
    const open = one(calls('openWindow').filter(node => text(node.arguments[0]) === "'run-review'"
      && text(node.arguments[1]) === "'重试任务'" && text(node.arguments[2]) === 'nextRunId'), 'legacy Run retry view');
    replace(open, 'requestNativeTaskView({projectId,runId:nextRunId,sourceRunId:runId})');
  } else if (kind === 'execution') {
    const open = one(calls('openWindow').filter(node => text(node.arguments[0]) === "'run-review'"), 'execution Run open');
    replace(open, `requestNativeTaskView({projectId:useLcosShellStore.getState().projectId ?? '',runId:${text(open.arguments[2])}})`);
  } else if (kind === 'returns') {
    const read = one(calls('openReader'), 'candidate material open');
    replace(read, 'requestNativeMaterialView({projectId,artifactId:review.artifactId!,revisionId:review.draftRevisionId!,title:review.title,returnId:review.returnId})');
  } else if (kind === 'arc') {
    const windows = calls('openWindow');
    const run = one(windows.filter(node => text(node.arguments[0]) === "'run-review'"), 'Arc Run open');
    replace(run, `requestNativeTaskView({projectId:shell.projectId ?? '',runId:${text(run.arguments[2])}})`);
    const conversations = windows.filter(node => text(node.arguments[0]) === "'conversation'");
    if (conversations.length !== 2) throw new Error('Native secondary route Arc conversation branches changed.');
    for (const [index, call] of conversations.entries()) replace(call,
      `requestNativeConversationView({projectId:shell.projectId ?? '',conversationId:${text(call.arguments[2])}${index === 1 ? ',section:command.id' : ''}})`);
    const focus = one(nodes(file, node => ts.isBinaryExpression(node) && text(node.left) === 'cancelSectionFocus.current'
      && ts.isCallExpression(node.right) && node.right.expression.getText(file) === 'focusConversationSection'), 'legacy window focus scheduling');
    replace(focus, 'cancelSectionFocus.current = undefined');
    const reader = one(calls('openReader'), 'Arc exact material reader');
    replace(reader, "requestNativeMaterialView({projectId:shell.projectId ?? '',artifactId:ref.entityId,artifactViewId:ref.artifactViewId,...(presentedRevisionId === undefined ? {} : {revisionId:presentedRevisionId}),nodeId,title:`阅读 · ${title}`})");
  } else if (kind === 'continuation') {
    const windows = calls('openWindow').filter(node => text(node.arguments[0]) === "'conversation'");
    if (windows.length !== 2) throw new Error('Native secondary route continuation request/recovery callers changed.');
    for (const call of windows) replace(call, "requestNativeConversationView({projectId,conversationId,section:'recover-session',continuationOperationId:request?.intent.operationId})");
  } else {
    const reader = one(calls('openReader'), 'Composer exact reference reader');
    replace(reader, "requestNativeMaterialView({projectId,artifactId,revisionId,title,composerOriginKey:inputKey,...(ref.entityType === 'view' || ref.entityType === 'artifactView' ? {artifactViewId:ref.entityId} : ref.artifactViewId ? {artifactViewId:ref.artifactViewId} : {})})");
    // Resolving a View's Artifact must not replace a revision already pinned
    // on the reference with that View's present revision or Artifact Current.
    const revision = one(nodes(file, node => ts.isBinaryExpression(node) && text(node.left) === 'revisionId'
      && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && text(node.right).includes('view?.revisionId')), 'exact reference revision resolution');
    replace(revision.right, `revisionId ?? (${text(revision.right)})`);
    const windows = calls('openWindow');
    const created = one(windows.filter(node => text(node.arguments[0]) === "'run-review'"), 'created Run open');
    replace(created, 'requestNativeTaskView({projectId,runId:createdRun.runId})');
    const conversations = windows.filter(node => text(node.arguments[0]) === "'conversation'");
    if (conversations.length !== 2) throw new Error('Native secondary route Composer conversation callers changed.');
    for (const call of conversations) replace(call, text(call.arguments[1]) === "'核对会话记录'"
      ? "requestNativeConversationView({projectId,conversationId:retainedSend.input.conversationId,section:'recover-session',continuationOperationId:retainedSend.input.continuationOperationId,messageId:retainedSend.input.messageId})"
      : `requestNativeConversationView({projectId,conversationId:${text(call.arguments[2])}})`);
    const close = one(nodes(file, node => ts.isCallExpression(node) && ts.isIdentifier(node.expression)
      && node.expression.text === 'useCloseOnEscape'), 'Composer Escape owner');
    replace(close.arguments[0], `!inline && (${text(close.arguments[0])})`);
    const pickingEscape = one(nodes(file, node => ts.isArrowFunction(node) && ts.isBlock(node.body)
      && node.parameters[0]?.name.getText(file) === 'event' && text(node).includes("setReferencePickOwner(null)")
      && text(node).includes("event.key !== 'Escape'")), 'canvas-reference Escape handler');
    edits.push({ start: pickingEscape.body.getStart(file) + 1, end: pickingEscape.body.getStart(file) + 1,
      text: '\n      if (event.isComposing || event.keyCode === 229 || inline && nativeChatHasHigherTransient()) return;\n' });
  }
  const imports = ['execution', 'run'].includes(kind) ? ['requestNativeTaskView'] : kind === 'arc' ? ['requestNativeTaskView', 'requestNativeConversationView'] : kind === 'continuation'
    ? ['requestNativeConversationView'] : kind === 'composer'
    ? ['requestNativeTaskView', 'requestNativeConversationView', 'nativeChatHasHigherTransient'] : [];
  const addition = marker + '\n' + (imports.length ? `import { ${imports.join(', ')} } from ${JSON.stringify(specifier(sourcePath, 'lab/pilot/native-task-route.ts'))};\n` : '')
    + (!['execution', 'continuation', 'run'].includes(kind) ? `import { requestNativeMaterialView } from ${JSON.stringify(specifier(sourcePath, 'lab/pilot/native-material-viewer-port.ts'))};\n` : '');
  let result = source;
  for (const edit of edits.sort((a, b) => b.start - a.start)) result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  return addition + result;
}
export const transformNativeTaskExecutionSource = (source, { sourcePath } = {}) => transform(source, sourcePath, 'execution');
export const transformNativeTaskReturnSource = (source, { sourcePath } = {}) => transform(source, sourcePath, 'returns');
export const transformNativeTaskComposerSource = (source, { sourcePath } = {}) => transform(source, sourcePath, 'composer');
export const nativeTaskRouteSourceTransforms = Object.fromEntries(Object.entries(ownerFiles).map(([kind, file]) => [file,
  (source, { sourcePath } = {}) => transform(source, sourcePath, kind)]));
