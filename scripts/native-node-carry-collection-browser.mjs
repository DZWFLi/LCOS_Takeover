import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { currentGen2Root } from '../lab/current-gen2-resources.mjs';
const origin='http://127.0.0.1:56241', canvasId='surface-core-main', projectId='disposable-surface-core-facade';
const output=path.resolve(import.meta.dirname,'../output/原生节点Drop集合_20261020');await mkdir(output,{recursive:true});
const request=async(route,init)=>{const r=await fetch(origin+route,{cache:'no-store',...init});const body=await r.json();assert.ok(r.ok,JSON.stringify(body));assert.ok(body.ok===true||body.code===0);return body.value??body.data;};
const health=await (await fetch(origin+'/health')).json();assert.equal(health.runtimeLabel,'isolated-node-carry-20261020');
const project='/api/lcos/core/projects/'+projectId, canvasPath='/api/canvas/v1/canvases/'+canvasId;
const post=(url,body)=>request(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
let fixture;try{fixture=JSON.parse(await readFile(path.join(output,'fixture.json'),'utf8'));}catch{}
if(!fixture){const col=await post(project+'/collections',{title:'右拖集合实测 · 20261020',members:[]});
const projection=await post('/api/lcos/canvases/'+canvasId+'/collections:project',{collectionId:col.id,position:{x:950,y:160}});
assert.equal(projection.state,'present');fixture={collectionId:col.id,carrierId:projection.node.id};await writeFile(path.join(output,'fixture.json'),JSON.stringify(fixture,null,2));}
const membersPath=project+'/collections/'+fixture.collectionId+'/members';
const resetMembers=await request(membersPath);
for(const row of resetMembers.members) await request(membersPath,{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({memberType:row.memberRef.type,memberId:row.memberRef.id})});

const report={at:new Date().toISOString(),origin,runtimeLabel:health.runtimeLabel,fixture,checks:[],writes:[],errors:[],consoleErrors:[],screenshots:[],passed:false,mode:'real original browser mouse; canonical isolated fixture; no Drop store injection; no Run/provider'};
const {chromium}=createRequire(path.join(currentGen2Root,'package.json'))('playwright-core');
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--disable-background-networking','--no-first-run']});
let page;
try{
const context=await browser.newContext({viewport:{width:1500,height:1050},locale:'zh-CN',serviceWorkers:'block'});
await context.route('**/*',route=>{const u=new URL(route.request().url());if(['http:','https:'].includes(u.protocol)&&u.origin!==origin)return route.abort();return route.continue();});
await context.routeWebSocket('**/*',ws=>{if(new URL(ws.url()).origin.replace(/^ws/,'http')!==origin)ws.close();else ws.connectToServer();});
page=await context.newPage();page.on('pageerror',e=>report.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text())});page.on('response',r=>{if(r.status()>=500&&r.status()!==501)report.errors.push('HTTP '+r.status()+' '+r.url())});
page.on('request',req=>{if(['POST','PUT','PATCH','DELETE'].includes(req.method()))report.writes.push({method:req.method(),url:new URL(req.url()).pathname,body:req.postData()});});
await page.goto(origin+'/canvas/'+canvasId,{waitUntil:'domcontentloaded'});
await page.waitForFunction(()=>!!window.__LCOS_NODE_LAB__?.api?.getNodes?.().length,undefined,{timeout:25000});
const sourceSelector='.react-flow__node[data-id="surface-main-image"]';
const targetSelector='.react-flow__node[data-id="'+fixture.carrierId+'"]';
await page.locator(sourceSelector).waitFor();await page.locator(targetSelector).waitFor();await page.locator('[data-lcos-professional-surface-state="ready"]').waitFor({state:'attached',timeout:30000});
await page.evaluate(()=>window.__LCOS_NODE_LAB__.api.fitView({padding:0.25,duration:0}));await page.waitForTimeout(500);
const before=await request(canvasPath);report.beforeMembers=await request(membersPath);
const source=before.nodes.find(n=>n.id==='surface-main-image'), artifactId=source.data.lcos_ref.artifactId;
const sourceGeometry=()=>({position:source.position,parent:source.parentId??source.parent_id??null});
report.sourceBefore=sourceGeometry();
const screenshot=async name=>{const dest=path.join(output,name+'.png');await page.screenshot({path:dest,fullPage:true});report.screenshots.push(dest);};
await page.getByTestId('common-loading-overlay').waitFor({state:'hidden',timeout:30000});await screenshot('01-before');
async function drag(name){const a=await page.locator(sourceSelector).boundingBox(),b=await page.locator(targetSelector).boundingBox();assert.ok(a&&b);
const from={x:a.x+a.width/2,y:a.y+a.height/2},to={x:b.x+b.width/2,y:b.y+b.height/2};report[name]={from,to};report[name].diagnostics=await page.evaluate(async ({from})=>{const mod=await import('/lcos/agent-ui.js');const a=document.querySelector('.react-flow__node[data-id="surface-main-image"]');const hit=document.elementFromPoint(from.x,from.y);return {inspection:mod.inspectNativeCollectionLanding(),sourceClass:a?.className,hit:hit?.outerHTML.slice(0,450),closestNode:hit?.closest('.react-flow__node')?.getAttribute('data-id'),selection:window.__LCOS_NODE_LAB__?.api.getSelection(),scope:{projectId:window.__LCOS_NODE_LAB__?.projectId,canvasId:window.__LCOS_NODE_LAB__?.currentCanvasId}}},{from});
assert.equal(report[name].diagnostics.closestNode,'surface-main-image','physical pointer must hit actual source after original loading mask exits');await page.mouse.move(from.x,from.y);await page.mouse.down({button:'right'});await page.mouse.move(from.x+12,from.y+9,{steps:3});await page.mouse.move(to.x,to.y,{steps:20});await page.waitForTimeout(700);await screenshot(name+'-hover');await page.mouse.up({button:'right'});}
await drag('02-first');
let matching;
for(let i=0;i<80;i++){matching=(await request(membersPath)).members.filter(m=>m.memberRef.type==='artifact'&&m.memberRef.id===artifactId);if(matching.length===1)break;await page.waitForTimeout(100);}
report.afterMembers=await request(membersPath);
report.visible=await page.locator('body').innerText();
report.live=await page.evaluate(id=>window.__LCOS_NODE_LAB__.api.getNodes().find(n=>n.id===id),fixture.carrierId);
await screenshot('03-after');
assert.equal(matching.length,1,'real right carry must reach Collection member owner');
await page.waitForFunction(({id,member})=>window.__LCOS_NODE_LAB__.api.getNodes().find(n=>n.id===id)?.data?.memberIds?.includes(member),{id:fixture.carrierId,member:'surface-main-image'},{timeout:10000});
const after=await request(canvasPath),sourceAfter=after.nodes.find(n=>n.id===source.id);
assert.deepEqual({position:sourceAfter.position,parent:sourceAfter.parentId??sourceAfter.parent_id??null},report.sourceBefore);
report.checks.push('right mouse carry updates canonical collection and original pile memberIds while source stays');
const countBefore=after.nodes.length;await drag('04-repeat');await page.waitForTimeout(1100);
const repeated=await request(membersPath),repeatCanvas=await request(canvasPath);
assert.equal(repeated.members.filter(m=>m.memberRef.type==='artifact'&&m.memberRef.id===artifactId).length,1);
assert.equal(repeatCanvas.nodes.length,countBefore);
assert.deepEqual(repeatCanvas.nodes.find(n=>n.id===source.id).position,source.position);
report.checks.push('repeat carry dedupes membership and creates no node copy');
await page.locator('[data-pile-node="'+fixture.carrierId+'"]').click();
const gallery=page.locator('[role="dialog"][data-pile-gallery-phase="open"]');await gallery.waitFor({state:'visible'});
assert.ok((await gallery.locator('[data-pile-gallery-item]').evaluateAll(elements=>elements.map(e=>e.getAttribute('data-pile-gallery-item')))).includes(source.id));
await screenshot('05-gallery-exact-member');await page.keyboard.press('Escape');await gallery.waitFor({state:'hidden'});await page.locator('[role=dialog][data-pile-gallery-phase]').waitFor({state:'hidden',timeout:15000});
const exposedSource=await page.locator(sourceSelector).evaluate(element=>{const r=element.getBoundingClientRect();return {className:element.className,id:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('.react-flow__node')?.getAttribute('data-id')}});
assert.equal(exposedSource.id,source.id);assert.ok(exposedSource.className.includes('draggable'));report.checks.push('original Gallery open/close retains the source visible and draggable at its actual position');

const editor=page.locator('[data-lcos-composer-input]').first();
await editor.waitFor({state:'visible',timeout:10000});
const composer=page.locator('[data-lcos-composer-reference-surface]').first();
const beforeRefs=await page.locator('[data-lcos-composer-ref]').count();
const collectionBox=await page.locator(targetSelector).boundingBox(), composerBox=await composer.boundingBox();assert.ok(collectionBox&&composerBox);
await page.mouse.move(collectionBox.x+collectionBox.width/2,collectionBox.y+collectionBox.height/2);
await page.mouse.down({button:'right'});await page.mouse.move(collectionBox.x+collectionBox.width/2+12,collectionBox.y+collectionBox.height/2,{steps:3});
await page.mouse.move(composerBox.x+composerBox.width/2,composerBox.y+composerBox.height/2,{steps:20});await page.waitForTimeout(700);await page.mouse.up({button:'right'});
await page.waitForFunction(count=>document.querySelectorAll('[data-lcos-composer-ref]').length===count+1,beforeRefs,{timeout:10000});
const refKeys=await page.locator('[data-lcos-composer-ref]').evaluateAll(elements=>elements.map(element=>element.getAttribute('data-reference-key')));
assert.ok(refKeys.some(key=>key?.includes(fixture.collectionId)),'aggregate Collection itself is referenced');
report.composerReferenceKeys=refKeys;report.checks.push('Collection right-carry to Composer adds one whole Collection reference, not its members');
await screenshot('05-repeat-complete');
await page.reload({waitUntil:'domcontentloaded'});
await page.locator('[data-lcos-professional-surface-state="ready"]').waitFor({state:'attached',timeout:30000});
await page.getByTestId('common-loading-overlay').waitFor({state:'hidden',timeout:30000});
await page.locator(sourceSelector).waitFor({state:'visible'});
const reloadedSource=await page.locator(sourceSelector).evaluate(element=>{const r=element.getBoundingClientRect();return {className:element.className,id:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('.react-flow__node')?.getAttribute('data-id')}});
assert.equal(reloadedSource.id,source.id);assert.ok(reloadedSource.className.includes('draggable'));
assert.equal((await request(membersPath)).members.filter(m=>m.memberRef.id===artifactId).length,1);
report.checks.push('full reload retains one canonical member and source remains independently draggable');
await screenshot('07-reload-source-still-present');

assert.equal(report.errors.length,0,JSON.stringify(report.errors));
assert.ok(!report.writes.some(x=>/\/runs(?:$|\/)|provider.*send/.test(x.url)));
report.passed=true;
}catch(error){if(page){try{await page.screenshot({path:path.join(output,'failure.png'),fullPage:true});report.failureBody=await page.locator('body').innerText();}catch{}}report.failure=String(error?.stack??error);process.exitCode=1;}finally{await browser.close();await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,failure:report.failure,output,checks:report.checks,errors:report.errors}));}
