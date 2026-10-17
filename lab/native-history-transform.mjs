import { parseOriginalDonorScript } from './agent-node-transform.mjs';
import { nativeHistoryLocalDateKey } from './native-history-date.mjs';

const page = 'page-Da_DfwiK.js', hookAsset = 'useHistoryAssetList-DmiPqiyV.js';
const marker = '\n/* lcos-native-history-owner */\n';
const key = node => !node.computed ? node.key?.name ?? node.key?.value : undefined;
function walk(node, visit) {
  if (!node?.type) return;
  visit(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(child => { if (child?.type) walk(child, visit); });
    else if (value?.type) walk(value, visit);
  }
}
function find(root, predicate, label) {
  const found = []; walk(root, node => { if (predicate(node)) found.push(node); });
  if (found.length !== 1) throw new Error(`Original History ${label} changed (${found.length}).`);
  return found[0];
}
function owners(ast) {
  return ast.body.flatMap(row => row.type === 'FunctionDeclaration' ? [row] : row.type === 'VariableDeclaration' ? row.declarations : []);
}
function editsApplied(source, edits) {
  let result = source, last = Infinity;
  for (const edit of edits.sort((a, b) => b.start - a.start || b.end - a.end)) {
    if (edit.end > last) throw new Error('History owner edits overlap.');
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end); last = edit.start;
  }
  return result;
}

/** Retain the shipped sidebar, expanded dialog, tabs, virtual lists, selection,
 * date grouping and motion. Only the real data categories and action owners
 * change; no local node factory or filehub signing is used for Core history. */
export function transformNativeHistoryScript(filename, source) {
  const asset = filename.split(/[\\/]/).pop();
  if (![page, hookAsset].includes(asset) || source.includes(marker)) return source;
  const ast = parseOriginalDonorScript(source, filename), edits = [];
  const top = name => {
    const matches = owners(ast).filter(node => node.id?.name === name);
    if (matches.length !== 1) throw new Error(`Original History owner ${name} changed.`);
    return matches[0];
  };
  const insert = (at, text) => edits.push({ start: at, end: at, text });
  const replace = (node, text) => edits.push({ start: node.start, end: node.end, text });
  if (asset === hookAsset) {
    const owner = top('J');
    const result = find(owner, node => node.type === 'ReturnStatement' && node.argument?.type === 'ObjectExpression'
      && node.argument.properties.some(prop => key(prop) === 'viewItems'), 'paginated read return');
    insert(result.argument.end - 1, ',reload:()=>d(1,"replace")');
    const day = find(top('B'), node => node.type === 'MemberExpression' && node.computed
      && node.property?.value === 0 && node.object?.callee?.property?.name === 'split'
      && node.object.arguments[0]?.value === 'T', 'sidebar calendar day');
    replace(day, `nativeHistoryLocalDateKey(${source.slice(day.object.callee.object.start, day.object.callee.object.end)})`);
  } else {
    const sidebar = top('l9'), actions = top('aE'), tabs = top('GH'), card = top('YH');
    const scope = top('WH');
    for (const [oldKey, newKey, label] of [
      ['historyPanel.scope', 'lcos.history.scope', '历史范围'],
      ['historyPanel.scopeAll', 'lcos.history.scopeProject', '整个项目'],
      ['historyPanel.scopeThisProject', 'lcos.history.scopeWorkspace', '当前现场'],
    ]) {
      const translated = find(scope, node => node.type === 'CallExpression'
        && node.arguments[0]?.value === oldKey, oldKey + ' label');
      replace(translated, `${source.slice(translated.callee.start, translated.callee.end)}(${JSON.stringify(newKey)},${JSON.stringify(label)})`);
    }
    const expandedDay = find(top('r9'), node => node.type === 'ConditionalExpression'
      && node.alternate?.value === 'unknown' && node.consequent?.type === 'MemberExpression'
      && node.consequent.object?.callee?.property?.name === 'split'
      && node.consequent.object.arguments[0]?.value === 'T', 'expanded calendar day');
    replace(expandedDay, `(nativeHistoryLocalDateKey(${source.slice(expandedDay.test.start, expandedDay.test.end)})||"unknown")`);
    replace(actions.body, '{return LCOSUseNativeHistoryActions({...e,notify:message=>se.info(message)});}');
    const kindList = top('cm');
    if (kindList.init?.type !== 'ArrayExpression' || kindList.init.elements.map(row => row.value).join(',') !== 'image,video,audio,threed')
      throw new Error('Original History type ordering changed.');
    insert(kindList.init.end - 1, ',"text","other"');
    const tabList = find(tabs, node => node.type === 'ObjectProperty' && key(node) === 'tabs', 'filter tabs').value;
    insert(tabList.end - 1, ',{id:"text",label:s("common.text","文本")},{id:"other",label:s("common.other","其他")}');
    const firstRead = find(sidebar, node => node.type === 'VariableDeclaration' && node.declarations.some(row => row.id?.name === 'R'
      && row.init?.type === 'CallExpression' && row.init.callee?.name === 'tr'), 'read hook group');
    insert(firstRead.end - 1, ',lcosHistoryText=tr("text","desc",N),lcosHistoryOther=tr("other","desc",N),lcosHistoryCurrentText=tr("text","desc",E),lcosHistoryCurrentOther=tr("other","desc",E)');
    for (const [name, text, other] of [['I', 'lcosHistoryText', 'lcosHistoryOther'], ['D', 'lcosHistoryCurrentText', 'lcosHistoryCurrentOther']]) {
      const row = find(sidebar, node => node.type === 'VariableDeclarator' && node.id?.name === name, name + ' original read map');
      const body = row.init.arguments[0].body, dependencies = row.init.arguments[1];
      if (body.type !== 'ObjectExpression' || dependencies.type !== 'ArrayExpression') throw new Error('Original History read maps changed.');
      insert(body.end - 1, `,text:${text},other:${other}`); insert(dependencies.end - 1, `,${text},${other}`);
    }
    const actionRead = find(sidebar, node => node.type === 'VariableDeclarator' && node.init?.callee?.name === 'aE', 'action hook');
    insert(actionRead.id.end - 1, ',applyHistoryAssets:lcosApplyHistory');
    const apply = find(sidebar, node => node.type === 'VariableDeclarator' && node.id?.name === 'Y', 'Apply callback');
    replace(apply.init.arguments[0].body, '{void lcosApplyHistory(q).then(result=>{if(result.complete){c(!1);v.exitSelectionMode();}});}');
    replace(apply.init.arguments[1], '[lcosApplyHistory,v.exitSelectionMode]');
    const alert = find(sidebar, node => node.type === 'ObjectExpression' && node.properties.some(prop => key(prop) === 'role' && prop.value?.value === 'alert'), 'read error');
    const message = alert.properties.find(prop => key(prop) === 'children').value;
    replace(message, `r.jsxs(r.Fragment,{children:[${source.slice(message.start, message.end)},r.jsx("button",{type:"button",className:"ml-2 underline",onClick:()=>U.reload(),children:"重新读取"})]})`);
    const content = find(sidebar, node => node.type === 'ObjectExpression'
      && node.properties.some(prop => key(prop) === 'data-history-content'), 'content frame');
    insert(content.properties.find(prop => key(prop) === 'children').value.end - 1,
      ',!U.loading&&!U.error&&U.items.length===0&&r.jsx("div",{role:"status",className:"pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center text-xs text-muted-foreground",children:u?"没有找到匹配记录。":"当前分类还没有历史记录。"})');
    // The original square grid otherwise exposes no title for images. Keep its
    // square geometry and existing media leaf, add only a version caption.
    const grid = find(sidebar, node => node.type === 'ObjectExpression' && node.properties.some(prop => key(prop) === 'className'
      && source.slice(prop.value.start, prop.value.end).includes('w-full h-full overflow-hidden rounded-md relative group')), 'grid card props');
    const children = grid.properties.find(prop => key(prop) === 'children').value;
    insert(children.end - 1, ',xe.lcos_history&&["image","video","threed"].includes(xe.generation_type)&&r.jsx("span",{className:"pointer-events-none absolute inset-x-0 bottom-0 truncate bg-background/90 px-1.5 py-1 text-[10px] text-foreground",title:xe.prompt,children:xe.prompt})');
    const readButton = (item, inline = false) => `,${item}.lcos_history&&r.jsx("button",{type:"button",disabled:!${item}.lcos_history.readable,className:${JSON.stringify(inline
      ? 'ml-auto shrink-0 rounded-md bg-background/90 px-1.5 py-1 text-[10px] text-foreground disabled:opacity-40'
      : 'absolute right-1 top-1 rounded-md bg-background/90 px-1.5 py-1 text-[10px] text-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-40')},"aria-label":"阅读这个版本",onClick:event=>{event.stopPropagation();LCOSOpenNativeHistoryVersion(${item},message=>se.info(message));},children:"阅读"})`;
    insert(children.end - 1, readButton('xe'));
    const list = find(sidebar, node => node.type === 'ObjectExpression' && node.properties.some(prop => key(prop) === 'className'
      && source.slice(prop.value.start, prop.value.end).includes('group flex items-center gap-2.5 h-full px-2 rounded-md')), 'list card props');
    insert(list.properties.find(prop => key(prop) === 'children').value.end - 1, readButton('re', true));
    const expanded = find(card, node => node.type === 'ObjectExpression' && node.properties.some(prop => key(prop) === 'style'
      && prop.value?.type === 'ObjectExpression' && prop.value.properties.some(style => key(style) === 'width')), 'expanded card props');
    const expandedChildren = expanded.properties.find(prop => key(prop) === 'children').value;
    insert(expandedChildren.end - 1, ',e.lcos_history&&["image","video","threed"].includes(e.generation_type)&&r.jsx("span",{className:"pointer-events-none absolute inset-x-0 bottom-0 truncate bg-background/90 px-1.5 py-1 text-[10px] text-foreground",title:e.prompt,children:e.prompt})');
    insert(expandedChildren.end - 1, readButton('e'));
    for (const [owner, type] of [[find(sidebar, node => node.type === 'VariableDeclarator' && node.id?.name === 'Z', 'square renderer'), 'Pe'],
      [find(sidebar, node => node.type === 'VariableDeclarator' && node.id?.name === '$', 'list renderer'), 'fe'], [card, 's']]) {
      walk(owner, node => {
        if (node.type === 'CallExpression' && node.callee?.type === 'MemberExpression'
          && ['jsx', 'jsxs'].includes(node.callee.property?.name) && node.arguments[0]?.name === 'Qr')
          replace(node.arguments[0], `(${type}==="text"||${type}==="other"?Va:Qr)`);
      });
    }
    insert(0, 'import{LCOSUseNativeHistoryActions,LCOSOpenNativeHistoryVersion}from"/lcos/agent-ui.js";\n');
  }
  const result = editsApplied(source, edits) + '\n' + nativeHistoryLocalDateKey.toString() + marker;
  parseOriginalDonorScript(result, filename);
  return result;
}
