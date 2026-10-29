import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { currentGen2Root } from '../lab/current-gen2-resources.mjs';
import { parseOriginalDonorScript } from '../lab/agent-node-transform.mjs';
const argument=name=>process.argv.find(value=>value.startsWith('--'+name+'='))?.slice(name.length+3);
const address=new URL(argument('base-url')??'http://127.0.0.1:56241');
assert.equal(address.protocol,'http:');assert.equal(address.hostname,'127.0.0.1');assert.equal(address.pathname,'/');
const origin=address.origin,projectId='disposable-surface-core-facade',prefix='/api/lcos/core/projects/'+projectId;
const output=path.resolve(import.meta.dirname,'../output/原流程接续_20261021/原库Scope预览投递/'+new Date().toISOString().replace(/[:.]/g,'-'));await fs.mkdir(output,{recursive:true});
const health=await(await fetch(origin+'/health')).json();assert.equal(health.runtimeLabel,'isolated-node-carry-20261020');
if(argument('expected-pid'))assert.equal(health.pid,Number(argument('expected-pid')));
const report={passed:false,origin,pid:health.pid,output,checks:[],mutations:[],pageErrors:[],screenshots:[],readOnlyStoreProbe:true,storeMutation:false,models:0};
const get=async address=>{const response=await fetch(origin+address,{cache:'no-store',redirect:'error'}),body=await response.json();assert.ok(response.ok&&(body.ok===true||body.code===0),address);return body.value??body.data;};
const warehouse=await get(prefix+'/warehouse?kinds=context,workflow,collection&limit=100'),saved=warehouse.items.find(i=>i.kind==='context'),method=warehouse.items.find(i=>i.kind==='workflow');assert.ok(saved&&method);
const {chromium}=createRequire(path.join(currentGen2Root,'package.json'))('playwright-core'),browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-networking','--no-first-run']});let page;
try{
 const context=await browser.newContext({viewport:{width:1880,height:1120},locale:'zh-CN',serviceWorkers:'block'});
 await context.route('**/*',async route=>{const request=route.request(),url=new URL(request.url());if(['http:','https:'].includes(url.protocol)&&url.origin!==origin)return route.abort();
  if(request.method()==='POST'&&/\/runs(?:$|\/)|collaboration-send|conversation-continuations|agent\/gateway/.test(url.pathname))return route.abort();
  if(!['GET','HEAD','OPTIONS'].includes(request.method()))report.mutations.push({method:request.method(),path:url.pathname,body:request.postData()});
  if(process.argv.includes('--diagnostic')&&url.pathname==='/assets/page-Da_DfwiK.js'){
   const response=await route.fetch();let source=await response.text();const ast=parseOriginalDonorScript(source,'page-Da_DfwiK.js');
   let row;const visit=(node,fn)=>{if(!node?.type)return;fn(node);for(const value of Object.values(node)){if(Array.isArray(value))value.forEach(child=>visit(child,fn));else if(value?.type)visit(value,fn);}};
   visit(ast,node=>{if(node.type==='VariableDeclarator'&&node.id?.name==='Zp')row=node;});assert.ok(row);const edits=[];
   visit(row,node=>{if(node.type==='CallExpression'&&node.callee?.name==='C'){const call=source.slice(node.start,node.end);edits.push({start:node.start,end:node.end,text:'((window.__SCOPE_PREVIEW_CLOSE_TRACE__??=[]).push({name:e.name,call:'+JSON.stringify(call)+',time:Date.now()}),'+call+')'});}});
   for(const edit of edits.sort((a,b)=>b.start-a.start))source=source.slice(0,edit.start)+edit.text+source.slice(edit.end);
   return route.fulfill({response,body:source});
  }
  if(url.pathname==='/lcos/agent-ui.js'){const response=await route.fetch();let source=await response.text();assert.ok(source.includes('useLcosDropStore ='));
   if(process.argv.includes('--diagnostic')){
   const registration='registerTarget: (target) => liveTargetRegistry.register(target)';assert.equal(source.split(registration).length,2);
   source=source.replace(registration,`registerTarget: (target) => {const trace=window.__SCOPE_PREVIEW_REG_TRACE__??=[];trace.push({kind:'register',id:target.targetId,time:Date.now()});const cleanup=liveTargetRegistry.register(target);return()=>{trace.push({kind:'cleanup',id:target.targetId,time:Date.now()});return cleanup();}}`);
   source=source.replace('liveTargetRegistry.clear();',`(window.__SCOPE_PREVIEW_REG_TRACE__??=[]).push({kind:'clear',stack:new Error().stack,time:Date.now()});liveTargetRegistry.clear();`);
   source=source.replace('unregisterTarget: (targetId) => liveTargetRegistry.unregister(targetId)',`unregisterTarget: (targetId) => { (window.__SCOPE_PREVIEW_REG_TRACE__??=[]).push({kind:'unregister',id:targetId,stack:new Error().stack,time:Date.now()});return liveTargetRegistry.unregister(targetId);}`);
   source=source.replace('function nativeLibraryScopePreviewRegistration(element3, projectId, target, label2, current) {','function nativeLibraryScopePreviewRegistration(element3, projectId, target, label2, current) { (window.__SCOPE_PREVIEW_ELEMENTS__??=[]).push({element:element3,id:target.id});');
   }
   return route.fulfill({response,body:source+`
const __retainTrace=[];const __retainOriginal=LCOSNativeLibraryPreviewRetain;
if(${process.argv.includes('--diagnostic')})LCOSNativeLibraryPreviewRetain=(...args)=>{const value=__retainOriginal(...args),event=args[2],d=useLcosDropStore.getState();__retainTrace.push({reason:args[1],value,event:event?.constructor.name,button:event?.button,pointerType:event?.pointerType,target:event?.target?.outerHTML?.slice(0,400),status:d.state.status,targets:d.targets().map(t=>t.targetId)});return value;};
window.__SCOPE_PREVIEW_DROP_READ__=()=>{const d=useLcosDropStore.getState();return{state:d.state,feedback:d.feedback,resolution:d.resolution,targets:d.targets().map(t=>({targetId:t.targetId,enabled:t.enabled,semantic:t.semantic})),rawTargets:[...liveTargetRegistry.targets.values()].filter(t=>t.targetId.startsWith('native-library')).map(t=>({id:t.targetId,rect:t.readRect(),enabled:t.enabled})),prompt:useLcosShellStore.getState().composerPrompt,retainTrace:__retainTrace,closeTrace:window.__SCOPE_PREVIEW_CLOSE_TRACE__,registrationTrace:window.__SCOPE_PREVIEW_REG_TRACE__,elements:window.__SCOPE_PREVIEW_ELEMENTS__?.map(({element:e,id})=>({id,connected:e.isConnected,hidden:!!e.closest('[inert],[aria-hidden="true"]'),opacity:getComputedStyle(e).opacity,rect:e.getBoundingClientRect().toJSON()}))}};`});}
  return route.continue();});
 await context.routeWebSocket('**/*',socket=>socket.close());page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',error=>report.pageErrors.push(String(error)));
 const read=()=>page.evaluate(()=>window.__SCOPE_PREVIEW_DROP_READ__());
 const shot=async label=>{const file=path.join(output,label+'.png');await page.screenshot({path:file});report.screenshots.push(file);};
 await page.goto(origin+'/canvas/surface-core-main',{waitUntil:'domcontentloaded'});await page.locator('[data-lcos-professional-surface-state="ready"]').waitFor({state:'attached',timeout:60000});await page.getByTestId('common-loading-overlay').waitFor({state:'hidden',timeout:60000});
 const geometry=canvas=>canvas.nodes.map(node=>({id:node.id,position:node.position,parent:node.parent_id??node.parentId??null})).sort((a,b)=>a.id.localeCompare(b.id));
 const beforeCanvas=await get('/api/canvas/v1/canvases/surface-core-main'),beforeGraph=await get(prefix+'/graph'),beforeRuns=await get(prefix+'/runs'),beforePresentations=await get(prefix+'/presentations'),beforePrompt=(await read()).prompt;
 const methodBefore=beforePresentations.find(p=>p.id==='presentation:workflow:'+method.entityRef.id)?.state;assert.ok(methodBefore);
 const library=page.locator('[data-library-view="library"]');
 const targetId=item=>'native-library-scope-preview:'+JSON.stringify([projectId,item.kind,item.entityRef.id]);
 async function open(item,query=item.title){if(!await library.isVisible())await page.getByTestId('canvas-dockbar-assets-btn').click();await library.waitFor();const search=library.getByRole('textbox',{name:'搜索',exact:true});
  // Focusing the original search intentionally closes a Popover. Do not
  // mistake its still-visible exit animation for the next opened receiver.
  if(await search.inputValue()!==query){const previous=page.locator('[data-native-library-scope-drop-target]');const hadPreview=await previous.count()>0;await search.fill(query);if(hadPreview)await previous.waitFor({state:'hidden'});}
  const button=library.getByRole('button',{name:item.title,exact:true});await button.waitFor();const receiver=page.locator('[data-native-library-scope-drop-target="'+item.entityRef.id+'"]');if(!await receiver.isVisible())await button.click();await receiver.waitFor();await page.waitForFunction(id=>window.__SCOPE_PREVIEW_DROP_READ__().targets.some(t=>t.targetId===id&&t.enabled),targetId(item));return receiver;}
 async function nodePoint(id){const box=await page.locator('.react-flow__node[data-id="'+id+'"]').boundingBox();assert.ok(box);for(const fx of [.15,.3,.45,.6,.75])for(const fy of [.2,.4,.6,.8]){const point={x:box.x+box.width*fx,y:box.y+box.height*fy};if(await page.evaluate(({point,id})=>document.elementFromPoint(point.x,point.y)?.closest('.react-flow__node')?.getAttribute('data-id')===id,{point,id}))return point;}throw Error('Actual source node is not exposed: '+id);}
 async function dragTo(item,source,button,label,cancel=false){const receiver=page.locator('[data-native-library-scope-drop-target="'+item.entityRef.id+'"]'),box=await receiver.boundingBox();assert.ok(box);let to={x:box.x+box.width*.5,y:box.y+box.height*.5};const previous=(await read()).feedback?.receipt.transactionId,mutationAt=report.mutations.length;
  assert.equal(await page.evaluate(p=>!!document.elementFromPoint(p.x,p.y)?.closest('[data-native-library-scope-drop-target]'),to),true,'Preview DOM exposed');
  await page.mouse.move(source.x,source.y);await page.mouse.down({button});report[label+'AfterDown']={receiverVisible:await receiver.isVisible(),state:await read()};await page.mouse.move(source.x+18,source.y+8,{steps:4});await page.mouse.move(to.x,to.y,{steps:20});await page.waitForTimeout(750);
  // The original search can add its last result/shift the Popover anchor.
  // Follow the receiver actually on screen rather than a stale start rect.
  const liveBox=await receiver.boundingBox();assert.ok(liveBox,'Original receiver survives the source gesture');to={x:liveBox.x+liveBox.width*.5,y:liveBox.y+liveBox.height*.5};await page.mouse.move(to.x,to.y,{steps:8});await page.mouse.move(to.x+1,to.y+1,{steps:2});await page.waitForTimeout(100);
  const hover=await read();report[label+'Hover']=hover;report[label+'Dom']=await receiver.evaluateAll(elements=>elements.map(element=>{const parents=[];for(let parent=element;parent;parent=parent.parentElement){const s=getComputedStyle(parent);parents.push({tag:parent.tagName,class:parent.className,hidden:parent.getAttribute('aria-hidden'),inert:parent.hasAttribute('inert'),state:parent.getAttribute('data-state'),display:s.display,visibility:s.visibility,opacity:s.opacity});}return{rect:element.getBoundingClientRect().toJSON(),parents};}));await shot(label+'-hover');assert.equal(hover.state.status,'preview',JSON.stringify(hover));assert.equal(hover.resolution.status,'ready');assert.equal(hover.resolution.intent.kind,'assembly-apply');assert.equal(hover.resolution.intent.targetId,targetId(item));assert.deepEqual(hover.resolution.intent.targetRef,{kind:item.kind,id:item.entityRef.id});
  if(cancel){await page.keyboard.press('Escape');await page.mouse.up({button});await page.waitForTimeout(250);assert.equal(report.mutations.slice(mutationAt).filter(r=>r.path.endsWith('/assembly/apply')).length,0);return;}
  await page.mouse.up({button});await page.waitForFunction(previous=>{const f=window.__SCOPE_PREVIEW_DROP_READ__().feedback;return f&&f.receipt.transactionId!==previous;},previous,{timeout:45000});const result=await read();report[label+'Result']=result;assert.equal(result.feedback.receipt.status,'success',JSON.stringify(result.feedback));
  await page.waitForFunction(id=>window.__SCOPE_PREVIEW_DROP_READ__().targets.some(t=>t.targetId===id&&t.enabled),targetId(item));await shot(label+'-success');return{result,writes:report.mutations.slice(mutationAt).filter(r=>r.path.endsWith('/assembly/apply'))};
 }
 await open(saved);await shot('01-context-preview');if(!process.argv.includes('--skip-cancel')){await dragTo(saved,await nodePoint('surface-main-image'),'right','02-image-cancel',true);report.checks.push('Esc during actual node carry does not submit Preview membership');await page.waitForTimeout(800);}
 await open(saved);await dragTo(saved,await nodePoint('surface-main-image'),'right','03-image-to-context');
 const image=beforeCanvas.nodes.find(n=>n.id==='surface-main-image'),contextState=(await get(prefix+'/presentations')).find(p=>p.id==='presentation:context:'+saved.entityRef.id);assert.ok(contextState.state.memberViewIds.includes(image.data.lcos_ref.artifactViewId));
 const title=beforeGraph.artifacts.find(a=>a.id===image.data.lcos_ref.artifactId).title;await page.locator('[data-native-library-context-preview]').getByText(title,{exact:true}).waitFor();report.checks.push('Original image right-carry enters exact Context Presentation and same preview refreshes after settled feedback');
 const repeat=await dragTo(saved,await nodePoint('surface-main-image'),'right','04-image-repeat');assert.equal(repeat.writes.length,0);report.checks.push('Repeated preview drop is GET-only with zero Assembly POST');
 await open(method);await page.keyboard.down('Alt');try{await dragTo(method,await nodePoint('surface-main-text'),'left','05-text-to-workflow');}finally{await page.keyboard.up('Alt');}
 const text=beforeCanvas.nodes.find(n=>n.id==='surface-main-text'),workflowState=(await get(prefix+'/presentations')).find(p=>p.id==='presentation:workflow:'+method.entityRef.id).state;assert.ok(workflowState.memberViewIds.includes(text.data.lcos_ref.artifactViewId));assert.deepEqual(workflowState.workflowActions,methodBefore.workflowActions);assert.deepEqual(workflowState.workflowActionEdges,methodBefore.workflowActionEdges);assert.deepEqual(workflowState.workflowOperators,methodBefore.workflowOperators);assert.deepEqual(workflowState.positions,methodBefore.positions);report.checks.push('Original text Alt-carry joins Workflow references; existing method and positions remain exact');
 const common=[...saved.title].map((_,i)=>saved.title.slice(0,i+1)).filter(prefix=>method.title.startsWith(prefix)).at(-1)?.trim();assert.ok(common,'Synthetic Context/Workflow titles share a searchable prefix');
 await open(saved,common);const sourceRow=library.getByRole('button',{name:method.title,exact:true}).locator('xpath=ancestor::div[@draggable="true"][1]');assert.equal(await sourceRow.count(),1);const sourceBox=await sourceRow.boundingBox();assert.ok(sourceBox);await dragTo(saved,{x:sourceBox.x+Math.min(90,sourceBox.width/2),y:sourceBox.y+sourceBox.height/2},'left','06-workflow-whole-to-context');
 const members=(await get(prefix+'/presentations')).find(p=>p.id==='presentation:context:'+saved.entityRef.id).state.memberEntityRefs;assert.ok(members.some(ref=>ref.type==='scope'&&ref.id===method.entityRef.id));report.checks.push('Original Library Workflow row enters Context preview as one whole Scope reference');
 await page.keyboard.press('Escape');await page.locator('[data-native-library-scope-drop-target]').waitFor({state:'hidden'});assert.ok(!(await read()).targets.some(t=>t.targetId.startsWith('native-library-scope-preview:')));report.checks.push('Closing original Popover removes receiver registration');
 assert.deepEqual(geometry(await get('/api/canvas/v1/canvases/surface-core-main')),geometry(beforeCanvas));const afterGraph=await get(prefix+'/graph');for(const key of ['artifacts','artifactViews','artifactRevisions','fileRecords'])assert.deepEqual(afterGraph[key],beforeGraph[key]);assert.deepEqual(await get(prefix+'/runs'),beforeRuns);assert.equal((await read()).prompt,beforePrompt);
 for(const write of report.mutations.filter(r=>r.path.endsWith('/assembly/apply'))){const request=JSON.parse(write.body);assert.equal(request.placementBySource,undefined);assert.ok(['context','workflow'].includes(request.targetRef.kind));}
 assert.deepEqual(report.pageErrors,[]);report.checks.push('Source geometry, material identities, unsent input and Runs unchanged; actual writes have no placement');report.passed=true;
}catch(error){report.error=String(error.stack??error);process.exitCode=1;if(page){await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});report.dom=await page.locator('body').innerText().catch(()=>null);report.state=await page.evaluate(()=>window.__SCOPE_PREVIEW_DROP_READ__?.()).catch(()=>null);}}
finally{await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify({passed:report.passed,checks:report.checks,error:report.error,output},null,2));}
