import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {isDeepStrictEqual as same} from 'node:util';
import {currentGen2Root} from '../lab/current-gen2-resources.mjs';

// Run only by the root task after its exact Core restart. All actions below use
// rendered original controls; the appended bundle helper only reads state.
const option=name=>process.argv.find(arg=>arg.startsWith('--'+name+'='))?.slice(name.length+3);
const phase=option('phase')??'enter';assert.ok(['enter','inspect','return'].includes(phase));
assert.ok(process.argv.includes('--execute-real-ui'),'Explicit --execute-real-ui is required.');
const expectedPid=Number(option('expected-pid'));assert.ok(Number.isSafeInteger(expectedPid)&&expectedPid>0,'Exact --expected-pid is required.');
const origin=new URL(option('base-url')??'http://127.0.0.1:56311').origin;
assert.equal(new URL(origin).protocol,'http:');assert.equal(new URL(origin).hostname,'127.0.0.1');
const fixture=JSON.parse(await fs.readFile('output/方法嵌套成员与混合现场_20261025/fixture.json','utf8'));
const prefix='/api/lcos/core/projects/'+fixture.projectId,openRoute='/api/lcos/workflow/'+encodeURIComponent(fixture.scopeId)+'/workspace:open';
const output=path.resolve('output/方法混合成员原画布投影_20261025/实屏',new Date().toISOString().replace(/[:.]/g,'-'));
await fs.mkdir(output,{recursive:true});
const report={passed:false,phase,output,checks:[],writes:[],blockedExternal:[],blockedWebSockets:[],pageErrors:[],httpErrors:[],screenshots:[],modelSends:0,newRuns:0,hiddenSetters:0,fixture:{projectId:fixture.projectId,scopeId:fixture.scopeId,workspaceId:fixture.workspaceId,title:fixture.title}};
const save=()=>fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
const get=async route=>{const response=await fetch(origin+route,{redirect:'error',signal:AbortSignal.timeout(30000)}),body=await response.json();assert.ok(response.ok&&body.ok!==false,route+': '+JSON.stringify(body));return body.value??body.data??body;};
let browser,page,context;
const facts=async()=>({graph:await get(prefix+'/graph'),presentations:await get(prefix+'/presentations'),execution:await get(prefix+'/execution-projection'),messages:await get(prefix+'/conversations/'+fixture.liveSessionId+'/messages?limit=1000'),bindings:await get(prefix+'/spatial/bindings')});
const key=(type,id)=>JSON.stringify([type,id]);
function expectedMembers(graph,presentations){
 const rows=[],seen=new Set();
 const visit=ref=>{assert.ok(ref?.type&&ref.id);const address=key(ref.type,ref.id);if(seen.has(address))return;seen.add(address);rows.push(ref);
  if(ref.type==='collection')for(const row of graph.collectionMemberships.filter(row=>String(row.collectionId)===ref.id))visit(row.memberRef);};
 for(const row of presentations.filter(row=>row.scopeId===fixture.scopeId&&row.capability==='workflow')){
  for(const id of row.state.memberViewIds)if(!(id in(row.state.workflowOperators??{}))||graph.artifactViews.some(view=>String(view.id)===id))visit({type:'view',id});
  for(const ref of row.state.memberEntityRefs??[])visit(ref);
  for(const action of row.state.workflowActions??[])for(const id of action.attachedViewIds)visit({type:'view',id});
  for(const operator of Object.values(row.state.workflowOperators??{}))for(const branch of operator.branches??[])if(branch.targetViewId)visit({type:'view',id:branch.targetViewId});
 }
 return rows;
}
try{
 const health=await get('/health');assert.equal(health.pid,expectedPid);assert.equal(health.realCoreConnected,true);report.pid=health.pid;
 const before=await facts(),expected=expectedMembers(before.graph,before.presentations),originalWorkspace=before.graph.workspaces.find(row=>row.id===fixture.workspaceId);assert.ok(originalWorkspace);
 const candidate=originalWorkspace.canvasId??'worksite-'+Buffer.from(JSON.stringify([fixture.projectId,fixture.workspaceId])).toString('base64url');
 const allowedCanvases=new Set([...before.graph.workspaces.map(row=>row.canvasId).filter(Boolean),candidate]);report.expected=expected;report.canvasId=candidate;
 if(phase!=='enter')assert.ok(originalWorkspace.canvasId,'Use --phase=enter first; inspect/return never create an unopened scene.');
 const initialCanvas=originalWorkspace.canvasId?await get('/api/canvas/v1/canvases/'+candidate):null;
 const {chromium}=createRequire(path.join(currentGen2Root,'package.json'))('playwright-core');
 browser=await chromium.launch({channel:'chrome',headless:!process.argv.includes('--headed'),args:['--disable-background-networking','--disable-sync','--no-first-run']});
 context=await browser.newContext({viewport:{width:1500,height:1000},locale:'zh-CN',serviceWorkers:'block'});
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin!==origin){report.blockedExternal.push({protocol:url.protocol,host:url.host});return route.abort();}
  if(!['GET','HEAD','OPTIONS'].includes(request.method())){
   let body;try{body=request.postDataJSON()}catch{}
   const write={method:request.method(),path:url.pathname,permitted:false};report.writes.push(write);
   if(request.method()==='POST'&&url.pathname==='/api/events')write.permitted=true;
   else if(request.method()==='POST'&&url.pathname===openRoute&&same(body,{workspaceId:fixture.workspaceId})&&phase!=='inspect')write.permitted=true;
   else if(request.method()==='POST'&&/^\/api\/lcos\/canvases\/([^/]+)\/(execution|conversations):reconcile$/.test(url.pathname)){
    const canvasId=decodeURIComponent(url.pathname.split('/')[4]);write.permitted=allowedCanvases.has(canvasId)&&same(body,{});
   }else if(request.method()==='POST'&&url.pathname.endsWith('/nodes:batchActions')&&allowedCanvases.has(body?.canvas_id)){
    const current=await get('/api/canvas/v1/canvases/'+encodeURIComponent(body.canvas_id));
    write.permitted=!body.lcos_operation&&Array.isArray(body.actions)&&body.actions.length>0&&body.actions.every(action=>action.action==='update'&&Array.isArray(action.updates)&&action.updates.every(patch=>{
     const old=current.nodes.find(row=>row.id===patch.id);return !!old&&Object.entries(patch).every(([field,value])=>['id','type','data','position','measured'].includes(field)&&same(value,old[field]));}));
   }
   if(!write.permitted){write.bodyKeys=body&&typeof body==='object'?Object.keys(body):[];await save();return route.abort();}
  }
  if(url.pathname==='/lcos/agent-ui.js'){
   const response=await route.fetch({timeout:120000}),source=await response.text();
   return route.fulfill({response,body:source+'\nwindow.__METHOD_PROJECTION_READ__=()=>{const s=useLcosShellStore.getState(),c=useCanvasStore.getState(),r=useLcosReferenceStore.getState(),h=window.__LCOS_NODE_LAB__;return{canvas:c.canvasId,status:c.status,workspace:s.activeWorkspaceId,projectId:s.projectId,host:h&&{projectId:h.projectId,canvasId:h.canvasId,currentCanvasId:h.currentCanvasId,apiMatches:h.api===c.rfInstance},surface:s.activeSurface,rootCanvases:s.surfaceCanvasId,prompt:s.composerPrompt,target:s.composerTarget,caret:s.composerCaret,refs:r.draft.orderedEntityRefs,windows:s.windows,nodes:c.nodes,viewport:c.rfInstance?.getViewport(),registered:[...r.nodeEntityRefs].map(([id,value])=>({id,entityType:value.entityType,entityId:value.entityId})),selectedConversation:typeof readNativeConversationSelection===\"function\"?readNativeConversationSelection():undefined,document:performance.timeOrigin}};'});
  }
  return route.continue();
 });
 await context.routeWebSocket('**/*',socket=>{report.blockedWebSockets.push(socket.url());socket.close()});
 page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',error=>report.pageErrors.push(String(error)));
 page.on('response',response=>{if(response.status()>=400)report.httpErrors.push({path:new URL(response.url()).pathname,status:response.status()})});
 const read=()=>page.evaluate(()=>window.__METHOD_PROJECTION_READ__());
 const ready=async canvasId=>{await page.waitForFunction(id=>{const s=window.__METHOD_PROJECTION_READ__?.();return s?.canvas===id&&s.status==='ready'&&s.host?.apiMatches&&(s.host.currentCanvasId??s.host.canvasId)===id},canvasId,{timeout:120000});await page.locator('[data-lcos-professional-surface-state=ready]').waitFor({state:'attached',timeout:120000});await page.getByTestId('common-loading-overlay').waitFor({state:'hidden',timeout:60000});};
 const shot=async name=>{await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const file=path.join(output,name+'.png');await page.screenshot({path:file});report.screenshots.push(file);await save();};
 const enterFromGallery=async()=>{
  await page.goto(origin+'/canvas/surface-core-main',{waitUntil:'domcontentloaded',timeout:120000});await ready('surface-core-main');
  const more=page.getByRole('button',{name:'浏览全部',exact:true});if(!await more.isVisible())await page.getByTestId('canvas-dockbar-workflow-btn').click();
  const guide=page.getByRole('button',{name:'知道了',exact:true});if(await guide.isVisible())await guide.click();await more.click();
  const gallery=page.locator('[data-native-workflow-gallery]');await gallery.waitFor();await gallery.getByRole('textbox').fill(fixture.title);await gallery.getByRole('textbox').press('Enter');await gallery.getByText(fixture.title,{exact:true}).first().click();
  const method=page.locator('[data-native-workflow-preview][data-method-id='+JSON.stringify(fixture.scopeId)+']');await method.waitFor();await shot('01-original-gallery-exact-method');
  await method.locator('[data-native-method-enter='+JSON.stringify(fixture.workspaceId)+']').click();
  await ready(candidate);await gallery.waitFor({state:'hidden'});
 };
 if(phase==='enter')await enterFromGallery();else{await page.goto(origin+'/canvas/'+encodeURIComponent(candidate),{waitUntil:'domcontentloaded',timeout:120000});await ready(candidate);}
 assert.equal(await page.locator('vite-error-overlay').count(),0);
 const fit=page.getByTestId('canvas-editor-fit-view-btn');if(await fit.isVisible())await fit.click();
 await page.waitForFunction(count=>window.__METHOD_PROJECTION_READ__?.().nodes.length>=count,Math.max(1,expected.length-1));
 const afterOpen=await facts(),canvas=await get('/api/canvas/v1/canvases/'+candidate),state=await read();report.originalState={...state,nodes:undefined};report.nodes=canvas.nodes;
 assert.equal(state.canvas,candidate);assert.equal(state.workspace,fixture.workspaceId);assert.notEqual(state.rootCanvases.workflow,candidate,'Child must not overwrite root navigation mapping.');
 const matched=[];
 for(const member of expected){
  let matching,binding;
  if(member.type==='view'||member.type==='artifact'){
   const sourceView=member.type==='view'?before.graph.artifactViews.find(row=>String(row.id)===member.id):undefined,artifact=before.graph.artifacts.find(row=>String(row.id)===String(sourceView?.artifactId??member.id));assert.ok(artifact);
   const revisionId=String(sourceView?.revisionId??member.revisionId??artifact.currentRevisionId);matching=canvas.nodes.filter(node=>node.data?.lcos_ref?.artifactId===String(artifact.id)&&node.data.lcos_ref.revisionId===revisionId);
   assert.equal(matching.length,1,JSON.stringify(member));binding=afterOpen.bindings.find(row=>row.canvasId===candidate&&row.spatialId===matching[0].id&&row.entityType==='view'&&row.entityId===matching[0].data.lcos_ref.artifactViewId);
  }else{
   const refField=member.type==='collection'?'lcos_collection_ref':member.type==='conversation'?'lcos_conversation_ref':member.type==='run'?'lcos_execution_ref':'lcos_member_ref';
   const idField=member.type==='collection'?'collectionId':member.type==='conversation'?'connectedConversationId':'entityId';matching=canvas.nodes.filter(node=>node.data?.[refField]?.[idField]===member.id&&(refField!=='lcos_member_ref'||node.data[refField].entityType===member.type));assert.equal(matching.length,1,JSON.stringify(member));
   binding=afterOpen.bindings.find(row=>row.canvasId===candidate&&row.spatialId===matching[0].id&&row.entityType===member.type&&row.entityId===member.id);
  }
  assert.ok(binding,JSON.stringify(member));matched.push({member,nodeId:matching[0].id,nodeType:matching[0].type,binding});
 }
 report.matched=matched;assert.deepEqual(afterOpen.execution,before.execution);assert.deepEqual(afterOpen.messages,before.messages);assert.deepEqual(afterOpen.presentations,before.presentations);
 for(const field of['artifacts','artifactRevisions','fileRecords','notes','scopes','collections','collectionMemberships','relations','workspaceEntityMemberships'])assert.deepEqual(afterOpen.graph[field],before.graph[field],field);
 for(const old of before.graph.artifactViews)assert.deepEqual(afterOpen.graph.artifactViews.find(row=>row.id===old.id),old);
 for(const old of before.graph.workspaces)if(old.id!==fixture.workspaceId)assert.deepEqual(afterOpen.graph.workspaces.find(row=>row.id===old.id),old);
 const newViews=afterOpen.graph.artifactViews.filter(row=>!before.graph.artifactViews.some(old=>old.id===row.id));assert.ok(newViews.every(row=>row.referenceKind==='explicit_additional'&&String(row.scopeId)===fixture.scopeId&&String(row.id).startsWith('view:native-library:')));
 report.sideEffects={newPinnedViewIds:newViews.map(row=>row.id),workspaceClaimed:originalWorkspace.canvasId!==candidate,runAndSlotTruthUnchanged:true,messagesUnchanged:true,presentationsUnchanged:true};
 for(const node of canvas.nodes.filter(node=>node.type==='lcos-member')){const body=page.locator('[data-native-member-body='+JSON.stringify(node.id)+']');await body.waitFor();await page.waitForFunction(id=>{const row=[...document.querySelectorAll('[data-native-member-body]')].find(row=>row.getAttribute('data-native-member-body')===id);return row&&row.querySelector('[data-native-member-action]')?.disabled===false},node.id);}
 await shot('02-original-method-child-all-members');report.checks.push('Original method scene contains every direct/nested Collection member and exact material version with its real Core binding, typed Note/Scope/Workspace body, original conversation and existing foreign Run; Run/slot/messages/Presentations remain unchanged.');
 if(initialCanvas){assert.deepEqual(canvas.nodes.map(node=>[node.id,node.position,node.measured]),initialCanvas.nodes.map(node=>[node.id,node.position,node.measured]));report.checks.push('Inspect/re-entry preserves the existing original node identities and geometry.');}
 if(phase==='return'){
  const sameScene=async()=>{await ready(candidate);assert.deepEqual((await read()).windows,state.windows);};
  const visibleNode=async id=>{const node=page.locator('[data-native-member-node='+JSON.stringify(id)+']');await node.waitFor();await node.scrollIntoViewIfNeeded();return node;};
  const note=canvas.nodes.find(node=>node.data?.lcos_member_ref?.entityType==='note');assert.ok(note);await(await visibleNode(note.id)).locator('[data-native-member-action=note]').click();
  const viewer=page.locator('[data-media-viewer]');await viewer.waitFor();await viewer.getByText(note.data.lcos_member_facts.body,{exact:false}).first().waitFor();await shot('03-note-original-viewer');await page.getByRole('button',{name:'返回库内预览',exact:true}).click();await viewer.waitFor({state:'hidden'});await sameScene();await page.waitForFunction(id=>document.activeElement?.closest('[data-native-member-body]')?.getAttribute('data-native-member-body')===id,note.id);report.checks.push('Actual Note node button opens the original Viewer with the exact body and returns focus to the same original node.');
  const scope=canvas.nodes.find(node=>node.data?.lcos_member_ref?.entityType==='scope');assert.ok(scope);await(await visibleNode(scope.id)).locator('[data-native-member-action=scope]').click();const preview=page.locator('.native-library-content-preview');await preview.waitFor();await shot('04-scope-original-library');await preview.getByRole('button',{name:'返回 '+scope.data.title,exact:true}).click();await preview.waitFor({state:'hidden'});await sameScene();report.checks.push('Actual Scope node uses the original Library and returns to the same method Canvas.');
  const workspace=canvas.nodes.find(node=>node.data?.lcos_member_ref?.entityType==='workspace');assert.ok(workspace);await(await visibleNode(workspace.id)).locator('[data-native-member-action=workspace]').click();await ready(workspace.data.lcos_member_facts.targetCanvasId);await shot('05-workspace-original-scene');await page.getByTestId('canvas-header-logo-button').click();await sameScene();await shot('06-original-header-back-to-method');report.checks.push('Actual Workspace node enters the exact pre-existing scene through original navigation, and original header Back restores its source method.');
  const closeChat=async()=>{const header=page.locator('[data-lcos-native-chat-header]');const buttons=await header.locator('button:visible').evaluateAll(rows=>rows.map(row=>({label:row.getAttribute('aria-label')||row.getAttribute('title')||row.textContent?.trim()})));const closing=buttons.filter(row=>/收起|关闭|close/i.test(row.label??''));assert.equal(closing.length,1,'Original chat close button must be unambiguous: '+JSON.stringify(buttons));await header.getByRole('button',{name:closing[0].label,exact:true}).click();};
  const conversation=canvas.nodes.find(node=>node.data?.lcos_conversation_ref?.connectedConversationId===fixture.nested.conversationId);assert.ok(conversation);const conversationNode=page.locator('[data-lcos-node-id='+JSON.stringify(conversation.id)+']');await conversationNode.scrollIntoViewIfNeeded();await conversationNode.getByRole('button',{name:conversation.data.title,exact:true}).click();await page.locator('[data-lcos-native-chat-header]').waitFor();await page.getByText('这是一段人工准备的嵌套入口验证历史；没有请求模型，也没有发送新消息。',{exact:true}).waitFor();await shot('07-conversation-original-right-panel');await closeChat();await sameScene();
  const run=canvas.nodes.find(node=>node.data?.lcos_execution_ref?.entityType==='run');assert.ok(run);const runNode=page.locator('[data-lcos-native-execution-node='+JSON.stringify(run.id)+'] [data-lcos-execution-node]');await runNode.scrollIntoViewIfNeeded();await runNode.dblclick();const detail=page.locator('[data-native-task-detail]');await detail.waitFor();await detail.getByRole('heading',{name:run.data.title,exact:true}).waitFor();await shot('08-existing-run-original-task-panel');await closeChat();await sameScene();report.checks.push('Original conversation and existing Run nodes open their actual original right panels; closing returns to the same method with no new message, session or Run.');
  const stable=await get('/api/canvas/v1/canvases/'+candidate),stableBindings=(await get(prefix+'/spatial/bindings')).filter(row=>row.canvasId===candidate);await enterFromGallery();await sameScene();assert.deepEqual((await get('/api/canvas/v1/canvases/'+candidate)).nodes,stable.nodes);assert.deepEqual((await get(prefix+'/spatial/bindings')).filter(row=>row.canvasId===candidate),stableBindings);await page.reload({waitUntil:'domcontentloaded'});await ready(candidate);assert.deepEqual((await get('/api/canvas/v1/canvases/'+candidate)).nodes,stable.nodes);assert.deepEqual((await get(prefix+'/spatial/bindings')).filter(row=>row.canvasId===candidate),stableBindings);await shot('09-reenter-refresh-original-identities');report.checks.push('Re-enter through original Gallery then refresh retains the same original nodes/bindings; permitted original reconciliation does not delete admitted members.');
 }
 const after=await facts();assert.deepEqual(after.execution,before.execution);assert.deepEqual(after.messages,before.messages);assert.deepEqual(after.presentations,before.presentations);assert.deepEqual(report.pageErrors,[]);assert.ok(report.writes.every(write=>write.permitted));report.finalState={...(await read()),nodes:undefined};report.passed=true;
}catch(error){report.error=String(error.stack??error);process.exitCode=1;if(page){report.body=await page.locator('body').innerText().catch(()=>'<unavailable>');const file=path.join(output,'failure.png');await page.screenshot({path:file}).catch(()=>{});report.screenshots.push(file);report.failedState=await page.evaluate(()=>window.__METHOD_PROJECTION_READ__?.()).catch(()=>undefined);}}
finally{await save();await browser?.close();}
console.log(JSON.stringify({passed:report.passed,phase,checks:report.checks,error:report.error,output},null,2));
