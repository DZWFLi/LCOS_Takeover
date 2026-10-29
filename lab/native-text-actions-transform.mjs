import { parseOriginalDonorScript as parse } from './agent-node-transform.mjs';

const target = 'course-api-base-url-CifxI1ia.js';
const owner = 'LCOSNativeTextNodeOwner', tools = 'LCOSUseNativeTextTools';
const importText = `import{${owner},${tools}}from"/lcos/native-text-first-ui.js";\n`;
const marker = '\n/* LCOS original text action owner */';
const property = (object, name) => object?.properties?.find(value => (value.key?.name ?? value.key?.value) === name)?.value;
function walk(node, visit) {
  if (!node?.type) return; visit(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(child => walk(child, visit));
    else if (value?.type) walk(value, visit);
  }
}
function matching(root, predicate) { const out = []; walk(root, node => { if (predicate(node)) out.push(node); }); return out; }
function one(values, label) { if (values.length !== 1) throw new Error(`Original text action ${label} seam changed (${values.length}).`); return values[0]; }
const jsx = (node, name) => node?.type === 'CallExpression' && node.callee?.object?.name === 'a'
  && node.callee?.property?.name === 'jsx' && node.arguments[0]?.name === name;
function renderer(program, name) {
  const binding = one(matching(program, node => node.type === 'VariableDeclarator' && node.id?.name === name), name);
  const fn = binding.init?.callee?.object?.name === 'd' && binding.init?.callee?.property?.name === 'memo' ? binding.init.arguments[0] : null;
  if (fn?.type !== 'ArrowFunctionExpression' || fn.body?.type !== 'BlockStatement') throw new Error('Original text renderer shape changed.');
  const slot = one(matching(fn, node => jsx(node, 'LCOSNativeTextBodySlot')), 'body slot');
  if (property(slot.arguments[1], 'NativeToolbar')) throw new Error('Original text action owner cannot coexist with an extra body toolbar.');
  const props = Object.fromEntries(['nodeId', 'data', 'width', 'height', 'selected', 'dragging', 'editable'].map(key => [key, property(slot.arguments[1], key)]));
  if (Object.values(props).some(value => value?.type !== 'Identifier')) throw new Error('Original text node owner props changed.');
  return { fn, props, result: one(fn.body.body.filter(node => node.type === 'ReturnStatement'), 'node return') };
}
function toolbar(program) {
  const fn = one(program.body.filter(node => node.type === 'FunctionDeclaration' && node.id?.name === 'rBe'), 'rBe');
  const rest = fn.params[0]?.properties?.find(value => value.type === 'RestElement')?.argument;
  const group = one(matching(fn, node => node.type === 'VariableDeclarator' && node.init?.callee?.name === 'iBe'), 'original iBe group');
  const call = one(matching(fn, node => jsx(node, 'xl')), 'original xl toolbar');
  const value = property(call.arguments[1], 'tools');
  if (rest?.type !== 'Identifier' || group.id?.type !== 'Identifier' || group.init.arguments[0]?.name !== rest.name)
    throw new Error('Original text toolbar node policy changed.');
  return { value, rest: rest.name, groups: group.id.name };
}
function edit(source, edits) {
  for (const item of edits.sort((a, b) => b.start - a.start)) source = source.slice(0, item.start) + item.text + source.slice(item.end);
  return source;
}

/** Runs after native-first Text's existing child/edit seam. Only two DOM-free
 * providers and rBe's original tools input change. ua/xl/zde/JT and JU remain. */
export function transformNativeTextActionsScript(filename, source) {
  if (filename.split(/[\\/]/).pop() !== target) return source;
  const program = parse(source, filename), installed = source.endsWith(marker);
  const renderers = ['r4', 's4'].map(name => renderer(program, name));
  const action = toolbar(program);
  if (installed) {
    if (source.split(importText).length !== 2 || renderers.some(value => !jsx(value.result.argument, owner))
      || action.value?.callee?.name !== tools) throw new Error('Original text action owner is partially installed.');
    return source;
  }
  if (source.includes(owner) || source.includes(tools) || action.value?.name !== action.groups)
    throw new Error('Original text action owner is partial or the original tools input changed.');
  const slice = value => source.slice(value.start, value.end);
  const edits = renderers.map(({ props, result }) => ({ start: result.argument.start, end: result.argument.end,
    text: `a.jsx(${owner},{${Object.entries(props).map(([key, value]) => `${key}:${slice(value)}`).join(',')},children:${slice(result.argument)}})` }));
  edits.push({ start: action.value.start, end: action.value.end,
    text: `${tools}(${action.rest}.nodeId,${action.groups},a.jsx(Ni,{opacity:1}))` });
  const transformed = importText + edit(source, edits) + marker;
  parse(transformed, filename);
  return transformed;
}

/** Exact-source preservation proof, including the original generative input,
 * original edit policy, all toolbar groups and focus/zoom wrappers. */
export function restoreNativeTextActionsScriptForComparison(filename, source) {
  if (filename.split(/[\\/]/).pop() !== target) return source;
  const program = parse(source, filename), action = toolbar(program);
  const edits = ['r4', 's4'].map(name => {
    const value = renderer(program, name).result.argument;
    const child = property(value.arguments?.[1], 'children');
    if (!jsx(value, owner) || !child) throw new Error('Original text node owner wrapper changed.');
    return { start: value.start, end: value.end, text: source.slice(child.start, child.end) };
  });
  if (action.value?.callee?.name !== tools || action.value.arguments[1]?.name !== action.groups)
    throw new Error('Original text toolbar action owner changed.');
  edits.push({ start: action.value.start, end: action.value.end, text: action.groups });
  return edit(source, edits).replace(importText, '').replace(marker, '');
}
