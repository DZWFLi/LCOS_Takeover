import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {isDeepStrictEqual as equal} from 'node:util';
import {currentGen2Root} from '../lab/current-gen2-resources.mjs';
const origin='http://127.0.0.1:56311',project='disposable-surface-core-facade',scope='scope-surface-core-workflow',canvas='surface-core-main',prefix='/api/lcos/core/projects/'+project;
const output=path.resolve('output/原方法移除恢复_20261023/实屏',new Date().toISOString().replaceAll(':','-'));await fs.mkdir(output,{recursive:true});
const get=async route=>{const r=await fetch(origin+route);assert.ok(r.ok);const d=await r.json();return d.value??d.data??d};
const before={graph:await get(prefix+'/graph'),views:await get(prefix+'/presentations'),canvas:await get('/api/canvas/v1/canvases/'+canvas),conversations:await get(prefix+'/connected-conversations')};
const originalScope=before.graph.scopes.find(s=>s.id===scope);assert.ok(originalScope&&!originalScope.archivedAt);
const report={passed:false,output,scope,checks:[],writes:[],errors:[],screenshots:[]};
const {chromium}=createRequire(path.join(currentGen2Root,'package.json'))('playwright-core');let browser,page,failArchive=true,loseArchiveResponse=true,ownedVersion;
try{
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-networking','--disable-sync','--no-first-run']});
 const context=await browser.newContext({viewport:{width:1500,height:1000},locale:'zh-CN',serviceWorkers:'block'});
 await context.route('**/*',async route=>{const r=route.request(),u=new URL(r.url());if(u.origin!==origin)return route.abort();
  if(!['GET','HEAD','OPTIONS'].includes(r.method())){
   const body=r.postDataJSON();let permitted=u.pathname==='/api/events'||u.pathname.endsWith('/execution:reconcile');
   if(u.pathname.endsWith('/nodes:batchActions'))permitted=!body.lcos_operation&&body.actions?.every(a=>a.action==='update'&&a.updates?.every(n=>{const old=before.canvas.nodes.find(x=>x.id===n.id);return old&&equal(old.position,n.position)&&equal(old.data,n.data)}));
   const life=r.method()==='POST'&&[prefix+'/workflow/methods/'+scope+'/archive',prefix+'/workflow/methods/'+scope+'/restore'].includes(u.pathname);
   if(life)permitted=Object.keys(body).length===1&&Number.isInteger(body.expectedVersion);
   const row={path:u.pathname,permitted};report.writes.push(row);if(!permitted)return route.abort();
   if(life){row.body=body;
    if(u.pathname.endsWith('/archive')&&failArchive){failArchive=false;row.injectedRejected=true;return route.fulfill({status:503,contentType:'application/json',body:'{"ok":false,"error":{"code":"UNAVAILABLE","message":"injected rejected archive"}}'});}
    if(u.pathname.endsWith('/archive')&&loseArchiveResponse){loseArchiveResponse=false;const real=await route.fetch();assert.equal(real.status(),200);const json=await real.json();ownedVersion=json.value.scope.lifecycleVersion;row.realCommitResponseHidden=true;return route.fulfill({status:503,contentType:'application/json',body:'{"ok":false,"error":{"code":"UNAVAILABLE","message":"injected lost response"}}'});}
   }
  }
  if(u.pathname==='/lcos/agent-ui.js'){const response=await route.fetch({timeout:120000});return route.fulfill({response,body:await response.text()+'\nwindow.__LIFE_READ__=()=>{const s=useLcosShellStore.getState();return{target:s.composerTarget,prompt:s.composerPrompt,windows:s.windows,refs:useLcosReferenceStore.getState().draft.orderedEntityRefs}};'});}
  return route.continue();
 });await context.routeWebSocket('**/*',socket=>socket.close());
 page=await context.newPage();page.setDefaultTimeout(25000);page.on('pageerror',e=>report.errors.push(String(e)));
 const shot=async name=>{await page.waitForTimeout(400);const file=path.join(output,name+'.png');await page.screenshot({path:file});report.screenshots.push(file);await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));};
 const ready=async()=>{await page.locator('[data-lcos-professional-surface-state=ready]').waitFor({state:'attached',timeout:120000})};
 const open=async()=>{await page.getByTestId('canvas-dockbar-workflow-btn').click();const guide=page.getByRole('button',{name:'知道了',exact:true});if(await guide.isVisible())await guide.click();await page.getByRole('button',{name:'浏览全部',exact:true}).click();};
 await page.goto(origin+'/canvas/'+canvas,{waitUntil:'domcontentloaded',timeout:120000});await ready();
 const input=page.getByRole('textbox',{name:'Composer 输入',exact:true});await input.fill('移除与恢复不改这份原输入。');const ui=await page.evaluate(()=>window.__LIFE_READ__());
 await open();const gallery=page.locator('[data-native-workflow-gallery]'),card=gallery.locator('[data-native-method-id="'+scope+'"]');await card.waitFor();
 await page.waitForFunction(()=>[...document.querySelectorAll('[data-native-method-id] img')].every(e=>e.complete&&e.naturalWidth>0));await card.hover();
 await card.getByRole('button',{name:'移除方法 合成 Workflow',exact:true}).click();await card.locator('[data-native-method-removal]').waitFor();
 await shot('01-original-inline-remove-confirmation');await card.getByRole('button',{name:'取消移除方法',exact:true}).click();assert.deepEqual(await get(prefix+'/graph'),before.graph);
 await card.hover();await card.getByRole('button',{name:'移除方法 合成 Workflow',exact:true}).click();await card.getByRole('button',{name:'确认移除方法',exact:true}).click();
 await page.getByText('移除或恢复尚未确认，内容保留；请重新读取后核对。',{exact:true}).waitFor();assert.equal(await card.isVisible(),true);assert.deepEqual(await get(prefix+'/graph'),before.graph);
 assert.equal(report.writes.filter(r=>r.path.endsWith('/archive')).length,1);await shot('02-failed-removal-keeps-card');
 await card.getByRole('button',{name:'确认移除方法',exact:true}).click();await card.waitFor({state:'hidden'});assert.equal(report.writes.filter(r=>r.path.endsWith('/archive')).length,2);
 await page.getByText('移除或恢复尚未确认，内容保留；请重新读取后核对。',{exact:true}).waitFor({state:'hidden'});
 const archived=(await get(prefix+'/graph')).scopes.find(s=>s.id===scope);assert.ok(archived.archivedAt);assert.equal(archived.lifecycleVersion,originalScope.lifecycleVersion+1);
 const dropResponse=await fetch(origin+prefix+'/assembly/apply',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({schemaVersion:1,projectId:project,targetRef:{kind:'workflow',id:scope},sourceRefs:[{kind:'capture',id:'explicit-unmaterialized-lifecycle-check'}]})});
 assert.equal(dropResponse.status,200);const dropData=await dropResponse.json();assert.equal(dropData.value.allApplied,false);assert.ok(dropData.value.results.every(row=>row.status==='failed'&&row.message.includes('方法已移除')));report.archivedDrop=dropData.value;
 assert.deepEqual(await page.evaluate(()=>window.__LIFE_READ__()),ui);report.checks.push('Original inline confirmation Cancel writes nothing; failed removal keeps card; real commit with hidden response is read back once, no replay, original input unchanged. Live Core also rejects old Capture Drop before materialization.');
 await page.keyboard.press('Escape');await gallery.waitFor({state:'hidden'});await page.keyboard.press('Escape');
 await page.getByTestId('canvas-dockbar-assets-btn').click();const library=page.locator('[data-library-view="library"]');await library.getByRole('textbox',{name:'搜索',exact:true}).fill('合成');
 await library.getByRole('button',{name:'合成 Saved Context',exact:true}).click();const preview=page.locator('.native-library-content-preview');
 await preview.getByRole('button',{name:'进入 合成 Workflow',exact:true}).click();await page.locator('[data-native-library-method-preview]').waitFor();
 assert.ok((await preview.innerText()).includes('已从方法库移除'));assert.ok((await preview.innerText()).includes('核对拖放方法'));assert.ok((await preview.innerText()).includes('Main · 项目总览'));assert.ok((await preview.innerText()).includes('Workflow · 交付现场'));
 assert.equal(await preview.getByRole('button',{name:'恢复后可使用',exact:true}).isDisabled(),true);await shot('03-existing-scope-reference-still-readable');
 await preview.getByRole('button',{name:'返回 合成 Saved Context',exact:true}).click();await preview.getByRole('button',{name:'进入 合成 Workflow',exact:true}).waitFor();
 assert.deepEqual(await page.evaluate(()=>window.__LIFE_READ__()),ui);report.checks.push('Existing Saved Context reference still opens the same complete method and both materials in original Library; removed state is explicit, Take disabled, original Back preserves input.');
 await page.reload({waitUntil:'domcontentloaded',timeout:120000});await ready();await input.fill(ui.prompt);await open();await gallery.getByText('已移除',{exact:true}).click();await card.waitFor();
 await page.setViewportSize({width:360,height:800});await card.scrollIntoViewIfNeeded();await card.click({trial:true});const box=await card.boundingBox();assert.ok(box.width>180&&box.x>=0&&box.x+box.width<=361);await shot('04-narrow-original-removed-card');
 await card.getByText('合成 Workflow',{exact:true}).click();await gallery.getByRole('button',{name:'恢复方法',exact:true}).waitFor();assert.equal(await gallery.getByRole('button',{name:'编辑方法',exact:true}).count(),0);
 await gallery.getByRole('button',{name:'恢复方法',exact:true}).click();await gallery.getByRole('button',{name:'加入当前输入',exact:true}).waitFor();
 const restored=(await get(prefix+'/graph')).scopes.find(s=>s.id===scope);assert.equal(restored.archivedAt,undefined);assert.equal(restored.lifecycleVersion,originalScope.lifecycleVersion+2);ownedVersion=undefined;
 assert.deepEqual(await page.evaluate(()=>window.__LIFE_READ__()),ui);await shot('05-restored-same-original-method');
 await gallery.getByRole('button',{name:'加入当前输入',exact:true}).click();await gallery.waitFor({state:'hidden'});
 const used=await page.evaluate(()=>window.__LIFE_READ__());assert.ok(used.prompt.startsWith(ui.prompt)&&used.prompt.includes('核对拖放方法'));assert.equal(used.refs.length,ui.refs.length+2);assert.deepEqual({...used.target,focusInput:false},{...ui.target,focusInput:false});assert.deepEqual(used.windows,ui.windows);
 report.checks.push('Full reload retains removed state. Original removed category and large narrow card are reachable; Restore returns same method to active list and Take carries the same full steps + both references into original Composer.');
 const after=await get(prefix+'/graph');assert.deepEqual(after.scopes.filter(s=>s.id!==scope),before.graph.scopes.filter(s=>s.id!==scope));
 for(const key of Object.keys(before.graph).filter(k=>!['scopes','graphVersion','project'].includes(k)))assert.deepEqual(after[key],before.graph[key],key);
 assert.deepEqual(await get(prefix+'/presentations'),before.views);assert.deepEqual(await get('/api/canvas/v1/canvases/'+canvas),before.canvas);assert.deepEqual(await get(prefix+'/connected-conversations'),before.conversations);
 assert.ok(report.writes.every(r=>r.permitted));assert.deepEqual(report.errors,[]);report.passed=true;
}catch(error){report.error=String(error.stack??error);process.exitCode=1;if(page){report.body=await page.locator('body').innerText().catch(()=>'<unavailable>');await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});}}
finally{
 if(ownedVersion!==undefined){const current=(await get(prefix+'/graph')).scopes.find(s=>s.id===scope);if(current.archivedAt&&current.lifecycleVersion===ownedVersion){const r=await fetch(origin+prefix+'/workflow/methods/'+scope+'/restore',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({expectedVersion:ownedVersion})});report.failureCleanup={restored:r.ok};}}
 await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));await browser?.close();
}
console.log(JSON.stringify({passed:report.passed,output,checks:report.checks,error:report.error,errors:report.errors},null,2));
