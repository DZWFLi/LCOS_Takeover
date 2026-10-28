import path from 'node:path';
import { createRequire } from 'node:module';
import { installedRoot } from './pilot/build-pilot.mjs';
const root = path.resolve(import.meta.dirname, '..');
const ts = createRequire(path.join(installedRoot, 'package.json'))('typescript');
const owner = 'lcos/huabu/apps/web/src/lcos/professional/ConversationContinuationControls.tsx';
const marker = '/* native continuation product presentation */';
const nodes = (file, predicate) => { const found = []; const visit = node => { if (predicate(node)) found.push(node); ts.forEachChild(node, visit); }; visit(file); return found; };
const one = (values, label) => { if (values.length !== 1) throw Error('Original continuation presentation seam changed: ' + label); return values[0]; };

/** Only this original component's presentation expressions change. Its submit,
 * receipt validation, synchronous guards, immutable intent and retry remain original. */
export function transformNativeContinuationPresentationSource(source, { sourcePath } = {}) {
  if (typeof sourcePath !== 'string' || path.relative(root, path.resolve(sourcePath)).replaceAll('\\', '/').toLowerCase() !== owner.toLowerCase()) {
    throw Error('Continuation presentation requires its exact original sourcePath.');
  }
  if (source.includes(marker)) return source;
  const file = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  if (file.parseDiagnostics.length) throw Error('Original continuation presentation source must parse.');
  const edits = [], text = node => node.getText(file);
  const replace = (node, value) => edits.push({ start: node.getStart(file), end: node.end, value });
  const variable = name => one(nodes(file, node => ts.isVariableDeclaration(node) && text(node.name) === name), name);
  const modes = one(nodes(variable('MODES'), ts.isArrayLiteralExpression), 'original four modes');
  const expected = [['continue_existing', 'canResume', 'RotateCcw'], ['selected_context', 'canSelectedContext', 'Layers'],
    ['blank_new', 'canBlankNew', 'Plus'], ['native_full_fork', 'canFork', 'GitFork']];
  if (modes.elements.length !== expected.length) throw Error('Original continuation presentation seam changed: four modes');
  for (const [index, object] of modes.elements.entries()) {
    if (!ts.isObjectLiteralExpression(object) || object.properties.length !== 6) throw Error('Original continuation presentation seam changed: mode fields');
    const prop = name => one(object.properties.filter(node => ts.isPropertyAssignment(node) && text(node.name) === name), 'mode ' + name).initializer;
    const [action, capability, icon] = expected[index];
    if (!ts.isStringLiteral(prop('action')) || prop('action').text !== action || prop('capability').text !== capability || text(prop('Icon')) !== icon) {
      throw Error('Original continuation presentation seam changed: exact mode identity');
    }
    for (const key of ['label', 'history', 'context']) prop(key);
    replace(object, `{ action: ${text(prop('action'))}, capability: ${text(prop('capability'))}, Icon: ${text(prop('Icon'))}, ...nativeContinuationModeCopy(${JSON.stringify(action)}) }`);
  }
  replace(variable('capabilityReason').initializer, 'nativeContinuationCapabilityReason(action, projection?.capabilities[mode.capability], entry?.status)');
  const short = one(nodes(file, node => ts.isJsxElement(node) && node.openingElement.attributes.properties.some(attr => ts.isJsxAttribute(attr)
    && text(attr.name) === 'className' && attr.initializer && ts.isStringLiteral(attr.initializer) && attr.initializer.text === 'lcos-continuation-mode-short')), 'mode short label');
  const shortExpression = one(short.children.filter(ts.isJsxExpression), 'mode short expression');
  if (!shortExpression.expression || !text(shortExpression.expression).includes("'continue_existing'")) throw Error('Original continuation presentation seam changed: short mode choice');
  replace(shortExpression.expression, 'item.short');
  const errorText = one(nodes(file, node => ts.isJsxExpression(node) && node.expression && text(node.expression) === 'request.error.userMessage'), 'rendered request error');
  replace(errorText.expression, 'nativeContinuationErrorMessage(action, request.error)');
  const jsxText = (before, after) => replace(one(nodes(file, node => ts.isJsxText(node) && text(node).trim() === before), 'user text ' + before), after);
  jsxText('继承', '开始方式');
  jsxText('请求已提交，等待外部确认。可继续编辑下一份草稿。', '已提交，等待连接结果确认。你可以继续编辑草稿。');
  jsxText('核对或恢复原操作', '查看原请求并处理');
  const literal = (before, after) => replace(one(nodes(file, node => ts.isStringLiteral(node) && node.text === before), 'user copy ' + before), JSON.stringify(after));
  literal('本次提交 · 只读快照', '本次确认的材料');
  literal('请先在会话工作窗核对或恢复原操作', '请先查看原请求，核对连接结果。');
  let result = source;
  for (const edit of edits.sort((a, b) => b.start - a.start)) result = result.slice(0, edit.start) + edit.value + result.slice(edit.end);
  let specifier = path.relative(path.dirname(sourcePath), path.join(root, 'lab/pilot/native-continuation-presentation.ts')).replaceAll('\\', '/');
  if (!specifier.startsWith('.')) specifier = './' + specifier;
  return marker + '\nimport { nativeContinuationModeCopy, nativeContinuationCapabilityReason, nativeContinuationErrorMessage } from ' + JSON.stringify(specifier) + ';\n' + result;
}
export const nativeContinuationPresentationTransforms = { [owner]: transformNativeContinuationPresentationSource };
export function withNativeContinuationPresentationTransforms(existing = {}) {
  const result = { ...existing }, before = result[owner];
  result[owner] = before ? (source, options) => transformNativeContinuationPresentationSource(before(source, options), options) : transformNativeContinuationPresentationSource;
  return result;
}

