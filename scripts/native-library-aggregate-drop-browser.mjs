import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {currentGen2Root} from '../lab/current-gen2-resources.mjs';
const origin='http://127.0.0.1:56241',projectId='disposable-surface-core-facade',project='/api/lcos/core/projects/'+projectId;
const output=path.resolve(import.meta.dirname,'../output/原库整体对象Drop_20261020/'+new Date().toISOString().replace(/[:.]/g,'-'));
await mkdir(output,{recursive:true});
const report={passed:false,origin,output,checks:[],fixtureWrites:[],mutations:[],pageErrors:[],screenshots:[],models:0,storeInjection:false};
const get=async address=>{const r=await fetch(origin+address,{cache:'no-store',redirect:'error'}),v=await r.json();assert.ok(r.ok&&v.ok===true||r.ok&&v.code===0,address);return v.value??v.data;};
const health=await(await fetch(origin+'/health')).json();assert.equal(health.runtimeLabel,'isolated-node-carry-20261020');
const fixture=JSON.parse(await readFile(path.resolve(import.meta.dirname,'../output/原生节点Drop集合_20261020/fixture.json'),'utf8'));
const warehouse=await get(project+'/warehouse?kinds=context,workflow,collection&limit=100');
const contextItem=warehouse.items.find(x=>x.kind==='context'),method=warehouse.items.find(x=>x.kind==='workflow');assert.ok(contextItem&&method);
const collection=warehouse.items.find(x=>x.kind==='collection'&&x.entityRef.id===fixture.collectionId);assert.ok(collection);
const methodId='presentation:workflow:'+method.entityRef.id;
const presentations=await get(project+'/presentations');
if(!presentations.some(p=>p.id===methodId)){
 const workflow=await get('/api/canvas/v1/canvases/surface-core-workflow'),material=workflow.nodes.find(n=>n.id==='surface-workflow-text');assert.ok(material?.data?.lcos_ref?.artifactViewId);
 const now=new Date().toISOString(),viewId=material.data.lcos_ref.artifactViewId;
 const contract={schemaVersion:0,id:methodId,projectId,scopeId:method.entityRef.id,capability:'workflow',renderer:'workflow',version:0,updatedBy:'agent',createdAt:now,updatedAt:now,
  state:{memberViewIds:[viewId],hiddenViewIds:[],positions:{},hierarchy:{parentByViewId:{},orderByParent:{}},presentationEdges:[],pinnedViewIds:[],emphasisByViewId:{},workflowOperators:{},
   workflowActions:[{id:'drop-read',label:'核对拖放方法',description:'人工合成方法，只加入草稿，不运行模型。',attachedViewIds:[viewId],x:0,y:0}],workflowActionEdges:[]}};
 const r=await fetch(origin+project+'/presentations/'+encodeURIComponent(methodId),{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({contract,expectedVersion:0})});assert.equal(r.status,200);report.fixtureWrites.push({id:methodId,kind:'synthetic workflow method'});
}
const beforeGraph=await get(project+'/graph'),beforeRuns=await get(project+'/runs'),beforeCanvas=await get('/api/canvas/v1/canvases/surface-core-main');
const geometry=c=>c.nodes.map(n=>({id:n.id,position:n.position,parent:n.parentId??n.parent_id??null})).sort((a,b)=>a.id.localeCompare(b.id));
const {chromium}=createRequire(path.join(currentGen2Root,'package.json'))('playwright-core');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-networking','--no-first-run']});let page;
try{
 const context=await browser.newContext({viewport:{width:1550,height:1050},locale:'zh-CN',serviceWorkers:'block'});
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());if(['http:','https:'].includes(u.protocol)&&u.origin!==origin)return route.abort();
  if(req.method()==='POST'&&/\/runs(?:$|\/)|collaboration-send|conversation-continuations|agent\/gateway/.test(u.pathname))return route.abort();
  if(!['GET','HEAD','OPTIONS'].includes(req.method()))report.mutations.push({method:req.method(),path:u.pathname,body:req.postData()});
  if(u.pathname==='/lcos/agent-ui.js'){
   const response=await route.fetch(),body=await response.text();assert.ok(body.includes('useLcosDropStore ='));
   return route.fulfill({response,body:body+'\nwindow.__AGGREGATE_DROP_READ__=()=>{const s=useLcosDropStore.getState();return{state:s.state,resolution:s.resolution,feedback:s.feedback,draft:useLcosReferenceStore.getState().draft,prompt:useLcosShellStore.getState().composerPrompt}};'});
  }return route.continue();
 });
 await context.routeWebSocket('**/*',s=>s.close());page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>report.pageErrors.push(String(e)));
 const shot=async name=>{const file=path.join(output,name+'.png');await page.screenshot({path:file});report.screenshots.push(file);};
 const read=()=>page.evaluate(()=>window.__AGGREGATE_DROP_READ__());
 await page.goto(origin+'/canvas/surface-core-main',{waitUntil:'domcontentloaded'});
 await page.locator('[data-lcos-professional-surface-state="ready"]').waitFor({state:'attached',timeout:60000});
 await page.getByTestId('common-loading-overlay').waitFor({state:'hidden',timeout:60000});
 await page.evaluate(()=>window.__LCOS_NODE_LAB__.api.fitView({padding:.25,duration:0}));
 const input=page.getByRole('textbox',{name:'Composer 输入',exact:true});await input.fill('原草稿继续保留。');
 await page.getByTestId('canvas-dockbar-assets-btn').click();const library=page.locator('[data-library-view="library"]');await library.waitFor();
 async function source(item){await library.getByRole('textbox',{name:'搜索',exact:true}).fill(item.title);const button=library.getByRole('button',{name:item.title,exact:true});await button.waitFor();const row=button.locator('xpath=ancestor::div[@draggable="true"][1]');assert.equal(await row.count(),1);return row;}
 async function drag(item,to,label){
  const row=await source(item),a=await row.boundingBox(),previous=(await read()).feedback?.receipt.transactionId;assert.ok(a);
  await page.mouse.move(a.x+Math.min(95,a.width/2),a.y+a.height/2);await page.mouse.down();await page.mouse.move(a.x+Math.min(95,a.width/2)+25,a.y+a.height/2,{steps:5});await page.mouse.move(to.x,to.y,{steps:20});await page.waitForTimeout(650);await page.mouse.move(to.x+1,to.y+1,{steps:2});await page.waitForTimeout(150);
  const hover=await read();report[label+'Hover']=hover;await shot(label+'-hover');assert.equal(hover.state.status,'preview');assert.equal(hover.resolution.status,'ready');assert.equal(hover.state.payload.sourceRef.kind,item.kind);assert.equal(hover.state.payload.sourceRef.id,item.entityRef.id);
  await page.mouse.up();await page.waitForFunction(previous=>{const f=window.__AGGREGATE_DROP_READ__().feedback;return f&&f.receipt.transactionId!==previous;},previous,{timeout:45000});const result=await read();report[label+'Result']=result;assert.equal(result.feedback.receipt.status,'success',JSON.stringify(result.feedback));await shot(label+'-success');return result;
 }
 const composer=await page.locator('[data-lcos-composer-reference-surface]').boundingBox();assert.ok(composer);
 const methodResult=await drag(method,{x:composer.x+composer.width/2,y:composer.y+composer.height/2},'01-workflow-to-input');
 assert.ok(methodResult.prompt.startsWith('原草稿继续保留。')&&methodResult.prompt.includes('核对拖放方法'));assert.ok(methodResult.draft.orderedEntityRefs.length>0);report.checks.push('Original Library Workflow row physically drags to existing Composer; real method steps + exact refs append to preserved unsent input');
 assert.ok(!methodResult.prompt.includes(projectId)&&!methodResult.prompt.includes(method.entityRef.id)&&!methodResult.prompt.includes(methodId),'Generated source IDs do not leak into the visible method draft');
 const prompt=methodResult.prompt;
 if(!process.argv.includes('--method-only')){
 const pile=page.locator('.react-flow__node[data-id="'+fixture.carrierId+'"]'),b=await pile.boundingBox();assert.ok(b);
 const point={x:b.x+b.width/2,y:b.y+b.height/2};
 assert.equal(await page.evaluate(p=>document.elementFromPoint(p.x,p.y)?.closest('.react-flow__node')?.getAttribute('data-id'),point),fixture.carrierId,'real target exposed');
 await drag(contextItem,point,'02-context-to-collection');const members=await get(project+'/collections/'+fixture.collectionId+'/members');assert.ok(members.members.some(m=>m.memberRef.type==='scope'&&m.memberRef.id===contextItem.entityRef.id));assert.equal((await read()).prompt,prompt);
 report.checks.push('Whole Context goes to real Collection membership as one Scope; no member expansion or prompt overwrite');
 await drag(method,point,'03-workflow-to-collection');const methodMembers=await get(project+'/collections/'+fixture.collectionId+'/members');assert.ok(methodMembers.members.some(m=>m.memberRef.type==='scope'&&m.memberRef.id===method.entityRef.id));report.checks.push('Same Workflow source dropped on Collection stores one method Scope, distinct from use-in-Composer');
 }
 await page.reload({waitUntil:'domcontentloaded'});await page.locator('[data-lcos-professional-surface-state="ready"]').waitFor({state:'attached',timeout:60000});await page.getByTestId('common-loading-overlay').waitFor({state:'hidden',timeout:60000});
 assert.deepEqual(geometry(await get('/api/canvas/v1/canvases/surface-core-main')),geometry(beforeCanvas));const afterGraph=await get(project+'/graph');
 const {collectionMembers:beforeMembers,...beforeOther}=beforeGraph,{collectionMembers:afterMembers,...afterOther}=afterGraph;
 assert.deepEqual(afterOther,beforeOther,'Drop only changes the requested Collection membership, not other Core entities');
 const key=m=>m.collectionId+':'+m.memberRef.type+':'+m.memberRef.id;
 const allowed=new Set(process.argv.includes('--method-only')?[]:[contextItem,method].map(item=>fixture.collectionId+':scope:'+item.entityRef.id));
 for(const old of beforeMembers??[])assert.deepEqual((afterMembers??[]).find(m=>key(m)===key(old)),old,'Existing memberships stay intact');
 for(const added of afterMembers??[])if(!(beforeMembers??[]).some(m=>key(m)===key(added)))assert.ok(allowed.has(key(added)),'No unrelated membership created');assert.deepEqual(await get(project+'/runs'),beforeRuns);assert.deepEqual(report.pageErrors,[]);
 report.checks.push('Reload preserves source geometry and Runs; only requested Collection memberships may change');report.passed=true;
}catch(error){report.error=String(error.stack??error);if(page){await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});report.dom=await page.locator('body').innerText().catch(()=>null);report.state=await page.evaluate(()=>window.__AGGREGATE_DROP_READ__?.()).catch(()=>null);}process.exitCode=1;}
finally{await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify({passed:report.passed,checks:report.checks,error:report.error,output},null,2));}
