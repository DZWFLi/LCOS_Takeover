import { parseOriginalDonorScript } from './agent-node-transform.mjs';
const marker='/* lcos-native-workflow-editor */';
function walk(n,v){if(!n?.type)return;v(n);for(const[k,x]of Object.entries(n)){if(['loc','tokens','comments'].includes(k))continue;if(Array.isArray(x))x.forEach(y=>walk(y,v));else if(x?.type)walk(x,v)}}
const prop=(n,name)=>n?.properties?.find(p=>(p.key?.name??p.key?.value)===name);
function one(root,test,label){const found=[];walk(root,n=>{if(test(n))found.push(n)});if(found.length!==1)throw new Error('Original workflow editor '+label+': '+found.length);return found[0]}
export function transformNativeWorkflowEditorScript(filename,source){
 const file=filename.split(/[\\/]/).pop();if(!['page-Da_DfwiK.js','course-api-base-url-CifxI1ia.js'].includes(file)||source.includes(marker))return source;
 const ast=parseOriginalDonorScript(source,file),edits=[],text=n=>source.slice(n.start,n.end),replace=(n,value)=>edits.push({start:n.start,end:n.end,text:value});
 const append=(n,value)=>edits.push({start:n.end-1,end:n.end-1,text:','+value});
 const owner=name=>one(ast,n=>n.type==='VariableDeclarator'&&n.id?.name===name,name);
 const jsx=(root,name)=>one(root,n=>n.type==='CallExpression'&&n.arguments?.[0]?.name===name,name);
 if(file==='page-Da_DfwiK.js'){
  const gallery=owner('gp'),data=one(gallery,n=>n.type==='VariableDeclarator'&&n.init?.callee?.name==='methodDataSource','gallery data');
  append(data.id,'handleCreate:createMethod,isSaving:methodSaving');
  replace(prop(jsx(gallery,'ln').arguments[1],'onOpenChange').value,'value=>{if(!value&&(!localMethods||!methodSaving&&!methodReading))t()}');
  const create=one(gallery,n=>n.type==='ObjectExpression'&&prop(n,'title')?.value?.value==='方法创建尚未接入；已有方法可查看和取用','create button');
  replace(prop(create,'disabled').value,'false');replace(prop(create,'title').value,'"创建项目方法"');append(create,'onClick:()=>Promise.resolve(createMethod()).catch(()=>se.error("新方法暂时打不开，请重试。"))');
  const editCall=jsx(gallery,'QP');append(editCall.arguments[1],'key:k.id');
  const host=one(gallery,n=>n.type==='CallExpression'&&n.arguments?.[0]?.value==='div'&&prop(n.arguments[1],'children')?.value===editCall,'editor host');
  append(host.arguments[1],'"data-native-workflow-editor":localMethods||undefined');
  const list=one(gallery,n=>n.type==='ObjectExpression'&&prop(n,'aria-hidden'),'background list');
  replace(prop(list,'aria-hidden').value,'localMethods&&!!(x||k)');replace(prop(list,'style').value,'localMethods&&(x||k)?{pointerEvents:"none",visibility:"hidden"}:undefined');
  const detail=owner('sD'),edit=one(detail,n=>n.type==='LogicalExpression'&&n.operator==='&&'&&n.left?.name==='o'&&n.right?.callee?.property?.name==='jsxs','edit affordance');
  replace(edit.left,'(o||!!e.lcos_method)');
  const button=one(detail,n=>n.type==='ObjectExpression'&&prop(n,'onClick')&&text(prop(n,'onClick').value).includes('a?.(e)'),'edit action');
  append(button,'role:"button",tabIndex:0,"aria-label":"编辑方法",onKeyDown:event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();a?.(e)}}');
 }else{
  const form=owner('a1e');
  edits.push({start:form.init.body.start+1,end:form.init.body.start+1,text:'const methodForm=LCOSUseNativeWorkflowEditForm(e.raw),methodSaveNotice=d.useRef(null);d.useEffect(()=>()=>{if(methodSaveNotice.current!==null)_e.dismiss(methodSaveNotice.current)},[]);'});
  const effect=one(form,n=>n.type==='CallExpression'&&n.callee?.property?.name==='useEffect','upload effect').arguments[0];
  edits.push({start:effect.body.start+1,end:effect.body.start+1,text:'if(e.raw.lcos_method)return;'});
  const save=one(form,n=>n.type==='CallExpression'&&n.callee?.name==='n','save');
  append(save.arguments[0],'...(e.raw.lcos_method?{lcos_method_edit:methodForm.values}:{})');
  const saveTry=one(form,n=>n.type==='TryStatement'&&n.finalizer&&text(n).includes('lcos_method_edit')===false&&text(n).includes('await n('),'save try');
  // Insert a local-method error handler before the original spinner finally.
  edits.push({start:saveTry.block.end-1,end:saveTry.block.end-1,text:';if(e.raw.lcos_method&&methodSaveNotice.current!==null){_e.dismiss(methodSaveNotice.current);methodSaveNotice.current=null}'});
  edits.push({start:saveTry.block.end,end:saveTry.block.end,text:'catch(error){if(e.raw.lcos_method)methodSaveNotice.current=_e.error(error instanceof Error?error.message:"方法未保存，输入保留。");else throw error}'});
  const media=one(form,n=>n.type==='CallExpression'&&n.arguments?.[0]?.value==='div'&&prop(n.arguments[1],'onClick')?.value?.name==='N','cover');
  replace(media,`e.raw.lcos_method?a.jsx("div",{className:"native-method-editor-summary",children:"编排步骤与关联材料，确认后一起保存。"}):(${text(media)})`);
  const tags=jsx(form,'i1e');replace(tags,`e.raw.lcos_method?null:${text(tags)}`);
  const tagLabel=one(form,n=>n.type==='CallExpression'&&n.arguments?.[0]?.name==='zi'&&text(n).includes('assets.tags'),'tags label');replace(tagLabel,`e.raw.lcos_method?null:${text(tagLabel)}`);
  const description=one(form,n=>n.type==='CallExpression'&&n.arguments?.[0]?.value==='div'&&prop(n.arguments[1],'className')?.value?.value==='flex flex-col gap-2'&&text(n).includes('assets.remarks'),'description');
  replace(description,`e.raw.lcos_method?a.jsx(LCOSNativeWorkflowEditFields,{form:methodForm,template:e.raw,disabled:x,parts:{Input:ri,TextArea:Ng,Label:zi,Button:Ut,Checkbox:LCOSMethodCheckbox,Select:LCOSMethodSelect,SelectTrigger:LCOSMethodSelectTrigger,SelectValue:LCOSMethodSelectValue,SelectContent:LCOSMethodSelectContent,SelectItem:LCOSMethodSelectItem}}):(${text(description)})`);
  const name=one(form,n=>n.type==='ObjectExpression'&&prop(n,'value')?.value?.name==='l'&&prop(n,'onChange'),'name input');append(name,'"aria-label":e.raw.lcos_method?"方法名称":undefined,disabled:!!e.raw.lcos_method&&x');
  const cancel=one(form,n=>n.type==='ObjectExpression'&&prop(n,'onClick')?.value?.name==='t'&&prop(n,'variant')?.value?.value==='secondary','cancel');append(cancel,'disabled:!!e.raw.lcos_method&&x');
 }
 for(const edit of edits.sort((a,b)=>b.start-a.start))source=source.slice(0,edit.start)+edit.text+source.slice(edit.end);
 if(file==='course-api-base-url-CifxI1ia.js')source='import {LCOSUseNativeWorkflowEditForm,LCOSNativeWorkflowEditFields} from "/lcos/agent-ui.js";\nimport {aP as LCOSMethodCheckbox,bG as LCOSMethodSelect,bN as LCOSMethodSelectTrigger,bO as LCOSMethodSelectValue,bH as LCOSMethodSelectContent,bI as LCOSMethodSelectItem} from "./index-BAQXnPag.js";\n'+source;
 source+='\n'+marker;parseOriginalDonorScript(source,file);return source;
}
