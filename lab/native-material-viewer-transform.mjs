import { parseOriginalDonorScript } from './agent-node-transform.mjs';

const asset = 'course-api-base-url-CifxI1ia.js';
const marker = '\n/* lcos-native-material-viewer-slots */\n';
function walk(root, visit) {
  if (!root?.type) return;
  visit(root);
  for (const [key, value] of Object.entries(root)) {
    if (['loc', 'tokens', 'comments'].includes(key)) continue;
    if (Array.isArray(value)) value.forEach(child => walk(child, visit));
    else if (value?.type) walk(value, visit);
  }
}
function one(root, predicate, label) {
  const found = []; walk(root, node => { if (predicate(node)) found.push(node); });
  if (found.length !== 1) throw new Error(`Native media viewer ${label} changed (${found.length}).`);
  return found[0];
}
const property = (object, name) => object?.properties?.find(p => (p.key?.name ?? p.key?.value) === name);
const isCall = (node, name) => node.type === 'CallExpression' && node.arguments?.[0]?.name === name
  && ['jsx', 'jsxs'].includes(node.callee?.property?.name);
function editsApplied(source, edits) {
  let boundary = source.length + 1;
  for (const edit of edits.sort((a, b) => b.start - a.start || b.end - a.end)) {
    if (edit.end > boundary) throw new Error('Native viewer slot edits overlap.');
    source = source.slice(0, edit.start) + edit.text + source.slice(edit.end); boundary = edit.start;
  }
  return source;
}

/** Extend the existing wa/d2/c2 viewer. It remains the only viewer session,
 * motion/focus/anchor/inspect owner; ordinary donor sessions keep their path. */
export function transformNativeMaterialViewerScript(filename, source) {
  if (filename.split(/[\\/]/).pop() !== asset || source.includes(marker)) return source;
  const ast = parseOriginalDonorScript(source, filename), edits = [];
  const declaration = name => one(ast, n => n.type === 'FunctionDeclaration' && n.id?.name === name, name);
  const viewer = declaration('c2'), text = declaration('vZ'), actions = declaration('UX');
  const mountFocus = one(viewer, n => n.type === 'ExpressionStatement'
    && n.expression?.callee?.property?.name === 'useLayoutEffect'
    && source.slice(n.start, n.end).includes('u.current?.focus'), 'original mount focus');
  edits.push({ start: mountFocus.end, end: mountFocus.end, text: 'useLCOSNativeViewerHandoffFocus(t,e,u);' });
  const viewerRoot = one(viewer, n => n.type === 'ObjectExpression' && property(n, 'data-media-viewer'), 'original dialog root');
  edits.push({ start: viewerRoot.end - 1, end: viewerRoot.end - 1,
    text: ',"data-lcos-native-viewer-owner":t.lcosControlled?.requestKey' });
  const owner = one(ast, node => node.type === 'VariableDeclarator' && node.id?.name === 'd2', 'viewer mount owner');
  const mount = one(owner, node => isCall(node, 'c2'), 'single original viewer mount');
  // Original cX measures its media container only on mount. A controlled
  // text-loading → image handoff must remount this same original c2, otherwise
  // no media container was present during its measurement effect.
  edits.push({ start: mount.arguments[1].end - 1, end: mount.arguments[1].end - 1,
    text: ',key:i.lcosControlled?i.id+":"+i.media.type:void 0' });
  // Loading/error/media transitions reuse the shipped wa owner. A late motion
  // callback from an older presentation must not mark/close a newer session.
  for (const [name, phase] of [['onOpened', 'opening'], ['onClosed', 'closing']]) {
    const callback = property(mount.arguments[1], name)?.value;
    if (!callback || callback.type !== 'Identifier') throw new Error('Original Viewer lifecycle callback changed.');
    const original = source.slice(callback.start, callback.end);
    edits.push({ start: callback.start, end: callback.end,
      text: `i.lcosControlled?()=>{const current=wa.getState();if(current.session===i&&current.phase==="${phase}")${original}()}:${original}` });
  }
  // A controlled loading slot can finish its first opening before exact bytes
  // replace it. Escape during that second opening uses the existing queued close.
  const keyboard = one(viewer, n => n.type === 'VariableDeclarator' && n.id?.name === 'B'
    && n.init?.callee?.property?.name === 'useCallback', 'original keyboard callback');
  const onKey = keyboard.init.arguments[0], keyEvent = onKey.params[0]?.name, keyDeps = keyboard.init.arguments[1];
  if (!keyEvent || onKey.body.type !== 'BlockStatement' || keyDeps?.type !== 'ArrayExpression') throw new Error('Native viewer keyboard shape changed.');
  // The native Popover can retain a Library -> Task -> Viewer journey too.
  // Its marked Escape belongs to the current controlled Viewer, even though
  // that material deliberately does not inherit the Task's Library return.
  edits.push({ start: onKey.body.start + 1, end: onKey.body.start + 1,
    text: 'if(t.lcosControlled&&('+keyEvent+'.lcosNativeLibraryPreviewEscape||'+keyEvent+'.nativeEvent?.lcosNativeLibraryPreviewEscape)&&'+keyEvent+'.key==="Escape"&&!document.fullscreenElement){'
      +'if(e==="open"){'+keyEvent+'.stopPropagation();L();return;}if(e==="opening"){'+keyEvent+'.stopPropagation();LCOSNativeMaterialViewerRuntime.close(t.id);return;}}'
      +'if(t.lcosControlled&&e==="opening"&&' + keyEvent + '.key==="Escape"&&!'+ keyEvent + '.defaultPrevented&&!document.fullscreenElement){'
      + keyEvent + '.preventDefault();' + keyEvent + '.stopPropagation();LCOSNativeMaterialViewerRuntime.close(t.id);return;}' });
  edits.push({ start: keyDeps.end - 1, end: keyDeps.end - 1, text: ',t.lcosControlled?.requestKey' });
  const code = n => source.slice(n.start, n.end);
  const fileInfo = one(viewer, n => n.type === 'CallExpression' && n.callee?.name === 'kY', 'file info read');
  edits.push({ start: fileInfo.arguments[0].start, end: fileInfo.arguments[0].end,
    text: `t.lcosControlled?"":(${code(fileInfo.arguments[0])})` });
  for (const [name, replacement] of [['SY', 't.lcosControlled?.factsSlot'], ['yY', 't.lcosControlled?.actionsSlot']]) {
    const call = one(viewer, n => isCall(n, name), name + ' presentation');
    edits.push({ start: call.start, end: call.end, text: `(${replacement}??${code(call)})` });
  }
  const textCall = one(viewer, n => isCall(n, 'vZ'), 'text content');
  edits.push({ start: textCall.arguments[1].end - 1, end: textCall.arguments[1].end - 1,
    text: ',lcosBodySlot:t.lcosControlled?.bodySlot,lcosActionsSlot:t.lcosControlled?.textActionsSlot,lcosHideCopy:t.lcosControlled?.hideCopy' });
  edits.push({ start: text.params[0].end - 1, end: text.params[0].end - 1,
    text: ',lcosBodySlot,lcosActionsSlot,lcosHideCopy' });
  const textPanel = one(text, n => n.type === 'ObjectProperty' && n.key?.name === 'className'
    && n.value?.value === 'media-viewer__text-panel h-full select-text overflow-hidden text-card-foreground', 'original text panel');
  const textPanelObject = one(text, n => n.type === 'ObjectExpression' && n.properties.includes(textPanel), 'text panel props');
  const textBody = property(textPanelObject, 'children').value;
  edits.push({ start: textBody.start, end: textBody.end, text: `(lcosBodySlot??(${code(textBody)}))` });
  const textActions = one(text, n => isCall(n, 'UX'), 'text actions');
  const textActionsZone = one(text, n => n.type === 'ObjectExpression'
    && property(n, 'className')?.value?.value === 'fixed bottom-7 left-1/2 z-30 -translate-x-1/2'
    && property(n, 'data-media-viewer-dismiss-blocker'), 'original text action zone');
  edits.push({ start: textActionsZone.end - 1, end: textActionsZone.end - 1,
    text: ',"data-lcos-native-viewer-actions":lcosActionsSlot?"text":void 0' });
  const originalEditable = property(textActions.arguments[1], 'editable').value;
  edits.push({ start: originalEditable.start, end: originalEditable.end,
    text: `lcosActionsSlot?false:(${code(originalEditable)})` });
  edits.push({ start: textActions.arguments[1].end - 1, end: textActions.arguments[1].end - 1,
    text: ',lcosExtraActions:lcosActionsSlot,lcosHideCopy' });
  edits.push({ start: actions.params[0].end - 1, end: actions.params[0].end - 1,
    text: ',lcosExtraActions,lcosHideCopy' });
  const actionContainer = one(actions, n => isCall(n, 'XO'), 'native text action bar');
  const actionChildren = property(actionContainer.arguments[1], 'children').value;
  const copy = actionChildren.elements[0];
  edits.push({ start: copy.start, end: copy.end, text: `(!lcosHideCopy&&${code(copy)})` });
  edits.push({ start: actionChildren.end - 1, end: actionChildren.end - 1, text: ',lcosExtraActions' });
  // Keep CT, its actual Markdown renderer and custom link/image renderers.
  // Source positions are optional presentation attributes, never visual lines.
  const markdownBody = one(ast, n => n.type === 'VariableDeclarator' && n.id?.name === 'CT', 'original Markdown body');
  const markdownFunction = markdownBody.init?.arguments?.[0];
  const markdownProps = markdownFunction?.params?.[0];
  const markdownCall = one(markdownBody, n => isCall(n, 'uW'), 'original Markdown renderer');
  if (markdownProps?.type !== 'ObjectPattern' || markdownProps.properties.length !== 2
    || !property(markdownProps, 'markdown') || !property(markdownProps, 'className')
    || property(markdownCall.arguments[1], 'rehypePlugins')) throw new Error('Original CT source-position seam changed.');
  edits.push({ start: markdownProps.end - 1, end: markdownProps.end - 1, text: ',sourceLines:lcosSourceLines=false' });
  edits.push({ start: markdownCall.arguments[1].end - 1, end: markdownCall.arguments[1].end - 1,
    text: ',rehypePlugins:lcosSourceLines?[LCOSNativeReaderSourceLines]:void 0' });
  const result = editsApplied(source, edits) + marker + `
function useLCOSNativeViewerHandoffFocus(session,phase,rootRef){
  d.useLayoutEffect(()=>{
    if(!session.lcosControlled||phase==="closing"||wa.getState().session!==session)return;
    const root=rootRef.current,active=document.activeElement;
    if(root?.isConnected&&(active===document.body||active===document.documentElement||root.contains(active)))root.focus({preventScroll:!0});
  },[session.lcosControlled?.requestKey]);
}
function LCOSNativeReaderSourceLines(){return tree=>{
  const valid=line=>Number.isSafeInteger(line)&&line>0;
  const attrs=(start,end)=>({"data-native-source-start-line":start,"data-native-source-end-line":end});
  const visit=node=>{
    const start=node.position?.start?.line,end=node.position?.end?.line;
    if(node.type==="element"&&valid(start)&&valid(end)&&end>=start)node.properties={...node.properties,...attrs(start,end)};
    if(!Array.isArray(node.children))return;
    node.children=node.children.flatMap(child=>{
      const first=child.position?.start?.line,last=child.position?.end?.line;
      if(child.type==="text"&&typeof child.value==="string"&&valid(first)&&valid(last)&&last>=first){
        const lines=child.value.split("\\n");
        if(lines.length===last-first+1)return lines.map((value,index)=>({type:"element",tagName:"span",properties:attrs(first+index,first+index),
          children:[{type:"text",value:value+(index<lines.length-1?"\\n":"")}]}));
      }
      visit(child);return [child];
    });
  };visit(tree);
};}
const LCOSNativeMaterialViewerRuntime={
  open:session=>wa.getState().open(session),
  anchor:id=>NZ(id),
  getState:()=>wa.getState(),
  subscribe:listener=>wa.subscribe(listener),
  close:id=>{const state=wa.getState();if(!state.session||state.session.id!==id)return false;
    if(state.phase==="open"){state.requestClose(NZ(id));return true;}
    if(state.phase==="opening"){const release=wa.subscribe(next=>{if(next.session?.id!==id){release();return;}
      if(next.phase==="open"){release();next.requestClose(NZ(id));}});return true;}return state.phase==="closing";}
};
const LCOSNativeViewerParts={ActionBar:XO,ActionButton:gm,TextBody:CT,Facts:SY};
export{LCOSNativeMaterialViewerRuntime,LCOSNativeViewerParts};
`;
  parseOriginalDonorScript(result, filename);
  return result;
}
