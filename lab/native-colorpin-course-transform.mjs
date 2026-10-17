import { parseOriginalDonorScript } from './agent-node-transform.mjs';

const target = 'course-api-base-url-CifxI1ia.js', marker = '/* native-colorpin-original-node-bridge */';
const imports = ['LCOSUseNativeColorPinNode', 'LCOSUseNativeColorPinEnabled', 'LCOSUseNativeColorPinChoices', 'LCOSUseNativeColorPinCommands',
  'LCOSUseNativeColorPinGroups', 'LCOSNativeColorPinChoice', 'NativeColorPinNodeStatus'];
const walk = (node, fn) => { if (!node?.type) return; fn(node); for (const value of Object.values(node))
  if (Array.isArray(value)) value.forEach(child => walk(child, fn)); else if (value?.type) walk(value, fn); };
const one = (values, name) => { if (values.length !== 1) throw new Error('Original Color Pin ' + name + ' changed.'); return values[0]; };
function owner(program, name) { return one(program.body.flatMap(node => node.type === 'FunctionDeclaration' ? [node]
  : node.type === 'VariableDeclaration' ? node.declarations : []).filter(node => node.id?.name === name), name); }
function replaceOnce(source, before, after, name) { if (source.split(before).length !== 2) throw new Error('Original Color Pin ' + name + ' seam changed.'); return source.replace(before, after); }

/** Keep the original Dg/Hie/jie/Lie/Gie and n5/Pie/Die/pBe/minimap layout,
 * motion and focus owners; replace only controlled values/command admission. */
export function transformNativeColorPinCourseScript(filename, source) {
  if (filename.split(/[\\/]/).pop() !== target) return source;
  if (source.includes(marker)) return source;
  const ast = parseOriginalDonorScript(source, filename), edits = [];
  const change = (name, fn) => { const node = owner(ast, name), before = source.slice(node.start, node.end), after = fn(before, node);
    edits.push({ start: node.start, end: node.end, text: after }); };
  change('Dg', before => {
    let next = replaceOnce(before, 'const t=MF()', 'const __lcos=LCOSUseNativeColorPinNode(e),t=MF()', 'node capability');
    next = replaceOnce(next, '!t||!n?null', '!(t||__lcos.enabled)||!n?null', 'original item policy');
    next = replaceOnce(next, '{pins:s,onToggle:o=>r(e,o)}', '{pins:__lcos.managed?__lcos.authoringPins:s,onToggle:o=>r(e,o),lcosNative:__lcos,disabled:__lcos.managed?__lcos.triggerDisabled:void 0}', 'original Hie props');
    return replaceOnce(next, '[t,n,s,e,r]', '[t,n,s,e,r,__lcos]', 'original item memo');
  });
  change('n5', before => {
    let next = replaceOnce(before, 'const t=ii(e);return d.useMemo', 'const __lcos=LCOSUseNativeColorPinNode(e),t=ii(e);const __original=d.useMemo', 'marker source');
    return next.slice(0, -1) + ';return __lcos.managed?__lcos.pinState:__original}';
  });
  change('Xie', (before, node) => {
    const calls = []; walk(node, child => { if (child.type === 'CallExpression' && child.callee?.name === 'MF') calls.push(child); });
    const call = one(calls, 'original node marker policy');
    const start = call.start - node.start, end = call.end - node.start;
    return before.slice(0, start) + 'LCOSUseNativeColorPinEnabled(v,' + before.slice(start, end) + ')' + before.slice(end);
  });
  change('Yie', before => {
    let next = replaceOnce(before, 'function Yie(){', 'function Yie(){const __lcos=LCOSUseNativeColorPinCommands();', 'original command owner');
    next = replaceOnce(next, 's=d.useCallback((o,i)=>{', 's=d.useCallback((o,i)=>{if(__lcos.toggle(o,i))return;', 'toggle dispatch');
    next = replaceOnce(next, 'r=d.useCallback(o=>{', 'r=d.useCallback(o=>{if(__lcos.clear(o))return;', 'group clear dispatch');
    next = replaceOnce(next, '[n,t]', '[n,t,__lcos]', 'toggle dependencies');
    return replaceOnce(next, '[n,e]', '[n,e,__lcos]', 'clear dependencies');
  });
  change('pBe', before => replaceOnce(before, 'return Ms(t)', 'return LCOSUseNativeColorPinGroups(Ms(t))', 'original groups read'));
  for (const name of ['Toe', 'Roe']) change(name, before => replaceOnce(before, 'e5.get(e)', '(e5.get(e)??LCOSNativeColorPinChoice(e))', 'dynamic marker palette ' + name));
  change('Iie', before => replaceOnce(before, 'Jc.filter', 'LCOSUseNativeColorPinChoices(Jc).filter', 'original title dots'));
  change('Hie', before => {
    let next = replaceOnce(before, 'onToggle:s}', 'onToggle:s,lcosNative:__lcos}', 'original Hie controlled props');
    next = replaceOnce(next, '){const{t:r', '){const __choices=LCOSUseNativeColorPinChoices(Jc),__palette=__lcos?.managed?__choices:Jc;const{t:r', 'original tooltip palette');
    next = replaceOnce(next, 'Jc.filter', '__palette.filter', 'tooltip existing colors');
    next = replaceOnce(next, 'map(f=>r(f.nameKey))', 'map(f=>f.label||(f.nameKey?r(f.nameKey):f.hex))', 'tooltip true labels');
    next = replaceOnce(next, '{selectedPins:t,onToggle:s,tooltipContent:p,children:', '{selectedPins:t,onToggle:s,tooltipContent:p,choices:__palette,lcosNative:__lcos,disabled:__lcos?.managed?__lcos.disabled:n,children:', 'original Popover props');
    return replaceOnce(next, '{pins:t})', '{pins:t,choices:__palette})', 'original moving icon palette');
  });
  change('Gie', before => {
    let next = replaceOnce(before, 'function({pins:t})', 'function({pins:t,choices:__choices=Jc})', 'moving icon choices');
    next = replaceOnce(next, 'Jc.filter', '__choices.filter', 'moving icon selected colors');
    return replaceOnce(next, 'Jc.map', '__choices.map', 'moving icon geometry');
  });
  change('Lie', before => {
    let next = replaceOnce(before, 'onClick:o}', 'onClick:o,disabled:__disabled}', 'original dot disabled prop');
    return replaceOnce(next, '"aria-label":r,onClick:o', '"aria-label":r,onClick:o,disabled:__disabled', 'original native button disabled');
  });
  change('jie', before => {
    let next = replaceOnce(before, 'function({selectedPins:t,onToggle:n,tooltipContent:s,children:r})',
      'function({selectedPins:t,onToggle:n,tooltipContent:s,children:r,choices:__choices=Jc,disabled:__disabled,lcosNative:__lcos})', 'original Popover controlled palette');
    const original = 'children:Jc.map(v=>a.jsx(Lie,{hex:v.hex,selected:b.has(v.id),ariaLabel:o(v.nameKey),onClick:()=>n(v.id)},v.id))';
    const controlled = '"data-native-colorpin-popover":__lcos?.managed?true:void 0,children:[__choices.map(v=>a.jsx(Lie,{hex:v.hex,selected:b.has(v.id),ariaLabel:v.label||(v.nameKey?o(v.nameKey):v.hex),onClick:__disabled?void 0:()=>n(v.id),disabled:__disabled},v.id)),a.jsx(NativeColorPinNodeStatus,{state:__lcos},"native-pin-status")]';
    return replaceOnce(next, original, controlled, 'original dot list/status slot');
  });
  edits.sort((a, b) => b.start - a.start);
  let result = source; for (const edit of edits) result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  const first = ast.body.find(node => node.type === 'ImportDeclaration');
  result = result.slice(0, first.start) + marker + 'import{' + imports.join(',') + '}from"/lcos/agent-ui.js";\n' + result.slice(first.start);
  parseOriginalDonorScript(result, filename);
  return result;
}
