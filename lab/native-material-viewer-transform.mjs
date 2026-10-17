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
  const owner = one(ast, node => node.type === 'VariableDeclarator' && node.id?.name === 'd2', 'viewer mount owner');
  const mount = one(owner, node => isCall(node, 'c2'), 'single original viewer mount');
  // Original cX measures its media container only on mount. A controlled
  // text-loading → image handoff must remount this same original c2, otherwise
  // no media container was present during its measurement effect.
  edits.push({ start: mount.arguments[1].end - 1, end: mount.arguments[1].end - 1,
    text: ',key:i.lcosControlled?i.id+":"+i.media.type:void 0' });
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
  const result = editsApplied(source, edits) + marker + `
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
