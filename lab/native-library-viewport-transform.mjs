import { parseOriginalDonorScript } from './agent-node-transform.mjs';

const TARGET = 'page-Da_DfwiK.js';
const HELPER = 'LCOSNativeLibraryViewport';
const NAMESPACE = 'LCOSNativeLibraryReactDOM';
const MARKER = '/* LCOS original Library viewport paint owner. */';
const IMPORT = `import{hD as ${NAMESPACE}}from"./index-BAQXnPag.js";\n`;
function walk(node, visit) { if (!node?.type) return; visit(node); for (const value of Object.values(node))
  if (Array.isArray(value)) value.forEach(child => walk(child, visit)); else if (value?.type) walk(value, visit); }
function one(root, predicate, label) { const found = []; walk(root, node => { if (predicate(node)) found.push(node); });
  if (found.length !== 1) throw Error(`Original Library viewport ${label} seam changed (${found.length}).`); return found[0]; }
const prop = (node, key) => node?.properties?.find(item => item.type === 'ObjectProperty' && (item.key?.name ?? item.key?.value) === key);

/** Only the existing jF return changes its DOM paint parent. React ownership,
 * original hooks/refs/handlers, animation and all Fragment siblings stay put.
 * The inline layer is between original Chat45 and Popover50; it does not raise
 * any global menu or introduce a second Library/window/root. */
export function transformNativeLibraryViewportScript(filename, source) {
  if (filename.split(/[\\/]/).pop() !== TARGET) return source;
  const program = parseOriginalDonorScript(source, filename);
  const library = one(program, node => node.type === 'VariableDeclarator' && node.id?.name === 'jF', 'jF').init;
  if (library?.type !== 'ArrowFunctionExpression' || library.body?.type !== 'BlockStatement') throw Error('Original Library viewport owner is no longer the original function.');
  const returns = library.body.body.filter(node => node.type === 'ReturnStatement');
  if (returns.length !== 1 || !returns[0].argument) throw Error('Original Library viewport final return seam changed.');
  const returned = returns[0].argument;
  const panel = one(library, node => node.type === 'CallExpression' && prop(node.arguments[1], 'data-library-panel'), 'physical panel');
  const style = prop(panel.arguments[1], 'style')?.value;
  if (style?.type !== 'ObjectExpression' || !prop(style, 'width') || !prop(style, 'bottom')) throw Error('Original Library viewport geometry seam changed.');
  if (source.includes(MARKER)) {
    if (returned.type !== 'CallExpression' || returned.callee?.name !== HELPER || returned.arguments.length !== 1
      || prop(style, 'zIndex')?.value?.value !== 46 || source.split(IMPORT).length !== 2)
      throw Error('Original Library viewport is only partially installed.');
    one(program, node => node.type === 'FunctionDeclaration' && node.id?.name === HELPER, 'portal helper');
    return source;
  }
  if (source.includes(HELPER) || source.includes(NAMESPACE) || prop(style, 'zIndex')) throw Error('Original Library viewport has a conflicting paint owner.');
  if (returned.type !== 'CallExpression' || returned.callee?.property?.name !== 'jsxs'
    || returned.arguments[0]?.property?.name !== 'Fragment') throw Error('Original Library viewport Fragment seam changed.');
  // The panel style lies inside the return: apply it before wrapping, so no
  // overlapping edit can drop the original children/handlers or duplicate JSX.
  const painted = source.slice(returned.start, style.end - 1) + ',zIndex:46' + source.slice(style.end - 1, returned.end);
  const output = IMPORT + source.slice(0, returned.start) + `${HELPER}(${painted})` + source.slice(returned.end)
    + `\n${MARKER}\nfunction ${HELPER}(children){return typeof document!=="undefined"&&document.body?${NAMESPACE}.createPortal(children,document.body):children;}\n`;
  parseOriginalDonorScript(output, filename);
  return output;
}
