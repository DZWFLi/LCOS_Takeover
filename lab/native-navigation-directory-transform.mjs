import { parseOriginalDonorScript } from './agent-node-transform.mjs';

const target = 'page-Da_DfwiK.js';
const courseTarget = 'course-api-base-url-CifxI1ia.js';
const marker = '/* lcos-native-navigation-directory */';
const property = (object, name) => object?.properties?.find(value => (value.key?.name ?? value.key?.value) === name)?.value;
function walk(node, visit) {
  if (!node?.type) return;
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'tokens', 'comments'].includes(key)) continue;
    if (Array.isArray(value)) value.forEach(child => walk(child, visit));
    else if (value?.type) walk(value, visit);
  }
}
function one(root, predicate, label) {
  const matches = []; walk(root, node => { if (predicate(node)) matches.push(node); });
  if (matches.length !== 1) throw new Error(`Original navigation directory ${label} changed (${matches.length}).`);
  return matches[0];
}

/** Keep H7 → UVe → xBe as the single original bottom camera row. Only its
 * existing leftSlot receives one controlled entry beside the native minimap. */
export function transformNativeNavigationDirectoryScript(filename, source) {
  const asset = filename.split(/[\\/]/).pop();
  if (![target, courseTarget].includes(asset) || source.includes(marker)) return source;
  const program = parseOriginalDonorScript(source, filename);
  if (asset === courseTarget) {
    const owner = one(program, node => node.type === 'VariableDeclarator' && node.id?.name === 'xBe', 'xBe camera owner');
    const exactDiv = value => one(owner, node => node.type === 'CallExpression' && node.arguments?.[0]?.value === 'div'
      && property(node.arguments[1], 'className')?.value === value, value + ' native div');
    const zoom = exactDiv('flex w-[77px] items-center');
    const pill = one(owner, node => node.type === 'CallExpression' && node.arguments?.[0]?.value === 'div'
      && property(node.arguments[1], 'className')?.type === 'CallExpression'
      && property(node.arguments[1], 'className').arguments?.[0]?.value === 'relative flex h-10 items-center gap-2 rounded-2xl bg-tap-background-secondary pl-2 pr-3', 'native camera pill');
    let result = source;
    for (const [call, tag] of [[pill, 'data-native-navigation-camera-pill'], [zoom, 'data-native-navigation-zoom']]
      .sort((a, b) => b[0].arguments[1].end - a[0].arguments[1].end)) {
      const offset = call.arguments[1].end - 1;
      result = result.slice(0, offset) + `,"${tag}":true` + result.slice(offset);
    }
    result += '\n' + marker + '\n';
    parseOriginalDonorScript(result, filename);
    return result;
  }
  const owner = one(program, node => node.type === 'VariableDeclarator' && node.id?.name === 'H7', 'H7 owner');
  const fn = owner.init, canvasId = property(fn?.params?.[0], 'canvasId');
  if (fn?.type !== 'ArrowFunctionExpression' || canvasId?.type !== 'Identifier')
    throw new Error('Original navigation directory canvas props changed.');
  for (const [local, imported] of [['gs', 'Y'], ['pr', 'a1']]) {
    one(program, node => node.type === 'ImportDeclaration' && node.source?.value === './index-BAQXnPag.js'
      && node.specifiers?.some(specifier => specifier.local?.name === local && specifier.imported?.name === imported), `${local} original leaf`);
  }
  const tutorial = one(fn.body, node => node.type === 'VariableDeclarator' && node.init?.type === 'CallExpression'
    && node.init.callee?.name === 'xn' && node.init.arguments?.[0]?.name === 'Ua', 'tutorial protection');
  const minimap = one(fn.body, node => node.type === 'CallExpression' && node.arguments?.[0]?.name === 'Hj', 'native minimap wrapper');
  const render = property(minimap.arguments[1], 'children');
  if (render?.type !== 'ArrowFunctionExpression' || render.params[0]?.type !== 'Identifier')
    throw new Error('Original navigation directory minimap render slot changed.');
  const camera = one(render.body, node => node.type === 'CallExpression' && node.arguments?.[0]?.name === 'Gj', 'native camera');
  const row = one(render.body, node => node.type === 'CallExpression' && node.arguments?.[0]?.value === 'div'
    && property(node.arguments[1], 'className')?.value === 'flex items-center gap-x-3', 'native bottom row');
  const slot = property(camera.arguments[1], 'leftSlot');
  if (slot?.type !== 'Identifier' || slot.name !== render.params[0].name || tutorial.id?.type !== 'Identifier')
    throw new Error('Original navigation directory leftSlot changed.');
  if (source.includes('LCOSNativeNavigationDirectoryEntry')) throw new Error('Original navigation directory is partially installed.');
  const replacement = `r.jsxs(r.Fragment,{children:[${source.slice(slot.start, slot.end)},r.jsx(LCOSNativeNavigationDirectoryEntry,{canvasId:${canvasId.name},disabled:${tutorial.id.name},NativeButton:gs,NativePopover:pr})]})`;
  let result = source;
  const edits = [{ start: slot.start, end: slot.end, text: replacement },
    { start: row.arguments[1].end - 1, end: row.arguments[1].end - 1, text: ',"data-native-navigation-bottom-row":true' }];
  for (const edit of edits.sort((a, b) => b.start - a.start)) result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  result = 'import{LCOSNativeNavigationDirectoryEntry}from"/lcos/agent-ui.js";\n' + result + '\n' + marker + '\n';
  parseOriginalDonorScript(result, filename);
  return result;
}
