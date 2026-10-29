import { parseOriginalDonorScript } from './agent-node-transform.mjs';

const target = 'course-api-base-url-CifxI1ia.js';
const marker = '/* __LCOS_NATIVE_TIPTAP_AUTOSAVE__ */';
function walk(root, visit) {
  if (!root?.type) return;
  visit(root);
  for (const [key, value] of Object.entries(root)) {
    if (['loc', 'tokens', 'comments'].includes(key)) continue;
    if (Array.isArray(value)) value.forEach(node => walk(node, visit));
    else if (value?.type) walk(value, visit);
  }
}
function one(root, predicate, label) {
  const matches = []; walk(root, node => { if (predicate(node)) matches.push(node); });
  if (matches.length !== 1) throw new Error('Native Tiptap autosave seam changed: ' + label + ' (' + matches.length + ').');
  return matches[0];
}
const property = (object, name) => object?.properties?.find(node => (node.key?.name ?? node.key?.value) === name);
const jsx = (node, name) => node.type === 'CallExpression' && ['jsx', 'jsxs'].includes(node.callee?.property?.name)
  && node.arguments[0]?.name === name;

/** Mark only the existing vZ callback. hl/G7 and its update call stay native. */
export function transformNativeTiptapAutosaveScript(filename, source) {
  if (filename.split(/[\\/]/).pop() !== target || source.includes(marker)) return source;
  const ast = parseOriginalDonorScript(source, filename), edits = [];
  const view = one(ast, node => node.type === 'FunctionDeclaration' && node.id?.name === 'vZ', 'vZ');
  const actions = one(ast, node => node.type === 'FunctionDeclaration' && node.id?.name === 'UX', 'UX');
  const viewNodeId = property(view.params[0], 'nodeId').value.name;
  const api = one(view, node => node.type === 'VariableDeclarator' && node.id?.type === 'ObjectPattern'
    && property(node.id, 'updateNodeData') && node.init?.callee?.name === '_t', 'original update API');
  const updateName = property(api.id, 'updateNodeData').value.name;
  const update = one(view, node => node.type === 'CallExpression' && node.callee?.name === updateName
    && node.arguments[0]?.name === viewNodeId && property(node.arguments[1], 'text'), 'original autosave call');
  const body = source.slice(property(update.arguments[1], 'text').value.start, property(update.arguments[1], 'text').value.end);
  const patch = update.arguments[1], original = source.slice(patch.start, patch.end);
  edits.push({ start: patch.start, end: patch.end,
    text: '(window.__LCOS_NATIVE_TEXT_SAVE_PORT__?.autosavePatch?window.__LCOS_NATIVE_TEXT_SAVE_PORT__.autosavePatch('
      + viewNodeId + ',' + body + '):(' + original + '))' });
  const actionCall = one(view, node => jsx(node, 'UX'), 'original text action bar call');
  edits.push({ start: actionCall.arguments[1].end - 1, end: actionCall.arguments[1].end - 1,
    text: ',lcosAutosaveNodeId:' + viewNodeId });
  edits.push({ start: actions.params[0].end - 1, end: actions.params[0].end - 1, text: ',lcosAutosaveNodeId' });
  const bar = one(actions, node => jsx(node, 'XO'), 'original text action bar container');
  const children = property(bar.arguments[1], 'children').value;
  if (children.type !== 'ArrayExpression') throw new Error('Native Tiptap autosave action children changed.');
  // gm is the existing action-button exported by the original viewer parts.
  one(ast, node => ['VariableDeclarator', 'FunctionDeclaration'].includes(node.type)
    && node.id?.name === 'gm', 'original action button gm');
  const editable = property(actions.params[0], 'editable').value.name;
  edits.push({ start: children.end - 1, end: children.end - 1,
    text: ',lcosAutosaveNodeId&&a.jsx(LCOSNativeTiptapAutosaveStatus,{nodeId:lcosAutosaveNodeId,editable:'
      + editable + ',parts:{Button:gm}})' });
  let boundary = Infinity;
  for (const edit of edits.sort((a, b) => b.start - a.start || b.end - a.end)) {
    if (edit.end > boundary) throw new Error('Native Tiptap autosave edits overlap.');
    source = source.slice(0, edit.start) + edit.text + source.slice(edit.end); boundary = edit.start;
  }
  const result = 'import{NativeTiptapAutosaveStatus as LCOSNativeTiptapAutosaveStatus}from"/lcos/agent-ui.js";\n' + source + '\n' + marker;
  parseOriginalDonorScript(result, filename);
  return result;
}
