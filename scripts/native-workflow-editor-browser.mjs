import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {isDeepStrictEqual as equal} from 'node:util';
import {currentGen2Root} from '../lab/current-gen2-resources.mjs';
const origin='http://127.0.0.1:56311',project='disposable-surface-core-facade',canvas='surface-core-main',prefix='/api/lcos/core/projects/'+project;
const output=path.resolve('output/原方法编辑接续_20261023/实屏',new Date().toISOString().replaceAll(':','-'));await fs.mkdir(output,{recursive:true});
const report={passed:false,output,checks:[],writes:[],errors:[],screenshots:[]};
const get=async route=>{const r=await fetch(origin+route);assert.ok(r.ok);const d=await r.json();return d.value??d.data??d};
const beforeCanvas=await get('/api/canvas/v1/canvases/'+canvas),beforeGraph=await get(prefix+'/graph'),beforeViews=await get(prefix+'/presentations'),beforeConversations=await get(prefix+'/connected-conversations');
const existingId=process.argv.find(arg=>arg.startsWith('--existing='))?.slice('--existing='.length);
const existingScope=existingId?beforeGraph.scopes.find(scope=>scope.id===existingId):undefined;if(existingId)assert.ok(existingScope);
let browser,page,rejectSave=false,dropSaveResponse=false,methodId=existingId,pauseSave=false,releaseSave,markSave;
const title=existingScope?.name??('本地方法联调 · '+new Date().toISOString()),finalTitle=existingId?title.replace(/( · (?:已修改|复核完成))+$/,'')+' · 复核完成':title+' · 已修改';report.title=title;
const {chromium}=createRequire(path.join(currentGen2Root,'package.json'))('playwright-core');
try{
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-networking','--disable-sync','--no-first-run']});
 const context=await browser.newContext({viewport:{width:1500,height:1000},locale:'zh-CN',serviceWorkers:'block'});
 await context.route('**/*',async route=>{const r=route.request(),u=new URL(r.url());if(u.origin!==origin)return route.abort();
  if(!['GET','HEAD','OPTIONS'].includes(r.method())){
   let permitted=u.pathname==='/api/events'||u.pathname.endsWith('/execution:reconcile'),body=r.postDataJSON();
   if(u.pathname.endsWith('/nodes:batchActions'))permitted=!body.lcos_operation&&body.actions?.every(a=>a.action==='update'&&a.updates?.every(n=>{const old=beforeCanvas.nodes.find(x=>x.id===n.id);return old&&equal(old.position,n.position)&&equal(old.data,n.data)}));
   if(r.method()==='PUT'&&u.pathname.startsWith(prefix+'/workflow/methods/')){
    const id=decodeURIComponent(u.pathname.split('/').pop());
    permitted=(body.create?body.name===title:[title,finalTitle].includes(body.name))&&(!methodId||methodId===id);if(permitted)methodId=id;
   }
   const row={path:u.pathname,method:r.method(),permitted};report.writes.push(row);if(!permitted)return route.abort();
   if(u.pathname.startsWith(prefix+'/workflow/methods/')){
    row.body=body;
    if(pauseSave){pauseSave=false;markSave?.();await new Promise(resolve=>{releaseSave=resolve});}
    if(rejectSave){rejectSave=false;row.injectedFailure=true;return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({ok:false,error:{code:'CONFLICT',message:'Synthetic rejected save'}})});}
    if(dropSaveResponse){dropSaveResponse=false;const real=await route.fetch();assert.equal(real.status(),200);row.realCommitResponseHidden=true;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({ok:false,error:{code:'UNAVAILABLE',message:'Synthetic lost response after real commit'}})});}
   }
  }
  if(u.pathname==='/lcos/agent-ui.js'){const response=await route.fetch({timeout:120000});return route.fulfill({response,body:await response.text()+'\nwindow.__METHOD_EDIT_READ__=()=>{const s=useLcosShellStore.getState();return{prompt:s.composerPrompt,target:s.composerTarget,windows:s.windows,refs:useLcosReferenceStore.getState().draft.orderedEntityRefs}};'});}
  return route.continue();
 });await context.routeWebSocket('**/*',socket=>socket.close());
 page=await context.newPage();page.setDefaultTimeout(25000);page.on('pageerror',e=>report.errors.push(String(e)));
 const shot=async name=>{await page.waitForTimeout(350);const file=path.join(output,name+'.png');await page.screenshot({path:file});report.screenshots.push(file);await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));};
 const ready=async()=>{await page.locator('[data-lcos-professional-surface-state=ready]').waitFor({state:'attached',timeout:120000})};
 await page.goto(origin+'/canvas/'+canvas,{waitUntil:'domcontentloaded',timeout:120000});await ready();
 const composer=page.getByRole('textbox',{name:'Composer 输入',exact:true});await composer.fill('方法编辑不能覆盖我的原输入。');const original=await page.evaluate(()=>window.__METHOD_EDIT_READ__());
 const open=async()=>{await page.getByTestId('canvas-dockbar-workflow-btn').click();const guide=page.getByRole('button',{name:'知道了',exact:true});if(await guide.isVisible())await guide.click();await page.getByRole('button',{name:'浏览全部',exact:true}).click();};
 await open();const gallery=page.locator('[data-native-workflow-gallery]'),editor=page.locator('[data-native-workflow-editor]');
 if(existingId){await gallery.getByText(title,{exact:true}).first().click();await gallery.getByRole('button',{name:'编辑方法',exact:true}).click();}
 else await gallery.getByRole('button',{name:'创建',exact:true}).click();
 await editor.waitFor();await editor.getByRole('textbox',{name:'方法名称',exact:true}).fill(title);
 await editor.getByRole('textbox',{name:'步骤 1 名称',exact:true}).fill('阅读原始材料');await editor.getByRole('textbox',{name:'步骤 1 说明',exact:true}).fill('保留关键内容，再核对遗漏。');
 if(!existingId)await editor.getByRole('button',{name:'添加步骤',exact:true}).click();await editor.getByRole('textbox',{name:'步骤 2 名称',exact:true}).fill('输出下一步');await editor.getByRole('textbox',{name:'步骤 2 说明',exact:true}).fill('按实际材料列出可执行的下一步。');
 await shot('01-original-create-form');
 rejectSave=true;await editor.getByRole('button',{name:'确认',exact:true}).click();
 await page.getByText('方法未确认保存，输入保留；请先重新读取，避免覆盖其他修改。',{exact:true}).waitFor();
 assert.equal(await editor.getByRole('textbox',{name:'方法名称',exact:true}).inputValue(),title);assert.equal((await get(prefix+'/graph')).scopes.length,beforeGraph.scopes.length);
 assert.equal(report.writes.filter(r=>r.path.startsWith(prefix+'/workflow/methods/')).length,1);await shot('02-failed-save-keeps-form');
 const saveStarted=new Promise(resolve=>{markSave=resolve});pauseSave=true;
 await editor.getByRole('button',{name:'确认',exact:true}).click();await saveStarted;
 assert.equal(await editor.getByRole('textbox',{name:'方法名称',exact:true}).isDisabled(),true);
 assert.equal(await editor.getByRole('textbox',{name:'步骤 1 说明',exact:true}).isDisabled(),true);
 assert.equal(await editor.getByRole('button',{name:'取消',exact:true}).isDisabled(),true);
 await page.keyboard.press('Escape');assert.equal(await editor.isVisible(),true);releaseSave();
 await editor.waitFor({state:'hidden'});report.checks.push('While the actual save is pending, fields/Cancel remain disabled and Escape does not discard the form; they settle after the response.');
 await page.getByText('方法未确认保存，输入保留；请先重新读取，避免覆盖其他修改。',{exact:true}).waitFor({state:'hidden'});
 await gallery.getByRole('heading',{name:title,exact:true}).waitFor();const created=(await get(prefix+'/presentations')).find(v=>v.scopeId===methodId);assert.equal(created.state.workflowActions.length,2);
 assert.deepEqual(await page.evaluate(()=>window.__METHOD_EDIT_READ__()),original);report.methodId=methodId;
 report.checks.push((existingId?'Existing same-ID method reopened in original editor.':'Original gallery Create opens original editor.')+' Rejected save keeps all fields and makes no automatic retry. Explicit second save confirms both full steps and dismisses the stale error; original Composer unchanged.');
 await gallery.getByRole('button',{name:'编辑方法',exact:true}).click();await editor.waitFor();
 await editor.getByRole('textbox',{name:'方法名称',exact:true}).fill(finalTitle);await editor.getByRole('textbox',{name:'步骤 2 说明',exact:true}).fill('修改后：先对照原件，再输出下一步。');
 dropSaveResponse=true;await editor.getByRole('button',{name:'确认',exact:true}).click();await editor.waitFor({state:'hidden'});await gallery.getByRole('heading',{name:finalTitle,exact:true}).waitFor();
 const updated=(await get(prefix+'/presentations')).find(v=>v.scopeId===methodId);assert.equal(updated.id,created.id);assert.equal(updated.version,created.version+1);assert.equal(updated.state.workflowActions[1].description,'修改后：先对照原件，再输出下一步。');
 assert.equal(report.writes.filter(r=>r.path.startsWith(prefix+'/workflow/methods/')).length,3);await shot('03-saved-same-method');
 report.checks.push('Original detail Edit saves real name and action content together. Actual committed response is hidden; authoritative readback recognizes the same method without replay or duplicate creation.');
 await page.setViewportSize({width:360,height:800});await gallery.getByRole('button',{name:'编辑方法',exact:true}).click();await editor.waitFor();
 await editor.getByRole('textbox',{name:'方法名称',exact:true}).fill('取消的修改');
 await editor.getByRole('button',{name:'取消',exact:true}).scrollIntoViewIfNeeded();await editor.getByRole('button',{name:'取消',exact:true}).click({trial:true});
 const box=await editor.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=361);assert.equal(await editor.evaluate(e=>e.scrollWidth>e.clientWidth),false);await shot('04-narrow-original-editor');
 await editor.getByRole('button',{name:'取消',exact:true}).click();await editor.waitFor({state:'hidden'});assert.equal((await get(prefix+'/graph')).scopes.find(s=>s.id===methodId).name,finalTitle);
 assert.deepEqual(await page.evaluate(()=>window.__METHOD_EDIT_READ__()),original);report.checks.push('Original small-screen editor fits, Cancel is actually clickable, and cancelled changes alter neither Core nor Composer.');
 await page.setViewportSize({width:1500,height:1000});await page.reload({waitUntil:'domcontentloaded',timeout:120000});await ready();await composer.fill(original.prompt);await open();
 await gallery.getByText(finalTitle,{exact:true}).first().click();await gallery.getByRole('button',{name:'加入当前输入',exact:true}).click();await gallery.waitFor({state:'hidden'});
 await page.waitForFunction(()=>document.activeElement?.matches('textarea[data-lcos-composer-input]'));
 const taken=await page.evaluate(()=>window.__METHOD_EDIT_READ__());assert.ok(taken.prompt.includes(finalTitle)&&taken.prompt.includes('修改后：先对照原件，再输出下一步。')&&taken.prompt.startsWith(original.prompt));assert.deepEqual(taken.windows,original.windows);
 await shot('05-saved-method-after-reload-in-original-input');
 const afterGraph=await get(prefix+'/graph'),afterViews=await get(prefix+'/presentations');
 assert.deepEqual(afterGraph.scopes.filter(s=>s.id!==methodId),beforeGraph.scopes.filter(s=>s.id!==methodId));assert.deepEqual(afterGraph.workspaces.filter(w=>w.scopeId!==methodId),beforeGraph.workspaces.filter(w=>w.scopeId!==methodId));
 assert.deepEqual(afterViews.filter(v=>v.scopeId!==methodId),beforeViews.filter(v=>v.scopeId!==methodId));assert.deepEqual(await get('/api/canvas/v1/canvases/'+canvas),beforeCanvas);assert.deepEqual(await get(prefix+'/connected-conversations'),beforeConversations);
 assert.deepEqual(report.errors,[]);assert.ok(report.writes.every(r=>r.permitted));report.checks.push('Full reload reads the saved same-ID method; Apply takes both edited steps into original input. Existing methods, workspaces, canvas and conversations remain unchanged; no model send.');report.passed=true;
}catch(error){report.error=String(error.stack??error);process.exitCode=1;if(page){report.body=await page.locator('body').innerText().catch(()=>'<unavailable>');await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});}}
finally{await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));await browser?.close();}
console.log(JSON.stringify({passed:report.passed,output,methodId,checks:report.checks,error:report.error,errors:report.errors},null,2));
