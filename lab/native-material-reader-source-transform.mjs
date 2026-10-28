import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { currentGen2Root } from './current-gen2-resources.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ts = createRequire(path.join(currentGen2Root, 'package.json'))('typescript');
const sourceFile = 'lcos/huabu/apps/web/src/lcos/shell/lcosShellStore.ts';
const pdfSourceFile = 'lcos/huabu/apps/web/src/lcos/ui/professional/ReaderPdfView.tsx';
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
  const pdfBefore = existing[pdfSourceFile];
  return { ...existing,
    [sourceFile]: before ? (source, options) => transformNativeMaterialReaderSource(before(source, options), options) : transformNativeMaterialReaderSource,
    [pdfSourceFile]: pdfBefore ? (source, options) => transformNativePdfDocumentSource(pdfBefore(source, options), options) : transformNativePdfDocumentSource,
  };
}

/** Keep the existing GN1 page rail/text/transfer renderer. react-pdf already
 * reads Blob through FileReader; reuse the exact bytes fetched by the Reader
 * owner instead of refetching its blob: URL through CSP connect-src. */
export function transformNativePdfDocumentSource(source, { sourcePath } = {}) {
  if (!sourcePath || path.resolve(sourcePath).toLowerCase() !== path.join(root, pdfSourceFile).toLowerCase())
    throw new Error('Native PDF document input must address the original ReaderPdfView.');
  if (source.includes('sourceBlob?: Blob')) return source;
  const ast = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const owner = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'ReaderPdfView');
  const parameter = owner?.parameters[0];
  if (!parameter || !ts.isObjectBindingPattern(parameter.name) || !parameter.type || !ts.isTypeLiteralNode(parameter.type))
    throw new Error('Original ReaderPdfView parameter seam changed.');
  const files = [];
  const visit = node => {
    if (ts.isJsxOpeningElement(node) && node.tagName.getText(ast) === 'Document')
      files.push(...node.attributes.properties.filter(attribute => ts.isJsxAttribute(attribute) && attribute.name.getText(ast) === 'file'));
    ts.forEachChild(node, visit);
  }; visit(owner);
  if (files.length !== 1 || files[0].initializer?.getText(ast) !== '{content.url}')
    throw new Error('Original react-pdf Document source seam changed.');
  const edits = [
    { start: parameter.name.getStart(ast) + 1, end: parameter.name.getStart(ast) + 1, text: ' sourceBlob,' },
    { start: parameter.type.getStart(ast) + 1, end: parameter.type.getStart(ast) + 1, text: ' readonly sourceBlob?: Blob;' },
    { start: files[0].initializer.getStart(ast), end: files[0].initializer.end, text: '{sourceBlob ?? content.url}' },
  ];
  for (const edit of edits.sort((a, b) => b.start - a.start)) source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  return source;
}
