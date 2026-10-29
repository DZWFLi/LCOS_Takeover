import { parseOriginalDonorScript } from './agent-node-transform.mjs';

const course = 'course-api-base-url-CifxI1ia.js', page = 'page-Da_DfwiK.js';
const marker = '/* native-node-original-gui-toolbar */';
const walk = (node, visit) => { if (!node?.type) return; visit(node); for (const value of Object.values(node))
  if (Array.isArray(value)) value.forEach(row => walk(row, visit)); else if (value?.type) walk(value, visit); };
const one = (rows, name) => { if (rows.length !== 1) throw new Error('Original GUI toolbar ' + name + ' changed (' + rows.length + ').'); return rows[0]; };
const find = (program, predicate, name) => { const rows = []; walk(program, node => { if (predicate(node)) rows.push(node); }); return one(rows, name); };

/** Original ua visibility, JT/Vde toolbar and Dg/Hie palette, not an imitation
 * toolbar. The factory is applied once at module scope, never during render. */
export function transformNativeNodeGuiToolbarScript(filename, source) {
  const file = filename.split(/[\\/]/).pop();
  if (![course, page].includes(file) || source.includes(marker)) return source;
  const program = parseOriginalDonorScript(source, filename);
  if (file === course) {
    for (const name of ['ua', 'JT', 'Dg']) find(program, node => ['VariableDeclarator', 'FunctionDeclaration'].includes(node.type) && node.id?.name === name, name);
    const toolbar = find(program, node => node.type === 'VariableDeclarator' && node.id?.name === 'Vde', 'Vde').init;
    if (toolbar.type !== 'ArrowFunctionExpression' || toolbar.body.type !== 'BlockStatement') throw new Error('Original Vde function changed.');
    const result = source.slice(0, toolbar.body.start + 1)
      + 'const LCOSGuiPin=Dg(n);e=LCOSGuiPin&&!e.some(group=>Array.isArray(group)&&group.some(tool=>tool?.key==="pin"))?[...e,[LCOSGuiPin]]:e;'
      + source.slice(toolbar.body.start + 1) + `\n${marker}
function LCOSWithNativeNodeGui(Body){return d.memo(function LCOSOriginalNodeGui(props){const zoom=fp(),offset=d.useMemo(()=>Math.min(48/zoom,60),[zoom]);return a.jsxs(d.Fragment,{children:[a.jsx(Body,props),a.jsx(ua,{nodeId:props.id,visible:!!props.selected,isDragging:!!props.dragging,children:a.jsx(JT,{nodeId:props.id,nodeTitle:props.data?.title||"节点",tools:[],className:"absolute origin-bottom left-1/2 z-10 pointer-events-auto",style:{top:"-"+offset+"px"},"data-native-node-gui-toolbar":props.id})})]})})}
export{LCOSWithNativeNodeGui};\n`;
    parseOriginalDonorScript(result, filename); return result;
  }
  const keys = ['lcos-conversation', 'lcos-execution', 'lcos-result-material', 'lcos-collection', 'lcos-member'];
  const registry = find(program, node => node.type === 'ObjectProperty' && (node.key?.name ?? node.key?.value) === 'nodeTypes'
    && node.value?.type === 'ObjectExpression' && node.value.properties.some(row => (row.key?.name ?? row.key?.value) === 'lcos-member'), 'extended registry').value;
  const edits = [], declarations = [];
  for (const [index, key] of keys.entries()) {
    const row = one(registry.properties.filter(row => (row.key?.name ?? row.key?.value) === key), key);
    if (row.value?.type !== 'Identifier') throw new Error('Original typed renderer changed: ' + key);
    const name = 'LCOSOriginalGuiRenderer' + index;
    declarations.push('const ' + name + '=LCOSWithNativeNodeGui(' + row.value.name + ');');
    edits.push({ start: row.value.start, end: row.value.end, text: name });
  }
  let result = source;
  for (const edit of edits.sort((a, b) => b.start - a.start)) result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  // The renderers are initialized after donor declarations, before React ever
  // mounts the original Canvas. No per-render component identity is invented.
  result = 'import{LCOSWithNativeNodeGui}from"./' + course + '";\n' + result + '\n' + marker + '\n' + declarations.join('\n') + '\n';
  parseOriginalDonorScript(result, filename); return result;
}
