import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {isDeepStrictEqual as equal} from 'node:util';
import {currentGen2Root} from '../lab/current-gen2-resources.mjs';

const origin='http://127.0.0.1:56311',project='disposable-surface-core-facade',canvas='surface-core-main';
const prefix='/api/lcos/core/projects/'+project,scopeId='scope-workflow-mixed-member-reading-20261025',presentationId='presentation:workflow:'+scopeId;
const title='混合成员阅读联调 · 附注、对话、任务',noteId='note-project-mvp-boundary',conversationId='connected-conversation-52edcac3-dd7f-40b0-a89c-c0ed535d8048',runId='run-42b5b2dc-a81b-4d9d-bb77-a1333f55da9b';
const memberRefs=[{type:'note',id:noteId},{type:'conversation',id:conversationId},{type:'run',id:runId}];
const root=path.resolve('output/原方法混合成员阅读_20261025'),output=path.join(root,'实屏',new Date().toISOString().replaceAll(':','-'));
await fs.mkdir(output,{recursive:true});await fs.mkdir(path.join(root,'fixture'),{recursive:true});
const report={passed:false,checks:[],fixture:{scopeId,presentationId,title,memberRefs,writes:[]},browserWrites:[],blockedExternal:[],blockedWrites:[],failuresInjected:[],errors:[],screenshots:[],modelCalled:false,output};
async function get(route){const response=await fetch(origin+route,{cache:'no-store',redirect:'error'});assert.equal(response.status,200,route);const payload=await response.json();return payload.value??payload.data??payload}
async function put(route,body){const response=await fetch(origin+route,{method:'PUT',redirect:'error',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const payload=await response.json();report.fixture.writes.push({method:'PUT',route,status:response.status,ok:payload.ok===true});return{response,payload}}
async function prepare(){
 const health=await get('/health');assert.equal(health.bind,'127.0.0.1');assert.equal(health.realCoreConnected,true);
 let [graph,presentations,conversations,execution]=await Promise.all([get(prefix+'/graph'),get(prefix+'/presentations'),get(prefix+'/connected-conversations'),get(prefix+'/execution-projection')]);
 const note=graph.notes.find(row=>row.id===noteId&&row.projectId===project),conversation=conversations.find(row=>row.id===conversationId&&row.projectId===project),run=execution.runs.find(row=>row.id===runId&&row.projectId===project);
 assert.ok(note&&conversation&&!conversation.conversationRef.startsWith('pending-')&&run);assert.equal(conversation.label,'Scope 嵌套对话 · 人工历史');
 let scope=graph.scopes.find(row=>row.id===scopeId);assert.ok(!scope||scope.kind==='workflow'&&scope.name===title&&!scope.archivedAt,'Existing fixture was modified; preserve it.');
 if(!scope){
  const actions=Array.from({length:5},(_,index)=>({id:'mixed-member-read-step-'+(index+1),label:['核对原附注','浏览原人工对话','查看已有任务','核对成员回程','保留当前输入'][index],description:'只沿原页面查看既有内容；返回同一方法位置，不发送消息、不执行任务。\n核对完整文字、原成员身份和当前输入。',attachedViewIds:[],x:0,y:index*160}));
  const body={create:true,name:title,expectedGraphVersion:graph.graphVersion,presentations:[{id:presentationId,expectedVersion:0,workflowActions:actions,workflowActionEdges:[],workflowOperators:{}}]};
  const result=await put(prefix+'/workflow/methods/'+scopeId,body);
  [graph,presentations]=await Promise.all([get(prefix+'/graph'),get(prefix+'/presentations')]);scope=graph.scopes.find(row=>row.id===scopeId);
  assert.ok(scope&&scope.name===title,'Method create is unconfirmed; no automatic write replay.');
  assert.equal(result.response.status,200,JSON.stringify(result.payload.error));
 }else report.fixture.reused=true;
 let presentation=presentations.find(row=>row.id===presentationId);assert.ok(presentation&&presentation.scopeId===scopeId&&presentation.projectId===project);
 if(!equal(presentation.state.memberEntityRefs??[],memberRefs)){
  assert.deepEqual(presentation.state.memberEntityRefs??[],[],'Existing member refs changed; do not overwrite.');
  const contract={...presentation,state:{...presentation.state,memberEntityRefs:memberRefs},updatedBy:'web',updatedAt:new Date().toISOString()};
  const result=await put(prefix+'/presentations/'+encodeURIComponent(presentationId),{contract,expectedVersion:presentation.version});
  presentations=await get(prefix+'/presentations');presentation=presentations.find(row=>row.id===presentationId);
  assert.deepEqual(presentation.state.memberEntityRefs,memberRefs,'Member save unconfirmed; no automatic write replay.');assert.equal(result.response.status,200,JSON.stringify(result.payload.error));
 }
 const workspace=graph.workspaces.find(row=>row.scopeId===scopeId);assert.ok(workspace&&!workspace.canvasId);
 report.fixture={...report.fixture,workspaceId:workspace.id,presentationVersion:presentation.version,noteTitle:note.body.split('\n').find(row=>row.trim()).slice(0,72).trim(),conversationTitle:conversation.label,runTitle:run.title,noteBody:note.body};
 const preparationHistory=[];
 for(const directory of await fs.readdir(path.join(root,'实屏'),{withFileTypes:true}))if(directory.isDirectory()){
  const evidence=path.join(root,'实屏',directory.name,'report.json'),saved=await fs.readFile(evidence,'utf8').then(JSON.parse).catch(()=>null);
  if(saved?.fixture?.scopeId===scopeId&&saved.fixture.writes?.length)preparationHistory.push({evidence:path.relative(root,evidence),writes:saved.fixture.writes});
 }
 report.fixture.preparationHistory=preparationHistory;
 await fs.writeFile(path.join(root,'fixture','fixture.json'),JSON.stringify(report.fixture,null,2));
 return{note,conversation,run,presentation,scope,workspace};
}

let browser,page,failConversations=false,failRuns=false;
const traceClose=process.argv.includes('--trace-close'),narrowOnly=process.argv.includes('--narrow-only'),captionOnly=process.argv.includes('--caption-only');
try{
 const fixture=await prepare();report.checks.push('Original Core HTTP owners created/reused one clearly named independent method and added the exact existing Note, manual conversation and Run; the original c96e method is untouched.');
 if(process.argv.includes('--prepare-only')){report.passed=true;}
 else{
  const timelineRoute=prefix+'/connected-conversations/'+conversationId+'/collaboration-timeline?limit=50';
  const before={graph:await get(prefix+'/graph'),presentations:await get(prefix+'/presentations'),conversations:await get(prefix+'/connected-conversations'),run:await get('/api/lcos/core/runs/'+runId+'/review'),timeline:await get(timelineRoute)};
  const expectedMessages=before.timeline.filter(row=>['user_message','agent_message'].includes(row.kind));assert.equal(expectedMessages.length,2);report.existingHistoryMessages=expectedMessages.map(row=>({itemId:row.itemId,kind:row.kind,body:row.body}));
  const {chromium}=createRequire(path.join(currentGen2Root,'package.json'))('playwright-core');browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-networking','--disable-sync','--no-first-run']});
  const context=await browser.newContext({viewport:{width:1500,height:1000},locale:'zh-CN',serviceWorkers:'block'});
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());if(url.origin!==origin){report.blockedExternal.push({protocol:url.protocol,host:url.host});return route.abort()}
   if(request.method()==='GET'&&(url.pathname===prefix+'/connected-conversations'&&failConversations||url.pathname===prefix+'/execution-projection'&&failRuns)){
    report.failuresInjected.push(url.pathname);return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({ok:false,error:{code:'UNAVAILABLE',message:'Synthetic directory read failure for exact member retry'}})});
   }
   if(!['GET','HEAD','OPTIONS'].includes(request.method())){
    let permitted=url.pathname==='/api/events'||url.pathname.endsWith('/execution:reconcile');
    if(url.pathname.endsWith('/nodes:batchActions')){
     const body=request.postDataJSON(),saved=await get(url.pathname.replace('/nodes:batchActions',''));
     permitted=!body.lcos_operation&&body.actions?.every(action=>action.action==='update'&&action.updates?.every(node=>{const old=saved.nodes.find(row=>row.id===node.id);return old&&equal(old.position,node.position)&&equal(old.data,node.data)}));
    }
    const write={method:request.method(),path:url.pathname,permitted};report.browserWrites.push(write);if(!permitted){report.blockedWrites.push(write);return route.abort()}
   }
   if(url.pathname==='/lcos/agent-ui.js'){
    const response=await route.fetch({timeout:120000});let source=await response.text();
    if(traceClose){
     for(const[signature,event,extra]of[['function releaseNativeLibraryReadingReturn(request3, returning, used = false) {','lease-release','returning,used'],['function cancelNativeLibraryReadingReturn(lease, preserveOrigin = false) {','lease-cancel','preserveOrigin,rootId:lease?.rootId,closed:lease?.closed']]){
      assert.ok(source.includes(signature));source=source.replace(signature,signature+'(window.__METHOD_MEMBER_TRACE__??=[]).push({at:performance.now(),event:'+JSON.stringify(event)+','+extra+',stack:new Error().stack?.slice(0,1000)});');
     }
     const signature='function LCOSUseNativeWorkflowGallery({ searchKeyword = "", onClose, onMaterialUse }) {';assert.ok(source.includes(signature));source=source.replace(signature,signature+'useEffect8(()=>{(window.__METHOD_MEMBER_TRACE__??=[]).push({at:performance.now(),event:"gallery-mounted"});return()=>{(window.__METHOD_MEMBER_TRACE__??=[]).push({at:performance.now(),event:"gallery-unmounted"})}},[]);');
    }
    return route.fulfill({response,body:source+'\nwindow.__METHOD_MEMBERS_READ__=()=>{const s=useLcosShellStore.getState(),c=useCanvasStore.getState();return{prompt:s.composerPrompt,target:s.composerTarget,caret:s.composerCaret,refs:useLcosReferenceStore.getState().draft.orderedEntityRefs,windows:s.windows,selected:readNativeConversationSelection(),canvas:c.canvasId,workspace:s.activeWorkspaceId}};'});
   }
   if(traceClose&&url.pathname.endsWith('/page-Da_DfwiK.js')){
    const response=await route.fetch();let source=await response.text();source=source.replace('onOpenChange:value=>{if(!value&&(!localMethods||!methodSaving&&!methodReading))t()}','onOpenChange:value=>{(window.__METHOD_MEMBER_TRACE__??=[]).push({at:performance.now(),event:"dialog-open-change",value,methodSaving,methodReading});if(!value&&(!localMethods||!methodSaving&&!methodReading))t()}').replace('i.cancel();methodNavigation.clear();','(window.__METHOD_MEMBER_TRACE__??=[]).push({at:performance.now(),event:"gallery-close",stack:new Error().stack?.slice(0,1000)});i.cancel();methodNavigation.clear();');return route.fulfill({response,body:source});
   }
   return route.continue();
  });await context.routeWebSocket('**/*',socket=>socket.close());page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',error=>report.errors.push(String(error)));
  const ready=()=>page.locator('[data-lcos-professional-surface-state=ready]').waitFor({state:'attached',timeout:120000}),read=()=>page.evaluate(()=>window.__METHOD_MEMBERS_READ__());
  const shot=async label=>{const file=path.join(output,label+'.png');await page.screenshot({path:file});report.screenshots.push(file);await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2))};
  const settled=async locator=>{await locator.click({trial:true});await locator.evaluate(element=>new Promise((resolve,reject)=>{let frames=0,stable=0;const check=()=>{
   let visible=element.isConnected;for(let node=element;visible&&node instanceof HTMLElement;node=node.parentElement)visible=Number(getComputedStyle(node).opacity)>=.99;
   stable=visible?stable+1:0;if(stable>=2)return resolve();if(++frames>240)return reject(new Error('Original destination is still transitioning.'));requestAnimationFrame(check);
  };check()}))};
  await page.goto(origin+'/canvas/'+canvas,{waitUntil:'domcontentloaded',timeout:120000});await ready();
  const input=page.getByRole('textbox',{name:'Composer 输入',exact:true});await input.fill('混合成员逐项阅读：原输入、引用与光标保持在本标签页。');await input.evaluate(element=>{element.focus();element.setSelectionRange(9,14);element.dispatchEvent(new Event('select',{bubbles:true}))});
  const original=await read();assert.equal(original.selected,null);assert.ok(original.target.nodeId.startsWith('canvas:'));report.inputEvidence={before:original,expectedCaret:{start:9,end:14},returns:[]};
  await page.getByTestId('canvas-dockbar-workflow-btn').click();const guide=page.getByRole('button',{name:'知道了',exact:true});if(await guide.isVisible())await guide.click();await page.getByRole('button',{name:'浏览全部',exact:true}).click();
  const gallery=page.locator('[data-native-workflow-gallery]'),preview=gallery.locator('[data-native-workflow-preview]'),viewer=page.locator('[data-media-viewer]'),parentRail=page.getByTestId('canvas-dockbar-workflow-panel');assert.equal(await parentRail.count(),1,'One original method parent Rail exists');await gallery.getByRole('textbox').fill('混合成员阅读联调');await gallery.getByRole('textbox').press('Enter');
  const openMethod=async()=>{await gallery.getByText(title,{exact:true}).first().click();await preview.waitFor()};await openMethod();
  const memberButton=kind=>preview.locator('[data-native-method-member]').filter({has:page.locator('span')}).filter({hasText:kind==='note'?report.fixture.noteTitle:kind==='conversation'?fixture.conversation.label:fixture.run.title});
  const conversationRead=async()=>{await page.waitForFunction(id=>window.__METHOD_MEMBERS_READ__().selected?.connectedConversationId===id,conversationId);for(const message of expectedMessages)await page.getByText(message.body,{exact:false}).first().waitFor()};
  async function assertReturned(kind,scroll){
   await gallery.waitFor();await preview.waitFor();const button=memberButton(kind);await button.waitFor();await page.waitForFunction(key=>document.activeElement?.getAttribute('data-native-method-member')===key,JSON.stringify([kind==='conversation'?'conversation':kind==='run'?'run':'note',kind==='conversation'?conversationId:kind==='run'?runId:noteId]));
   await parentRail.waitFor({state:'visible'});assert.equal(await gallery.getAttribute('data-native-workflow-reading'),null,'Returning releases the original source reading state');
   const returned=await read();for(const key of['prompt','refs','windows','canvas','workspace','selected'])assert.deepEqual(returned[key],original[key],key);
   report.inputEvidence.returns.push({kind,caret:returned.caret,target:returned.target,selected:returned.selected});
   assert.equal(returned.caret?.start,9,'Original input selection start retained');assert.equal(returned.caret?.end,14,'Original input selection end retained');assert.equal(returned.caret?.text,original.prompt);
   const address=target=>{const{focusInput,...value}=target;return value};assert.deepEqual(address(returned.target),address(original.target));assert.ok(Math.abs(await preview.evaluate(element=>element.scrollTop)-scroll)<2,'Original method scroll restored');
   assert.equal(await gallery.getByRole('textbox',{includeHidden:true}).inputValue(),'混合成员阅读联调');
  }
  for(const kind of(narrowOnly||captionOnly?[]:['note','conversation','run'])){
   const button=memberButton(kind);await button.scrollIntoViewIfNeeded();const scroll=await preview.evaluate(element=>element.scrollTop);await button.click();
   if(kind==='note'){await viewer.waitFor();await page.getByText(fixture.note.body,{exact:false}).first().waitFor();assert.equal(await gallery.isVisible(),false)}
   else if(kind==='conversation'){await conversationRead();await page.getByRole('button',{name:'返回库内预览',exact:true}).waitFor();assert.equal(await gallery.isVisible(),false)}
   else{await page.locator('[data-native-task-detail]').waitFor();await page.locator('[data-native-task-detail]').getByRole('heading',{name:fixture.run.title,exact:true}).waitFor();assert.equal(await gallery.isVisible(),false)}
   await parentRail.waitFor({state:'hidden'});assert.equal(await parentRail.count(),1,'Source Rail is suspended, not unmounted');assert.equal(await gallery.getAttribute('data-native-workflow-reading'),'true','Original Gallery exposes its live reading state');await settled(page.getByRole('button',{name:'返回库内预览',exact:true}));await shot('0'+(['note','conversation','run'].indexOf(kind)+1)+'-'+kind+'-original-page');await page.getByRole('button',{name:'返回库内预览',exact:true}).click();if(kind==='note')await viewer.waitFor({state:'hidden'});await assertReturned(kind,scroll);
   report.checks.push('Original method → '+kind+' original destination → Back restores the same method search, scroll, exact member focus, Canvas assistant draft and original conversation selection.');
  }
  for(const kind of(narrowOnly||captionOnly?[]:['conversation','run'])){
   await gallery.getByRole('button',{name:'返回方法列表',exact:true}).click();if(kind==='conversation')failConversations=true;else failRuns=true;
   // A new original Gallery mount rereads the directory rather than using the
   // already-loaded selected method; no domain response is fabricated.
   await gallery.getByTestId('common-dialog-close-btn').click();await gallery.waitFor({state:'hidden'});await page.getByRole('button',{name:'浏览全部',exact:true}).click();await gallery.waitFor();await gallery.getByRole('textbox').fill('混合成员阅读联调');await gallery.getByRole('textbox').press('Enter');await openMethod();
   const retry=preview.getByRole('button',{name:kind==='conversation'?'重新读取 对话':'重新读取 任务',exact:true});await retry.waitFor();await preview.getByText(kind==='conversation'?'对话列表暂时无法读取，请重新读取；原成员保留':'任务列表暂时无法读取，请重新读取；原成员保留',{exact:true}).waitFor();assert.equal(await preview.locator('[data-native-method-member]').count(),3);
   assert.ok(await memberButton('note').isEnabled());await retry.scrollIntoViewIfNeeded();await settled(retry);await shot('failure-'+kind+'-retains-members');failConversations=false;failRuns=false;await retry.click();await memberButton(kind).waitFor();
   const button=memberButton(kind);await button.scrollIntoViewIfNeeded();const scroll=await preview.evaluate(element=>element.scrollTop);await button.click();if(kind==='conversation')await conversationRead();else await page.locator('[data-native-task-detail]').waitFor();await page.getByRole('button',{name:'返回库内预览',exact:true}).click();await assertReturned(kind,scroll);
   report.checks.push(kind+' catalogue GET 503 retains all three member identities and retry guidance; explicit reread restores the exact real destination and its original Back path.');
  }
  // Enter through the original narrow Rail after its responsive side change;
  // do not click an outgoing desktop Dialog while Radix remounts that owner.
  await gallery.getByTestId('common-dialog-close-btn').click();await gallery.waitFor({state:'hidden'});await page.setViewportSize({width:360,height:800});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const more=page.getByRole('button',{name:'浏览全部',exact:true});if(!await more.isVisible())await page.getByTestId('canvas-dockbar-workflow-btn').click();await more.click();await gallery.waitFor();await gallery.getByRole('textbox').fill('混合成员阅读联调');await gallery.getByRole('textbox').press('Enter');await openMethod();
  if(captionOnly){
   const caption='完整方法及关联内容会加入当前输入，步骤仍可编辑。关联 3 项内容，可逐项查看。';await gallery.getByText(caption,{exact:true}).waitFor();assert.equal(await preview.locator('[data-native-method-member]').count(),3);assert.equal(await gallery.getByText('这份方法没有绑定材料。',{exact:false}).count(),0);
   await settled(gallery.getByRole('button',{name:'加入当前输入',exact:true}));assert.equal(await gallery.evaluate(element=>element.scrollWidth>element.clientWidth),false);assert.equal(await preview.evaluate(element=>element.scrollWidth>element.clientWidth),false);await shot('narrow-mixed-members-caption');report.checks.push('At 360px the original method description accurately says three associated items can be read, does not promise those refs are carried into Take, and fits the original layout.');
  }else{
   const narrow=memberButton('note');await narrow.scrollIntoViewIfNeeded();const scroll=await preview.evaluate(element=>element.scrollTop);await narrow.click();await viewer.waitFor();await page.getByRole('button',{name:'返回库内预览',exact:true}).click();await viewer.waitFor({state:'hidden'});await assertReturned('note',scroll);assert.equal(await gallery.evaluate(element=>element.scrollWidth>element.clientWidth),false);assert.equal(await preview.evaluate(element=>element.scrollWidth>element.clientWidth),false);await shot('narrow-original-method-return');
   report.checks.push('At 360px, the original Note Viewer returns to the same method, draft and exact member focus; the original method page has no horizontal overflow.');
  }
  const after={graph:await get(prefix+'/graph'),presentations:await get(prefix+'/presentations'),conversations:await get(prefix+'/connected-conversations'),run:await get('/api/lcos/core/runs/'+runId+'/review'),timeline:await get(timelineRoute)};
  assert.deepEqual(after.graph.notes.find(row=>row.id===noteId),before.graph.notes.find(row=>row.id===noteId));assert.deepEqual(after.presentations.find(row=>row.id===presentationId),before.presentations.find(row=>row.id===presentationId));assert.deepEqual(after.graph.workspaces.find(row=>row.scopeId===scopeId),before.graph.workspaces.find(row=>row.scopeId===scopeId));assert.deepEqual(after.conversations.find(row=>row.id===conversationId),before.conversations.find(row=>row.id===conversationId));assert.deepEqual(after.run,before.run);
  assert.deepEqual(after.timeline,before.timeline);assert.deepEqual(report.errors,[]);assert.deepEqual(report.blockedWrites,[]);if(!narrowOnly&&!captionOnly)assert.ok(report.failuresInjected.some(route=>route.endsWith('/connected-conversations'))&&report.failuresInjected.some(route=>route.endsWith('/execution-projection')));
  report.checks.push('The real Note, manual conversation, Run and independent method remain unchanged during browsing. All model/send/create/dispatch writes and external HTTP/WS are blocked; no new conversation or Run was made.');report.passed=true;
 }
}catch(error){report.error=String(error.stack??error);process.exitCode=1;if(page){report.body=await page.locator('body').innerText().catch(()=>'<unavailable>');await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{})}}
finally{if(traceClose&&page)report.trace=await page.evaluate(()=>window.__METHOD_MEMBER_TRACE__??[]).catch(()=>[]);await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));await browser?.close()}
console.log(JSON.stringify({passed:report.passed,checks:report.checks,error:report.error,fixture:report.fixture,errors:report.errors,output},null,2));
