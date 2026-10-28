import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import{createRequire}from'node:module';
import{currentGen2Root}from'../lab/current-gen2-resources.mjs';
const origin=new URL(process.argv.find(v=>v.startsWith('--base-url='))?.slice(11)??'http://127.0.0.1:56311').origin;assert.equal(new URL(origin).hostname,'127.0.0.1');
const fixture=JSON.parse(await fs.readFile('output/Scope嵌套与跨现场_20261022/fixture.json','utf8'));assert.ok(fixture.cross);
const prefix='/api/lcos/core/projects/'+fixture.projectId,output=path.resolve('output/Scope嵌套与跨现场_20261022/跨现场真实页面/'+new Date().toISOString().replace(/[:.]/g,'-'));await fs.mkdir(output,{recursive:true});
const report={passed:false,origin,output,checks:[],writes:[],pageErrors:[],consoleErrors:[],httpErrors:[],screenshots:[],models:0,storeMutation:false};
const get=async p=>{const r=await fetch(origin+p,{redirect:'error',cache:'no-store'}),b=await r.json();assert.ok(r.ok&&(b.ok===true||b.code===0),p);return b.value??b.data;};
const facts=async()=>({graph:await get(prefix+'/graph'),presentations:await get(prefix+'/presentations'),runs:await get(prefix+'/runs'),
 canvases:await Promise.all(['main','context','workflow'].map(s=>get('/api/canvas/v1/canvases/surface-core-'+s)))});
const{chromium}=createRequire(path.join(currentGen2Root,'package.json'))('playwright-core'),browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-networking','--no-first-run']});let page;
let failNextWorkspaceRead=false;
try{
 const context=await browser.newContext({viewport:{width:1880,height:1120},locale:'zh-CN',serviceWorkers:'block'});
 await context.route('**/*',async route=>{const q=route.request(),u=new URL(q.url());if(['http:','https:'].includes(u.protocol)&&u.origin!==origin)return route.abort();
  if(!['GET','HEAD','OPTIONS'].includes(q.method())){report.writes.push({method:q.method(),path:u.pathname,body:q.postData()});if(/\/runs(?:$|\/)|collaboration-send|conversation-continuations|agent\/gateway/.test(u.pathname))return route.abort();}
  if(failNextWorkspaceRead&&q.method()==='GET'&&u.pathname===prefix+'/workspaces'){failNextWorkspaceRead=false;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({ok:false,error:{code:'TEST_READ_FAILURE',message:'One controlled return read failure'}})});}
  if(u.pathname==='/lcos/agent-ui.js'){const r=await route.fetch(),s=await r.text();return route.fulfill({response:r,body:s+`\nwindow.__CROSS_READ__=()=>{const s=useLcosShellStore.getState(),c=useCanvasStore.getState();return{projectId:s.projectId,canvasId:c.canvasId,status:c.status,viewport:c.rfInstance?.getViewport(),prompt:s.composerPrompt,caret:s.composerCaret,target:s.composerTarget,inputKey:composerInputKey(s.composerTarget),windows:s.windows,navigation:libraryNavigation?{phase:libraryNavigation.phase,error:libraryNavigation.error,root:libraryNavigation.root}:null}};`});}
  return route.continue();});await context.routeWebSocket('**/*',socket=>socket.close());page=await context.newPage();page.setDefaultTimeout(25000);page.on('pageerror',e=>report.pageErrors.push(String(e)));
 page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text().slice(0,1200));});page.on('response',r=>{if(r.status()>=400)report.httpErrors.push({status:r.status(),path:new URL(r.url()).pathname});});
 const read=()=>page.evaluate(()=>window.__CROSS_READ__());const shot=async name=>{const file=path.join(output,name+'.png');await page.screenshot({path:file});report.screenshots.push(file);};
 const preview=page.locator('.native-library-content-preview'),library=page.locator('[data-library-view="library"]');
 const row=title=>preview.getByRole('button',{name:'进入 '+title,exact:true});
 const waitCanvas=async id=>{await page.waitForFunction(id=>{const s=window.__CROSS_READ__?.();return s?.canvasId===id&&s.status==='ready';},id,{timeout:60000});await page.getByTestId('common-loading-overlay').waitFor({state:'hidden',timeout:60000});};
 await page.goto(origin+'/canvas/surface-core-main',{waitUntil:'domcontentloaded'});await waitCanvas('surface-core-main');const input=page.getByRole('textbox',{name:'Composer 输入',exact:true});await input.waitFor();
 const draft='跨现场返回仍用这份原输入。';await input.fill(draft);await input.evaluate(e=>e.setSelectionRange(2,6));await page.getByTestId('canvas-dockbar-assets-btn').click();
 const search=library.getByRole('textbox',{name:'搜索',exact:true});await search.fill(fixture.scopeTitle);await library.getByRole('button',{name:fixture.scopeTitle,exact:true}).click();await row(fixture.cross.context.name).waitFor();
 const before=await facts(),beforeUI=await read();report.beforeUI=beforeUI;const writeStart=report.writes.length;await shot('01-original-scope-workspace-entry');
 await row(fixture.cross.context.name).click();await waitCanvas(fixture.cross.context.canvasId);const originalBack=page.getByTestId('canvas-header-logo-button');
 await originalBack.getByRole('img').count();await page.getByRole('button',{name:'返回 '+fixture.scopeTitle,exact:true}).waitFor();await shot('02-context-native-header-back');
 await originalBack.click();await waitCanvas('surface-core-main');report.sourceArrived=await read();await shot('02b-source-arrived');await row(fixture.cross.context.name).waitFor();assert.equal(await search.inputValue(),fixture.scopeTitle);
 let returned=await read();report.firstReturn=returned;assert.equal(returned.prompt,draft);assert.equal(returned.inputKey,beforeUI.inputKey);assert.equal(returned.target.messageId,beforeUI.target.messageId);assert.equal(returned.target.continuationOperationId,beforeUI.target.continuationOperationId);assert.deepEqual([returned.caret.start,returned.caret.end],[2,6]);
 for(const key of ['x','y','zoom'])assert.ok(Math.abs(returned.viewport[key]-beforeUI.viewport[key])<.02,key);
 report.checks.push('Scope → 原 Ke 进入 Context 现场 → 顶部现有原返回按钮 → 原 Scope、搜索、输入所有者与相机');
 await row(fixture.outer.title).click();await row(fixture.inner.title).click();await row(fixture.cross.workflow.name).waitFor();await row(fixture.cross.workflow.name).click();await waitCanvas(fixture.cross.workflow.canvasId);
 await page.getByRole('button',{name:'返回 '+fixture.scopeTitle,exact:true}).waitFor();await shot('03-workflow-native-header-back');await originalBack.click();await waitCanvas('surface-core-main');
 await row(fixture.cross.workflow.name).waitFor();await preview.getByRole('button',{name:'返回 '+fixture.outer.title,exact:true}).waitFor();assert.equal(await search.inputValue(),fixture.scopeTitle);await shot('04-nested-path-restored');
 returned=await read();report.nestedReturn=returned;assert.equal(returned.prompt,draft);assert.equal(returned.inputKey,beforeUI.inputKey);assert.equal(returned.target.messageId,beforeUI.target.messageId);assert.equal(returned.target.continuationOperationId,beforeUI.target.continuationOperationId);assert.deepEqual([returned.caret.start,returned.caret.end],[2,6]);
 report.checks.push('Scope → 外层集合 → 内层集合 → 原 Ke 进入 Workflow → 原返回按钮恢复完整内层路径和刚才成员焦点');
 await page.setViewportSize({width:1040,height:760});await row(fixture.cross.workflow.name).click();await waitCanvas(fixture.cross.workflow.canvasId);await originalBack.click();await waitCanvas('surface-core-main');await row(fixture.cross.workflow.name).waitFor();await shot('05-narrow-returned-native-preview');
 report.checks.push('窄窗重复跨现场与返回可达，没有新建窗口／第二画布／第二个路由');
 await preview.getByRole('button',{name:'返回 '+fixture.outer.title,exact:true}).click();await preview.getByRole('button',{name:'返回 '+fixture.scopeTitle,exact:true}).click();await row(fixture.cross.context.name).waitFor();
 await page.keyboard.press('Escape');await preview.waitFor({state:'hidden'});await search.fill('');
 await library.getByText('已保存上下文',{exact:true}).click();await library.getByRole('button',{name:fixture.scopeTitle,exact:true}).waitFor();
 await library.getByRole('button',{name:fixture.scopeTitle,exact:true}).click();await row(fixture.cross.context.name).waitFor();await row(fixture.cross.context.name).click();await waitCanvas(fixture.cross.context.canvasId);
 failNextWorkspaceRead=true;await originalBack.click();await page.getByRole('button',{name:/暂时无法返回原内容.*请重试/}).waitFor();await page.getByText('暂时无法返回原内容，位置仍保留；请重试。',{exact:true}).waitFor();assert.equal((await read()).canvasId,fixture.cross.context.canvasId);await shot('06-return-read-failure-original-button');
 await originalBack.click();await waitCanvas('surface-core-main');await row(fixture.cross.context.name).waitFor();assert.equal(await search.inputValue(),'');await shot('07-folder-path-returned');
 report.checks.push('原分类树／空搜索入口跨现场返回会恢复已展开分类；单次真实返回 GET 503 留在当前现场，原按钮重试成功');
 const after=await facts();for(const key of ['presentations','runs'])assert.deepEqual(after[key],before[key]);
 for(const key of ['artifacts','artifactViews','artifactRevisions','fileRecords','notes','collections','collectionMemberships','scopes','workspaces'])assert.deepEqual(after.graph[key],before.graph[key],key);
 const geometry=canvas=>({nodes:canvas.nodes.map(n=>({id:n.id,type:n.type,position:n.position,width:n.width,height:n.height,measured:n.measured,parentId:n.parentId??n.parent_id})).sort((a,b)=>a.id.localeCompare(b.id)),edges:canvas.edges});
 assert.deepEqual(after.canvases.map(geometry),before.canvases.map(geometry));report.newWrites=report.writes.slice(writeStart);
 assert.equal(report.newWrites.filter(r=>r.path.startsWith('/api/lcos/core/')).length,0);assert.deepEqual(report.pageErrors,[]);
 report.checks.push('三现场几何与 Core 成员／材料／附注／Runs 不变；只经过原现场读取／显示协调，无领域写入或模型执行');report.passed=true;
}catch(error){report.error=String(error.stack??error);process.exitCode=1;if(page){await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});report.dom=await page.locator('body').innerText().catch(()=>null);report.ui=await page.evaluate(()=>window.__CROSS_READ__?.()).catch(()=>null);report.backTitle=await page.getByTestId('canvas-header-logo-button').getAttribute('title').catch(()=>null);}}
finally{await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));await page?.unrouteAll({behavior:'ignoreErrors'}).catch(()=>{});await browser.close();console.log(JSON.stringify({passed:report.passed,checks:report.checks,error:report.error,output},null,2));}
