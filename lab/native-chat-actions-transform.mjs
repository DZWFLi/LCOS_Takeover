import { parseOriginalDonorScript } from './agent-node-transform.mjs';
function walk(node, visitor) {
  if (!node?.type) return; visitor(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) { for (const child of value) walk(child, visitor); }
    else if (value?.type) walk(value, visitor);
  }
}
/** Original Copy is local and functional. Feedback only renders when its
 * caller supplies a real handler, rather than toggling an unpersisted thumb. */
export function transformNativeChatActionsScript(filename, source) {
  if (filename.split(/[\\/]/).pop() !== 'agent-host-provider-uVo_bky5.js') return source;
  if (source.includes('/* LCOS actionable feedback */')) return source;
  const program = parseOriginalDonorScript(source, filename), edits = [];
  let owner;
  walk(program, node => { if (node.type === 'VariableDeclarator' && node.id?.name === 'uv') owner = node; });
  walk(owner, node => {
    if (node.type !== 'CallExpression' || !['jsx', 'jsxs'].includes(node.callee?.property?.name)) return;
    const properties = node.arguments[1]?.properties ?? [];
    const label = properties.find(p => p.key?.name === 'label')?.value;
    const key = label?.arguments?.[0]?.value;
    if (['chatAdapter.feedback.thumbsUp', 'chatAdapter.feedback.thumbsDown'].includes(key)) edits.push({ start: node.start, end: node.end,
      text: `p&&${source.slice(node.start, node.end)}` });
  });
  if (edits.length !== 2) throw new Error('The native feedback controls could not be connected to their real callback.');
  for (const edit of edits.sort((a,b) => b.start-a.start)) source = source.slice(0,edit.start)+edit.text+source.slice(edit.end);
  return source+'\n/* LCOS actionable feedback */\n';
}
