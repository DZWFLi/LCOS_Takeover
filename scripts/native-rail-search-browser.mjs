import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { isDeepStrictEqual as equal } from 'node:util';
import { currentGen2Root } from '../lab/current-gen2-resources.mjs';
const origin='http://127.0.0.1:56311',canvasId='surface-core-main',prefix='/api/lcos/core/projects/disposable-surface-core-facade';
const get=async route=>{const r=await fetch(origin+route);assert.ok(r.ok);const d=await r.json();return d.value??d.data??d};
const health=await get('/health');assert.equal(health.realCoreConnected,true);
const before=await get('/api/canvas/v1/canvases/'+canvasId),beforeConversations=await get(prefix+'/connected-conversations');
const output=path.resolve('output/原Rail接续_20261023/原搜索实屏',new Date().toISOString().replaceAll(':','-'));await fs.mkdir(output,{recursive:true});
const report={passed:false,pid:health.pid,output,checks:[],writes:[],errors:[],screenshots:[]};
const {chromium}=createRequire(path.join(currentGen2Root,'package.json'))('playwright-core');let browser,page;
try{
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-networking','--disable-sync','--no-first-run']});
 const context=await browser.newContext({viewport:{width:1500,height:1000},locale:'zh-CN',serviceWorkers:'block'});
 await context.route('**/*',async route=>{const r=route.request(),u=new URL(r.url());if(u.origin!==origin)return route.abort();
  if(!['GET','HEAD','OPTIONS'].includes(r.method())){const body=r.postDataJSON(),row={path:u.pathname,permitted:false};report.writes.push(row);
   row.permitted=u.pathname==='/api/events'||u.pathname.endsWith('/execution:reconcile');
   if(u.pathname.endsWith('/nodes:batchActions')){row.body=body;row.permitted=!body.lcos_operation&&body.actions?.every(a=>a.action==='update'&&a.updates?.every(n=>{const old=before.nodes.find(x=>x.id===n.id);return old&&equal(n.position,old.position)&&equal(n.data,old.data)}));}
   if(!row.permitted)return route.abort();
  }
  if(u.pathname==='/lcos/agent-ui.js'){const response=await route.fetch({timeout:90000});return route.fulfill({response,body:await response.text()+'\nwindow.__RAIL_SEARCH_READ__=()=>{const s=useLcosShellStore.getState();return{target:s.composerTarget,prompt:s.composerPrompt,windows:s.windows,refs:useLcosReferenceStore.getState().draft.orderedEntityRefs}};'});}
  return route.continue();
 });await context.routeWebSocket('**/*',socket=>socket.close());
 page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>report.errors.push(String(e)));
 const shot=async name=>{const f=path.join(output,name+'.png');await page.screenshot({path:f});report.screenshots.push(f);await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));};
 await page.goto(origin+'/canvas/'+canvasId,{waitUntil:'domcontentloaded',timeout:120000});await page.locator('[data-lcos-professional-surface-state=ready]').waitFor({state:'attached',timeout:90000});
 const composer=page.getByRole('textbox',{name:'Composer 输入',exact:true}),draft='搜索与定位后保留这份原输入。';await composer.fill(draft);
 const uiBefore=await page.evaluate(()=>window.__RAIL_SEARCH_READ__());
 const search=page.getByRole('button',{name:'节点搜索',exact:true}),dialog=page.getByRole('dialog'),query=dialog.locator('input');
 await search.click();await query.waitFor();assert.equal(await dialog.count(),1);
 assert.ok(!(await dialog.innerText()).includes('无 Prompt'));assert.ok((await dialog.innerText()).includes('任务 · 尚未开始'));
 const selectors=[['智能体','lcos-conversation'],['集合','pile'],['任务','lcos-execution']];
 for(const[label,type]of selectors){await dialog.getByRole('button',{name:label,exact:true}).click();
  const actual=await dialog.locator('[data-native-search-node]').evaluateAll(rows=>rows.map(row=>row.getAttribute('data-native-search-node')));
  assert.deepEqual(new Set(actual),new Set(before.nodes.filter(n=>n.type===type).map(n=>n.id)));report.checks.push('Original '+label+' filter shows exactly its real canvas nodes.');await shot('filter-'+type);
 }
 await dialog.getByRole('button',{name:'全部',exact:true}).click();await query.fill('整理这份合成项目');
 assert.equal(await dialog.locator('[data-native-search-node]').count(),1);assert.equal(await dialog.locator('[data-native-search-node]').getAttribute('data-native-search-node'),'surface-main-text');
 assert.ok((await dialog.innerText()).includes('整理这份合成项目'));await shot('matched-body');
 await query.press('Escape');assert.equal(await query.inputValue(),'');await query.press('Escape');await dialog.waitFor({state:'hidden'});
 await page.locator('.react-flow__pane').click({position:{x:200,y:180}});await page.keyboard.press('Control+f');await query.waitFor();
 await dialog.getByRole('button',{name:'智能体',exact:true}).click();await query.fill('');
 const composition=await context.newCDPSession(page);await composition.send('Input.imeSetComposition',{text:'新对话',selectionStart:3,selectionEnd:3});
 assert.equal(await query.inputValue(),'新对话');const beforeComposition=await page.evaluate(()=>window.__LCOS_NODE_LAB__.api.getNodes().filter(n=>n.selected).map(n=>n.id));
 await query.press('Enter');assert.equal(await dialog.isVisible(),true);assert.deepEqual(await page.evaluate(()=>window.__LCOS_NODE_LAB__.api.getNodes().filter(n=>n.selected).map(n=>n.id)),beforeComposition);
 await composition.send('Input.insertText',{text:'新对话'});await composition.detach();assert.equal(await query.inputValue(),'新对话');
 report.checks.push('Chrome composition events keep Enter from selecting a node until the Chinese query is committed.');
 const targets=await dialog.locator('[data-native-search-node]').evaluateAll(rows=>rows.map(row=>row.getAttribute('data-native-search-node')));assert.ok(targets.length>1);
 await query.press('ArrowDown');await query.press('Enter');await dialog.waitFor({state:'hidden'});
 await page.waitForFunction(id=>window.__LCOS_NODE_LAB__.api.getNodes().filter(n=>n.selected).length===1&&window.__LCOS_NODE_LAB__.api.getNodes().find(n=>n.id===id)?.selected,targets[1]);
 report.selectedNodeId=targets[1];await shot('original-enter-locates-agent');
 assert.equal(await composer.inputValue(),draft);const uiAfter=await page.evaluate(()=>window.__RAIL_SEARCH_READ__());assert.deepEqual(uiAfter,uiBefore);
 report.checks.push('Original Ctrl+F, ArrowDown/Enter exact-node selection and two-step Escape work; body matches display actual content, original Composer/target/references/windows stay unchanged.');
 await page.setViewportSize({width:360,height:800});await search.click();await query.waitFor();await dialog.getByRole('button',{name:'任务',exact:true}).click();
 const box=await dialog.boundingBox();assert.ok(box&&box.x>=0&&box.x+box.width<=361&&box.y>=0&&box.y+box.height<=801);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));report.narrowDialog=box;
 const lastRow=dialog.locator('[data-native-search-node]').last();await lastRow.scrollIntoViewIfNeeded();await lastRow.click({trial:true});
 report.narrowLastRowHit=await lastRow.evaluate(e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))});assert.equal(report.narrowLastRowHit,true);
 const narrowTarget=await lastRow.getAttribute('data-native-search-node');await shot('360-original-search');await lastRow.click();await dialog.waitFor({state:'hidden'});
 await page.waitForFunction(id=>window.__LCOS_NODE_LAB__.api.getNode(id)?.selected===true,narrowTarget);
 await page.waitForFunction(id=>{const node=document.querySelector('.react-flow__node[data-id="'+id+'"]'),panel=document.querySelector('[data-lcos-native-chat-frame]');if(!node||!panel)return false;
   const r=node.getBoundingClientRect(),p=panel.getBoundingClientRect();return r.width>0&&r.left>=0&&r.right<=innerWidth&&r.top>=60&&r.bottom<=p.top-12
     &&node.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));},narrowTarget);
 report.narrowLocatedVisible=true;
 for(const name of ['Main','Context','Workflow'])await page.getByRole('button',{name,exact:true}).click({trial:true});
 const dockBox=await page.locator('[data-lcos-surface-dock]').boundingBox(),chatBox=await page.locator('[data-lcos-native-chat-frame]').boundingBox();
 assert.ok(dockBox.y+dockBox.height<=chatBox.y-11);report.narrowDockVisible=true;
 const rail=page.getByTestId('canvas-dockbar-container'),railBox=await rail.boundingBox();assert.ok(railBox.y>=60&&railBox.y+railBox.height<=dockBox.y-8);
 for(const id of ['canvas-dockbar-add-node-btn','canvas-dockbar-assets-btn','canvas-dockbar-workflow-btn','canvas-dockbar-comment-mode-btn','canvas-dockbar-history-btn']){
   await page.getByTestId(id).scrollIntoViewIfNeeded();await page.getByTestId(id).click({trial:true});
 }
 report.narrowRailReachable=true;
 await composer.click({trial:true,position:{x:30,y:20}});
 report.narrowInputHit=await composer.evaluate(e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+30,r.y+20))});assert.equal(report.narrowInputHit,true);
 await shot('360-original-input-after-search');
 await page.setViewportSize({width:1500,height:1000});assert.equal(await composer.inputValue(),draft);
 report.checks.push('360px keeps the original bounded dialog and horizontally scrollable type strip; the final result is visibly above the chat pane, hit-tested and actually clicked to locate its exact task, with no page overflow or lost draft.');
 for(const[id,label]of[['canvas-dockbar-add-node-btn','添加'],['canvas-dockbar-assets-btn','资料库'],['canvas-dockbar-history-btn','材料历史']])assert.equal(await page.getByTestId(id).getAttribute('aria-label'),label);
 assert.deepEqual(await get('/api/canvas/v1/canvases/'+canvasId),before);assert.deepEqual(await get(prefix+'/connected-conversations'),beforeConversations);
 assert.ok(report.writes.every(row=>row.permitted));assert.deepEqual(report.errors,[]);report.passed=true;
}catch(error){report.error=String(error.stack??error);process.exitCode=1;if(page){try{report.visible=await page.locator('body').innerText();await page.screenshot({path:path.join(output,'failure.png')});}catch{}}}
finally{await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));await browser?.close();}
console.log(JSON.stringify({passed:report.passed,pid:report.pid,output,checks:report.checks,error:report.error},null,2));
