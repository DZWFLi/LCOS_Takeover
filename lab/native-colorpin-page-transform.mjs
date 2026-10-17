import { parseOriginalDonorScript } from './agent-node-transform.mjs';

const TARGET = 'page-Da_DfwiK.js';
const MARKER = '/* __LCOS_NATIVE_COLORPIN_PAGE__ */';
export function transformNativeColorPinPageScript(filename, source) {
  if (filename !== TARGET || source.includes(MARKER)) return source;
  const program = parseOriginalDonorScript(source, filename);
  const walk = (node, visit) => {
    if (!node?.type) return; visit(node);
    for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(item => { if (item?.type) walk(item, visit); });
    else if (value?.type) walk(value, visit);
  };
  const one = (root, predicate, label) => {
    const matches = []; walk(root, node => { if (predicate(node)) matches.push(node); });
    if (matches.length !== 1) throw new Error(`Native ColorPin page ${label} changed (${matches.length}).`);
    return matches[0];
  };
  const top = name => {
    const matches = program.body.flatMap(row => row.type === 'VariableDeclaration' ? row.declarations
      .filter(node => node.id?.name === name) : row.type === 'FunctionDeclaration' && row.id?.name === name ? [row] : []);
    if (matches.length !== 1) throw new Error('Native ColorPin page owner changed: ' + name);
    return matches[0];
  };
  const fn = name => top(name).init?.arguments?.[0] ?? top(name);
  const prop = (object, name) => object?.properties?.find(row => (row.key?.name ?? row.key?.value) === name);
  const props = call => call.arguments?.[1];
  const children = call => prop(props(call), 'children')?.value;
  const element = (node, name) => node.type === 'CallExpression' && (node.arguments?.[0]?.name ?? node.arguments?.[0]?.value) === name;
  const slice = node => source.slice(node.start, node.end);
  const edit = (root, changes) => {
    let text = slice(root), previous = root.end;
    for (const change of [...changes].sort((a, b) => b.start - a.start || b.end - a.end)) {
      if (change.end > previous || change.start < root.start) throw new Error('Native ColorPin page edits overlap.');
      text = text.slice(0, change.start - root.start) + change.text + text.slice(change.end - root.start); previous = change.start;
    }
    return text;
  };
  const change = (node, text) => ({ start: node.start, end: node.end, text });
  const appendProps = (call, text) => ({ start: props(call).end - 1, end: props(call).end - 1, text: ',' + text });
  const edits = [];

  // Keep donor w7/u7 unchanged. Only the scoped capability chooses this exact
  // original bar layout with controlled reads/actions instead of vendor APIs.
  const originalBar = top('w7').init, barFunction = fn('w7');
  const nativeBarEdits = [{ start: barFunction.body.start + 1, end: barFunction.body.start + 1,
    text: 'const LCOSPinDownloads=LCOSUseNativeColorPinDownloads();' }];
  for (const [name, replacement] of [['u7', 'LCOSUseNativeColorPinNames'], ['Mj', 'LCOSUseNativeColorPinMenuActions']]) {
    const call = one(barFunction, node => node.type === 'CallExpression' && node.callee?.name === name, name + ' bar hook');
    nativeBarEdits.push(change(call.callee, replacement));
  }
  const cloudDownloads = one(barFunction, node => node.type === 'CallExpression' && node.callee?.name === 'iw', 'bar download hook');
  nativeBarEdits.push(change(cloudDownloads, 'LCOSPinDownloads'));
  const color = one(barFunction, node => element(node, 'y7'), 'bar group button');
  nativeBarEdits.push(appendProps(color, 'downloadMessage:LCOSPinDownloads.message'));
  const nativeBar = 'const LCOSNativePinBar=' + edit(originalBar, nativeBarEdits) + ';';

  const bar = fn('v7'), originalReturn = one(bar, node => node.type === 'ReturnStatement', 'bar return');
  edits.push({ start: bar.body.start + 1, end: bar.body.start + 1, text: 'const LCOSPinBar=LCOSUseNativeColorPinBar();' });
  edits.push(change(originalReturn.argument, '(LCOSPinBar.enabled?(s.length===0?null:r.jsx(LCOSNativePinBar,{groups:s})):' + slice(originalReturn.argument) + ')'));

  // Optional original group name key, required for pre-existing non-six colors.
  const groupButton = fn('y7'), translate = one(groupButton,
    node => node.type === 'CallExpression' && node.callee?.name === 'u' && node.arguments?.[0]?.type === 'MemberExpression', 'group color translation');
  edits.push(change(translate, 't.group.nameKey?u(t.group.nameKey):t.group.hex'));
  edits.push({ start: groupButton.params[0].end - 1, end: groupButton.params[0].end - 1, text: ',downloadMessage:LCOSPinDownloadMessage' });
  edits.push(appendProps(one(groupButton, node => element(node, 'm7'), 'group menu'), 'downloadMessage:LCOSPinDownloadMessage'));

  // Keep current-Canvas p7 highlight + fitView. Only managed groups add a final
  // identity check; no old Core coordinates, route, camera or window is added.
  const locate = fn('p7');
  edits.push({ start: locate.params[0].end, end: locate.params[0].end, text: ',LCOSPinGroup' });
  edits.push({ start: locate.body.start + 1, end: locate.body.start + 1,
    text: 'const LCOSPinLocate=LCOSUseNativeColorPinLocate(e,LCOSPinGroup);' });
  const locateCallback = one(locate, node => node.type === 'VariableDeclarator' && node.id?.name === 'c', 'locate callback').init;
  edits.push({ start: locateCallback.arguments[0].body.start + 1, end: locateCallback.arguments[0].body.start + 1,
    text: 'if(LCOSPinGroup?.definitionId&&!LCOSPinLocate.canLocate(d,h))return false;' });
  edits.push({ start: locateCallback.arguments[1].end - 1, end: locateCallback.arguments[1].end - 1, text: ',LCOSPinGroup,LCOSPinLocate' });
  const located = locate.body.body.filter(node => node.type === 'ReturnStatement');
  if (located.length !== 1) throw new Error('Native ColorPin page direct locate return changed.');
  const locatedMemo = located[0].argument;
  edits.push({ start: locatedMemo.arguments[0].body.end - 1, end: locatedMemo.arguments[0].body.end - 1, text: ',notice:LCOSPinLocate.message' });
  edits.push({ start: locatedMemo.arguments[1].end - 1, end: locatedMemo.arguments[1].end - 1, text: ',LCOSPinLocate.message' });
  // Original g7 already prevents menu close when p7 rejects a locate.

  const menu = fn('m7'), menuEdits = [];
  menuEdits.push({ start: menu.body.start + 1, end: menu.body.start + 1, text: 'const LCOSPinMenu=LCOSUseNativeColorPinMenuActions();' });
  menuEdits.push({ start: menu.params[0].end - 1, end: menu.params[0].end - 1, text: ',downloadMessage:LCOSPinDownloadMessage' });
  const memberHook = one(menu, node => node.type === 'VariableDeclarator' && node.init?.callee?.name === 'p7', 'members hook');
  menuEdits.push({ start: memberHook.init.end - 1, end: memberHook.init.end - 1, text: ',t' });
  menuEdits.push({ start: memberHook.id.end - 1, end: memberHook.id.end - 1, text: ',notice:LCOSPinLocateNotice' });
  const confirmation = one(menu, node => node.type === 'CallExpression' && node.callee?.property?.name === 'confirm', 'clear confirmation');
  const config = confirmation.arguments[0];
  for (const [key, text] of [['title', '"移除此画布的标记"'], ['description', 'LCOSColorPinClearDescription(t,d)']]) {
    const old = prop(config, key).value; menuEdits.push(change(old, 't.definitionId?' + text + ':' + slice(old)));
  }
  const confirmLabel = prop(prop(config, 'confirmButton').value, 'label').value;
  menuEdits.push(change(confirmLabel, 't.definitionId?"移除标记":' + slice(confirmLabel)));
  const clearConfirm = prop(config, 'onConfirm').value;
  menuEdits.push(change(clearConfirm, 't.definitionId?()=>a(t):' + slice(clearConfirm)));
  const clearCallback = one(menu, node => node.type === 'VariableDeclarator' && node.id?.name === 'Y', 'clear callback').init;
  menuEdits.push({ start: clearCallback.arguments[1].end - 1, end: clearCallback.arguments[1].end - 1, text: ',t' });

  const menuContent = one(menu, node => element(node, 'kr'), 'original menu content'), content = children(menuContent);
  const scope = 't.definitionId?r.jsx("span",{className:"shrink-0 text-xs text-muted-foreground",children:"项目共享"}):null';
  const label = one(menu, node => element(node, 'span') && children(node)?.name === 'd', 'name label');
  menuEdits.push({ start: label.end, end: label.end, text: ',' + scope });
  const input = one(menu, node => element(node, 'input'), 'rename input');
  menuEdits.push({ start: input.start, end: input.start, text: scope + ',' });
  const accessible = prop(props(input), 'aria-label').value;
  menuEdits.push(change(accessible, 't.definitionId?"颜色组名称（本项目）":' + slice(accessible)));
  menuEdits.push(appendProps(input, 'readOnly:t.definitionId?(LCOSPinMenu.busy||LCOSPinMenu.needsCheck):undefined'));
  const saveName = one(menu, node => node.type === 'VariableDeclarator' && node.id?.name === 'J', 'inline rename callback').init;
  const saveBody = saveName.arguments[0].body;
  menuEdits.push({ start: saveBody.start + 1, end: saveBody.start + 1,
    text: 'if(t.definitionId){if(LCOSPinMenu.busy||LCOSPinMenu.needsCheck)return;Promise.resolve(f(C)).then(LCOSConfirmed=>{if(LCOSConfirmed){A.current=V;w(false);S(void 0)}});return;}' });
  menuEdits.push({ start: saveName.arguments[1].end - 1, end: saveName.arguments[1].end - 1, text: ',t.definitionId,LCOSPinMenu.busy,LCOSPinMenu.needsCheck' });
  menuEdits.push({ start: content.elements[0].end, end: content.elements[0].end,
    text: ',t.definitionId?r.jsx(LCOSColorPinMenuStatus,{extraMessage:LCOSPinLocateNotice||LCOSPinDownloadMessage}):null' });

  const download = one(menu, node => element(node, 'pt') && prop(props(node), 'onSelect')?.value?.name === 'o', 'download action');
  menuEdits.push(change(prop(props(download), 'onSelect').value, 'LCOSDownloadEvent=>{if(t.definitionId)LCOSDownloadEvent.preventDefault();o()}'));
  const actionLabel = children(download).elements[1];
  const action = (label, handler) => edit(download, [change(prop(props(download), 'disabled').value, 'LCOSPinMenu.busy'),
    change(prop(props(download), 'onSelect').value, `LCOSMenuEvent=>{LCOSMenuEvent.preventDefault();void ${handler}()}`), change(actionLabel, JSON.stringify(label))]);
  menuEdits.push({ start: download.end, end: download.end,
    text: ',t.definitionId&&LCOSPinMenu.needsCheck?' + action('核对标记结果', 'LCOSPinMenu.verifyPending')
      + ':t.definitionId&&LCOSPinMenu.status==="error"?' + action('重新读取', 'LCOSPinMenu.refresh') + ':null' });
  const clear = one(menu, node => element(node, 'pt') && prop(props(node), 'onSelect')?.value?.name === 'Y', 'clear action');
  const clearText = children(clear).elements[1];
  menuEdits.push(change(clearText, 't.definitionId?"移除此画布标记":' + slice(clearText)));
  menuEdits.push(appendProps(clear, 'disabled:t.definitionId?(LCOSPinMenu.busy||LCOSPinMenu.needsCheck||LCOSPinMenu.status!=="ready"):undefined'));
  edits.push(change(menu, edit(menu, menuEdits)));

  // eG owns both original BC(=memo(bB)) and sibling H7(contains v7).
  // Wrapping bB alone would leave the original header outside the Context.
  const canvas = fn('eG'), canvasReturns = canvas.body.body.filter(node => node.type === 'ReturnStatement');
  if (canvasReturns.length !== 1) throw new Error('Native ColorPin original Canvas return changed.');
  const canvasRoot = canvasReturns[0].argument;
  edits.push(change(canvasRoot, 'r.jsx(LCOSNativeColorPinProvider,{children:(' + slice(canvasRoot) + ')})'));

  let result = source;
  for (const row of edits.sort((a, b) => b.start - a.start || b.end - a.end)) result = result.slice(0, row.start) + row.text + result.slice(row.end);
  result = MARKER + '\nimport{LCOSNativeColorPinProvider,LCOSUseNativeColorPinBar,LCOSUseNativeColorPinNames,LCOSUseNativeColorPinMenuActions,LCOSUseNativeColorPinLocate,LCOSColorPinMenuStatus,LCOSColorPinClearDescription,LCOSUseNativeColorPinDownloads}from"/lcos/agent-ui.js";\n'
    + result + '\n' + nativeBar;
  parseOriginalDonorScript(result, filename);
  return result;
}
