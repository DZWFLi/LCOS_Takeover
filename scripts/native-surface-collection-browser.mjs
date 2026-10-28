import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { currentGen2Root } from '../lab/current-gen2-resources.mjs';
const origin='http://127.0.0.1:56241',projectId='disposable-surface-core-facade',sourceCanvasId='surface-core-main';
const project='/api/lcos/core/projects/'+projectId,output=path.resolve(import.meta.dirname,'../output/集合跨Dock真实GUI_20261020');
await mkdir(output,{recursive:true});
const report={passed:false,at:new Date().toISOString(),origin,checks:[],fixtureWrites:[],requests:[],responses:[],errors:[],consoleErrors:[],screenshots:[],fileReads:[],models:0,storeInjection:false};
const request=async(route,init)=>{const r=await fetch(origin+route,{cache:'no-store',redirect:'error',...init});const x=await r.json();assert.ok(r.ok,route+' '+JSON.stringify(x));assert.ok(x.ok===true||x.code===0);return x.value??x.data;};
const post=(route,body)=>request(route,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
const health=await(await fetch(origin+'/health')).json();assert.equal(health.runtimeLabel,'isolated-node-carry-20261020');report.health={runtimeLabel:health.runtimeLabel,pid:health.pid};
const fixture=JSON.parse(await readFile(path.resolve(import.meta.dirname,'../output/原生节点Drop集合_20261020/fixture.json'),'utf8'));
report.collection=fixture;
let unique;try{unique=JSON.parse(await readFile(path.join(output,'unique-text.json'),'utf8'));}catch{}
if(!unique){
 const graph=await request(project+'/graph'),root=graph.scopes.find(s=>s.kind==='root'&&s.projectId===projectId);assert.ok(root);
 const body='# 集合跨现场独有正文\n\nCOLLECTION_DOCK_UNPROJECTED_TEXT_20261020\n这段正文只属于集合，不要求先在每个目标画布摊开一个节点。';
 unique={...await post(project+'/text-artifacts',{scopeId:root.id,title:'集合专属正文 · 跨Dock 20261020',body}),body};
 await post(project+'/collections/'+fixture.collectionId+'/members',{memberType:'artifact',memberId:unique.artifactId});
 await writeFile(path.join(output,'unique-text.json'),JSON.stringify(unique,null,2));
 report.fixtureWrites.push({producer:'Core text-artifacts + Collections members',artifactId:unique.artifactId,collectionId:fixture.collectionId});
}
report.unique=unique;
const members=await request(project+'/collections/'+fixture.collectionId+'/members');assert.ok(members.members.some(m=>m.memberRef.id===unique.artifactId));
const canvasPath=id=>'/api/canvas/v1/canvases/'+id;
const projectionPath=id=>'/api/lcos/canvases/'+id+'/collections/'+fixture.collectionId+'/projection';
const canvases=await Promise.all(['main','context','workflow'].map(k=>request(canvasPath('surface-core-'+k))));
assert.ok(canvases.every(c=>!c.nodes.some(n=>n.data?.lcos_ref?.artifactId===unique.artifactId)),'unique member has no Canvas node');
report.beforeCanvases=Object.fromEntries(canvases.map(c=>[c.id,c]));
const signature=c=>c.nodes.map(n=>({id:n.id,position:n.position,parent:n.parentId??n.parent_id??null})).sort((a,b)=>a.id.localeCompare(b.id));
const sourceBefore=signature(report.beforeCanvases[sourceCanvasId]);
const {chromium}=createRequire(path.join(currentGen2Root,'package.json'))('playwright-core');
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--disable-background-networking','--no-first-run']});
let page,withheld=false;
try{
 const context=await browser.newContext({viewport:{width:1500,height:1050},locale:'zh-CN',serviceWorkers:'block'});
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());if(['http:','https:'].includes(u.protocol)&&u.origin!==origin)return route.abort();
  if(req.method()==='POST'&&/\/runs(?:$|\/)/.test(u.pathname))throw new Error('No Run may be submitted');
  if(req.method()==='POST'&&u.pathname==='/api/lcos/canvases/surface-core-workflow/collections:project'&&!withheld){
   const body=req.postDataJSON();if(body.collectionId===fixture.collectionId){
    const response=await route.fetch({maxRedirects:0});const value=await response.json();
    report.responses.push({path:u.pathname,status:response.status(),withheld:true,value});
    assert.ok(response.ok());withheld=true;await route.abort('failed');return;
   }
  }return route.continue();
 });
 await context.routeWebSocket('**/*',ws=>{if(new URL(ws.url()).origin.replace(/^ws/,'http')!==origin)ws.close();else ws.connectToServer();});
 page=await context.newPage();page.on('pageerror',e=>report.errors.push(String(e)));
 page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text());});
 page.on('request',r=>{const u=new URL(r.url());if(u.origin===origin&&(u.pathname.includes('/collections')||!['GET','HEAD','OPTIONS'].includes(r.method())))report.requests.push({method:r.method(),path:u.pathname,body:r.postData()});});
 page.on('response',async r=>{const u=new URL(r.url());if(u.origin===origin&&u.pathname.includes('/'+unique.fileRecordId+'/content'))try{report.fileReads.push({path:u.pathname,status:r.status(),body:await r.text()});}catch{}if(u.origin===origin&&u.pathname.includes('/collections'))try{report.responses.push({path:u.pathname,method:r.request().method(),status:r.status(),value:await r.json()});}catch{}});
 const shot=async name=>{const file=path.join(output,name+'.png');await page.screenshot({path:file,fullPage:true});report.screenshots.push(file);};
 const ready=async()=>{await page.locator('[data-lcos-professional-surface-state="ready"]').waitFor({state:'attached',timeout:45000});await page.getByTestId('common-loading-overlay').waitFor({state:'hidden',timeout:45000});};
 await page.goto(origin+'/canvas/'+sourceCanvasId,{waitUntil:'domcontentloaded'});await ready();
 await page.evaluate(()=>window.__LCOS_NODE_LAB__.api.fitView({padding:.25,duration:0}));await page.waitForTimeout(400);
 const sourceSelector='.react-flow__node[data-id="'+fixture.carrierId+'"]';
 await page.locator(sourceSelector).waitFor();await shot('01-source-collection');
 async function dragTo(surface,label){
  const a=await page.locator(sourceSelector).boundingBox(),dock=page.locator('[data-lcos-surface-dock] button[data-lcos-surface="'+surface+'"]'),b=await dock.boundingBox();assert.ok(a&&b);
  const from={x:a.x+a.width/2,y:a.y+a.height/2},to={x:b.x+b.width/2,y:b.y+b.height/2};
  const hit=await page.evaluate(p=>document.elementFromPoint(p.x,p.y)?.closest('.react-flow__node')?.getAttribute('data-id'),from);
  assert.equal(hit,fixture.carrierId,'actual source node must own pointer');
  await page.mouse.move(from.x,from.y);await page.mouse.down({button:'right'});await page.mouse.move(from.x+12,from.y+8,{steps:3});await page.mouse.move(to.x,to.y,{steps:24});await page.waitForTimeout(700);
  await shot(label+'-hover');await page.mouse.up({button:'right'});
  let receipt;
  for(let i=0;i<80;i++){receipt=await request(projectionPath('surface-core-'+surface));if(receipt.state==='present')break;await page.waitForTimeout(100);}
  assert.equal(receipt.state,'present','target Collection must persist');
  await page.waitForFunction(async()=>{const m=await import('/lcos/agent-ui.js');return m.inspectNativeCollectionLanding().dropStatus==='idle';},undefined,{timeout:15000});
  assert.equal(new URL(page.url()).pathname,'/canvas/'+sourceCanvasId,'drop does not navigate');
  assert.deepEqual(signature(await request(canvasPath(sourceCanvasId))),sourceBefore,'source geometry remains exact');
  const live=await page.locator(sourceSelector).evaluate(e=>{const r=e.getBoundingClientRect();return {className:e.className,id:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('.react-flow__node')?.getAttribute('data-id')};});
  assert.equal(live.id,fixture.carrierId);assert.ok(live.className.includes('draggable'));
  await shot(label+'-receipt');return receipt;
 }
 const contextReceipt=await dragTo('context','02-context');report.contextReceipt=contextReceipt;
 const contextAfter=await request(canvasPath('surface-core-context'));
 assert.equal(contextAfter.nodes.filter(n=>n.data?.lcos_collection_ref?.collectionId===fixture.collectionId).length,1);
 assert.equal(contextAfter.nodes.length,report.beforeCanvases['surface-core-context'].nodes.length+(report.beforeCanvases['surface-core-context'].nodes.some(n=>n.data?.lcos_collection_ref?.collectionId===fixture.collectionId)?0:1));
 report.checks.push('real Collection right-drag to Context persists one aggregate; no navigation or source movement');
 const postsBefore=report.requests.filter(r=>r.method==='POST'&&r.path.endsWith('/collections:project')).length;
 await dragTo('context','03-context-repeat');
 assert.equal(report.requests.filter(r=>r.method==='POST'&&r.path.endsWith('/collections:project')).length,postsBefore,'repeat uses GET, not a second producer');
 report.checks.push('Context repeat reuses the same target carrier, GET only');
 const workflowReceipt=await dragTo('workflow','04-workflow');report.workflowReceipt=workflowReceipt;
 assert.equal((await request(canvasPath('surface-core-workflow'))).nodes.filter(n=>n.data?.lcos_collection_ref?.collectionId===fixture.collectionId).length,1);
 if(withheld){assert.equal(report.requests.filter(r=>r.method==='POST'&&r.path==='/api/lcos/canvases/surface-core-workflow/collections:project').length,1);report.checks.push('real successful Workflow POST response lost; GET-only recovery confirms without producer replay');}
 else report.checks.push('Workflow already-present fixture reused without a new POST');
 for(const [surface,receipt]of[['context',contextReceipt],['workflow',workflowReceipt]]){
  await page.locator('[data-lcos-surface-dock] button[data-lcos-surface="'+surface+'"]').click();
  await page.waitForURL('**/canvas/surface-core-'+surface);await ready();
  const pile=page.locator('[data-pile-node="'+receipt.node.id+'"]');await pile.waitFor({state:'visible'});
  await page.evaluate(()=>window.__LCOS_NODE_LAB__.api.fitView({padding:.25,duration:0}));await page.waitForTimeout(300);
  await pile.click();const gallery=page.locator('[role=dialog][data-pile-gallery-phase=open]');await gallery.waitFor({state:'visible'});
  const uniqueRow=gallery.locator('[data-native-collection-gallery-member="artifact:'+unique.artifactId+'"]');
  await uniqueRow.waitFor();assert.ok((await uniqueRow.innerText()).includes(unique.title));
  assert.ok((await gallery.locator('[data-native-collection-gallery-info]').innerText()).includes(members.members.length+' 个成员'));
  await shot('05-'+surface+'-complete-members');
  await uniqueRow.getByRole('button',{name:'查看',exact:true}).click();const viewer=page.locator('[data-media-viewer]');await viewer.waitFor({state:'visible'});await page.waitForFunction(async()=>(await import('/assets/course-api-base-url-CifxI1ia.js')).LCOSNativeMaterialViewerRuntime.getState().phase==='open',undefined,{timeout:20000});
  await page.locator('[data-lcos-native-text-reading]').waitFor();assert.ok((await page.locator('[data-lcos-native-text-reading]').innerText()).includes('COLLECTION_DOCK_UNPROJECTED_TEXT_20261020'));
  await shot('06-'+surface+'-unique-text');report.readerReturnControls??=[];report.readerReturnControls.push(await viewer.locator('header').getByRole('button',{name:/返回|Back/}).evaluate(e=>e.outerHTML));
await viewer.locator('header').getByRole('button',{name:/返回|Back/}).click();await viewer.waitFor({state:'hidden'});await gallery.waitFor({state:'visible'});
  await page.keyboard.press('Escape');await page.locator('[role=dialog][data-pile-gallery-phase]').waitFor({state:'hidden'});
  const after=await request(canvasPath('surface-core-'+surface));assert.ok(!after.nodes.some(n=>n.data?.lcos_ref?.artifactId===unique.artifactId),'reading must not fabricate text nodes');
  await page.reload({waitUntil:'domcontentloaded'});await ready();await page.locator('[data-pile-node="'+receipt.node.id+'"]').waitFor({state:'visible'});
  const reread=await request(projectionPath('surface-core-'+surface));assert.equal(reread.node.id,receipt.node.id);assert.equal(reread.collection_id,fixture.collectionId);
  assert.ok((await request(project+'/collections/'+fixture.collectionId+'/members')).members.some(m=>m.memberRef.id===unique.artifactId));
  await shot('07-'+surface+'-reload');
  report.checks.push(surface+': original Gallery lists whole Collection and reads unique unprojected text; reload retains same aggregate ID, no text nodes created');
 }
const workflowBefore=signature(await request(canvasPath('surface-core-workflow')));
const workflowNode=page.locator('.react-flow__node[data-id="'+workflowReceipt.node.id+'"]');
await page.evaluate(()=>window.__LCOS_NODE_LAB__.api.fitView({padding:.25,duration:0}));await page.waitForTimeout(350);
const a=await workflowNode.boundingBox(),b=await page.locator('[data-lcos-surface-dock] button[data-lcos-surface=main]').boundingBox();assert.ok(a&&b);
const postCount=report.requests.filter(r=>r.method==='POST'&&r.path.endsWith('/collections:project')).length;
await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down({button:'right'});await page.mouse.move(a.x+a.width/2+12,a.y+a.height/2+8,{steps:3});
await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:24});await page.waitForTimeout(700);await page.mouse.up({button:'right'});
await page.waitForFunction(async()=>{const m=await import('/lcos/agent-ui.js');return m.inspectNativeCollectionLanding().dropStatus==='idle';},undefined,{timeout:15000});
await page.waitForFunction(async()=>{const m=await import('/lcos/agent-ui.js');const d=m.inspectNativeCollectionLanding();return d.feedback?.status==='success'&&d.feedback?.message?.includes(' main');},undefined,{timeout:15000});const mainAgain=await request(projectionPath(sourceCanvasId));assert.equal(mainAgain.node.id,fixture.carrierId);
assert.equal(new URL(page.url()).pathname,'/canvas/surface-core-workflow');assert.equal(report.requests.filter(r=>r.method==='POST'&&r.path.endsWith('/collections:project')).length,postCount);
assert.deepEqual(signature(await request(canvasPath('surface-core-workflow'))),workflowBefore);
report.checks.push('Workflow Collection right-carry to Main reuses original aggregate by GET only; source stays and no auto-navigation');
await shot('08-workflow-to-main-existing');

 assert.deepEqual(signature(await request(canvasPath(sourceCanvasId))),sourceBefore);
 assert.equal(report.errors.length,0,JSON.stringify(report.errors));report.passed=true;
}catch(error){report.failure=String(error?.stack??error);process.exitCode=1;if(page)try{await page.screenshot({path:path.join(output,'failure.png'),fullPage:true});report.failureBody=await page.locator('body').innerText();}catch{}}
finally{report.withheldReply=withheld;await browser.close();await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,failure:report.failure,checks:report.checks,output}));}
