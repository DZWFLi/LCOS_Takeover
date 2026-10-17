import { parseOriginalDonorScript } from './agent-node-transform.mjs';

const TARGET = 'course-api-base-url-CifxI1ia.js';
const SLOT = 'LCOSNativeTextBodySlot';
const REQUEST_EDIT = 'LCOSRequestNativeTextEdit';
const IMPORT = `import{${SLOT},${REQUEST_EDIT}}from"/lcos/agent-ui.js";\n`;

function walk(root, visit) {
  const queue = [root];
  while (queue.length) {
    const node = queue.pop();
    if (!node || typeof node.type !== 'string') continue;
    visit(node);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) queue.push(...value.filter(child => child?.type));
      else if (value?.type) queue.push(value);
    }
  }
}

function one(items, label) {
  if (items.length !== 1) throw new Error(`Native text seam changed: expected one ${label}, got ${items.length}.`);
  return items[0];
}

const nameOf = key => key?.name ?? key?.value;
const jsxOf = (node, component) => node.type === 'CallExpression'
  && node.callee.type === 'MemberExpression' && node.callee.object.name === 'a'
  && node.callee.property.name === 'jsx' && node.arguments[0]?.name === component;

function nodesMatching(root, predicate) {
  const found = [];
  walk(root, node => { if (predicate(node)) found.push(node); });
  return found;
}

function rendererSeam(program, rendererName, installed) {
  const renderer = one(nodesMatching(program, node => node.type === 'VariableDeclarator'
    && node.id.name === rendererName), `${rendererName} text renderer`);
  const init = renderer.init;
  if (init?.type !== 'CallExpression' || init.callee.type !== 'MemberExpression'
    || init.callee.object.name !== 'd' || init.callee.property.name !== 'memo'
    || init.arguments[0]?.type !== 'ArrowFunctionExpression') {
    throw new Error(`Native text seam changed: ${rendererName} is not the original memoized renderer.`);
  }
  const body = init.arguments[0];
  const params = body.params[0];
  if (params?.type !== 'ObjectPattern') throw new Error('Native text seam changed: node props are not destructured.');
  const props = Object.fromEntries(params.properties.filter(property => property.type === 'ObjectProperty')
    .map(property => [nameOf(property.key), property.value.name]));
  if (!['id', 'data', 'width', 'height', 'selected', 'dragging'].every(key => typeof props[key] === 'string')) {
    throw new Error('Native text seam changed: original node props no longer have the measured body-slot shape.');
  }
  const shell = one(nodesMatching(body, node => jsxOf(node, 'wr')), `${rendererName} original node shell`);
  const call = one(nodesMatching(body, node => jsxOf(node, installed ? SLOT : 'e4')),
    `${rendererName} ${installed ? 'installed slot' : 'original Markdown body'}`);
  if (call.start <= shell.start || call.end >= shell.end) {
    throw new Error('Native text seam changed: the Markdown body is no longer inside the original node shell.');
  }
  const object = call.arguments[1];
  if (object?.type !== 'ObjectExpression') throw new Error('Native text seam changed: body props are not an object.');
  if (installed) {
    const original = object.properties.find(property => nameOf(property.key) === 'originalBody')?.value;
    if (!jsxOf(original, 'e4')) throw new Error('Native text seam changed: original Markdown fallback was lost.');
    return { call, original, props };
  }
  const keys = object.properties.map(property => nameOf(property.key));
  if (keys.join(',') !== 'markdown,editable,selected,onEdit') {
    throw new Error('Native text seam changed: original Markdown body props changed.');
  }
  const editable = object.properties.find(property => nameOf(property.key) === 'editable')?.value;
  if (editable?.type !== 'Identifier') throw new Error('Native text seam changed: original edit policy is not an identifier.');
  return { call, props, editable: editable.name };
}

function assertOriginalRegistry(program) {
  const entries = nodesMatching(program, node => node.type === 'ObjectProperty' && node.computed
    && node.key.type === 'MemberExpression' && node.key.object.name === 'ye' && node.key.property.name === 'TEXT'
    && node.value?.type === 'CallExpression' && node.value.callee.type === 'MemberExpression'
    && node.value.callee.object.name === 'd' && node.value.callee.property.name === 'memo'
    && node.value.arguments[0]?.name === 'dBe');
  one(entries, 'original TEXT renderer registration');
  const container = one(nodesMatching(program, node => node.type === 'FunctionDeclaration'
    && node.id.name === 'dBe'), 'original Text node container');
  one(nodesMatching(container, node => jsxOf(node, 'Tw')), 'original disabled-node shell');
  one(nodesMatching(container, node => jsxOf(node, 'o4')), 'original pure/generative Text router');
}

function toolbarEditSeam(program, installed) {
  const fn = one(nodesMatching(program, node => node.type === 'FunctionDeclaration' && node.id.name === 't4'), 'original text edit hook');
  const props = fn.params[0];
  if (props?.type !== 'ObjectPattern') throw new Error('Native text edit command props changed.');
  const nodeId = props.properties.find(property => nameOf(property.key) === 'nodeId')?.value?.name;
  const disabled = props.properties.find(property => nameOf(property.key) === 'disabled')?.value?.name;
  const opener = one(nodesMatching(fn, node => node.type === 'VariableDeclarator'
    && node.init?.type === 'CallExpression' && node.init.callee.name === 'Lx'), 'original text media opener').id.name;
  if (!nodeId || !disabled) throw new Error('Native text edit policy changed.');
  const originalMatches = node => node.type === 'CallExpression' && node.callee.name === opener
    && node.arguments[0]?.name === nodeId && node.arguments[1]?.type === 'ObjectExpression'
    && node.arguments[1].properties.length === 1 && nameOf(node.arguments[1].properties[0].key) === 'mode'
    && node.arguments[1].properties[0].value.value === 'edit';
  const call = one(nodesMatching(fn, node => installed
    ? node.type === 'CallExpression' && node.callee.name === REQUEST_EDIT : originalMatches(node)), 'text edit command');
  const original = installed ? call.arguments[1]?.body : call;
  if (!originalMatches(original) || installed && (call.arguments[0]?.name !== nodeId
    || call.arguments[1]?.type !== 'ArrowFunctionExpression' || call.arguments[1].params.length)) {
    throw new Error('Native text edit fallback changed.');
  }
  one(nodesMatching(fn, node => node.type === 'LogicalExpression' && node.operator === '||'
    && node.left.name === disabled && node.right === call), 'original disabled edit policy');
  return { call, original, nodeId };
}

/** Candidate integration seam: replace only the Markdown child inside each
 * existing Text shell, preserving pure/generative routing, menus, handles,
 * read-only policy, memoized node identities and the original body fallback.
 * The original edit command delegates only bound primary text to the host;
 * its disabled policy and unsupported/unbound media fallback remain intact. */
export function transformNativeTextScript(filename, source) {
  if (filename.split(/[\\/]/).pop() !== TARGET) return source;
  const program = parseOriginalDonorScript(source, filename);
  assertOriginalRegistry(program);
  const imports = program.body.filter(node => node.type === 'ImportDeclaration'
    && node.source.value === '/lcos/agent-ui.js'
    && node.specifiers.some(specifier => specifier.local.name === SLOT));
  const slots = nodesMatching(program, node => jsxOf(node, SLOT));
  if (imports.length === 1 && slots.length === 2) {
    if (!imports[0].specifiers.some(specifier => specifier.local.name === REQUEST_EDIT)) throw new Error('Native text seam is partially installed.');
    for (const name of ['r4', 's4']) rendererSeam(program, name, true);
    toolbarEditSeam(program, true);
    return source;
  }
  if (imports.length || slots.length) throw new Error('Native text seam is partially installed.');
  const edits = ['r4', 's4'].map(name => {
    const { call, props, editable } = rendererSeam(program, name, false);
    const original = source.slice(call.start, call.end);
    return { start: call.start, end: call.end,
      text: `a.jsx(${SLOT},{nodeId:${props.id},data:${props.data},width:${props.width},height:${props.height},selected:${props.selected},dragging:${props.dragging},editable:${editable},originalBody:${original}})` };
  });
  const command = toolbarEditSeam(program, false);
  edits.push({ start: command.call.start, end: command.call.end,
    text: `${REQUEST_EDIT}(${command.nodeId},()=>${source.slice(command.call.start, command.call.end)})` });
  const firstImport = one(program.body.filter(node => node.type === 'ImportDeclaration').slice(0, 1), 'first module import');
  edits.push({ start: firstImport.start, end: firstImport.start, text: IMPORT });
  let result = source;
  for (const edit of edits.sort((left, right) => right.start - left.start)) {
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  }
  const after = parseOriginalDonorScript(result, filename);
  assertOriginalRegistry(after);
  for (const name of ['r4', 's4']) rendererSeam(after, name, true);
  toolbarEditSeam(after, true);
  return result;
}

/** Test/diagnostic read-back of only this transform's original-body fallbacks. */
export function restoreNativeTextScriptForComparison(filename, source) {
  const program = parseOriginalDonorScript(source, filename);
  const edits = ['r4', 's4'].map(name => {
    const { call, original } = rendererSeam(program, name, true);
    return { start: call.start, end: call.end, text: source.slice(original.start, original.end) };
  });
  const command = toolbarEditSeam(program, true);
  edits.push({ start: command.call.start, end: command.call.end, text: source.slice(command.original.start, command.original.end) });
  let restored = source;
  for (const edit of edits.sort((left, right) => right.start - left.start)) {
    restored = restored.slice(0, edit.start) + edit.text + restored.slice(edit.end);
  }
  return restored.replace(IMPORT, '');
}
