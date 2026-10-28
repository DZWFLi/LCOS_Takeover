import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildPilotEntry} from '../lab/pilot/build-pilot.mjs';
import {transformNativePileCollectionScript} from '../lab/native-pile-collection-transform.mjs';
import {transformNativeFrameTitleScript} from '../lab/native-frame-title-transform.mjs';
import {parseOriginalDonorScript} from '../lab/agent-node-transform.mjs';
const dir=await fs.mkdtemp(path.resolve('.runtime/native-frame-title-editor-'));
const output=path.resolve('output/普通Frame标题编辑_20261028/原输入专项',new Date().toISOString().replaceAll(':','-'));
await fs.mkdir(output,{recursive:true});
const report={passed:false,cases:[],models:0,liveWrites:0,scope:'Actual original kie/input transform + actual leaf controller/hook. Controlled Canvas API and React slots, no running service or browser.'};
const oldWindow=globalThis.window;
const clone=value=>structuredClone(value), tick=()=>new Promise(resolve=>setImmediate(resolve));
const defer=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve:value=>resolve(value)}};
function walk(root,test){const out=[],pending=[root];while(pending.length){const n=pending.pop();if(!n?.type)continue;if(test(n))out.push(n);for(const v of Object.values(n)){if(Array.isArray(v))pending.push(...v);else if(v?.type)pending.push(v);}}return out;}
const one=(a,label)=>{assert.equal(a.length,1,label);return a[0]};
try{
 const sourceFile=path.resolve('lab/pilot/native-frame-title.ts');let source=await fs.readFile(sourceFile,'utf8');
 source=source.replace("from 'react';","from './hooks';").replace("from './native-canvas-gui-markers';", "from "+JSON.stringify(path.resolve('lab/pilot/native-canvas-gui-markers.ts').replaceAll('\\','/'))+";");
 await fs.writeFile(path.join(dir,'hooks.ts'),['useEffect','useMemo','useState'].map(n=>'export const '+n+'=(...args:any[])=>globalThis.__FRAME_TITLE_HOOKS__.'+n+'(...args);').join('\n'));
 await fs.writeFile(path.join(dir,'leaf.ts'),source);
 await buildPilotEntry(path.relative(process.cwd(),path.join(dir,'leaf.ts')),path.join(dir,'leaf.mjs'),'node');
 const {createNativeFrameTitleEditor,LCOSUseNativeFrameTitleEditor,nativeOrdinaryFrameTitleNode}=await import(pathToFileURL(path.join(dir,'leaf.mjs')));
 function fixture(){
  const node={id:'frame',type:'group',parentId:'outer',position:{x:100,y:120},measured:{width:400,height:250},data:{id:'frame',label:'原标题',title:'原标题',lcos_ordinary_frame_title:true,lcos_gui_navigation_pin:false}},parent={id:'outer',type:'group',data:{id:'outer'}};
  const values=[parent,node],calls=[],updates=[];let submit=async input=>{node.data={...node.data,title:input.title,label:input.title};return {ok:true}};
  const api={getNodes:()=>values,getNode:id=>values.find(n=>n.id===id),getPointerInteraction:()=>({interactivityLocked:false}),commitFrameTitle:async(input,options)=>{calls.push(clone(input));assert.equal(options.isCurrent(),true);return submit(input,options)}};
  globalThis.window={__LCOS_NODE_LAB__:{projectId:'p',canvasId:'c',api}};
  const owner={projectId:'p',canvasId:'c',api,nodeId:node.id,parentId:node.parentId};
  const controller=createNativeFrameTitleEditor(owner,node.data.title,state=>updates.push(state));controller.sync(node.data.title);
  return {node,parent,values,api,owner,calls,updates,controller,setSubmit:value=>submit=value};
 }
 {
  const f=fixture(),before=clone(f.node);f.controller.change('新框名');assert.equal(f.calls.length,0,'typing has zero persistence');
  await f.controller.save();assert.deepEqual(f.calls,[{nodeId:'frame',title:'新框名',expectedTitle:'原标题',expectedLabel:'原标题'}]);
  assert.equal(f.controller.getState().dirty,false);assert.equal(f.controller.getState().notice,'已保存');
  assert.deepEqual(f.node.position,before.position);assert.deepEqual(f.node.measured,before.measured);assert.equal(f.node.parentId,before.parentId);
  f.controller.change('取消的稿');f.controller.cancel();assert.equal(f.controller.getState().value,'新框名');assert.equal(f.calls.length,1);
  report.cases.push('Typing and Escape cancellation do not write. Explicit save uses the exact editing-start title/raw label and original API once; parent/geometry remain intact.');
 }
 {
  const f=fixture();f.node.data.label=null;f.node.data.title='未命名框';f.controller.sync('未命名框');f.controller.change('我的稿');
  f.node.data.label='Agent 新名';f.node.data.title='Agent 新名';f.controller.sync('Agent 新名');
  assert.equal(f.controller.getState().value,'我的稿');assert.match(f.controller.getState().notice,/别处更新/);
  f.setSubmit(async()=>({ok:false,reason:'名称已更新，草稿已保留。'}));await f.controller.save();
  assert.equal(f.calls[0].expectedTitle,'未命名框');assert.equal(f.calls[0].expectedLabel,null);assert.equal(f.controller.getState().value,'我的稿');assert.equal(f.controller.getState().dirty,true);
  f.controller.cancel();assert.equal(f.controller.getState().value,'Agent 新名');report.cases.push('Dirty external renames do not consume the draft. Nullable original labels remain exact CAS observations; rejection keeps the draft, Escape then adopts the actual current name.');
 }
 {
  for(const kind of ['api','canvas','project','parent','identity','lock','parent-lock','draggable']){
   const f=fixture();f.controller.change('迟到稿');
   if(kind==='api')window.__LCOS_NODE_LAB__.api={...f.api};if(kind==='canvas')window.__LCOS_NODE_LAB__.canvasId='other';if(kind==='project')window.__LCOS_NODE_LAB__.projectId='other';if(kind==='parent')f.node.parentId='other';if(kind==='identity')f.node.data.lcos_ref=null;if(kind==='lock')f.node.data.locked=true;if(kind==='parent-lock')f.parent.data.locked=true;if(kind==='draggable')f.node.draggable=false;
   const r=await f.controller.save();assert.equal(r.ok,false,kind);assert.equal(f.calls.length,0,kind+' zero save');
  }
  report.cases.push('API/project/Canvas/parent identity changes, reserved refs including null, and own/ancestor locks reject retained late handlers before any save.');
 }
 {
  const f=fixture(),d=defer();f.setSubmit(()=>d.promise);f.controller.change('保存中');const p=f.controller.save();await f.controller.save();assert.equal(f.calls.length,1);
  f.controller.dispose();const count=f.updates.length;d.resolve({ok:true});await p;assert.equal(f.updates.length,count,'unmount completion does not update state');
  f.controller.activate();f.controller.sync(f.node.data.title);assert.equal(f.controller.getState().unknown,true,'unknown prior in-flight input is not silently replayed');
  const g=fixture();g.setSubmit(async()=>({ok:false,unknown:true,reason:'结果尚未确认'}));g.controller.change('结果未知');await g.controller.save();await g.controller.save();assert.equal(g.calls.length,1);assert.equal(g.controller.getState().value,'结果未知');
  report.cases.push('One in-flight save has no duplicate submit. Unmount makes delayed completion inert; unknown outcomes preserve the draft and never retry automatically.');
 }
 {
  const f=fixture();let reads=0,attemptAuthorization;
  f.setSubmit(async(input,options)=>{attemptAuthorization=options.isCurrent;return {ok:false,unknown:true,reason:'原ACK已有、metadata首次回填未确认'}});
  f.controller.change('只读核对成功');await f.controller.save();
  f.api.verifyFrameTitle=async(input,options)=>{assert.equal(attemptAuthorization(),true,'Verify serial must not revoke the original acknowledged operation owner');reads++;assert.deepEqual(input,{nodeId:'frame'});assert.equal(options.isCurrent(),true);f.node.data.title='只读核对成功';f.node.data.label='只读核对成功';return {ok:true}};
  f.controller.change('核对期间保留的新稿');const result=await f.controller.verify();assert.equal(result.ok,true);assert.equal(f.controller.getState().unknown,false);assert.equal(f.controller.getState().dirty,true);assert.equal(f.controller.getState().value,'核对期间保留的新稿');assert.equal(f.calls.length,1);assert.equal(reads,1);
  f.controller.change('   ');await f.controller.save();assert.equal(f.calls.length,1);assert.match(f.controller.getState().notice,/1–500/);
  const g=fixture();g.setSubmit(async()=>({ok:false,unknown:true}));g.controller.change('旧场景核对');await g.controller.save();g.api.verifyFrameTitle=async()=>{throw Error('Stale verify must not read')};window.__LCOS_NODE_LAB__.canvasId='other';assert.equal((await g.controller.verify()).ok,false);
  report.cases.push('The inline unknown-result action only verifies the original operation through the same API: exact confirmed state clears pending without a second save; scene changes prevent even that read. Blank/oversized drafts remain local.');
 }
 function harness(f){
  const slots=[],effects=[];let cursor=0,view,setCount=0;
  const same=(a,b)=>a?.length===b?.length&&a?.every((v,i)=>Object.is(v,b[i]));
  const hooks={useState(initial){const i=cursor++;slots[i]??={value:typeof initial==='function'?initial():initial};return [slots[i].value,next=>{setCount++;slots[i].value=typeof next==='function'?next(slots[i].value):next}]},useMemo(make,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps))slots[i]={value:make(),deps};return slots[i].value},useEffect(run,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps))effects.push(()=>{slots[i]?.cleanup?.();slots[i]={deps,run,cleanup:run()}})}};
  globalThis.__FRAME_TITLE_HOOKS__=hooks;
  return {render(){cursor=0;view=LCOSUseNativeFrameTitleEditor(f.node,f.node.data.title);while(effects.length)effects.shift()();return view},get view(){return view},get setCount(){return setCount},replay(){for(const slot of slots)if(slot?.run){slot.cleanup?.();slot.cleanup=slot.run()}},dispose(){for(const slot of slots)slot?.cleanup?.()}};
 }
 {
  const f=fixture(),h=harness(f);h.render();h.render();h.replay();h.render();
  h.view.onChange({target:{value:'输入法中'}});h.render();let prevented=0;const event={key:'Enter',isComposing:true,preventDefault(){prevented++},stopPropagation(){}};
  h.view.onKeyDown(event);assert.equal(f.calls.length,0);event.key='Escape';event.isComposing=false;h.view.onKeyDown(event);h.render();assert.equal(h.view.value,'原标题');assert.equal(f.calls.length,0);
  h.view.onChange({target:{value:'Enter 名称'}});h.render();event.key='Enter';h.view.onKeyDown(event);await tick();h.render();assert.equal(f.calls.length,1);assert.equal(h.view.value,'Enter 名称');
  h.view.onChange({target:{value:'失焦保存'}});h.render();h.view.onBlur();await tick();h.render();assert.equal(f.calls.length,2);assert.equal(h.view.value,'失焦保存');
  const d=defer();f.setSubmit(()=>d.promise);h.view.onChange({target:{value:'卸载不更新'}});h.render();h.view.onBlur();h.dispose();const count=h.setCount;d.resolve({ok:true});await tick();assert.equal(h.setCount,count);
  report.cases.push('Actual hook: StrictMode setup-cleanup-setup remains usable, IME Enter does not submit, Escape cancels, Enter and blur submit through the same original API, and unmount late results perform zero setState.');
 }
 {
  const file='reference/tapnow-installed/resources/web/assets/course-api-base-url-CifxI1ia.js',original=await fs.readFile(file,'utf8');
  const collection=transformNativePileCollectionScript(file,original),transformed=transformNativeFrameTitleScript(file,collection),p=parseOriginalDonorScript(transformed,file);
  assert.equal(transformNativeFrameTitleScript(file,transformed),transformed);assert.equal(transformNativePileCollectionScript(file,transformed),transformed,'existing Collection transform remains composable/idempotent');
  const originalP=parseOriginalDonorScript(collection,file),oldHl=one(walk(originalP,n=>n.type==='VariableDeclarator'&&n.id?.name==='hl'),'original hl'),newHl=one(walk(p,n=>n.type==='VariableDeclarator'&&n.id?.name==='hl'),'transformed hl');assert.equal(collection.slice(oldHl.start,oldHl.end),transformed.slice(newHl.start,newHl.end),'hl unchanged');
  const editor=one(walk(p,n=>n.type==='VariableDeclarator'&&n.id?.name==='kie'),'kie');
  const make=(frame)=>new Function('LCOSUseNativeFrameTitleEditor','Me','_t','hl','a','d5','u5','c5','Oo','xL','fn','return ('+transformed.slice(editor.init.start,editor.init.end)+');')(()=>frame,()=>({t:x=>x}),()=>({updateNodeData(){throw Error('No eager original update')}}),()=>({internalValue:'原默认标题',handleChange(){}}),{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})},'original-title',{},()=>{}, {},()=>{}, {CANVAS:{NODE:{TITLE:'original-title'}}});
  const frame={value:'我的Frame稿',onChange(){},onBlur(){},onKeyDown(){},readOnly:false,busy:false,notice:'Enter 保存 · Esc 取消'};
  const jsx=make(frame)({title:'原名',nodeId:'frame',lcosNativeFrameNode:{}}),input=one(walkJsx(jsx,n=>n.type==='input'),'same original input');
  assert.equal(input.props.value,frame.value);assert.equal(input.props.onBlur,frame.onBlur);assert.equal(input.props['data-testid'],'original-title');assert.equal(one(walkJsx(jsx,n=>n.props?.role==='status'),'inline status').props.children,frame.notice);
  const ordinary=make(undefined)({title:'原名',nodeId:'other'}),nativeInput=one(walkJsx(ordinary,n=>n.type==='input'),'ordinary input');assert.equal(nativeInput.props.value,'原默认标题');assert.equal(nativeInput.props.readOnly,undefined);assert.equal(walkJsx(ordinary,n=>n.props?.role==='status').length,0);
  report.cases.push('Actual shipped kie executes after the existing full Collection transform: same original input/testid/text measurement, Frame handlers and inline status; ordinary inputs keep original hl route. Original hl bytes and prior Collection transform stay unchanged/idempotent.');
 }
 function walkJsx(root,test){const out=[];function visit(n){if(!n||typeof n!=='object')return;if(test(n))out.push(n);if(Array.isArray(n))for(const c of n)visit(c);else visit(n.props?.children)}visit(root);return out;}
 assert.equal(nativeOrdinaryFrameTitleNode({id:'x',type:'group',data:{id:'x',lcos_ordinary_frame_title:true,lcos_ref:null}}),false);
 report.passed=true;
}catch(error){report.error=String(error?.stack||error);process.exitCode=1;}finally{
 if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;delete globalThis.__FRAME_TITLE_HOOKS__;
 await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
 await fs.rm(dir,{recursive:true,force:true});console.log(JSON.stringify({passed:report.passed,cases:report.cases.length,output,error:report.error}));
}
