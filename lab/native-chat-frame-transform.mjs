import { parseOriginalDonorScript } from './agent-node-transform.mjs';
import { nativeChatControlledViews } from './native-chat-controls-transform.mjs';

const TARGET = 'agent-host-provider-uVo_bky5.js';
function visit(node, fn) {
  if (!node || typeof node.type !== 'string') return;
  fn(node);
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'tokens', 'comments'].includes(key)) continue;
    if (Array.isArray(value)) value.forEach(child => visit(child, fn));
    else if (value?.type) visit(value, fn);
  }
}
const property = (object, name) => object?.properties?.find(p => (p.key?.name ?? p.key?.value) === name);
const props = call => call?.arguments?.[1];
const children = call => property(props(call), 'children')?.value;
function findOne(root, predicate, label) {
  const found = []; visit(root, node => { if (predicate(node)) found.push(node); });
  if (found.length !== 1) throw new Error(`Native Chatbox ${label} cannot be resolved from the installed frontend.`);
  return found[0];
}
function apply(source, edits) {
  for (const edit of edits.sort((a, b) => b.start - a.start)) source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  return source;
}

/** Reuse hD's actual shell, width controls, resize lifecycle and motion.
 * Only its cloud-owned content is replaced by controlled Core slots. hD itself
 * is left untouched and never mounted by the LCOS sidebar. */
export function transformNativeChatFrameScript(filename, source) {
  if (filename.split(/[\\/]/).pop() !== TARGET) return source;
  if (source.includes('function LCOSNativeChatFrame(')) return source;
  const program = parseOriginalDonorScript(source, filename);
  const owner = findOne(program, n => n.type === 'VariableDeclarator' && n.id?.name === 'hD', 'owner');
  const body = owner.init.body;
  const returned = body.body.findLast(n => n.type === 'ReturnStatement')?.argument;
  const rootChildren = children(returned);
  const inner = rootChildren?.elements?.find(n => property(props(n), 'ref')?.value?.name === 'Do');
  const entries = children(inner)?.elements ?? [];
  const resize = entries.find(n => property(props(n), 'onMouseDown')?.value?.name === '_0');
  const header = entries.find(n => n?.arguments?.[0]?.name === 'wM');
  const messages = entries.find(n => property(props(n), 'className')?.value?.value === 'relative flex-1 flex flex-col min-h-0');
  const composerCondition = entries.find(n => n.type === 'LogicalExpression'
    && property(props(n.right), 'className')?.value?.value === 'relative z-10');
  if (!inner || !resize || !header || !messages || !composerCondition) throw new Error('The native Chatbox content slots are unavailable.');
  const slice = n => source.slice(n.start, n.end);
  const replaceChildren = (call, content) => {
    const child = children(call);
    return apply(slice(call), [{ start: child.start - call.start, end: child.end - call.start, text: content }]);
  };
  const messageFrame = replaceChildren(messages, 'children');
  const composerFrame = replaceChildren(composerCondition.right, 'composer');
  const innerFrame = replaceChildren(inner, `[${slice(resize)},header,${messageFrame},${composerFrame}]`);
  const frame = apply(slice(returned), [{ start: rootChildren.start - returned.start,
    end: rootChildren.end - returned.start, text: `[${innerFrame}]` }])
    .replace('"data-chat-input-area":!0,', '"data-chat-input-area":!0,"data-lcos-native-chat-frame":true,');
  const bindings = new Map();
  visit(body, n => {
    if (n.type !== 'VariableDeclarator') return;
    const name = n.id?.type === 'Identifier' ? n.id.name : n.id?.type === 'ArrayPattern' ? n.id.elements[0]?.name : undefined;
    if (name && !bindings.has(name)) bindings.set(name, n);
  });
  const originals = ['W', '$', 'Q', 'de', 'te', 'me', 'V', 're', 'ae', 'Do', 'Qu', '_0', 'gc', 'hc', 'Kr', 'Yu', 'w0', 'S0'];
  const declarations = originals.map(name => {
    const binding = bindings.get(name);
    if (!binding) throw new Error(`Native Chatbox layout binding ${name} is missing.`);
    return `const ${slice(binding)};`;
  });
  const effects = [];
  visit(body, n => {
    if (n.type !== 'CallExpression' || n.callee?.object?.name !== 'a' || n.callee?.property?.name !== 'useEffect') return;
    const code = slice(n);
    if (code.includes('V.current=W') || code.includes('v0(K=>K+1)')
      || code.includes('Math.min(A,K)') || code.includes('document.addEventListener("mousemove"')) effects.push(code + ';');
  });
  const helper = `${nativeChatControlledViews(program, source)}\nfunction LCOSNativeChatFrame({isOpen:e,header,children,composer}){
const L=In(),X=false,Ke=false,pe=false,ac=false,Uu=false,Be=()=>{};
const {isPanelCollapsed:J}=YL(e,RN);
${declarations.join('\n')}
${effects.join('\n')}
const Dv=0,zv=0,qv=0,Bv=0,Hv=false,Un=true;
return ${frame};
}
LCOSNativeChatFrame.Header=LCOSNativeChatHeader;
LCOSNativeChatFrame.List=LCOSNativeTaskList;
export{LCOSNativeChatFrame,U5 as LCOSNativeMessages};\n`;
  // Parse the result before serving so an unavailable slot fails here, rather
  // than leaving the user with a blank canvas after a late syntax error.
  const transformed = source + helper;
  parseOriginalDonorScript(transformed, filename);
  return transformed;
}
