import { parseOriginalDonorScript as parse } from './agent-node-transform.mjs';

const target = 'page-Da_DfwiK.js';
const helper = 'LCOSUseNativeMaterialExcerptDrop';
const marker = '/* LCOS excerpt through original c7/fi/addNodes. */';
function walk(node, visit) { if (!node?.type) return; visit(node); for (const value of Object.values(node))
  if (Array.isArray(value)) value.forEach(child => walk(child, visit)); else if (value?.type) walk(value, visit); }
function one(root, predicate, label) { const found = []; walk(root, node => { if (predicate(node)) found.push(node); });
  if (found.length !== 1) throw Error(`Original excerpt Drop ${label} seam changed (${found.length}).`); return found[0]; }

/** Follow native-file-upload. Its existing EventOwned guards remain first;
 * all original file/paste/plain callbacks and document cleanup remain native. */
export function transformNativeMaterialExcerptDropScript(filename, source) {
  if (filename.split(/[\\/]/).pop() !== target) return source;
  const ast = parse(source, filename), owner = one(ast, node => node.type === 'VariableDeclarator' && node.id?.name === 'c7', 'c7').init;
  if (source.includes(marker)) {
    if (!source.includes(`const __lcosExcerpt=${helper}(e.canvasId)`)) throw Error('Original excerpt Drop only partially installed.');
    return source;
  }
  if (source.includes(helper)) throw Error('Original excerpt Drop has a conflicting owner.');
  const edits = [], code = node => source.slice(node.start, node.end);
  const api = one(owner, node => node.type === 'VariableDeclarator' && node.id?.type === 'ObjectPattern'
    && node.init?.type === 'CallExpression' && node.init.callee?.name === '$e', 'existing Canvas API hook');
  if (api.id.properties.some(property => property.key?.name === 'addNodes')) throw Error('Original excerpt Drop addNodes is already owned.');
  edits.push({ start: api.id.end - 1, end: api.id.end - 1, text: ',addNodes:__lcosExcerptAddNodes' });
  edits.push({ start: owner.body.start + 1, end: owner.body.start + 1,
    text: `const __lcosExcerpt=${helper}(e.canvasId),__lcosExcerptPolicy=No();` });
  for (const name of ['m', 'p', 'x']) {
    const hook = one(owner, node => node.type === 'VariableDeclarator' && node.id?.name === name
      && node.init?.callee?.property?.name === 'useCallback', name).init;
    const callback = hook.arguments[0], guard = callback.body.body[0];
    if (guard?.type !== 'IfStatement' || guard.test?.callee?.name !== 'LCOSNativeFileUploadEventOwned'
      || guard.test.arguments[0]?.name !== 'y') throw Error('Original excerpt Drop requires the existing foremost file/Composer owner guard.');
    const insert = name === 'x'
      ? `if(__lcosExcerpt.has(y)){c(!1);await __lcosExcerpt.drop(y,{factory:fi,addNodes:__lcosExcerptAddNodes,screenToFlowPosition:s,allowedCreateTypes:__lcosExcerptPolicy.nodes?.allowedCreateTypes,notice:se});return;}`
      : `const __lcosExcerptOver=__lcosExcerpt.over(y,__lcosExcerptPolicy.nodes?.allowedCreateTypes);if(__lcosExcerptOver!==void 0){c(__lcosExcerptOver);return;}`;
    edits.push({ start: guard.end, end: guard.end, text: insert });
    const dependencies = hook.arguments[1];
    if (dependencies?.type !== 'ArrayExpression') throw Error('Original excerpt Drop callback dependencies changed.');
    edits.push({ start: dependencies.end - 1, end: dependencies.end - 1,
      text: name === 'x' ? ',__lcosExcerpt,__lcosExcerptPolicy.nodes?.allowedCreateTypes,__lcosExcerptAddNodes'
        : ',__lcosExcerpt,__lcosExcerptPolicy.nodes?.allowedCreateTypes' });
  }
  const hint = one(owner, node => node.type === 'CallExpression' && node.callee?.name === 'o'
    && node.arguments[0]?.value === 'drag.drop-to-upload', 'original overlay hint');
  edits.push({ start: hint.start, end: hint.end, text: `__lcosExcerpt.label()??(${code(hint)})` });
  let output = source;
  for (const edit of edits.sort((a, b) => b.start - a.start)) output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  output = `import{${helper}}from"/lcos/agent-ui.js";\n` + output + '\n' + marker;
  parse(output, filename); return output;
}
