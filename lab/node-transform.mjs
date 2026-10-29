import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let parser, cachedInput, cachedOutput;
function parse(source, filename) {
  if (!parser) {
    const cache = path.join(process.env.LOCALAPPDATA || '', 'npm-cache', '_npx');
    const cachedParser = fs.existsSync(cache) && fs.readdirSync(cache).sort().map(entry => path.join(cache, entry, 'node_modules/playwright/lib/transform/babelBundle.js')).find(file => fs.existsSync(file));
    if (cachedParser) parser = require(cachedParser).babelParse;
    else {
      const store = 'E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/huabu/node_modules/.pnpm';
      const installed = fs.existsSync(store) && fs.readdirSync(store).find(entry => entry.startsWith('@babel+parser@'));
      if (!installed) throw new Error('Installed Babel parser unavailable; no download attempted.');
      const babel = require(path.join(store, installed, 'node_modules/@babel/parser/lib/index.js'));
      parser = (text, sourceFilename) => babel.parse(text, { sourceType: 'module', sourceFilename });
    }
  }
  return parser(source, filename, true);
}
function walk(root, visit) {
  const pending = [root];
  while (pending.length) {
    const node = pending.pop();
    if (!node || typeof node.type !== 'string') continue;
    visit(node);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) { for (const child of value) if (child?.type) pending.push(child); }
      else if (value?.type) pending.push(value);
    }
  }
}
const key = property => property?.type === 'ObjectProperty' && !property.computed ? property.key.name ?? property.key.value : null;
const prop = (object, name) => object?.properties?.find(property => key(property) === name);
const unique = (items, label) => {
  if (items.length !== 1) throw new Error('Canvas seam changed: expected one ' + label + ', got ' + items.length);
  return items[0];
};
const alias = (property, label) => {
  if (property?.value?.type !== 'Identifier') throw new Error('Canvas seam changed: ' + label);
  return property.value.name;
};
function seams(ast) {
  const program = ast.program ?? ast;
  const imports = program.body.filter(node => node.type === 'ImportDeclaration');
  const flow = unique(imports.filter(node => node.source.value.endsWith('UnlimitedModeToggle-D4wysAbz.js')).flatMap(node => node.specifiers.filter(s => s.imported?.name === 'i').map(s => s.local.name)), 'ReactFlow import');
  const canvas = unique(program.body.filter(node => node.type === 'FunctionDeclaration' && node.id?.name === 'bB'), 'Canvas root');
  const canvasId = alias(prop(canvas.params.find(p => p.type === 'ObjectPattern'), 'canvasId'), 'canvasId');
  const histories = [], historyNodeInputs = [], historySetters = [], stateTuples = [], roots = [], nodeProps = [];
  const draggable = [], commentModes = [], editingBlocks = [];
  walk(canvas.body, node => {
    if (node.type === 'ObjectProperty' && key(node) === 'nodesDraggable') draggable.push(node.value);
    if (node.type === 'ObjectPattern') {
      if (prop(node, 'isCommentMode')) commentModes.push(alias(prop(node, 'isCommentMode'), 'original comment mode'));
      if (prop(node, 'isCollaborationEditingBlocked')) editingBlocks.push(alias(prop(node, 'isCollaborationEditingBlocked'), 'original editing block'));
    }
    if (node.type === 'VariableDeclarator' && node.init?.callee?.name === 'B8' && prop(node.id, 'undo')) {
      histories.push(node.id);
      historyNodeInputs.push(alias(prop(node.init.arguments[0], 'nodes'), 'original O8 node input'));
      historySetters.push(alias(prop(node.init.arguments[0], 'setNodes'), 'original O8 node setter'));
    }
    if (node.type === 'VariableDeclarator' && node.id?.type === 'ArrayPattern') stateTuples.push(node.id.elements);
    if (node.type === 'CallExpression' && ['jsx', 'jsxs'].includes(node.callee?.property?.name) && node.arguments[0]?.name === flow) {
      const children = prop(node.arguments[1], 'children')?.value;
      if (children?.type === 'ArrayExpression') roots.push({ children, runtime: node.callee.object.name, flowProps: node.arguments[1] });
    }
    if (node.type === 'VariableDeclarator' && node.init?.type === 'CallExpression'
      && node.init.callee?.property?.name === 'useMemo') {
      walk(node.init.arguments[0], object => {
        if (object.type === 'ObjectExpression' && prop(object, 'nodes') && prop(object, 'onNodesChange')
          && prop(object, 'onEdgesChange')) nodeProps.push({ declarator: node, property: prop(object, 'nodes'), dependencies: node.init.arguments[1] });
      });
    }
  });
  const history = unique(histories, 'history binding'), root = unique(roots, 'ReactFlow children');
  const originalNodes = unique(historyNodeInputs, 'original O8 node input');
  const originalSetter = unique(historySetters, 'original O8 node setter');
  const flattenAnd = node => node?.type === 'LogicalExpression' && node.operator === '&&'
    ? [...flattenAnd(node.left), ...flattenAnd(node.right)] : [node];
  const terms = flattenAnd(unique(draggable, 'original draggable policy'));
  const preference = terms.at(-1);
  // Read the original explicit-tool terms, not the trailing movement preference:
  // disabling movement for a node is not a prohibition on reading its content.
  if (terms.length !== 8 || terms.slice(0, -1).some(node => node.type !== 'UnaryExpression'
    || node.operator !== '!' || node.argument?.type !== 'Identifier')
    || preference?.type !== 'LogicalExpression' || preference.operator !== '??'
    || preference.left?.property?.name !== 'draggable'
    || preference.left.object?.property?.name !== 'nodes') throw new Error('Canvas seam changed: original tool/movement policy.');
  const pointerInteraction = { toolFlags: terms.slice(0, -1).map(node => node.argument.name),
    commentMode: unique(commentModes, 'original comment mode'), editingBlocked: unique(editingBlocks, 'original editing block') };
  unique(stateTuples.filter(tuple => tuple[0]?.type === 'Identifier' && tuple[0].name === originalNodes
    && tuple[1]?.type === 'Identifier' && tuple[1].name === originalSetter), 'Canvas editing node state tuple shared with O8');
  return { program, canvasId, undo: alias(prop(history, 'undo'), 'undo'), redo: alias(prop(history, 'redo'), 'redo'), ...root,
    originalNodes, pointerInteraction,
    display: unique(nodeProps, 'original controlled Flow nodes memo') };
}
export const NODE_BRIDGE_ENTRY = '/startup-node-bridge.js';
export function transformNodeBridgeScript(filename, source) {
  if (filename.split(/[\\/]/).pop() !== 'page-Da_DfwiK.js') return source;
  if (source === cachedInput) return cachedOutput;
  const found = seams(parse(source, filename));
  const references = (source.match(/LCOSOriginalNodeBridge/g) || []).length;
  if (references === 2 && source.includes('from "/startup-node-bridge.js"')) return source;
  if (references) throw new Error('Node bridge partially installed; refusing ambiguous source.');
  const at = found.children.end - 1;
  const comma = found.children.elements.length && !source.slice(found.children.start + 1, at).trimEnd().endsWith(',') ? ',' : '';
  const nodesProperty = found.display.property;
  if (nodesProperty?.value?.type !== 'Identifier' || found.display.dependencies?.type !== 'ArrayExpression') {
    throw new Error('Canvas seam changed: original ReactFlow nodes/dependencies are unavailable.');
  }
  const nodeExpression = source.slice(nodesProperty.value.start, nodesProperty.value.end);
  const child = comma + found.runtime + '.jsx(LCOSOriginalNodeBridge,{canvasId:' + found.canvasId
    + ',undo:' + found.undo + ',redo:' + found.redo + ',originalNodes:' + found.originalNodes
    + ',pointerInteraction:{explicitToolActive:!!(' + [...found.pointerInteraction.toolFlags, found.pointerInteraction.commentMode].join('||')
    + '),interactivityLocked:!!' + found.pointerInteraction.editingBlocked + '}})';
  // This is the original Canvas's render-time node projection, not a second
  // Flow store or an updateNode/setNodes save. Hidden-only collapse stays out
  // of the vendor O8 and r6 persistence owners.
  const displayProjection = '__lcosCollectionDisplayNodes';
  const dependency = unique(found.display.dependencies.elements.filter(node => node?.type === 'Identifier'
    && node.name === nodeExpression), 'controlled Flow nodes memo dependency');
  const edits = [
    { start: at, end: at, text: child },
    { start: found.display.declarator.start, end: found.display.declarator.start,
      text: displayProjection + '=useLCOSCollectionDisplayProjection(' + nodeExpression + ',' + found.canvasId + '),' },
    { start: nodesProperty.value.start, end: nodesProperty.value.end, text: displayProjection },
    { start: dependency.start, end: dependency.end, text: displayProjection },
  ].sort((a, b) => b.start - a.start);
  let result = source;
  for (const edit of edits) result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  const importAt = found.program.body[0]?.start ?? 0;
  result = result.slice(0, importAt) + 'import { LCOSOriginalNodeBridge, useLCOSCollectionDisplayProjection } from "/startup-node-bridge.js";\n' + result.slice(importAt);
  seams(parse(result, filename));
  cachedInput = source; cachedOutput = result;
  return result;
}
