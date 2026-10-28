import { parseOriginalDonorScript } from './agent-node-transform.mjs';
import { transformNativeLibraryViewportScript } from './native-library-viewport-transform.mjs';

const TARGET = 'page-Da_DfwiK.js';
const POPOVER_TARGET = 'index-BAQXnPag.js';
const RETAIN = 'LCOSNativeLibraryPreviewRetain';
const BACK = 'LCOSUseNativeLibraryNavigationBack';
const ROW = 'LCOSUseNativeLibraryRowOwner';
const PREVIEW_LAYOUT = 'LCOSUseNativeLibraryPreviewLayout';
const RETAIN_MARKER = '/* lcos-native-library-preview-retain */';
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

function transformOriginalPopoverRetention(source, filename) {
  const program = parseOriginalDonorScript(source, filename);
  const component = binding(program, 'IQe').init.arguments[0];
  if (source.includes(RETAIN_MARKER)) {
    if (!prop(component.params[0], 'lcosKeepPreviewOpen')) throw new Error('Native preview retention prop is missing.');
    if (matching(component, node => node.type === 'OptionalCallExpression' && node.callee?.name === 'LCOSKeepPreviewOpen').length !== 7)
      throw new Error('Native preview retention owners are partial.');
    return source;
  }
  const edits = [], text = node => source.slice(node.start, node.end);
  const replace = (node, next) => edits.push({start:node.start,end:node.end,text:next});
  const insert = (at, next) => edits.push({start:at,end:at,text:next});
  const rest = one(component.params[0].properties.filter(p => p.type === 'RestElement'), 'original Popover rest props');
  insert(rest.start, 'lcosKeepPreviewOpen:LCOSKeepPreviewOpen,');
  // Let Escape reach the shipped Viewer. Only its originating preview ignores
  // the simultaneous underlying Radix dismiss; the next Escape closes normally.
  const change = binding(component, 'T').init;
  insert(change.arguments[0].body.start + 1, 'if(!H&&LCOSKeepPreviewOpen?.("viewer-open"))return;');
  insert(change.arguments[1].end - 1, ',LCOSKeepPreviewOpen');
  // Radix emits focus-outside before a native HTML drag crosses its slop.
  // Remember only the pointer-outside this Popover already retained, until
  // that pointer ends; this is focus continuity, never a second drag owner.
  insert(component.body.start + 1, `const LCOSOutsidePointer=w.useRef(null);w.useEffect(()=>{if(!LCOSKeepPreviewOpen)return;const clear=event=>{if(event?.type==="blur"&&event.target!==window)return;LCOSOutsidePointer.current=null};for(const type of ["pointerup","pointercancel","blur","keydown"])window.addEventListener(type,clear,true);return()=>{clear();for(const type of ["pointerup","pointercancel","blur","keydown"])window.removeEventListener(type,clear,true)}},[!!LCOSKeepPreviewOpen]);`);
  const content = one(matching(component, node => jsx(node, 'fQe')), 'original Popover content');
  insert(content.arguments[1].end - 1, ',onEscapeKeyDown:H=>{if(H.target?.closest?.("[data-media-viewer]")&&LCOSKeepPreviewOpen?.("viewer-open")){H.lcosNativeLibraryPreviewEscape=true;H.preventDefault()}}');
  for (const [name, reason] of [['onPointerDownOutside','pointer-outside'],['onFocusOutside','focus-outside']]) {
    const handler = prop(content.arguments[1], name)?.value;
    if (handler?.body?.type !== 'BlockStatement' || handler.params[0]?.name !== 'H') throw new Error('Original Popover outside callback changed.');
    insert(handler.body.start + 1, name === 'onPointerDownOutside'
      ? `LCOSOutsidePointer.current=null;if(LCOSKeepPreviewOpen?.("${reason}",H.detail?.originalEvent)){LCOSOutsidePointer.current=H.detail?.originalEvent;H.preventDefault();return;}`
      : `const previous=LCOSOutsidePointer.current;LCOSOutsidePointer.current=null;if(LCOSKeepPreviewOpen?.("${reason}",H.detail?.originalEvent)||(previous&&H.detail?.originalEvent?.target?.contains?.(previous.target)&&LCOSKeepPreviewOpen?.("pointer-outside",previous))){H.preventDefault();return;}`);
  }
  const hover = binding(component, 'j').init;
  const hoverClose = one(matching(hover.arguments[0], node => node.type === 'CallExpression' && node.callee?.name === 'T'
    && node.arguments[0]?.type === 'UnaryExpression' && node.arguments[0].operator === '!'), 'original hover close');
  replace(hoverClose, `LCOSKeepPreviewOpen?.("hover-leave")||${text(hoverClose)}`);
  insert(hover.arguments[1].end - 1, ',LCOSKeepPreviewOpen');
  const subscription = one(matching(component, node => node.type === 'CallExpression' && node.callee?.property?.name === 'useEffect'
    && matching(node.arguments[0], child => child.type === 'CallExpression' && child.callee?.object?.name === 'G' && child.callee?.property?.name === 'subscribe').length), 'original Popover peer subscription');
  const peerClose = one(matching(subscription.arguments[0], node => node.type === 'CallExpression' && node.callee?.name === 'T'), 'original peer close');
  replace(peerClose, `LCOSKeepPreviewOpen?.("peer-open")||${text(peerClose)}`);
  insert(subscription.arguments[1].end - 1, ',LCOSKeepPreviewOpen');
  return RETAIN_MARKER + apply(source, edits);
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
  one(program.body.filter(node => node.type === 'ImportDeclaration' && node.source.value === '/lcos/agent-ui.js')
    .flatMap(node => node.specifiers.filter(specifier => specifier.local?.name === PREVIEW_LAYOUT)), 'preview layout hook import');
  const row = binding(program, 'Zp').init;
  one(matching(row, node => node.type === 'CallExpression' && node.callee?.name === PREVIEW_LAYOUT), 'open-row preview layout hook');
  const rowPreview = one(matching(row, node => jsx(node, 'pr') && prop(node.arguments[1], 'content')), 'original row preview');
  if (prop(rowPreview.arguments[1], 'ref')?.value?.object?.name !== 'LCOSLibraryLayout')
    throw new Error('Native Library preview must retain the original forwarded trigger ref.');
}

/** Extend native Library view data and existing row/TS slots. No Atlas, Hand,
 * floating manager, cloud folder mutation or second navigation owner is added. */
export function transformNativeLibraryContextsScript(filename, source) {
  if (filename.split(/[\\/]/).pop() === POPOVER_TARGET) return transformOriginalPopoverRetention(source, filename);
  if (filename.split(/[\\/]/).pop() !== TARGET) return source;
  const program = parseOriginalDonorScript(source, filename);
  if (source.includes(MARKER)) { assertInstalled(program); return transformNativeLibraryViewportScript(filename, source); }
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
  insert(row.body.start+1,`const LCOSLibrarySide=${ROW}(e,()=>C(!0));`);
  const rowControl = one(matching(row.body,node=>jsx(node)&&prop(node.arguments[1],'aria-label')&&prop(node.arguments[1],'onClick')
    &&matching(prop(node.arguments[1],'onClick'),child=>child.type==='CallExpression'&&child.callee?.name==='g').length), 'original exact row control');
  insert(rowControl.arguments[1].end-1, ',"data-native-library-entry":e.lcos_library_entry?.item?.entityRef?.id?JSON.stringify([e.lcos_library_entry.projectId,e.lcos_library_entry.item.kind,e.lcos_library_entry.item.entityRef.id]):void 0');
  const popover = one(matching(row.body, node => jsx(node, 'pr') && prop(node.arguments[1], 'content')), 'original row Popover');
  const side = prop(popover.arguments[1], 'side')?.value;
  const padding = prop(popover.arguments[1], 'collisionPadding')?.value;
  const opened = prop(popover.arguments[1], 'open')?.value;
  const contentClass = prop(popover.arguments[1], 'contentClassName')?.value;
  if (!side || !padding || !opened || !contentClass || prop(popover.arguments[1], 'ref')) throw new Error('Native Library row positioning seam changed.');
  const rowReturn = one(row.body.body.filter(node => node.type === 'ReturnStatement'), 'original row final return');
  // The original state bindings are declared before this statement. Closed
  // rows keep hook order but never create a document observer.
  insert(rowReturn.start, `const LCOSLibraryLayout=${PREVIEW_LAYOUT}(e,${text(opened)});`);
  replace(side, `LCOSLibrarySide??(${text(side)})`);
  replace(padding, `LCOSLibraryLayout?.collisionPadding??(LCOSLibrarySide?16:(${text(padding)}))`);
  replace(contentClass, `LCOSLibraryLayout?.contentClassName?${text(contentClass)}+" "+LCOSLibraryLayout.contentClassName:${text(contentClass)}`);
  insert(popover.arguments[1].end - 1, ',ref:LCOSLibraryLayout?.triggerRef');
  const content = prop(popover.arguments[1], 'content').value;
  insert(popover.arguments[1].end - 1, `,lcosKeepPreviewOpen:(reason,event)=>${RETAIN}({asset:e},reason,event)`);
  replace(content, `T.asset?.lcos_library_entry?r.jsx(${EXPORTS[1]},{detail:T,NativePreview:TS,onClose:()=>C(!1)}):${text(content)}`);
  const calls = matching(row.body, node => node.type === 'CallExpression' && node.callee?.name === 'g'
    && node.arguments.length === 1 && node.arguments[0]?.type === 'ObjectExpression');
  if (calls.length !== 2) throw new Error('Native Library contexts original row click/keyboard actions changed.');
  calls.forEach(call => replace(call, `e.lcos_library_entry?C(!0):${text(call)}`));
  const menu = one(matching(row.body, node => jsx(node, 'IS')), 'original row menu');
  replace(menu, `e.lcos_library_entry?null:${text(menu)}`);
  const drag = one(matching(row.body, node => node.type === 'ObjectProperty' && (node.key?.name ?? node.key?.value) === 'draggable'), 'row drag prop');
  // Keep the original row gesture; the shared Drop producer validates Core entries.
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
  const header = one(matching(program,node=>jsx(node)&&prop(node.arguments[1],'className')?.value?.value==='canvas-header-chrome'),'original header');
  const owner = matching(program,node=>['ArrowFunctionExpression','FunctionExpression','FunctionDeclaration'].includes(node.type)
    &&node.body?.type==='BlockStatement'&&node.start<header.start&&node.end>header.end).sort((a,b)=>(a.end-a.start)-(b.end-b.start))[0];
  if(!owner)throw new Error('Original header return owner unavailable.');
  const toastSource=one(program.body.filter(node=>node.type==='ImportDeclaration'&&node.specifiers.some(specifier=>specifier.local?.name==='se')),'original toast import');
  const toast=one(toastSource.specifiers.filter(specifier=>specifier.local?.name==='se'),'original toast alias');
  if(toast.imported?.type!=='Identifier')throw new Error('Original toast export changed.');
  insert(owner.body.start+1,`const LCOSLibraryBack=${BACK}(${text(currentCanvas)},(message,retry)=>LCOSNativeLibraryToast.error(message,retry?{action:{label:"再试返回",onClick:retry}}:undefined));`);
  const originalBack = one(matching(header,node=>jsx(node)&&prop(node.arguments[1],'data-testid')?.value?.value==='canvas-header-logo-button'),'original header Back button');
  for(const [key,make] of [['onClick',value=>`LCOSLibraryBack?.onBack??${value}`],['aria-label',value=>`LCOSLibraryBack?.title??${value}`],
    ['disabled',value=>`LCOSLibraryBack?.busy||(${value})`],['children',value=>`LCOSLibraryBack?.icon??${value}`]]){
    const value=prop(originalBack.arguments[1],key)?.value;if(!value)throw new Error('Original header Back property unavailable: '+key);replace(value,make(text(value)));
  }
  insert(originalBack.arguments[1].end-1, ',title:LCOSLibraryBack?.title');
  const firstImport = one(program.body.filter(node => node.type === 'ImportDeclaration').slice(0, 1), 'first module import');
  insert(firstImport.start, `${MARKER}import{${[...EXPORTS, RETAIN, BACK, ROW, PREVIEW_LAYOUT].join(',')}}from"/lcos/agent-ui.js";\n`);
  insert(firstImport.start,`import{${toast.imported.name} as LCOSNativeLibraryToast}from${JSON.stringify(toastSource.source.value)};\n`);
  const output = apply(source, edits);
  assertInstalled(parseOriginalDonorScript(output, filename));
  return transformNativeLibraryViewportScript(filename, output);
}
