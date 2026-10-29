import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { isDeepStrictEqual as same } from 'node:util';
import { currentGen2Root } from '../lab/current-gen2-resources.mjs';

const option = name => process.argv.find(arg => arg.startsWith('--' + name + '='))?.slice(name.length + 3);
const pid = Number(option('expected-pid')), proofFile = option('owned-marker-report');
assert.ok(Number.isSafeInteger(pid) && pid > 0 && proofFile);
const origin = 'http://127.0.0.1:56311', project = 'disposable-surface-core-facade', base = '/api/lcos/core/projects/' + project;
const main = 'surface-core-main', contextId = 'surface-core-context';
const proof = JSON.parse(await fs.readFile(proofFile, 'utf8')); assert.equal(proof.pid, pid);
const owned = proof.receipts.map(row => row.marker), destination = owned.find(row => row.sourceSurfaceRef === 'workspace:workspace-reference-feedback');
assert.ok(owned.length === 2 && destination);
for (const marker of owned) assert.ok(proof.writes.some(row => row.method === 'POST' && row.path === base + '/spatial-markers' && row.permitted && row.status === 201 && row.markerId === marker.id
  && same(row.body, { targetRef: marker.targetRef, scope: marker.scope, sourceSurfaceRef: marker.sourceSurfaceRef })));
const out = path.resolve('output/原生固定目录_20261026/回程只读trace-' + new Date().toISOString().replace(/[:.]/g, '-')); await fs.mkdir(out, { recursive: true });
const report = { diagnosticCompleted: false, scope: 'Diagnostic-only original bundle with bounded read trace. Not final unmodified-bundle proof.', pid, out,
  originalFailure: proofFile, owned, writes: [], blocked: [], pageErrors: [], trace: [], screenshots: [], markerWrites: 0, modelSends: 0 };
let browser, page, stage = 'preflight';
const get = async route => { const response = await fetch(origin + route, { redirect: 'error', signal: AbortSignal.timeout(30000) }); assert.equal(response.status, 200, route);
  const payload = await response.json(); return payload.value ?? payload.data ?? payload; };
async function facts() {
  const graph = await get(base + '/graph'), messages = {}, canvases = {};
  for (const session of await get(base + '/conversations')) { const payload = await get(base + '/conversations/' + encodeURIComponent(session.id) + '/messages?limit=1000');
    assert.equal(Boolean(payload.hasMore ?? payload.nextCursor), false); messages[session.id] = Array.isArray(payload) ? payload : payload.messages ?? payload.items; }
  for (const id of new Set([main,contextId,...graph.workspaces.map(row => row.canvasId).filter(Boolean)])) canvases[id] = await get('/api/canvas/v1/canvases/' + encodeURIComponent(id));
  return { graph, messages, canvases, markers: await get(base + '/spatial-markers'), runs: await get(base + '/runs'), collections: await get(base + '/collections'), bindings: await get(base + '/spatial/bindings') };
}
function traceBundle(source) {
  assert.match(source, /const liveProject = useLcosShellStore\.getState\(\)\.projectId, liveCanvas = native_canvas_port_default\.getState\(\)/, 'Served original bundle contains live project/canvas owner fix');
  report.servedLiveOwnerFix = true;
  const edits = [];
  const exact = (fragment, replace, label) => { const at = source.indexOf(fragment); assert.ok(at >= 0 && source.indexOf(fragment, at + 1) < 0, 'One actual trace seam ' + label);
    edits.push({ start: at, end: at + fragment.length, text: replace }); };
  const trace = (event, extra = '{}') => `LCOSDirectoryReturnTrace(${JSON.stringify(event)},${extra});`;
  exact('var publishNavigation = (value2) => {', 'var publishNavigation = (value2) => {' + trace('publishNavigation:before', '{next:value2&&{phase:value2.phase,source:value2.source?.canvasId,destination:value2.destination?.canvasId,root:value2.root?.kind,error:!!value2.error}}'), 'publishNavigation entry');
  const pubStart = source.indexOf('var publishNavigation = (value2) => {'), pubEnd = source.indexOf('\n};', pubStart);
  const pubTail = source.lastIndexOf('navigationListeners.forEach((listener2) => listener2());', pubEnd);
  assert.ok(pubTail > pubStart); edits.push({ start: pubTail, end: pubTail, text: trace('publishNavigation:assigned') });
  exact('async function restoreOriginalLibrary(value2) {', 'async function restoreOriginalLibrary(value2) {' + trace('restoreOriginalLibrary:entry', '{frameSame:libraryNavigation===value2,phase:value2.phase,hasCallback:!!value2.returnToSource}'), 'restore entry');
  exact('await value2.returnToSource();', trace('restoreOriginalLibrary:callback-before') + 'await value2.returnToSource();' + trace('restoreOriginalLibrary:callback-after'), 'source callback');
  const restoringStart = source.indexOf('function nativeWorkspaceSourceRestoring('), restoringEnd = source.indexOf('\n}', restoringStart) + 2;
  assert.ok(restoringStart >= 0 && restoringEnd > restoringStart); const restoringBody = source.slice(restoringStart, restoringEnd);
  const expression = /return ([\s\S]*);\n\}$/.exec(restoringBody); assert.ok(expression);
  edits.push({ start: restoringStart, end: restoringEnd, text: restoringBody.replace(expression[0], 'const LCOSRestoringFlag=' + expression[1] + ';' + trace('sourceRestoring', '{projectId,canvasId,result:LCOSRestoringFlag}') + 'return LCOSRestoringFlag;\n}') });
  exact('const reopen = async () => {', 'const reopen = async () => {' + trace('reopen:entry', '{origin:origin2.canvasId,originWorkspace:origin2.workspaceId}'), 'reopen entry');
  exact('if (!projectCurrent(origin2) || !restoring()) return;', 'if (!projectCurrent(origin2) || !restoring()) {' + trace('reopen:early-return') + 'return;}', 'reopen initial predicate');
  exact('const returned = await waitForDirectoryArrival(origin2, origin2, returningOperation, returningController.signal, restoring);',
    trace('reopen:wait-before', '{returningOperation,serial}') + 'const returned = await waitForDirectoryArrival(origin2, origin2, returningOperation, returningController.signal, restoring);' + trace('reopen:wait-after', '{returningOperation,serial,canvas:returned.canvasId}'), 'reopen wait');
  exact('if (returningOperation !== serial || !restoring()) return;', 'if (returningOperation !== serial || !restoring()) {' + trace('reopen:cancelled-after-wait', '{returningOperation,serial}') + 'return;}', 'reopen final predicate');
  exact('function setNavigationDirectoryOpen(canvasId, open3) {', 'function setNavigationDirectoryOpen(canvasId, open3) {' + trace('setDirectoryOpen', '{canvasId,open:open3}'), 'controlled Popover callback');
  exact('const open3 = matchingScene && state3.open;', 'const open3 = matchingScene && state3.open;' + trace('entry:render-controlled-open', '{canvasId,open:open3,matchingScene,stateOpen:state3.open,stateCanvas:state3.scene?.canvasId,apiMatches:state3.scene?.api===currentApi}'), 'actual original Popover controlled open render');
  exact('function waitForDirectoryArrival(origin2, place, operation, signal, isCurrent = () => true) {', 'function waitForDirectoryArrival(origin2, place, operation, signal, isCurrent = () => true) {'
    + trace('arrivalWait:entry', '{operation,serial,origin:origin2.canvasId,target:place.canvasId,workspace:place.workspaceId,aborted:signal.aborted}'), 'arrival wait entry');
  const waitStart = source.indexOf('function waitForDirectoryArrival('), waitEnd = source.indexOf('\nfunction ', waitStart + 1), waitBody = source.slice(waitStart, waitEnd);
  const finish = 'const finish = (error64, scene) => {'; const finishAt = waitBody.indexOf(finish); assert.ok(finishAt >= 0);
  edits.push({ start: waitStart + finishAt + finish.length, end: waitStart + finishAt + finish.length, text: trace('arrivalWait:finish', '{operation,serial,error:!!error64,errorName:error64?.name,canvas:scene?.canvasId}') });
  for (const edit of edits.sort((a,b)=>b.start-a.start)) source = source.slice(0,edit.start)+edit.text+source.slice(edit.end);
  return source + `
function LCOSDirectoryReturnTrace(event,extra={}){
 try{const c=useCanvasStore.getState(),s=useLcosShellStore.getState(),d=navigationDirectorySnapshot(),n=nativeNavigationSnapshot(),f=libraryNavigation,scene=currentNativeNavigationScene();
 const safeFrame=f&&{phase:f.phase,root:f.root?.kind,source:f.source?.canvasId,destination:f.destination?.canvasId,error:!!f.error,restoringWork:!!f.restoringWork,hasCallback:!!f.returnToSource};
 const rows=window.__DIRECTORY_RETURN_TRACE__??=([]);rows.push({at:performance.now(),event,extra,frame:safeFrame,canvas:{id:c.canvasId,status:c.status,workspace:s.activeWorkspaceId,hostCanvas:window.__LCOS_NODE_LAB__?.currentCanvasId,apiMatchesHost:c.rfInstance===window.__LCOS_NODE_LAB__?.api,scene:scene?.canvasId,owner:n.scene?.canvasId,apiMatchesOwner:!!scene&&scene.api===n.scene?.api},directory:{open:d.open,status:d.status,busy:!!d.busy,hasError:!!d.error,hasQuery:!!d.query,scroll:d.scroll},lastEvent:window.__DIRECTORY_RETURN_LAST_EVENT__,active:LCOSDirectoryTraceElement(document.activeElement),stack:new Error().stack?.split('\\n').slice(2,8).join('\\n')});if(rows.length>800)rows.shift();}catch{}
}
function LCOSDirectoryTraceElement(target){if(!(target instanceof Element))return null;return{tag:target.tagName,role:target.getAttribute('role'),testId:target.getAttribute('data-testid'),inDirectory:!!target.closest('[data-native-navigation-directory]'),directoryTrigger:!!target.closest('[data-native-navigation-directory-entry]'),nodeId:target.closest('.react-flow__node')?.getAttribute('data-id'),headerBack:!!target.closest('[data-testid="canvas-header-logo-button"]'),loading:!!target.closest('[data-testid="common-loading-overlay"]')};}
window.__DIRECTORY_RETURN_TRACE__=[];
for(const type of ['pointerdown','click','focusin','focusout','keydown','wheel'])window.addEventListener(type,event=>{window.__DIRECTORY_RETURN_LAST_EVENT__={type,at:performance.now(),trusted:event.isTrusted,target:LCOSDirectoryTraceElement(event.target)};LCOSDirectoryReturnTrace('dom:'+type);},true);
let LCOSDirectoryDOMSignature='';new MutationObserver(()=>{const signature=JSON.stringify({entries:[...document.querySelectorAll('[data-native-navigation-directory-entry]')].map(e=>({expanded:e.querySelector('button')?.getAttribute('aria-expanded')})),directories:document.querySelectorAll('[data-native-navigation-directory]').length,loading:!!document.querySelector('[data-testid="common-loading-overlay"]')});if(signature!==LCOSDirectoryDOMSignature){LCOSDirectoryDOMSignature=signature;LCOSDirectoryReturnTrace('dom:popover-state',JSON.parse(signature));}}).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['aria-expanded']});
subscribeNavigationDirectory(()=>LCOSDirectoryReturnTrace('directory:observe'));
useCanvasStore.subscribe(()=>LCOSDirectoryReturnTrace('canvas:observe'));
subscribeNativeNavigation(()=>LCOSDirectoryReturnTrace('navigation:observe'));
window.__DIRECTORY_RETURN_READ__=()=>{const d=navigationDirectorySnapshot(),n=nativeNavigationSnapshot();return{canvas:useCanvasStore.getState().canvasId,scene:currentNativeNavigationScene()?.canvasId,directoryOpen:d.open,directoryError:!!d.error,status:d.status,queryLength:d.query.length,scroll:d.scroll,hasCameraReturn:!!n.returning,arrivalNode:n.arrival?.nodeId,frame:libraryNavigation&&{phase:libraryNavigation.phase,error:!!libraryNavigation.error}};};
`;
}
const before = await facts(); for (const row of owned) assert.deepEqual(before.markers.find(marker => marker.id === row.id), row);
try {
  const health = await get('/health'); assert.equal(health.pid, pid); assert.equal(health.realCoreConnected, true);
  const { chromium } = createRequire(path.join(currentGen2Root,'package.json'))('playwright-core'); browser = await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-networking','--disable-sync','--no-first-run']});
  const context = await browser.newContext({viewport:{width:1500,height:1000},locale:'zh-CN',serviceWorkers:'block'});
  await context.route('**/*',async route=>{const request=route.request(),url=new URL(request.url()),method=request.method();if(['data:','blob:'].includes(url.protocol))return route.continue();
    if(url.origin!==origin||url.pathname.startsWith('/api/lcos/core/projects/')&&!url.pathname.startsWith(base+'/')){report.blocked.push({stage,method,path:url.pathname});return route.abort();}
    if(method==='GET'&&url.pathname==='/lcos/agent-ui.js'){const response=await route.fetch({timeout:120000});return route.fulfill({response,body:traceBundle(await response.text())});}
    if(['GET','HEAD','OPTIONS'].includes(method))return route.continue();let body;try{body=request.postDataJSON();}catch{body=null;}
    const row={stage,method,path:url.pathname,permitted:false};report.writes.push(row);
    if(method==='POST'&&url.pathname==='/api/events')row.permitted=true;
    if(method==='POST'&&[main,contextId].some(id=>['/api/lcos/canvases/'+id+'/execution:reconcile','/api/lcos/canvases/'+id+'/conversations:reconcile'].includes(url.pathname))&&same(body,{}))row.permitted=true;
    if(method==='POST'&&url.pathname===base+'/navigation/resolve'&&owned.some(marker=>same(body,{targetRef:marker.targetRef})))row.permitted=true;
    if(method==='POST'&&[main,contextId].some(id=>url.pathname==='/api/canvas/v1/canvases/'+id+'/nodes:batchActions')){const old=await get(url.pathname.replace('/nodes:batchActions',''));
      row.permitted=body?.created_by_role==='user'&&body.actions?.length===1&&body.actions[0].action==='update'&&body.actions[0].updates?.every(patch=>{const node=old.nodes.find(n=>n.id===patch.id);return node&&Object.entries(patch).every(([key,value])=>key==='canvas_id'?url.pathname.includes('/'+value+'/'):['parent_id','parentId'].includes(key)?(value??'')===(node.parent_id??node.parentId??''):key==='data'?Object.entries(value).every(([field,next])=>same(next,node.data?.[field])):same(value,node[key]));});}
    if(row.permitted)return route.continue();report.blocked.push(row);return route.abort();});
  await context.routeWebSocket('**/*',socket=>socket.close());page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',error=>report.pageErrors.push(String(error)));
  const ready=async id=>{await page.waitForFunction(id=>window.__DIRECTORY_RETURN_READ__?.().canvas===id&&window.__DIRECTORY_RETURN_READ__?.().scene===id,id,{timeout:90000});await page.getByTestId('common-loading-overlay').waitFor({state:'hidden'});};
  const shot=async name=>{const file=path.join(out,name+'.png');await page.screenshot({path:file});report.screenshots.push(file);};
  stage='existing-main-directory';await page.goto(origin+'/canvas/'+main,{waitUntil:'domcontentloaded'});await ready(main);
  await page.locator('button[data-native-navigation-directory-trigger]').click();const directory=page.locator('[data-native-navigation-directory]');await directory.waitFor();
  const row=directory.locator('[data-native-navigation-directory-row="'+destination.id+'"] .native-navigation-directory-row-main');await row.waitFor();
  const title=await row.locator('.native-navigation-directory-title').innerText();await page.getByRole('searchbox',{name:'搜索固定目标',exact:true}).fill(title);await shot('01-existing-directory');
  stage='existing-pin-cross-enter';await row.click();await ready(contextId);await page.waitForFunction(()=>window.__DIRECTORY_RETURN_READ__().hasCameraReturn||window.__DIRECTORY_RETURN_READ__().directoryError);await shot('02-context-before-back');
  stage='original-header-back';await page.getByTestId('canvas-header-logo-button').click();await ready(main);
  await Promise.race([page.waitForFunction(()=>{const r=window.__DIRECTORY_RETURN_READ__();return r.directoryOpen||r.directoryError||r.frame?.error;},{},{timeout:12000}),page.waitForTimeout(12000)]).catch(()=>{});
  report.observed=await page.evaluate(()=>window.__DIRECTORY_RETURN_READ__());await shot('03-return-observed');
  const after=await facts();for(const key of Object.keys(before))assert.deepEqual(after[key],before[key],key+' unchanged');
  report.factsUnchanged=true;report.messageCounts=Object.fromEntries(Object.entries(after.messages).map(([id,rows])=>[id,rows.length]));report.markerIds=after.markers.map(row=>row.id);
  assert.deepEqual(report.blocked,[]);assert.deepEqual(report.pageErrors,[]);report.diagnosticCompleted=true;
}catch(error){report.failure=error.stack;process.exitCode=1;if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}
finally{if(page)report.trace=await page.evaluate(()=>window.__DIRECTORY_RETURN_TRACE__??[]).catch(()=>[]);await browser?.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({diagnosticCompleted:report.diagnosticCompleted,stage,observed:report.observed,report:path.join(out,'report.json'),failure:report.failure,traceRows:report.trace.length,markerIds:report.markerIds},null,2));}
