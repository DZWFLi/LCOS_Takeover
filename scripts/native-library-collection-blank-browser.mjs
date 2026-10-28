import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {currentGen2Root} from '../lab/current-gen2-resources.mjs';
const origin='http://127.0.0.1:56241',projectId='disposable-surface-core-facade',project='/api/lcos/core/projects/'+projectId;
const output=path.resolve(import.meta.dirname,'../output/库集合放到原画布_20261020/'+new Date().toISOString().replace(/[:.]/g,'-'));await mkdir(output,{recursive:true});
const report={passed:false,origin,output,checks:[],fixtureWrites:[],requests:[],responses:[],pageErrors:[],consoleErrors:[],screenshots:[],storeInjection:false,models:0};
const get=async(address,init)=>{const r=await fetch(origin+address,{cache:'no-store',redirect:'error',...init}),v=await r.json();assert.ok(r.ok&&(v.ok===true||v.code===0),address+' '+JSON.stringify(v));return v.value??v.data;};
const health=await(await fetch(origin+'/health')).json();assert.equal(health.runtimeLabel,'isolated-node-carry-20261020');report.health={runtimeLabel:health.runtimeLabel,pid:health.pid};
const unique=JSON.parse(await readFile(path.resolve(import.meta.dirname,'../output/集合跨Dock真实GUI_20261020/unique-text.json'),'utf8'));
const initialMain=await get('/api/canvas/v1/canvases/surface-core-main'),image=initialMain.nodes.find(n=>n.type==='image'&&n.data?.lcos_ref?.artifactId);assert.ok(image);
const members=[{type:'artifact',id:image.data.lcos_ref.artifactId},{type:'artifact',id:unique.artifactId}];
const collection=await get(project+'/collections',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title:'原库整体落点 · '+new Date().toISOString(),members})});
report.collection=collection;report.fixtureWrites.push({producer:'Core Collections API only; no Canvas carrier/bootstrap',collectionId:collection.id,members});
const beforeGraph=await get(project+'/graph'),beforeRuns=await get(project+'/runs');
const shape=c=>c.nodes.map(n=>({id:n.id,position:n.position,parent:n.parentId??n.parent_id??null})).sort((a,b)=>a.id.localeCompare(b.id));
const before=Object.fromEntries(await Promise.all(['main','context','workflow'].map(async s=>[s,await get('/api/canvas/v1/canvases/surface-core-'+s)])));
report.beforeGeometry=Object.fromEntries(Object.entries(before).map(([s,c])=>[s,shape(c)]));
const {chromium}=createRequire(path.join(currentGen2Root,'package.json'))('playwright-core');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-networking','--no-first-run']});let page;
try{
 const context=await browser.newContext({viewport:{width:1550,height:1050},locale:'zh-CN',serviceWorkers:'block'});
 await context.route('**/*',async route=>{const r=route.request(),u=new URL(r.url());if(['http:','https:'].includes(u.protocol)&&u.origin!==origin)return route.abort();
  if(r.method()==='POST'&&/\/runs(?:$|\/)|collaboration-send|conversation-continuations|agent\/gateway/.test(u.pathname))throw new Error('No provider/Run execution');
  if(u.pathname==='/lcos/agent-ui.js'){const response=await route.fetch(),body=await response.text();assert.ok(body.includes('useLcosDropStore ='));return route.fulfill({response,body:body+'\nwindow.__COLLECTION_BLANK_READ__=()=>{const s=useLcosDropStore.getState();return{state:s.state,resolution:s.resolution,feedback:s.feedback}};'});}return route.continue();});
 await context.routeWebSocket('**/*',s=>s.close());page=await context.newPage();page.setDefaultTimeout(20000);
 page.on('pageerror',e=>report.pageErrors.push(String(e)));page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text());});
 page.on('request',r=>{const u=new URL(r.url());if(u.origin===origin&&(u.pathname.includes('/collections')||!['GET','HEAD','OPTIONS'].includes(r.method())))report.requests.push({method:r.method(),path:u.pathname,body:r.postData()});});
 page.on('response',async r=>{const u=new URL(r.url());if(u.origin===origin&&u.pathname.includes('/collections'))try{report.responses.push({path:u.pathname,method:r.request().method(),status:r.status(),value:await r.json()});}catch{}});
 const shot=async name=>{const file=path.join(output,name+'.png');await page.screenshot({path:file});report.screenshots.push(file);};
 const ready=async()=>{await page.locator('[data-lcos-professional-surface-state="ready"]').waitFor({state:'attached',timeout:60000});await page.getByTestId('common-loading-overlay').waitFor({state:'hidden',timeout:60000});};
 const read=()=>page.evaluate(()=>window.__COLLECTION_BLANK_READ__());
 const projection=s=>get('/api/lcos/canvases/surface-core-'+s+'/collections/'+collection.id+'/projection');
 for(const surface of ['main','context','workflow']){
  await page.goto(origin+'/canvas/surface-core-'+surface,{waitUntil:'domcontentloaded'});await ready();await page.evaluate(()=>window.__LCOS_NODE_LAB__.api.fitView({padding:.25,duration:0}));
  await page.getByTestId('canvas-dockbar-assets-btn').click();const library=page.locator('[data-library-view="library"]');await library.waitFor();
  await library.getByRole('textbox',{name:'搜索',exact:true}).fill(collection.title);const button=library.getByRole('button',{name:collection.title,exact:true});await button.waitFor();
  const row=button.locator('xpath=ancestor::div[@draggable="true"][1]');assert.equal(await row.count(),1);
  async function drop(label){
   const to=await page.evaluate(()=>{for(let y=200;y<800;y+=90)for(let x=1460;x>800;x-=90){const e=document.elementFromPoint(x,y);if(e?.classList.contains('react-flow__pane'))return{x,y};}return null;});assert.ok(to,'exposed actual Canvas background');
   const expected=await page.evaluate(p=>window.__LCOS_NODE_LAB__.api.screenToFlowPosition(p),to),a=await row.boundingBox(),previous=(await read()).feedback?.receipt.transactionId;assert.ok(a);
   await page.mouse.move(a.x+Math.min(95,a.width/2),a.y+a.height/2);await page.mouse.down();await page.mouse.move(a.x+Math.min(95,a.width/2)+25,a.y+a.height/2,{steps:5});await page.mouse.move(to.x,to.y,{steps:24});await page.waitForTimeout(500);
   const hover=await read();report[label+'Hover']=hover;assert.equal(hover.state.status,'preview');assert.equal(hover.resolution.status,'ready');assert.equal(hover.state.payload.sourceRef.kind,'collection');assert.equal(hover.state.payload.sourceRef.id,collection.id);await shot(label+'-hover');
   await page.mouse.up();await page.waitForFunction(previous=>{const f=window.__COLLECTION_BLANK_READ__().feedback;return f&&f.receipt.transactionId!==previous;},previous,{timeout:45000});const result=await read();report[label+'Result']=result;assert.equal(result.feedback.receipt.status,'success',JSON.stringify(result.feedback));
   const value=await projection(surface);assert.equal(value.state,'present');assert.equal(value.collection_id,collection.id);assert.equal(value.node.type,'pile');assert.equal(value.node.data.lcos_collection_ref.collectionId,collection.id);
   await page.locator('.react-flow__node[data-id="'+value.node.id+'"]').waitFor({state:'visible'});await shot(label+'-success');return{expected,value};
  }
  const first=await drop(surface+'-first');assert.ok(Math.abs(first.expected.x-first.value.node.position.x)<1&&Math.abs(first.expected.y-first.value.node.position.y)<1,'actual pointer position must own placement');report[surface+'Placement']={expected:first.expected,position:first.value.node.position,nodeId:first.value.node.id};
  const writes=()=>report.requests.filter(r=>r.method==='POST'&&r.path.endsWith('/collections:project')).length,writeCount=writes();const repeated=await drop(surface+'-repeat');assert.equal(writes(),writeCount);assert.equal(repeated.value.node.id,first.value.node.id);assert.deepEqual(repeated.value.node.position,first.value.node.position);
  const after=await get('/api/canvas/v1/canvases/surface-core-'+surface);assert.equal(after.nodes.length,before[surface].nodes.length+1);assert.deepEqual(shape({...after,nodes:after.nodes.filter(n=>n.id!==first.value.node.id)}),shape(before[surface]));
  report.checks.push(surface+': original Library mouse drag places whole Collection at actual released Canvas point; repeat is GET-only, one carrier, existing nodes unchanged');
  await page.reload({waitUntil:'domcontentloaded'});await ready();const reread=await projection(surface);assert.equal(reread.node.id,first.value.node.id);assert.deepEqual(reread.node.position,first.value.node.position);await page.evaluate(()=>window.__LCOS_NODE_LAB__.api.fitView({padding:.25,duration:0}));
  const pile=page.locator('[data-pile-node="'+first.value.node.id+'"]');await pile.waitFor();await pile.click();const gallery=page.locator('[role=dialog][data-pile-gallery-phase=open]');await gallery.waitFor();const textRow=gallery.locator('[data-native-collection-gallery-member="artifact:'+unique.artifactId+'"]');await textRow.waitFor();assert.ok((await gallery.locator('[data-native-collection-gallery-info]').innerText()).includes('2 个成员'));await shot(surface+'-reloaded-gallery');
  await textRow.getByRole('button',{name:'查看',exact:true}).click();const viewer=page.locator('[data-media-viewer]');await viewer.waitFor();await page.locator('[data-lcos-native-text-reading]').waitFor();assert.ok((await page.locator('[data-lcos-native-text-reading]').innerText()).includes('COLLECTION_DOCK_UNPROJECTED_TEXT_20261020'));await shot(surface+'-text-read');
  await page.keyboard.press('Escape');await viewer.waitFor({state:'hidden'});await gallery.waitFor({state:'visible'});await page.keyboard.press('Escape');await page.locator('[role=dialog][data-pile-gallery-phase]').waitFor({state:'hidden'});
  report.checks.push(surface+': reload retains same whole Collection; unique unprojected member opens original Reader; Escape returns to Gallery then Canvas');
 }
 const finalGraph=await get(project+'/graph');for(const key of ['artifacts','artifactRevisions','fileRecords','collections','collectionMemberships'])assert.deepEqual(finalGraph[key],beforeGraph[key],key+' must not duplicate');assert.deepEqual(await get(project+'/runs'),beforeRuns);assert.equal(report.pageErrors.length,0);report.passed=true;
}catch(error){report.error=String(error.stack??error);if(page){await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});report.dom=await page.locator('body').innerText().catch(()=>null);report.state=await page.evaluate(()=>window.__COLLECTION_BLANK_READ__?.()).catch(()=>null);}process.exitCode=1;}
finally{await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify({passed:report.passed,checks:report.checks,error:report.error,output},null,2));}
