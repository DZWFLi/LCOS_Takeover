import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { currentGen2Root } from './current-gen2-resources.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ts = createRequire(path.join(currentGen2Root, 'package.json'))('typescript');
const shell = 'lcos/huabu/apps/web/src/lcos/shell/lcosShellStore.ts';
const stage = 'lcos/huabu/apps/web/src/lcos/professional/ProfessionalWindowStage.tsx';
const viewer = 'lab/pilot/native-material-viewer.tsx';
const marker = '// native-reader-recovery delegation';
function once(source, before, after, label) {
  if (source.split(before).length !== 2) throw new Error('Native Reader recovery seam changed: ' + label);
  return source.replace(before, after);
}
function parse(source, file) {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  if (ast.parseDiagnostics.length) throw new Error('Native Reader recovery source does not parse: ' + file);
  return ast;
}
function prefix(file, names, module) {
  const relative = path.relative(path.dirname(path.join(root, file)), path.join(root, module)).replaceAll('\\', '/');
  return `${marker}\nimport { ${names} } from ${JSON.stringify(relative.startsWith('.') ? relative : './' + relative)};\n`;
}
export function transformNativeReaderRestoreShell(source) {
  source = source.replaceAll('\r\n', '\n');
  if (source.includes(marker)) return source;
  const result = prefix(shell, 'markNativeReaderRestoreCandidates', 'lab/pilot/native-reader-recovery-state') + once(source,
    'windows: sameTabRestored?.windows ?? diskRestored?.windows ?? [],',
    'windows: markNativeReaderRestoreCandidates(sameTabRestored?.windows ?? diskRestored?.windows ?? []),', 'setProject restored addresses');
  parse(result, shell); return result;
}
export function transformNativeReaderRestoreStage(source) {
  source = source.replaceAll('\r\n', '\n');
  if (source.includes(marker)) return source;
  let result = once(source, '  const windows = useLcosShellStore((s) => s.windows);\n  const windowRegions = useLcosShellStore((s) => s.windowRegions);',
    '  const sourceWindows = useLcosShellStore((s) => s.windows);\n  const sourceWindowRegions = useLcosShellStore((s) => s.windowRegions);\n  const { windows, windowRegions } = useNativeReaderRecoveryLayout(projectId, sourceWindows, sourceWindowRegions);', 'Stage existing presentation reads');
  result = once(result, 'bodyKey={item.bodyKey} windowId={item.id}', 'bodyKey={item.bodyKey} windowId={item.id} readerWindow={item}', 'Reader source address');
  result = once(result, '  readerRevisionId,\n  sourceLocator,', '  readerRevisionId,\n  readerWindow,\n  sourceLocator,', 'body source destructuring');
  result = once(result, '  readerRevisionId?: string;\n  sourceLocator?:', '  readerRevisionId?: string;\n  readerWindow?: LcosWindow;\n  sourceLocator?:', 'body source type');
  result = once(result, '    const references = useLcosReferenceStore.getState().nodeEntityRefs;',
    '    if (returnNativeRestoredReaderSource(projectId, reader, closeWindow)) return;\n    const references = useLcosReferenceStore.getState().nodeEntityRefs;', 'exact native Reader source return');
  const ast = parse(result, stage), returns = [];
  const visit = node => {
    if (ts.isCaseClause(node) && node.expression.getText(ast) === "'reader'") {
      const statement = node.statements.find(ts.isReturnStatement);
      if (statement?.expression?.getText(ast).includes('<ArtifactReaderBody')) returns.push(statement.expression);
    }
    ts.forEachChild(node, visit);
  }; visit(ast);
  if (returns.length !== 1) throw new Error('Native Reader recovery expects the actual one reader body dispatch.');
  const expression = returns[0];
  result = result.slice(0, expression.getStart(ast))
    + `<NativeRestoredReaderBody projectId={projectId} source={readerWindow} onClose={onClose} fallback={${expression.getText(ast)}} />`
    + result.slice(expression.end);
  result = prefix(stage, 'NativeRestoredReaderBody, useNativeReaderRecoveryLayout, returnNativeRestoredReaderSource', 'lab/pilot/native-reader-recovery') + result;
  parse(result, stage); return result;
}
export function transformNativeReaderRestoreViewer(source) {
  source = source.replaceAll('\r\n', '\n');
  if (source.includes(marker)) return source;
  let result = once(source,
    'runtime.open(value); };', 'runtime.open(attachNativeReaderRecovery(value, operation.current?.target)); };', 'original wa presentation');
  result = once(result, '&& canvas.status === \'ready\' && canvas.canvasId === owner.canvasId && canvas.rfInstance === owner.api;',
    '&& canvas.status === \'ready\' && canvas.canvasId === owner.canvasId && canvas.rfInstance === owner.api\n        && nativeReaderRecoveryCurrent(owner.target);', 'original async current check');
  result = once(result, "        present({ id: owner.viewerId, mode: editing ? 'edit' : 'view',",
    "        readyNativeReaderRecovery(target, version, owner.key);\n        present({ id: owner.viewerId, mode: editing ? 'edit' : 'view',", 'exact bytes/decode ready');
  result = once(result, '      } catch (error) {\n        if (!isCurrent(owner)) return;\n        present(',
    '      } catch (error) {\n        if (!isCurrent(owner)) return;\n        failNativeReaderRecovery(target);\n        present(', 'honest same-version error');
  result = once(result, '      const owner = operation.current;\n      if (!owner || state.session?.lcosControlled?.requestKey === owner.key) return;',
    '      const owner = operation.current;\n      if (owner) observeNativeReaderRecovery(owner.target, state);\n      if (!owner || state.session?.lcosControlled?.requestKey === owner.key) return;', 'actual phase/open acknowledgement');
  result = once(result, '      if (!state.session) {\n        const shell = useLcosShellStore.getState();',
    '      if (!state.session) {\n        if (closeNativeReaderRecovery(owner.target)) return;\n        const shell = useLcosShellStore.getState();', 'actual closed acknowledgement');
  result = once(result, 'await open({ projectId: target.projectId, artifactId: exact.artifactId, revisionId: exact.revisionId, title: exact.title,',
    'await open(inheritNativeReaderRecovery(target, { projectId: target.projectId, artifactId: exact.artifactId, revisionId: exact.revisionId, title: exact.title,', 'same-session source trail');
  result = once(result, 'legacyReturnWindowId: target.legacyReturnWindowId },\n          inputReturn, [...owner.trail,',
    'legacyReturnWindowId: target.legacyReturnWindowId }),\n          inputReturn, [...owner.trail,', 'same-session source trail end');
  result = prefix(viewer, 'attachNativeReaderRecovery, readyNativeReaderRecovery, nativeReaderRecoveryCurrent, observeNativeReaderRecovery, closeNativeReaderRecovery, failNativeReaderRecovery, inheritNativeReaderRecovery',
    'lab/pilot/native-reader-recovery-state') + result;
  parse(result, viewer); return result;
}
export const nativeReaderRecoverySourceTransforms = {
  [shell]: transformNativeReaderRestoreShell,
  [stage]: transformNativeReaderRestoreStage,
};
export const nativeReaderRecoveryViewerSource = viewer;
/** Root composes this last on the LCOS source-transform map, not donor assets. */
export function withNativeReaderRecoverySourceTransforms(existing = {}) {
  const result = { ...existing };
  for (const [file, transform] of Object.entries(nativeReaderRecoverySourceTransforms)) {
    const before = result[file];
    result[file] = before ? (source, options) => transform(before(source, options), options) : transform;
  }
  return result;
}
