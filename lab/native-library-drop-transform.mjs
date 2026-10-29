import { parseOriginalDonorScript as parse } from './agent-node-transform.mjs';
const target = 'page-Da_DfwiK.js';
const START = 'LCOSNativeLibraryDragStart', FALLBACK = 'LCOSNativeLibraryDropFallback';
const ownImport = `import{${START},${FALLBACK}}from"/lcos/agent-ui.js";\n`;
const marker = '\n/* LCOS original Ko to existing Assembly transport */';
const noticeMarker = '\n/* LCOS original Drop notice supplied to the existing host */';
const property = (object, name) => object?.properties?.find(p => (p.key?.name ?? p.key?.value) === name)?.value;
function walk(node, visit) { if (!node?.type) return; visit(node); for (const value of Object.values(node))
  if (Array.isArray(value)) value.forEach(child => walk(child, visit)); else if (value?.type) walk(value, visit); }
function matching(root, test) { const values = []; walk(root, node => { if (test(node)) values.push(node); }); return values; }
function one(values, label) { if (values.length !== 1) throw new Error(`Original Library ${label} seam changed (${values.length}).`); return values[0]; }
function binding(program, name) { return one(matching(program, n => n.type === 'VariableDeclarator' && n.id?.name === name), name); }
function seams(program, source) {
  const row = binding(program, 'Zp').init, asset = property(row.params?.[0], 'asset');
  const drag = one(matching(row, node => node.type === 'VariableDeclarator' && node.init?.callee?.property?.name === 'useCallback'
    && matching(node.init.arguments[0], n => n.type === 'CallExpression' && n.callee?.property?.name === 'setData'
      && n.arguments[0]?.name === 'Ko').length === 1), 'Ko dragstart').init.arguments[0];
  const effect = one(matching(drag, node => node.type === 'AssignmentExpression' && node.left?.property?.name === 'effectAllowed'
    && node.right?.value === 'move'), 'original move effect');
  if (asset?.type !== 'Identifier' || drag.params[0]?.type !== 'Identifier' || drag.body?.type !== 'BlockStatement'
    || source[effect.end] !== ',') throw new Error('Original Ko drag statement changed.');
  const library = binding(program, 'jF').init;
  const drop = one(matching(library, node => node.type === 'VariableDeclarator' && node.init?.type === 'ArrowFunctionExpression'
    && matching(node.init, n => n.type === 'CallExpression' && n.callee?.name === 'Qe').length === 1
    && matching(node.init, n => n.type === 'CallExpression' && n.callee?.name === 'jk').length === 1), 'document Ko drop').init;
  const factory = one(matching(drop, n => n.type === 'VariableDeclaration' && n.declarations.some(d => d.init?.callee?.name === 'Qe')), 'Qe/Te fallback');
  const parsed = one(matching(drop, n => n.type === 'VariableDeclarator' && n.init?.callee?.name === 'jk'), 'Ko parser');
  const parsedStatement = one(matching(drop, n => n.type === 'VariableDeclaration' && n.declarations.includes(parsed)), 'Ko parser statement');
  if (drop.params[0]?.type !== 'Identifier' || parsed.id?.type !== 'Identifier' || parsed.init.arguments[0]?.type !== 'Identifier')
    throw new Error('Original Ko drop payload changed.');
  return { drag, effect, event: drag.params[0].name, asset: asset.name, drop, raw: parsed.init.arguments[0].name, parsedStatement, factory };
}

/** A reviewable original-source patch. No new row, drag image,
 * Canvas factory, semantic resolver, store or backend producer is introduced. */
export function transformNativeLibraryDropScript(filename, source) {
  if (filename.split(/[\\/]/).pop() !== target) return source;
  const program = parse(source, filename);
  if (source.includes(marker)) {
    if (source.split(ownImport).length !== 2 || matching(program, n => n.type === 'CallExpression' && n.callee?.name === START).length !== 1
      || matching(program, n => n.type === 'CallExpression' && n.callee?.name === FALLBACK).length !== 1)
      throw new Error('Original Library transport is partially installed.');
    return source;
  }
  if (source.includes(START) || source.includes(FALLBACK)) throw new Error('Original Library transport is partially installed.');
  const seam = seams(program, source);
  const edits = [
    { start: seam.effect.end, end: seam.effect.end + 1,
      text: `;if(${START}(${seam.event},${seam.asset},message=>se.error(message))==="rejected")return;` },
    { start: seam.parsedStatement.start, end: seam.parsedStatement.start,
      text: `if(${FALLBACK}(${seam.drop.params[0].name},${seam.raw},message=>se.error(message)))return;` },
  ];
  let result = source; for (const edit of edits.sort((a, b) => b.start - a.start)) result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  result = ownImport + result + marker; parse(result, filename); return result;
}
export function restoreNativeLibraryDropScriptForComparison(filename, transformed, original) {
  if (filename.split(/[\\/]/).pop() !== target) return transformed;
  if (typeof original !== 'string' || transformed !== transformNativeLibraryDropScript(filename, original))
    throw new Error('Original Library transport restore needs its exact input and reversible output.');
  return original;
}

/** Applied after the original host adaptation, so the actual donor Rt alias
 * enters the same React/provider tree without a new Toast root or portal. */
export function transformNativeLibraryDropNoticeScript(filename, source) {
  if (filename.split(/[\\/]/).pop() !== target) return source;
  const program = parse(source, filename);
  const toastImports = program.body.filter(node => node.type === 'ImportDeclaration' && /(?:^|\/)index-BAQXnPag\.js$/.test(node.source.value))
    .flatMap(node => node.specifiers).filter(node => node.type === 'ImportSpecifier' && node.local?.name === 'se' && node.imported?.name === 'al');
  one(toastImports, 'original Rt toast alias');
  const host = one(matching(program, node => node.type === 'CallExpression' && ['jsx', 'jsxs'].includes(node.callee?.property?.name)
    && node.arguments[0]?.name === 'LCOSProfessionalHost'), 'existing professional host');
  const props = host.arguments[1];
  if (props?.type !== 'ObjectExpression') throw new Error('Original Drop notice host props changed.');
  const existing = props.properties.filter(item => (item.key?.name ?? item.key?.value) === 'NativeDropNotice');
  if (source.includes(noticeMarker)) {
    if (existing.length !== 1 || existing[0].value?.name !== 'se') throw new Error('Original Drop notice is only partially supplied.');
    return source;
  }
  if (existing.length) throw new Error('Original Drop notice is only partially supplied.');
  const result = source.slice(0, props.end - 1) + `${props.properties.length ? ',' : ''}NativeDropNotice:se` + source.slice(props.end - 1) + noticeMarker;
  parse(result, filename); return result;
}
export function restoreNativeLibraryDropNoticeScriptForComparison(filename, transformed, original) {
  if (filename.split(/[\\/]/).pop() !== target) return transformed;
  if (transformed !== transformNativeLibraryDropNoticeScript(filename, original)) throw new Error('Drop notice restore needs the exact input and output.');
  return original;
}
