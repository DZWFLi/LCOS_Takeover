import { parseOriginalDonorScript as parse } from './agent-node-transform.mjs';
const marker = '/* LCOS Glyth in original Add menu */';
function walk(node, visit) { if (!node?.type) return; visit(node); for (const [key, value] of Object.entries(node)) {
  if (['loc', 'tokens', 'comments'].includes(key)) continue;
  if (Array.isArray(value)) value.forEach(child => walk(child, visit)); else if (value?.type) walk(value, visit);
} }
const property = (node, name) => node?.properties?.find(item => (item.key?.name ?? item.key?.value) === name)?.value;
function one(root, test, name) { const matches = []; walk(root, node => { if (test(node)) matches.push(node); });
  if (matches.length !== 1) throw new Error('Original Glyth creation ' + name + ' changed.'); return matches[0]; }
export function transformNativeGlythCreationScript(filename, source) {
  if (filename.split(/[\\/]/).pop() !== 'page-Da_DfwiK.js' || source.includes(marker)) return source;
  const ast = parse(source, filename), toolbar = one(ast, node => node.type === 'VariableDeclarator' && node.id?.name === 'fH', 'toolbar');
  const menu = one(toolbar, node => node.type === 'ObjectExpression' && property(node, 'data-add-node-menu'), 'menu');
  const list = one(menu, node => node.type === 'CallExpression' && node.arguments[0]?.name === 'Ch', 'original command list');
  const children = property(list.arguments[1], 'children');
  if (children?.type !== 'ArrayExpression' || !source.slice(toolbar.start, toolbar.end).includes('[p,x]=l.useState(!1)'))
    throw new Error('Original Add menu state changed.');
  const addition = 'r.jsx(LCOSNativeGlythCreationSlot,{canvasId:e,disabled:!V,onClose:()=>x(!1),NativeGroup:ms}),';
  const result = 'import{LCOSNativeGlythCreationSlot}from"/lcos/agent-ui.js";\n'
    + source.slice(0, children.start + 1) + addition + source.slice(children.start + 1) + '\n' + marker;
  parse(result, filename); return result;
}
