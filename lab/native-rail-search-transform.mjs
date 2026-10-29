import { parseOriginalDonorScript } from './agent-node-transform.mjs';
const marker = '/* lcos-native-rail-search */';
const names = ['LCOSNativeSearchDocuments','LCOSNativeSearchFilter','LCOSNativeSearchFilters','LCOSNativeSearchSummary','LCOSNativeSearchLocateVisible'];
function walk(node, visit) { if (!node?.type) return; visit(node); for (const [key,value] of Object.entries(node)) {
  if (['loc','tokens','comments'].includes(key)) continue; if (Array.isArray(value)) value.forEach(child => walk(child,visit)); else if (value?.type) walk(value,visit);
} }
function one(root, test, label) { const matches=[];walk(root,node=>{if(test(node))matches.push(node)});if(matches.length!==1)throw new Error('Original Rail '+label+' changed: '+matches.length);return matches[0]; }
const prop = (object,name) => object?.properties?.find(item=>(item.key?.name??item.key?.value)===name);
export function transformNativeRailSearchScript(filename,source) {
  if(filename.split(/[\\/]/).pop()!=='page-Da_DfwiK.js'||source.includes(marker))return source;
  const program=parseOriginalDonorScript(source,filename),edits=[],text=node=>source.slice(node.start,node.end);
  const replace=(node,value)=>edits.push({start:node.start,end:node.end,text:value});
  const search=one(program,node=>node.type==='VariableDeclarator'&&node.id?.name==='dH','search dialog');
  const build=one(search,node=>node.type==='CallExpression'&&node.callee?.name==='DV','document builder');
  replace(build,`LCOSNativeSearchDocuments(${text(build.arguments[0])},DV)`);
  const filter=one(search,node=>node.type==='CallExpression'&&node.callee?.name==='tH','filter');
  replace(filter,`LCOSNativeSearchFilter(${filter.arguments.map(text).join(',')},eH)`);
  const chips=one(search,node=>node.type==='MemberExpression'&&node.object?.name==='ZV'&&node.property?.name==='map','filter chips');
  replace(chips.object,'LCOSNativeSearchFilters(ZV,v,eH,{conversation:()=>r.jsx(gI,{size:14}),collection:()=>r.jsx(fp,{size:14}),task:()=>r.jsx(wv,{size:14}),file:()=>r.jsx(Va,{size:14})})');
  const subtitle=one(search,node=>node.type==='LogicalExpression'&&node.operator==='||'&&node.left?.type==='CallExpression'&&node.left.callee?.name==='$V','result summary');
  replace(subtitle,'LCOSNativeSearchSummary(D,p)');
  const description=one(search,node=>node.type==='CallExpression'&&node.arguments?.[0]?.value==='nodeSearch.description','description');
  replace(description,'"按名称、正文或内容类型查找当前画布，回车定位。"');
  const row=one(search,node=>node.type==='CallExpression'&&node.arguments?.[0]?.value==='button'&&prop(node.arguments[1],'onMouseMove'),'result row');
  edits.push({start:row.arguments[1].end-1,end:row.arguments[1].end-1,text:',"data-native-search-node":D.document.node.id'});
  const content=one(search,node=>node.type==='CallExpression'&&node.arguments?.[0]?.name==='cn','dialog content');
  edits.push({start:content.arguments[1].end-1,end:content.arguments[1].end-1,
    text:',onEscapeKeyDown:event=>{if(p||event.isComposing||event.keyCode===229)event.preventDefault()}'});
  const keys=one(search,node=>node.type==='VariableDeclarator'&&node.id?.name==='P','keyboard handler');
  const callback=keys.init.arguments?.[0];if(callback?.body?.type!=='BlockStatement'||callback.params[0]?.name!=='D')throw new Error('Original search keys changed');
  edits.push({start:callback.body.start+1,end:callback.body.start+1,text:'if(D.isComposing||D.nativeEvent?.isComposing||D.keyCode===229)return;'});
  const locate=one(search,node=>node.type==='VariableDeclarator'&&node.id?.name==='T','original camera locate').init.arguments?.[0];
  if(locate?.body?.type!=='BlockStatement'||locate.params[0]?.name!=='D')throw new Error('Original search location callback changed');
  edits.push({start:locate.body.start+1,end:locate.body.start+1,text:'if(LCOSNativeSearchLocateVisible(D))return;'});
  // Keep the original small preview frame, using its own icons for new node kinds.
  const icon=one(program,node=>node.type==='VariableDeclarator'&&node.id?.name==='rH','fallback icon');
  const parameter=icon.init.params[0], nodeName=prop(parameter,'node')?.value?.name;
  if(!nodeName||icon.init.body.type!=='BlockStatement')throw new Error('Original search icon arguments changed');
  edits.push({start:icon.init.body.start+1,end:icon.init.body.start+1,text:`if(${nodeName}.type==="lcos-conversation")return r.jsx(gI,{size:18});if(${nodeName}.type==="lcos-execution")return r.jsx(wv,{size:18});if(${nodeName}.type==="pile")return r.jsx(fp,{size:18});`});
  const rail=one(program,node=>node.type==='VariableDeclarator'&&node.id?.name==='fH','navigation');
  for(const [key,label]of [['ADD_NODE_BTN','添加'],['ASSETS_BTN','资料库'],['WORKFLOW_BTN','工作流模板'],['COMMENT_MODE_BTN','批注'],['HISTORY_BTN','材料历史']]){
    const control=one(rail,node=>node.type==='ObjectExpression'&&prop(node,'data-testid')?.value?.property?.name===key,key);
    if(!prop(control,'aria-label'))edits.push({start:control.end-1,end:control.end-1,text:',"aria-label":'+JSON.stringify(label)});
    if(key==='WORKFLOW_BTN')edits.push({start:control.end-1,end:control.end-1,text:',role:"button",tabIndex:0,onKeyDown:event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();if(!event.repeat)event.currentTarget.click()}}'});
  }
  for(const edit of edits.sort((a,b)=>b.start-a.start))source=source.slice(0,edit.start)+edit.text+source.slice(edit.end);
  source=`import {${names.join(',')}} from "/lcos/agent-ui.js";\n`+source+'\n'+marker;
  parseOriginalDonorScript(source,filename);return source;
}
