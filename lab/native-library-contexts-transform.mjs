import { parseOriginalDonorScript } from './agent-node-transform.mjs';

const TARGET = 'page-Da_DfwiK.js';
const EXPORTS = ['LCOSNativeLibraryContexts', 'LCOSNativeLibraryContextDetail', 'LCOSNativeLibraryNavigationOwner'];
const MARKER = '/* lcos-native-library-contexts */';

function walk(root, visitor) {
  const pending = [root];
  while (pending.length) {
    const node = pending.pop();
    if (!node?.type) continue;
    visitor(node);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) { for (const child of value) if (child?.type) pending.push(child); }
      else if (value?.type) pending.push(value);
    }
  }
}
function matching(root, predicate) { const out = []; walk(root, node => { if (predicate(node)) out.push(node); }); return out; }
function one(items, label) { if (items.length !== 1) throw new Error(`Native Library contexts seam changed: expected one ${label}, found ${items.length}.`); return items[0]; }
function prop(object, name) { return object?.properties?.find(property => property.type === 'ObjectProperty' && (property.key?.name ?? property.key?.value) === name); }
function jsx(node, name) { return node?.type === 'CallExpression' && node.callee?.type === 'MemberExpression'
  && ['jsx', 'jsxs'].includes(node.callee.property?.name) && (name === undefined || node.arguments[0]?.name === name); }
function binding(root, name) { return one(matching(root, node => node.type === 'VariableDeclarator' && node.id?.name === name), name); }
function apply(source, edits) {
  const ordered = edits.sort((a, b) => b.start - a.start || b.end - a.end);
  let previous = source.length + 1;
  for (const edit of ordered) {
    if (edit.end > previous) throw new Error('Native Library contexts edits overlap.');
    source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
    previous = edit.start;
  }
  return source;
}

function assertInstalled(program) {
  for (const name of EXPORTS) {
    one(program.body.filter(node => node.type === 'ImportDeclaration' && node.source.value === '/lcos/agent-ui.js')
      .flatMap(node => node.specifiers.filter(specifier => specifier.local?.name === name)), `import ${name}`);
    one(matching(program, node => jsx(node, name)), `render ${name}`);
  }
  const preview = binding(program, 'TS').init;
  for (const [name, local] of [['bodySlot', 'LCOSLibraryBody'], ['metaSlot', 'LCOSLibraryMeta'], ['actionsSlot', 'LCOSLibraryActions'], ['contentVariant', 'LCOSLibraryContentVariant']])
    if (prop(preview.params[0], name)?.value?.name !== local) throw new Error('Native Library contexts TS slots are partial or changed.');
  const wrapped = one(matching(binding(program, 'jF'), node => jsx(node, EXPORTS[0])), 'native list wrapper');
  if (prop(wrapped.arguments[1], 'NativeLibrary')?.value?.name !== 'sF' || prop(wrapped.arguments[1], 'NativeLibraryStore')?.value?.name !== 'wt' || prop(wrapped.arguments[1], 'originalProps')?.value?.type !== 'ObjectExpression')
    throw new Error('Native Library contexts must keep the original sF list owner.');
}

/** Extend native Library view data and existing row/TS slots. No Atlas, Hand,
 * floating manager, cloud folder mutation or second navigation owner is added. */
export function transformNativeLibraryContextsScript(filename, source) {
  if (filename.split(/[\\/]/).pop() !== TARGET) return source;
  const program = parseOriginalDonorScript(source, filename);
  if (source.includes(MARKER)) { assertInstalled(program); return source; }
  if (EXPORTS.some(name => source.includes(name))) throw new Error('Native Library contexts is partially installed.');
  const text = node => source.slice(node.start, node.end);
  const edits = [];
  const replace = (node, replacement) => edits.push({ start: node.start, end: node.end, text: replacement });
  const insert = (at, value) => edits.push({ start: at, end: at, text: value });
  const library = binding(program, 'jF').init;
  const canvasId = prop(library.params[0], 'canvasId')?.value;
  if (canvasId?.type !== 'Identifier') throw new Error('Native Library contexts Canvas identity is unavailable.');
  insert(library.body.start + 1, `l.useEffect(()=>{const nativeApi=window.__LCOS_NODE_LAB__?.api;return()=>window.dispatchEvent(new CustomEvent("lcos-native-library-closed",{detail:{canvasId:${text(canvasId)},api:nativeApi}}))},[${text(canvasId)}]);`);
  const list = one(matching(library.body, node => jsx(node, 'sF')), 'original Library sF');
  const state = one(matching(library.body, node => node.type === 'VariableDeclarator' && node.id?.type === 'ObjectPattern'
    && prop(node.id, 'activeSpace')), 'original Library active-space selector');
  const activeSpace = prop(state.id, 'activeSpace').value;
  one(program.body.filter(node => node.type === 'ImportDeclaration' && node.source.value.endsWith('/UnlimitedModeToggle-D4wysAbz.js'))
    .flatMap(node => node.specifiers.filter(specifier => specifier.local?.name === 'wt' && specifier.imported?.name === 'aa')), 'original Library store wt');
  replace(list, `r.jsx(${EXPORTS[0]},{NativeLibrary:sF,NativeLibraryStore:wt,originalProps:${text(list.arguments[1])},canvasId:${text(canvasId)},activeSpace:${text(activeSpace)}})`);

  const row = binding(program, 'Zp').init;
  const popover = one(matching(row.body, node => jsx(node, 'pr') && prop(node.arguments[1], 'content')), 'original row Popover');
  const content = prop(popover.arguments[1], 'content').value;
  replace(content, `T.asset?.lcos_library_entry?r.jsx(${EXPORTS[1]},{detail:T,NativePreview:TS,onClose:()=>C(!1)}):${text(content)}`);
  const calls = matching(row.body, node => node.type === 'CallExpression' && node.callee?.name === 'g'
    && node.arguments.length === 1 && node.arguments[0]?.type === 'ObjectExpression');
  if (calls.length !== 2) throw new Error('Native Library contexts original row click/keyboard actions changed.');
  calls.forEach(call => replace(call, `e.lcos_library_entry?C(!0):${text(call)}`));
  const menu = one(matching(row.body, node => jsx(node, 'IS')), 'original row menu');
  replace(menu, `e.lcos_library_entry?null:${text(menu)}`);
  const drag = one(matching(row.body, node => node.type === 'ObjectProperty' && (node.key?.name ?? node.key?.value) === 'draggable'), 'row drag prop');
  replace(drag.value, `!e.lcos_library_entry&&${text(drag.value)}`);
  const mouse = prop(popover.arguments[1], 'onMouseEnter');
  if (!mouse) throw new Error('Native Library contexts original hover behavior is unavailable.');
  replace(mouse.value, `e.lcos_library_entry?void 0:${text(mouse.value)}`);
  const trigger = prop(popover.arguments[1], 'trigger');
  if (trigger) replace(trigger.value, `e.lcos_library_entry?"click":${text(trigger.value)}`);
  else insert(popover.arguments[1].end - 1, ',trigger:e.lcos_library_entry?"click":"hover"');

  const preview = binding(program, 'TS').init;
  if (prop(preview.params[0], 'detail')?.value?.name !== 'e') throw new Error('Native Library contexts TS detail prop changed.');
  insert(preview.params[0].end - 1, ',bodySlot:LCOSLibraryBody,metaSlot:LCOSLibraryMeta,actionsSlot:LCOSLibraryActions,contentVariant:LCOSLibraryContentVariant');
  const media = one(matching(preview.body, node => jsx(node, 'yk')), 'original TS media slot');
  replace(media, `LCOSLibraryBody===undefined?${text(media)}:LCOSLibraryBody`);
  const originalButton = one(matching(preview.body, node => jsx(node) && node.arguments[0]?.value === 'button'
    && prop(node.arguments[1], 'onClick')), 'original TS action');
  replace(originalButton, `LCOSLibraryActions===undefined?${text(originalButton)}:LCOSLibraryActions`);
  const result = one(matching(preview.body, node => node.type === 'ReturnStatement'), 'original TS return').argument;
  const rootChildren = prop(result.arguments[1], 'children')?.value;
  const mediaContainer = rootChildren?.elements?.[0];
  const rootClass = prop(result.arguments[1], 'className')?.value;
  const mediaClass = prop(mediaContainer?.arguments?.[1], 'className')?.value;
  if (!rootClass || !mediaClass) throw new Error('Native Library contexts TS content layout seam changed.');
  replace(rootClass, `LCOSLibraryContentVariant==="content"?${text(rootClass)}+" native-library-content-preview":${text(rootClass)}`);
  replace(mediaClass, `LCOSLibraryContentVariant==="content"?"native-library-content-body":${text(mediaClass)}`);
  const footer = rootChildren?.elements?.[1];
  const footerChildren = prop(footer?.arguments?.[1], 'children')?.value;
  const metadata = footerChildren?.elements?.[0];
  if (!metadata || !jsx(metadata)) throw new Error('Native Library contexts TS metadata slot changed.');
  replace(metadata, `LCOSLibraryMeta===undefined?${text(metadata)}:LCOSLibraryMeta`);
  const refresh = one(matching(program, node => node.type === 'FunctionDeclaration' && node.id?.name === 'sU'), 'original detail refresh');
  const refreshEffect = one(matching(refresh, node => node.type === 'CallExpression' && node.callee?.property?.name === 'useEffect'
    && matching(node, child => child.type === 'MemberExpression' && child.property?.name === 'getAssetDetail').length > 0), 'original detail request effect');
  if (refreshEffect.arguments[0]?.body?.type !== 'BlockStatement') throw new Error('Native Library contexts detail effect changed.');
  insert(refreshEffect.arguments[0].body.start + 1, 'if(e.asset?.lcos_library_entry)return;');

  const folder = binding(program, 'wU').init;
  const folderMenu = one(matching(folder.body, node => jsx(node, 'fU')), 'original folder menu');
  replace(folderMenu, `e.lcos_library_folder?null:${text(folderMenu)}`);
  const cover = one(matching(folder.body, node => node.type === 'CallExpression' && node.callee?.name === 'C'
    && node.arguments.length === 2 && node.arguments[0]?.name === 'x'), 'original folder cover prefetch');
  replace(cover, `(e.lcos_library_folder?void 0:${text(cover)})`);

  const dock = one(matching(program, node => jsx(node, 'LCOSSurfaceDock')), 'existing native Surface Dock');
  const dockProps = dock.arguments[1];
  const currentCanvas = prop(dockProps, 'currentCanvasId')?.value;
  const select = prop(dockProps, 'onSelect')?.value;
  const disabled = prop(dockProps, 'disabled')?.value;
  if (!currentCanvas || !select || !disabled) throw new Error('Native Library contexts original Ke selection seam changed.');
  replace(dock, `r.jsxs(r.Fragment,{children:[${text(dock)},r.jsx(${EXPORTS[2]},{canvasId:${text(currentCanvas)},onSelect:${text(select)},disabled:${text(disabled)}})]})`);
  const firstImport = one(program.body.filter(node => node.type === 'ImportDeclaration').slice(0, 1), 'first module import');
  insert(firstImport.start, `${MARKER}import{${EXPORTS.join(',')}}from"/lcos/agent-ui.js";\n`);
  const output = apply(source, edits);
  assertInstalled(parseOriginalDonorScript(output, filename));
  return output;
}
