import { parseOriginalDonorScript } from './agent-node-transform.mjs';

const target = 'course-api-base-url-CifxI1ia.js';
const marker = '/* lcos-native-navigation-course */';
const helper = `
function LCOSNativeNavigationTools(tools,nodeId,state,moreIcon,composer){
  if(!Array.isArray(tools)||typeof nodeId!=="string"||!nodeId.trim()||!state)return tools;
  const items=[];
  if(composer?.supported)items.push({key:"native-node-use-input",label:!composer.canUse&&composer.reason?a.jsxs("span",{style:{display:"flex",flexDirection:"column",gap:2,maxWidth:230,whiteSpace:"normal"},children:["用于当前输入",a.jsx("span",{style:{fontSize:11,lineHeight:"15px",opacity:.72},children:composer.reason})]}):"用于当前输入",disabled:!!composer.busy||!composer.canUse,handle:composer.useForCurrentInput});
  if(state.canPin)items.push({key:"native-navigation-pin",label:state.pinAction==="manage"?"管理固定":state.pinned?"取消固定":"固定到导航",disabled:!!state.busy,handle:state.togglePin});
  if(state.canEmphasize!==false)items.push({key:"native-navigation-emphasis",label:state.emphasized?"取消强调":"强调",handle:state.toggleEmphasis});
  if(state.canLocate!==false)items.push({key:"native-navigation-locate",label:"定位",handle:state.locate});
  if(!items.length)return tools;
  if(state.notice)items.push({key:"native-navigation-notice",disabled:true,label:a.jsx("span",{role:"status","data-native-navigation-notice":nodeId,children:state.notice})});
  if(composer?.notice)items.push({key:"native-node-composer-notice",disabled:true,label:a.jsx("span",{role:"status","data-native-node-composer-notice":nodeId,children:composer.notice})});
  const isMore=tool=>tool?.buttonType==="more"&&(tool.key==="more"||tool.key==="native-collection-menu");
  let found=false;
  const next=tools.map(group=>Array.isArray(group)?group.map(tool=>{
    if(found||!isMore(tool))return tool;
    found=true;
    // Do not unlock a disabled/invisible original More or add a second one.
    if(tool.disabled||tool.invisible===true||tool.lockedTooltip)return tool;
    const original=Array.isArray(tool.menuItems)?tool.menuItems:[];
    return{...tool,tooltip:composer?.notice||state.notice||tool.tooltip,menuItems:[...original,...(original.length?[{key:"native-navigation-divider",separator:true}]:[]),...items]};
  }):group);
  if(found)return next;
  return[...tools,[{key:"native-navigation-menu",buttonType:"more",node:moreIcon,text:"节点操作",tooltip:composer?.notice||state.notice||"节点操作",dataTestId:"native-node-navigation-more",menuItems:items}]];
}
`;
const prop = (object, name) => object?.properties?.find(value => (value.key?.name ?? value.key?.value) === name)?.value;
function walk(node, visit) {
  if (!node?.type) return;
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'tokens', 'comments'].includes(key)) continue;
    if (Array.isArray(value)) value.forEach(child => walk(child, visit));
    else if (value?.type) walk(value, visit);
  }
}
function one(root, test, label) {
  const matches = []; walk(root, node => { if (test(node)) matches.push(node); });
  if (matches.length !== 1) throw new Error(`Original navigation ${label} changed (${matches.length}).`);
  return matches[0];
}

/** Vde is the actual shared JT toolbar for text, image and Pile. Keep its
 * Hde/Tooltip/Button/Menu leaves and original focus/visibility owners intact. */
export function transformNativeNavigationCourseScript(filename, source) {
  if (filename.split(/[\\/]/).pop() !== target || source.includes(marker)) return source;
  const program = parseOriginalDonorScript(source, filename);
  const noticeImports = program.body.filter(node => node.type === 'ImportDeclaration'
    && /(?:^|\/)index-BAQXnPag\.js$/.test(node.source.value)).flatMap(node => node.specifiers)
    .filter(node => node.type === 'ImportSpecifier' && node.imported?.name === 'al');
  if (noticeImports.length !== 1 || noticeImports[0].local?.type !== 'Identifier')
    throw new Error(`Original navigation toast import changed (${noticeImports.length}).`);
  const notice = noticeImports[0].local.name;
  const owner = one(program, node => node.type === 'VariableDeclarator' && node.id?.name === 'Vde', 'Vde toolbar');
  const fn = owner.init;
  const tools = prop(fn?.params?.[0], 'tools'), nodeId = prop(fn?.params?.[0], 'nodeId');
  if (fn?.type !== 'ArrowFunctionExpression' || fn.body?.type !== 'BlockStatement'
    || tools?.type !== 'Identifier' || nodeId?.type !== 'Identifier') throw new Error('Original navigation toolbar props changed.');
  const map = one(fn.body, node => node.type === 'CallExpression' && node.callee?.type === 'MemberExpression'
    && node.callee.object?.name === tools.name && node.callee.property?.name === 'map', 'original tool groups');
  const visibility = one(program, node => node.type === 'FunctionDeclaration' && node.id?.name === 'gw', 'original visibility hook');
  const visibilityId = visibility.params[0];
  const inView = one(visibility.body, node => node.type === 'VariableDeclarator' && node.init?.type === 'LogicalExpression'
    && node.init.operator === '&&' && node.init.left?.type === 'Identifier' && node.init.right?.type === 'Identifier', 'original ready/in-view conjunction');
  const visibilityReturn = one(visibility.body, node => node.type === 'ReturnStatement' && node.argument?.type === 'SequenceExpression', 'visibility result');
  const debounced = visibilityReturn.argument.expressions.at(-1);
  const firstEntry = one(visibility.body, node => node.type === 'IfStatement' && node.test?.type === 'MemberExpression'
    && node.test.property?.name === 'current', 'original first-entry branch');
  const effect = one(visibility.body, node => node.type === 'CallExpression' && node.callee?.type === 'MemberExpression'
    && node.callee.property?.name === 'useEffect', 'original visibility effect');
  const dependencies = effect.arguments[1];
  if (visibilityId?.type !== 'Identifier' || inView.id?.type !== 'Identifier' || debounced?.type !== 'Identifier'
    || dependencies?.type !== 'ArrayExpression' || dependencies.elements.length !== 2
    || dependencies.elements[0]?.name !== inView.id.name || dependencies.elements[1]?.name !== debounced.name)
    throw new Error('Original navigation visibility state changed.');
  if (source.includes('function LCOSNativeNavigationTools(')) throw new Error('Original navigation helper is partially installed.');
  const edits = [
    // Pass the already imported original Rt object. The toolbar sits outside
    // the Host provider; no second toast root, portal or feedback bus is needed.
    { start: fn.body.start + 1, end: fn.body.start + 1, text: `const LCOSNavigation=LCOSUseNativeNavigationNode(${nodeId.name},canvasId=>LCOSOpenNativeNavigationDirectory(canvasId,true));const LCOSNodeComposer=LCOSUseNativeNodeComposer(${nodeId.name},${notice});` },
    { start: map.callee.object.start, end: map.callee.object.end,
      text: `LCOSNativeNavigationTools(${tools.name},${nodeId.name},LCOSNavigation,a.jsx(tO,{size:20}),LCOSNodeComposer)` },
    // Explicit navigation keeps the original ready/intersection predicate and
    // state owner. Ordinary entry/exit timers and every media leaf stay native.
    { start: visibility.body.start + 1, end: visibility.body.start + 1,
      text: `const LCOSNavigationVisibility=LCOSUseNativeNavigationVisibility(${visibilityId.name});` },
    { start: firstEntry.test.start, end: firstEntry.test.end,
      text: `(${source.slice(firstEntry.test.start, firstEntry.test.end)}||LCOSNavigationVisibility)` },
    { start: dependencies.end - 1, end: dependencies.end - 1, text: ',LCOSNavigationVisibility' },
    { start: debounced.start, end: debounced.end,
      text: `(${debounced.name}||(LCOSNavigationVisibility&&${inView.id.name}))` },
  ];
  let result = source;
  for (const edit of edits.sort((a, b) => b.start - a.start)) result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  result = 'import{LCOSUseNativeNavigationNode,LCOSUseNativeNavigationVisibility,LCOSUseNativeNodeComposer,LCOSOpenNativeNavigationDirectory}from"/lcos/agent-ui.js";\n' + result + '\n' + helper + '\n' + marker + '\n';
  parseOriginalDonorScript(result, filename);
  return result;
}
