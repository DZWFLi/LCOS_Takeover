import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { currentGen2Root } from './current-gen2-resources.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ts = createRequire(path.join(currentGen2Root, 'package.json'))('typescript');
const sourceFile = 'lcos/huabu/apps/web/src/lcos/shell/lcosShellStore.ts';
const moduleFile = path.join(root, 'lab/pilot/native-material-viewer-port');

/** Existing callers retain their precise revision/locator/return address. Only
 * the destination changes, once the original viewer bridge is really mounted. */
export function transformNativeMaterialReaderSource(source, { sourcePath } = {}) {
  if (source.includes('nativeMaterialViewerAvailable()')) return source;
  if (!sourcePath || path.resolve(sourcePath).toLowerCase() !== path.join(root, sourceFile).toLowerCase())
    throw new Error('Native Reader route must address the actual shell source.');
  const ast = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS), matches = [];
  const visit = node => {
    if (ts.isPropertyAssignment(node) && node.name.getText(ast) === 'openReader' && ts.isArrowFunction(node.initializer)) matches.push(node.initializer);
    ts.forEachChild(node, visit);
  }; visit(ast);
  if (matches.length !== 1) throw new Error('The existing Reader opening owner changed.');
  const owner = matches[0], body = owner.body;
  if (ts.isBlock(body)) throw new Error('Expected the actual expression-bodied Reader owner.');
  const relative = path.relative(path.dirname(sourcePath), moduleFile).replaceAll('\\', '/');
  return `import { nativeMaterialViewerAvailable, requestNativeMaterialView } from ${JSON.stringify(relative.startsWith('.') ? relative : './' + relative)};\n`
    + source.slice(0, body.getStart(ast))
    + `{\nconst nativeShell=get();\nconst nativeProjectId=nativeShell.projectId;\nif(nativeProjectId&&nativeMaterialViewerAvailable()){requestNativeMaterialView({projectId:nativeProjectId,artifactId,title,revisionId:options?.revisionId,composerOriginKey:options?.composerOriginKey,sourceLocator:options?.sourceLocator,nodeId:options?.source?.nodeId,sourceCanvasId:options?.source?nativeShell.surfaceCanvasId[options.source.surface]:undefined,legacyReturnWindowId:options?.returnToWindowId});return;}\nreturn ${body.getText(ast)};\n}`
    + source.slice(body.end);
}
export function withNativeMaterialReaderSourceTransforms(existing) {
  const before = existing[sourceFile];
  return { ...existing, [sourceFile]: before ? (source, options) => transformNativeMaterialReaderSource(before(source, options), options) : transformNativeMaterialReaderSource };
}
