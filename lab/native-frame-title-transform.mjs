import { parseOriginalDonorScript } from './agent-node-transform.mjs';
const target='course-api-base-url-CifxI1ia.js', hook='LCOSUseNativeFrameTitleEditor', prop='lcosNativeFrameTitle', local='__lcosFrameTitle';
function all(root,test) {const result=[],pending=[root];while(pending.length){const n=pending.pop();if(!n||typeof n.type!=='string')continue;if(test(n))result.push(n);for(const v of Object.values(n)){if(Array.isArray(v))pending.push(...v);else if(v?.type)pending.push(v);}}return result;}
function one(values,label){if(values.length!==1)throw Error('Original Frame title seam changed: '+label+' ('+values.length+')');return values[0];}
function declaration(p,name){return one(all(p,n=>n.type==='VariableDeclarator'&&n.id?.name===name),'original '+name);}
const property=(node,name)=>one(node.properties.filter(p=>(p.key?.name??p.key?.value)===name),'property '+name);
function edits(source,changes){for(const c of changes.sort((a,b)=>b.start-a.start))source=source.slice(0,c.start)+c.text+source.slice(c.end);return source;}
function assertInstalled(p){
 const editor=declaration(p,'kie'),body=editor.init.body,renderer=declaration(p,'Aie');
 one(all(renderer.init.body,n=>n.type==='CallExpression'&&n.callee?.name===hook),'actual Frame hook in persistent h5 owner');
 for(const name of ['onBlur','onKeyDown','readOnly','data-native-frame-title-input'])one(all(body,n=>n.type==='ObjectProperty'&&(n.key?.name??n.key?.value)===name),'input '+name);
 one(all(renderer.init.body,n=>n.type==='ObjectProperty'&&n.key?.value==='data-native-frame-title-status'),'inline original-title status');
 one(all(p,n=>n.type==='ImportSpecifier'&&n.imported?.name===hook),'Frame hook import');
}
/** Extends the same shipped h5/kie/input. Non-Frame hl and its Collection
 * callback are unchanged. The existing h5 owns the local draft across kie
 * selection/unmount transitions; no new editor, portal or keyboard router. */
export function transformNativeFrameTitleScript(filename,source){
 if(filename.split(/[\\/]/).pop()!==target)return source;
 const p=parseOriginalDonorScript(source,filename);
 if(source.includes(local)){assertInstalled(p);return source;}
 const renderer=declaration(p,'Aie'),editor=declaration(p,'kie');
 const choice=one(all(renderer.init.body,n=>n.type==='ConditionalExpression'&&n.consequent?.callee?.property?.name==='jsx'&&n.consequent.arguments[0]?.name==='kie'),'original h5 editor');
 const props=choice.consequent.arguments[1];
 const input=one(all(editor.init.body,n=>n.type==='CallExpression'&&n.callee?.property?.name==='jsx'&&n.arguments[0]?.value==='input'),'original title input');
 const inputProps=input.arguments[1],value=property(inputProps,'value'),onChange=property(inputProps,'onChange');
 if(value.value.name!=='h'||source.slice(onChange.value.start,onChange.value.end)!=='f=>p(f.target.value)')throw Error('Original Frame title input changed.');
 const measure=one(all(editor.init.body,n=>n.type==='LogicalExpression'&&n.operator==='||'&&n.left?.name==='h'&&n.right?.callee?.name==='c'),'original invisible text measurement');
 const ownerReturn=one(renderer.init.body.body.filter(n=>n.type==='ReturnStatement'),'h5 return');
 const slots=[property(choice.consequent.arguments[1],'endSlot'),property(choice.alternate.arguments[1],'endSlot')];
 if(slots.some(slot=>slot.value.name!=='l'))throw Error('Original h5 end slots changed.');
 const importAnchor=one(p.body.filter(n=>n.type==='ImportDeclaration').slice(0,1),'first import');
 const changes=[
 {start:importAnchor.start,end:importAnchor.start,text:'import{'+hook+'}from"/lcos/agent-ui.js";\n'},
 {start:props.end-1,end:props.end-1,text:','+prop+':'+local},
 {start:ownerReturn.start,end:ownerReturn.start,text:'const '+local+'='+hook+'(c(t),e),__lcosFrameTitleSlot='+local+'?.notice?a.jsxs(a.Fragment,{children:[l,a.jsx("span",{"data-native-frame-title-status":t,role:"status",style:{fontSize:11,lineHeight:1.3,whiteSpace:"normal",maxWidth:260,flex:"0 1 auto"},children:('+local+'.unknown?a.jsxs("span",{children:['+local+'.notice,a.jsx("button",{type:"button",disabled:'+local+'.busy,onPointerDown:e=>e.stopPropagation(),onClick:e=>{e.preventDefault();e.stopPropagation();'+local+'.onVerify()},className:"nodrag nowheel underline ml-1",children:"核对结果"})]}):'+local+'.notice)})]}):l;'},
 ...slots.map(slot=>({start:slot.value.start,end:slot.value.end,text:'__lcosFrameTitleSlot'})),
 {start:editor.init.params[0].end-1,end:editor.init.params[0].end-1,text:','+prop},
 {start:editor.init.body.start+1,end:editor.init.body.start+1,text:'const '+local+'='+prop+';'},
 {start:value.value.start,end:value.value.end,text:local+'?'+local+'.value:h'},
 {start:measure.left.start,end:measure.left.end,text:'('+local+'?'+local+'.value:h)'},
 {start:onChange.value.start,end:onChange.value.end,text:local+'?'+local+'.onChange:'+source.slice(onChange.value.start,onChange.value.end)},
 {start:inputProps.end-1,end:inputProps.end-1,text:',onBlur:'+local+'?.onBlur,onKeyDown:'+local+'?.onKeyDown,readOnly:'+local+'?.readOnly,"aria-busy":'+local+'?.busy,"data-native-frame-title-input":'+local+'?t:void 0'},

 const next=edits(source,changes);assertInstalled(parseOriginalDonorScript(next,filename));return next;
}
