import { parseOriginalDonorScript } from './agent-node-transform.mjs';

const marker = '/* lcos-native-member-node */';
const course = 'course-api-base-url-CifxI1ia.js', page = 'page-Da_DfwiK.js';
function walk(node, visit) {
  if (!node?.type) return;
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'tokens', 'comments'].includes(key)) continue;
    if (Array.isArray(value)) value.forEach(child => walk(child, visit)); else if (value?.type) walk(value, visit);
  }
}
function matching(root, predicate) { const rows = []; walk(root, node => { if (predicate(node)) rows.push(node); }); return rows; }
function one(rows, name) { if (rows.length !== 1) throw new Error(`Original member node ${name} changed: ${rows.length}`); return rows[0]; }
const name = property => property.key?.name ?? property.key?.value;

/** Add one typed renderer to the original registry. The original Text shell,
 * title, selection/disabled owner, Markdown, Button and resize remain native. */
export function transformNativeMemberNodeScript(filename, source) {
  const target = filename.split(/[\\/]/).pop();
  if (![course, page].includes(target)) return source;
  const program = parseOriginalDonorScript(source, filename);
  if (target === course) {
    if (source.includes(marker)) {
      one(matching(program, node => node.type === 'VariableDeclarator' && node.id?.name === 'LCOSNativeMemberNode'), 'installed renderer');
      return source;
    }
    for (const binding of ['wr', 'Gr', 'CT']) one(matching(program, node => node.type === 'VariableDeclarator' && node.id?.name === binding
      && node.init?.callee?.object?.name === 'd' && node.init?.callee?.property?.name === 'memo'), binding);
    one(matching(program, node => node.type === 'FunctionDeclaration' && node.id?.name === 'Tw'), 'disabled node wrapper');
    one(program.body.filter(node => node.type === 'ImportDeclaration' && node.source.value === './index-BAQXnPag.js')
      .flatMap(node => node.specifiers.filter(value => value.imported?.name === 'aH' && value.local?.name === 'Ut')), 'original Button');
    const output = `import{LCOSNativeMemberBody}from"/lcos/agent-ui.js";\n${source}\n${marker}
const LCOSNativeMemberNode=d.memo(({id,data,selected,dragging,width,height})=>a.jsx("div",{className:"h-full w-full","data-native-member-node":id,children:a.jsx(Tw,{nodeId:id,children:a.jsx(Gr,{children:a.jsx(wr,{id,data,selected,dragging,isConnectable:false,canAcceptInput:false,canProvideOutput:false,resizable:true,width:width||300,height:height||220,minHeight:160,children:a.jsx(LCOSNativeMemberBody,{id,data,selected,dragging,TextBody:CT,Button:Ut})})})})}));
export{LCOSNativeMemberNode};\n`;
    parseOriginalDonorScript(output, filename); return output;
  }
  const registry = one(matching(program, node => node.type === 'ObjectProperty' && name(node) === 'nodeTypes'
    && node.value?.type === 'ObjectExpression' && node.value.properties.some(value => name(value) === 'lcos-collection')), 'extended original node registry').value;
  const registered = registry.properties.filter(value => name(value) === 'lcos-member');
  if (source.includes(marker)) {
    if (registered.length !== 1 || registered[0].value?.name !== 'LCOSNativeMemberNode') throw new Error('Original member node registry is partial.');
    return source;
  }
  if (registered.length) throw new Error('Original member node already has an unowned registration.');
  const output = `import{LCOSNativeMemberNode}from"./${course}";\n${source.slice(0, registry.end - 1)},"lcos-member":LCOSNativeMemberNode${source.slice(registry.end - 1)}\n${marker}\n`;
  parseOriginalDonorScript(output, filename); return output;
}
