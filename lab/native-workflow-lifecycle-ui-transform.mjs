import {parseOriginalDonorScript} from './agent-node-transform.mjs';
const marker='/* native-workflow-lifecycle-ui */';
function walk(n,fn){if(!n?.type)return;fn(n);for(const[k,v]of Object.entries(n)){if(['loc','tokens','comments'].includes(k))continue;if(Array.isArray(v))v.forEach(x=>walk(x,fn));else if(v?.type)walk(v,fn)}}
const prop=(n,key)=>n?.properties?.find(p=>(p.key?.name??p.key?.value)===key);
function one(root,test,label){const matches=[];walk(root,n=>{if(test(n))matches.push(n)});if(matches.length!==1)throw new Error('Original method lifecycle '+label+': '+matches.length);return matches[0]}
export function transformNativeWorkflowLifecycleUiScript(filename,source){
 if(filename.split(/[\\/]/).pop()!=='page-Da_DfwiK.js'||source.includes(marker))return source;
 const ast=parseOriginalDonorScript(source,filename),edits=[],text=n=>source.slice(n.start,n.end),replace=(n,value)=>edits.push({start:n.start,end:n.end,text:value});
 const append=(n,value)=>edits.push({start:n.end-1,end:n.end-1,text:','+value}),owner=name=>one(ast,n=>n.type==='VariableDeclarator'&&n.id?.name===name,name);
 const jsx=(root,name)=>one(root,n=>n.type==='CallExpression'&&n.arguments?.[0]?.name===name,name);
 const gallery=owner('gp'),data=one(gallery,n=>n.type==='VariableDeclarator'&&n.init?.callee?.name==='methodDataSource','data');append(data.id,'handleRestore:restoreMethod,itemHeight:methodItemHeight,gridRef:methodGridRef');
 const search=one(gallery,n=>n.type==='ObjectExpression'&&prop(n,'className')?.value?.value==='relative w-3/5 ml-auto flex items-center','search row');append(search,'"data-native-method-search":localMethods||undefined');
 const placeholder=one(gallery,n=>n.type==='CallExpression'&&n.arguments?.[0]?.value==='templateGallery.searchPlaceholder','search placeholder');replace(placeholder,`localMethods?"搜索项目方法…":${text(placeholder)}`);
 replace(prop(jsx(gallery,'iD').arguments[1],'itemHeight').value,'localMethods?methodItemHeight:170');
 const grid=one(gallery,n=>n.type==='ObjectExpression'&&prop(n,'aria-hidden'),'original grid');append(grid,'ref:localMethods?methodGridRef:undefined,"data-native-workflow-list":localMethods||undefined');
 const use=one(gallery,n=>n.type==='VariableDeclarator'&&n.id?.name==='J','use');edits.push({start:use.init.body.start+1,end:use.init.body.start+1,text:'if(Z?.lcos_method?.archivedAt){await restoreMethod(Z);return;}'});
 const detail=owner('sD');
 edits.push({start:detail.init.body.start+1,end:detail.init.body.start+1,text:'const methodActionNotice=l.useRef(null);l.useEffect(()=>()=>{if(methodActionNotice.current!==null)se.dismiss(methodActionNotice.current)},[]);'});
 const edit=one(detail,n=>n.type==='LogicalExpression'&&n.operator==='&&'&&n.left?.type==='LogicalExpression'&&n.left.operator==='||'&&n.left.left?.name==='o','edit');replace(edit.left,'(o||!!e.lcos_method&&!e.lcos_method.archivedAt)');
 const button=jsx(detail,'st').arguments[1];replace(prop(button,'disabled').value,'p||!!e.lcos_method&&!e.lcos_method.archivedAt&&e.lcos_method.draft.status!=="ready"');
 const label=one(detail,n=>n.type==='StringLiteral'&&n.value==='加入当前输入','apply label');replace(label,'(e.lcos_method.archivedAt?"恢复方法":"加入当前输入")');
 const apply=prop(button,'onClick').value,catcher=one(apply,n=>n.type==='CatchClause','restore error');replace(catcher,'catch(error){if(e.lcos_method)methodActionNotice.current=se.error(error instanceof Error?error.message:"方法状态未确认，请重新读取。");else se.error(d("templateGallery.getTemplateFailed"))}');
 const applyTry=one(apply,n=>n.type==='TryStatement','restore try');edits.push({start:applyTry.block.end-1,end:applyTry.block.end-1,text:';if(methodActionNotice.current!==null){se.dismiss(methodActionNotice.current);methodActionNotice.current=null}'});
 const list=owner('iD');append(jsx(list,'nD').arguments[1],'columnCount:u');
 const card=owner('nD');append(card.init.params[0],'columnCount:methodColumns=6');
 edits.push({start:card.init.body.start+1,end:card.init.body.start+1,text:'const methodRemovalNotice=l.useRef(null);l.useEffect(()=>()=>{if(methodRemovalNotice.current!==null)se.dismiss(methodRemovalNotice.current)},[]);'});
 const root=one(card,n=>n.type==='ReturnStatement','card return').argument.arguments[1];append(root,'"data-native-method-id":e.lcos_method?e.id:undefined');
 const style=prop(root,'style').value;let columns=0;walk(style,n=>{if(n.type==='BinaryExpression'&&n.operator==='/'&&n.right.value===6){replace(n.right,'methodColumns');columns++}});if(columns!==2)throw new Error('Original card column math changed');
 const image=jsx(card,'fc').arguments[1],src=prop(image,'src').value;replace(src,`e.lcos_method?(e.src||e.preview_image):(${text(src)})`);
 const imageClass=prop(image,'className').value;replace(imageClass,`e.lcos_method?"w-full h-full object-contain":(${text(imageClass)})`);
 const hover=one(card,n=>n.type==='ObjectExpression'&&prop(n,'className')?.value?.type==='CallExpression'&&prop(n,'className').value.arguments?.[0]?.value?.includes('bg-black/60'),'hover overlay');append(hover,'"data-native-method-overlay":e.lcos_method?true:undefined');
 const trigger=one(card,n=>n.type==='LogicalExpression'&&n.operator==='&&'&&n.left?.type==='LogicalExpression'&&n.left.left?.name==='s'&&n.left.right?.operator==='!','remove visibility');replace(trigger.left,'(s||!!e.lcos_method&&!e.lcos_method.archivedAt)&&!u');
 const triggerProps=trigger.right.arguments[1];append(triggerProps,'role:"button",tabIndex:0,"aria-label":e.lcos_method?"移除方法 "+(e.title||e.name):undefined,onKeyDown:event=>{if(event.key==="Enter"||event.key===" "){event.stopPropagation();event.preventDefault();f(true)}}');
 const confirmation=one(card,n=>n.type==='LogicalExpression'&&n.operator==='&&'&&n.left?.name==='u','remove confirmation').right.arguments[1];
 append(confirmation,'"data-native-method-removal":e.lcos_method?true:undefined');
 const children=prop(confirmation,'children').value;edits.push({start:children.start+1,end:children.start+1,text:'e.lcos_method&&r.jsx("p",{className:"native-method-removal-copy",children:"移到已移除；材料、现场和历史引用保留。"}),' });
 const removeLabel=one(card,n=>n.type==='CallExpression'&&n.arguments?.[0]?.value==='common.delete','remove label');replace(removeLabel,`e.lcos_method?(m?"处理中…":"移除"):${text(removeLabel)}`);
 const deleteCallback=one(card,n=>n.type==='VariableDeclarator'&&n.id?.name==='p','remove callback').init.arguments[0];
 replace(deleteCallback,`async y=>{if(!e.lcos_method)return (${text(deleteCallback)})(y);y.stopPropagation();if(m||!e.id||!o)return;if(methodRemovalNotice.current!==null){se.dismiss(methodRemovalNotice.current);methodRemovalNotice.current=null}g(true);try{if(await o(e.id)!==false)f(false)}catch(error){methodRemovalNotice.current=se.error(error instanceof Error?error.message:"方法状态未确认，请重新读取。")}finally{g(false)}}`);
 const confirmProps=one(confirmation,n=>n.type==='ObjectExpression'&&prop(n,'onClick')?.value?.name==='p','confirm button');append(confirmProps,'role:"button",tabIndex:0,"aria-label":e.lcos_method?"确认移除方法":undefined,"aria-disabled":m,onKeyDown:event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();p(event)}}');
 const cancelProps=one(confirmation,n=>n.type==='ObjectExpression'&&prop(n,'onClick')?.value?.type==='ArrowFunctionExpression','cancel button');append(cancelProps,'role:"button",tabIndex:0,"aria-label":e.lcos_method?"取消移除方法":undefined,onKeyDown:event=>{if(event.key==="Enter"||event.key===" "){event.stopPropagation();event.preventDefault();if(!m)f(false)}}');
 const cancelFn=prop(cancelProps,'onClick').value;edits.push({start:cancelFn.body.start+1,end:cancelFn.body.start+1,text:'if(e.lcos_method&&m)return;'});
 const useLabel=one(card,n=>n.type==='CallExpression'&&n.arguments?.[0]?.value==='workflow.use','card use');replace(useLabel,`e.lcos_method?.archivedAt?"恢复":${text(useLabel)}`);
 for(const edit of edits.sort((a,b)=>b.start-a.start))source=source.slice(0,edit.start)+edit.text+source.slice(edit.end);
 source+='\n'+marker;parseOriginalDonorScript(source,filename);return source;
}
