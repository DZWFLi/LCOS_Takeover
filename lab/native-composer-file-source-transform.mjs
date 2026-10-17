import path from 'node:path';
import { createRequire } from 'node:module';
import { installedRoot } from './pilot/build-pilot.mjs';

const root = path.resolve(import.meta.dirname, '..');
const ts = createRequire(path.join(installedRoot, 'package.json'))('typescript');
const target = 'lcos/huabu/apps/web/src/lcos/composer/LcosComposerHost.tsx';
const marker = '/* LCOS system files in existing Composer input */';
const hook = 'useNativeComposerFileInput', predicate = 'hasNativeComposerFiles';
function nodes(parent, test) { const out = []; const visit = node => { if (test(node)) out.push(node); ts.forEachChild(node, visit); }; visit(parent); return out; }
function one(found, label) { if (found.length !== 1) throw new Error(`Native Composer file ${label} seam changed (${found.length}).`); return found[0]; }
function apply(source, edits) {
  for (const value of edits.sort((a, b) => b.start - a.start)) source = source.slice(0, value.start) + value.text + source.slice(value.end);
  return source;
}
function addition(sourcePath) {
  let specifier = path.relative(path.dirname(sourcePath), path.join(root, 'lab/pilot/native-composer-file-input.ts')).replaceAll('\\', '/');
  if (!specifier.startsWith('.')) specifier = './' + specifier;
  return `${marker}\nimport {${hook},${predicate}} from ${JSON.stringify(specifier)};\n`;
}

/** The native Chatbox already renders this controlled Composer inline. Only
 * its existing material DOM handlers gain Files before the excerpt branch. */
export function transformNativeComposerFileInputSource(source, { sourcePath } = {}) {
  if (typeof sourcePath !== 'string' || path.relative(root, path.resolve(sourcePath)).replaceAll('\\', '/').toLowerCase() !== target.toLowerCase())
    throw new Error('Native Composer file transform requires the exact existing Composer sourcePath.');
  if (source.includes(marker)) return source;
  const file = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  if (file.parseDiagnostics.length) throw new Error('Native Composer file source must parse before adaptation.');
  const owner = one(nodes(file, node => ts.isFunctionDeclaration(node) && node.name?.text === 'LcosComposerHost'), 'owner');
  const receive = one(nodes(owner, node => ts.isVariableStatement(node) && node.declarationList.declarations.some(value => value.name.getText(file) === 'receiveMaterial')), 'existing material receive');
  const edits = [{ start: receive.getStart(file), end: receive.getStart(file),
    text: `const receiveNativeFiles = ${hook}({projectId,inputKey,open,blocked:state==='submitting'||voiceState!=='idle',textareaRef,onNotice:setMaterialNotice,session});\n  ` }];
  const handlers = ['onMaterialDragOver', 'onMaterialDrop', 'onMaterialPaste'];
  for (const name of handlers) {
    const attribute = one(nodes(owner, node => ts.isJsxAttribute(node) && node.name.getText(file) === name), name);
    const callback = attribute.initializer?.expression;
    if (!callback || !ts.isArrowFunction(callback) || !ts.isBlock(callback.body) || callback.parameters[0]?.name.getText(file) !== 'event')
      throw new Error('Native Composer file original event handler shape changed.');
    const transfer = name === 'onMaterialPaste' ? 'event.clipboardData' : 'event.dataTransfer';
    const text = name === 'onMaterialDragOver'
      ? `\n        if(${predicate}(${transfer})){event.preventDefault();event.stopPropagation();event.dataTransfer.dropEffect=state==='submitting'||voiceState!=='idle'||preparingReferences?'none':'copy';return;}\n`
      : `\n        if(receiveNativeFiles(${transfer})){event.preventDefault();event.stopPropagation();return;}\n`;
    edits.push({ start: callback.body.getStart(file) + 1, end: callback.body.getStart(file) + 1, text });
  }
  const result = addition(sourcePath) + apply(source, edits);
  const parsed = ts.createSourceFile(sourcePath, result, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  if (parsed.parseDiagnostics.length) throw new Error('Native Composer Files adaptation produced invalid TSX.');
  return result;
}
export const nativeComposerFileSourceTransforms = { [target]: transformNativeComposerFileInputSource };

export function withNativeComposerFileSourceTransforms(existing = {}) {
  const result = { ...existing }, before = result[target];
  result[target] = before ? (source, options) => transformNativeComposerFileInputSource(before(source, options), options)
    : transformNativeComposerFileInputSource;
  return result;
}

export function restoreNativeComposerFileInputForComparison(source, { sourcePath } = {}) {
  if (!source.startsWith(addition(sourcePath))) throw new Error('Native Composer file import changed.');
  const file = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX), edits = [];
  const receive = one(nodes(file, node => ts.isVariableStatement(node) && node.declarationList.declarations.some(value => value.name.getText(file) === 'receiveNativeFiles')), 'added hook');
  // The new statement is followed by exactly one generated newline/indent.
  const trailing = source.slice(receive.end, receive.end + 3);
  if (trailing !== '\n  ') throw new Error('Native Composer file generated hook spacing changed.');
  edits.push({ start: receive.getStart(file), end: receive.end + 3, text: '' });
  for (const name of ['onMaterialDragOver', 'onMaterialDrop', 'onMaterialPaste']) {
    const attribute = one(nodes(file, node => ts.isJsxAttribute(node) && node.name.getText(file) === name), name);
    const callback = attribute.initializer.expression, guard = callback.body.statements[0];
    if (!ts.isIfStatement(guard) || !ts.isCallExpression(guard.expression)
      || ![predicate, 'receiveNativeFiles'].includes(guard.expression.expression.getText(file))) throw new Error('Native Composer file handler guard changed.');
    edits.push({ start: callback.body.getStart(file) + 1, end: guard.end + 1, text: '' });
  }
  return apply(source, edits).slice(addition(sourcePath).length);
}
