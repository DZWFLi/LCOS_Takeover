import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {isDeepStrictEqual as equal} from 'node:util';
import {currentGen2Root} from '../lab/current-gen2-resources.mjs';

const origin='http://127.0.0.1:56311',project='disposable-surface-core-facade',prefix='/api/lcos/core/projects/'+project;
const out=path.resolve('output/原输入提交归属_20261025/实屏',new Date().toISOString().replaceAll(':','-'));await fs.mkdir(out,{recursive:true});
const report={passed:false,scope:'Actual original transformed Composer in the real TapNow page; task HTTP requests are held and fulfilled before Core. Synthetic receipts validate UI settlement only; zero actual Run/model execution.',checks:[],requests:[],writes:[],errors:[],screenshots:[]};
const get=async route=>{const response=await fetch(origin+route);assert.ok(response.ok);const data=await response.json();return data.value??data.data??data};
const before=await get(prefix+'/graph'),presentations=await get(prefix+'/presentations');
const held=[];let browser,page;
const {chromium}=createRequire(path.join(currentGen2Root,'package.json'))('playwright-core');
try{
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-networking','--disable-sync','--no-first-run']});
 const context=await browser.newContext({viewport:{width:1500,height:1000},locale:'zh-CN',serviceWorkers:'block'});
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());if(url.origin!==origin)return route.abort();
  if(!['GET','HEAD','OPTIONS'].includes(req.method())){
   const body=req.postDataJSON();
   if(url.pathname===prefix+'/runs'){
    const index=held.length;let release;const gate=new Promise(resolve=>{release=resolve});held.push({route,body,release,settled:false});
    report.requests.push({index,instruction:body.instruction,workspaceId:body.workspaceId,interceptedBeforeCore:true});await gate;
    const item=held[index];await route.fulfill(item.response);item.settled=true;return;
   }
   let permitted=url.pathname==='/api/events'||url.pathname.endsWith('/execution:reconcile');
   if(url.pathname.endsWith('/nodes:batchActions')){const saved=await get(url.pathname.replace('/nodes:batchActions',''));permitted=!body.lcos_operation&&body.actions?.every(action=>action.action==='update'&&action.updates?.every(node=>{const old=saved.nodes.find(row=>row.id===node.id);return old&&equal(old.position,node.position)&&equal(old.data,node.data)}))}
   report.writes.push({path:url.pathname,permitted});if(!permitted)return route.abort();
  }
  if(url.pathname==='/lcos/agent-ui.js'){
   const response=await route.fetch({timeout:120000}),source=await response.text();
   if(!source.includes('referenceSendingOwner')||!source.includes('submittingInput')){report.errors.push('Page did not load the newly built Composer pending-owner adaptation');return route.abort()}
   return route.fulfill({response,body:source+`\nwindow.__COMPOSER_PENDING_TEST__={open(name,workspaceId){const s=useLcosShellStore.getState();s.openComposer({nodeId:'pending-browser:'+name,title:'提交归属 '+name,intent:'delegate',workspaceId:workspaceId??s.activeWorkspaceId,anchor:{x:0,y:0,width:0,height:0},focusInput:false})},read(){const s=useLcosShellStore.getState(),r=useLcosReferenceStore.getState();return{projectId:s.projectId,target:s.composerTarget,prompt:s.composerPrompt,references:r.draft.orderedEntityRefs,operations:[...r.referenceInputOperations.values()]}}};`});
  }
  return route.continue();
 });
 await context.routeWebSocket('**/*',socket=>socket.close());page=await context.newPage();page.setDefaultTimeout(25000);page.on('pageerror',error=>report.errors.push(String(error)));
 await page.goto(origin+'/canvas/surface-core-main',{waitUntil:'domcontentloaded',timeout:120000});await page.locator('[data-lcos-professional-surface-state=ready]').waitFor({state:'attached',timeout:120000});
 const input=page.getByRole('textbox',{name:'Composer 输入',exact:true}),submit=page.getByRole('button',{name:'提交',exact:true});await input.waitFor();
 const read=()=>page.evaluate(()=>window.__COMPOSER_PENDING_TEST__.read());
 const open=async(name,workspaceId)=>{await page.evaluate(({name,workspaceId})=>window.__COMPOSER_PENDING_TEST__.open(name,workspaceId),{name,workspaceId});await page.waitForFunction(({name,workspaceId})=>document.querySelector('[data-lcos-composer]')?.getAttribute('data-lcos-composer-target')==='pending-browser:'+name&&(!workspaceId||window.__COMPOSER_PENDING_TEST__.read().target.workspaceId===workspaceId),{name,workspaceId});await input.waitFor()};
 const waitRequests=async count=>{await page.waitForFunction(()=>true);for(let i=0;i<100&&held.length<count;i++)await new Promise(resolve=>setTimeout(resolve,25));assert.equal(held.length,count)};
 const finish=async(index,success)=>{const item=held[index];assert.ok(item&&!item.settled);item.response={status:success?200:503,contentType:'application/json',body:JSON.stringify(success?{ok:true,value:{review:{run:{id:'controlled-pending-run-'+index,projectId:project}}}}:{ok:false,error:{code:'UNAVAILABLE',message:'Controlled failure before Core'}})};item.release();await page.waitForFunction(()=>true);for(let i=0;i<100&&!item.settled;i++)await new Promise(resolve=>setTimeout(resolve,25));assert.equal(item.settled,true)};
 const shot=async name=>{const file=path.join(out,name+'.png');await page.screenshot({path:file});report.screenshots.push(file)};
 const sending=async()=>{await page.waitForFunction(()=>document.querySelector('[data-lcos-composer]')?.getAttribute('data-ui-state')==='sending');assert.equal(await submit.isDisabled(),true);assert.equal(await submit.getAttribute('title'),'当前输入正在提交…');assert.equal(await page.locator('[data-lcos-composer-submitting]').innerText(),'提交中…')};

 await open('A');await input.fill('A原消息');await submit.click();await waitRequests(1);await sending();await input.fill('A发送期间的新草稿');
 await open('B');assert.equal(await input.inputValue(),'');await input.fill('B原消息');assert.equal(await submit.isEnabled(),true);
 await open('A');assert.equal(await input.inputValue(),'A发送期间的新草稿');await sending();await input.press('Control+Enter');await submit.dispatchEvent('click');await page.waitForTimeout(200);assert.equal(held.length,1);await shot('01-return-to-pending-A');
 report.checks.push('The actual ordinary-task Composer sends A once; A→B→A preserves the edited draft and shows the original submitting state. Button and shortcut cannot create another request while A is pending.');
 await open('B');await submit.click();await waitRequests(2);await sending();assert.equal((await read()).operations.filter(row=>row.kind==='sending').length,2);
 await finish(0,true);await page.waitForFunction(()=>window.__COMPOSER_PENDING_TEST__.read().operations.filter(row=>row.kind==='sending').length===1);assert.equal(await input.inputValue(),'B原消息');await sending();
 await open('A');assert.equal(await input.inputValue(),'A发送期间的新草稿');assert.equal(await submit.isEnabled(),true);await open('B');await sending();await shot('02-independent-B-pending');
 report.checks.push('B can send while A is pending. A’s late success releases only A’s original token and preserves A’s newer edit; B remains pending with its own text.');
 await finish(1,false);await page.waitForFunction(()=>document.querySelector('[data-lcos-composer]')?.getAttribute('data-ui-state')==='error');assert.equal(await input.inputValue(),'B原消息');assert.equal(await submit.isEnabled(),true);assert.equal((await read()).operations.filter(row=>row.kind==='sending').length,0);await page.waitForTimeout(150);assert.equal(held.length,2);await shot('03-explicit-failure-preserves-B');
 await submit.click();await waitRequests(3);await sending();assert.equal(held[2].body.instruction,'B原消息');await open('A');assert.equal(await submit.isEnabled(),true);await input.fill('A第二次明确提交');await input.press('Control+Enter');await waitRequests(4);await sending();
 await finish(2,true);await page.waitForFunction(()=>window.__COMPOSER_PENDING_TEST__.read().operations.filter(row=>row.kind==='sending').length===1);assert.equal(await input.inputValue(),'A第二次明确提交');await sending();
 await finish(3,true);await page.waitForFunction(()=>window.__COMPOSER_PENDING_TEST__.read().operations.filter(row=>row.kind==='sending').length===0);assert.equal(await input.inputValue(),'');await open('B');assert.equal(await input.inputValue(),'');await shot('04-owned-drafts-settled');
 report.checks.push('Controlled failure releases B’s token, retains B’s original draft and does not retry automatically. An explicit retry is allowed; subsequent A/B successes clear only their own matching drafts and release their exact original tokens.');
 const sourceWorkspace=(await read()).target.workspaceId,otherWorkspace=before.workspaces.find(row=>row.id!==sourceWorkspace)?.id;assert.ok(otherWorkspace);
 await open('same-node',sourceWorkspace);await input.fill('同节点目标一');await submit.click();await waitRequests(5);await sending();
 await open('same-node',otherWorkspace);assert.equal(await input.inputValue(),'');await input.fill('同节点目标二');assert.equal(await submit.isEnabled(),true);await submit.click();await waitRequests(6);await sending();
 await open('same-node',sourceWorkspace);assert.equal(await input.inputValue(),'同节点目标一');await sending();await input.press('Control+Enter');assert.equal(held.length,6);await finish(4,true);await page.waitForFunction(()=>window.__COMPOSER_PENDING_TEST__.read().operations.filter(row=>row.kind==='sending').length===1);assert.equal(await input.inputValue(),'');
 await open('same-node',otherWorkspace);assert.equal(await input.inputValue(),'同节点目标二');await sending();await finish(5,true);await page.waitForFunction(()=>window.__COMPOSER_PENDING_TEST__.read().operations.filter(row=>row.kind==='sending').length===0);assert.equal(await input.inputValue(),'');await shot('05-same-node-two-owned-targets');
 report.checks.push('Two original task inputs for the same node but two existing Workspace addresses remain independent: the next target can send, returning to the pending target remains blocked, and each response settles its own target only.');
 assert.deepEqual(await get(prefix+'/graph'),before);assert.deepEqual(await get(prefix+'/presentations'),presentations);assert.deepEqual(report.errors,[]);assert.ok(report.writes.every(row=>row.permitted));assert.equal(held.length,6);assert.ok(held.every(row=>row.settled));report.passed=true;report.actualRunCreated=false;report.modelExecuted=false;
}catch(error){report.error=String(error.stack??error);process.exitCode=1;if(page){report.ui=await page.evaluate(()=>window.__COMPOSER_PENDING_TEST__?.read()).catch(()=>null);report.body=await page.locator('body').innerText().catch(()=>'<unavailable>');await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{})}}
finally{for(const item of held)if(!item.settled){item.response={status:503,body:'Controlled test ended before Core'};item.release()}await browser?.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2))}
console.log(JSON.stringify({passed:report.passed,checks:report.checks,error:report.error,errors:report.errors,output:out},null,2));
