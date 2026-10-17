import path from 'node:path';
import { parseOriginalDonorScript } from './agent-node-transform.mjs';

const asset = 'agent-host-provider-uVo_bky5.js';
const marker = '\n/* LCOS controlled Composer slots: original Bl/Gy/FM/Dy containers. */\n';

function walk(root) {
  const result = [], queue = [root];
  while (queue.length) {
    const node = queue.pop();
    if (!node?.type) continue;
    result.push(node);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) queue.push(...value.filter(child => child?.type));
      else if (value?.type) queue.push(value);
    }
  }
  return result;
}
function one(nodes, label) {
  if (nodes.length !== 1) throw new Error(`Native Composer ${label} seam changed (${nodes.length}).`);
  return nodes[0];
}
function property(object, key) {
  return object?.properties?.find(item => item.type === 'ObjectProperty'
    && !item.computed && (item.key?.name ?? item.key?.value) === key)?.value;
}
function jsx(node, tag = 'div') {
  return node?.type === 'CallExpression' && ['jsx', 'jsxs'].includes(node.callee?.property?.name)
    && node.arguments[0]?.type === 'StringLiteral' && node.arguments[0].value === tag;
}
function binding(program, name) {
  return one(walk(program).filter(node => node.type === 'VariableDeclarator' && node.id?.name === name), name);
}
function baseClass(node) {
  const value = property(node.arguments[1], 'className');
  const first = value?.type === 'CallExpression' ? value.arguments[0] : value;
  return first?.type === 'StringLiteral' ? first.value : undefined;
}

/** Read real shipped containers, without mounting their Cloud session/voice owners.
 * Original Bl/Gy/FM/Dy are preserved. Slots keep the existing LCOS Host as the
 * only draft, caret, reference, voice, Drop and submission owner. */
export function extractNativeComposerContainers(source) {
  const program = parseOriginalDonorScript(source, asset);
  const bl = binding(program, 'Bl'), gy = binding(program, 'Gy'), fm = binding(program, 'FM'), dy = binding(program, 'Dy');
  const bubble = one(walk(bl).filter(node => jsx(node) && property(node.arguments[1], 'data-canvas-input-bubble')), 'Bl input bubble');
  const shell = one(walk(bl).filter(node => jsx(node) && baseClass(node)?.startsWith('relative m-2 mt-0')), 'Bl margin');
  const content = one(walk(bubble).filter(node => jsx(node) && baseClass(node) === 'relative z-10'), 'Bl content');
  const editor = one(walk(gy).filter(node => jsx(node) && property(node.arguments[1], 'data-message-input-container')), 'Gy editor');
  const editorInner = one(walk(editor).filter(node => jsx(node) && baseClass(node) === 'relative isolate min-h-12'), 'Gy editor inner');
  const toolbar = one(walk(fm).filter(node => jsx(node) && baseClass(node) === 'flex h-10 min-w-0 items-center justify-between px-2 pb-2'), 'FM toolbar');
  const toolbarLeft = one(walk(toolbar).filter(node => jsx(node) && baseClass(node)?.startsWith('flex shrink-0 items-center gap-2 transition-opacity')), 'FM left actions');
  const toolbarRight = one(walk(toolbar).filter(node => jsx(node) && baseClass(node) === 'flex shrink-0 items-center gap-1.5'), 'FM right actions');
  const references = one(walk(dy).filter(node => jsx(node) && baseClass(node) === 'flex items-center pl-4 pt-3'), 'Dy reference container');
  const referencesInner = one(walk(references).filter(node => jsx(node) && baseClass(node)?.startsWith('flex min-w-0 flex-1 items-center gap-2 overflow-x-hidden')), 'Dy reference scroll');
  const button = one(walk(toolbar).filter(node => jsx(node, 'button') && baseClass(node) === 'size-8 rounded-full cursor-pointer'), 'FM native button');
  const buttonClass = property(button.arguments[1], 'className');
  if (buttonClass.arguments.some(value => value.type !== 'StringLiteral')) throw new Error('Native Composer button styling now depends on session state.');
  return {
    shell: baseClass(shell), bubble: baseClass(bubble), content: baseClass(content),
    editor: baseClass(editor), editorInner: baseClass(editorInner), toolbar: baseClass(toolbar),
    toolbarLeft: baseClass(toolbarLeft), toolbarRight: baseClass(toolbarRight),
    references: baseClass(references), referencesInner: baseClass(referencesInner),
    button: buttonClass.arguments.map(value => value.value).join(' '),
  };
}

export function transformNativeComposerFrame(filename, source) {
  if (path.basename(filename) !== asset) return source;
  const previous = source.indexOf(marker);
  const pristine = previous < 0 ? source : source.slice(0, previous);
  const classes = extractNativeComposerContainers(pristine);
  const c = name => JSON.stringify(classes[name]);
  const addition = `${marker}
export const LCOSNativeComposerFrame=({references,editor,actions,feedback,options,heading,surfaceProps={},disabled=false,className=""})=>o.jsxs("div",{
 className:M(${c('shell')},disabled&&"opacity-50",className),children:[heading,
 o.jsx("div",{...surfaceProps,"data-canvas-input-bubble":true,"data-mention-popover-width-source":"true",className:${c('bubble')},
 children:o.jsxs("div",{className:${c('content')},children:[references,editor,actions]})}),options,feedback]});
export const LCOSNativeComposerEditorFrame=({children})=>o.jsx("div",{"data-message-input-container":true,className:${c('editor')},children:o.jsx("div",{className:${c('editorInner')},children})});
export const LCOSNativeComposerToolbarFrame=({start,end})=>o.jsxs("div",{className:${c('toolbar')},children:[o.jsx("div",{className:${c('toolbarLeft')},children:start}),o.jsx("div",{className:${c('toolbarRight')},children:end})]});
export const LCOSNativeComposerReferenceFrame=({children})=>o.jsx("div",{className:M(${c('references')},"gap-2 pr-4"),children:o.jsx("div",{className:"relative min-w-0 flex-1",children:o.jsx("div",{className:${c('referencesInner')},children})})});
export const LCOSNativeComposerButton=a.forwardRef(({children,className="",...props},ref)=>o.jsx("button",{...props,ref,type:props.type??"button",className:M(${c('button')},className),children}));
export const LCOSNativeComposerParts={Frame:LCOSNativeComposerFrame,EditorFrame:LCOSNativeComposerEditorFrame,ToolbarFrame:LCOSNativeComposerToolbarFrame,ReferenceFrame:LCOSNativeComposerReferenceFrame,Button:LCOSNativeComposerButton};
`;
  return pristine + addition;
}

export const nativeComposerSourceOverride = {
  'lcos/huabu/apps/web/src/lcos/ui/nearfield/LcosComposerView.tsx': 'lab/pilot/native-composer-view.tsx',
};
