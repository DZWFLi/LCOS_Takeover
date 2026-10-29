import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {currentGen2Root} from '../lab/current-gen2-resources.mjs';
const base='http://127.0.0.1:56241', root=path.resolve(import.meta.dirname,'..');
const health=await(await fetch(base+'/health')).json();
assert.equal(health.runtimeLabel,'isolated-node-carry-20261020');
const out=path.join(root,'output/跨现场Drop_20261020',new Date().toISOString().replace(/[:.]/g,'-'));await mkdir(out,{recursive:true});
const get=async p=>{const r=await fetch(base+p);const e=await r.json();assert.ok(r.ok,JSON.stringify(e));return e.code===0?e.data:e.value;};
const canvas=id=>get('/api/canvas/v1/canvases/'+id);
const beforeMain=await canvas('surface-core-main'), source=beforeMain.nodes.find(n=>n.id==='surface-main-text'), image=beforeMain.nodes.find(n=>n.id==='surface-main-image');
assert.ok(source?.data.lcos_ref&&image?.data.lcos_ref);
const report={passed:false,checks:[],posts:[],errors:[],screenshots:[],responseLoss:0};
const {chromium}=createRequire(path.join(currentGen2Root,'package.json'))('playwright-core');
const browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({viewport:{width:1500,height:1050},serviceWorkers:'block'});
let loseNext=false;
await context.route('**/*',async route=>{
 const req=route.request(),u=new URL(req.url());
 if(!['127.0.0.1','localhost'].includes(u.hostname)&&!['data:','blob:'].includes(u.protocol))return route.abort();
 if(req.method()==='POST'&&u.pathname.endsWith('/materials:receive')){
  report.posts.push({path:u.pathname,body:req.postDataJSON()});
  if(loseNext){loseNext=false;const real=await route.fetch();assert.equal(real.status(),200);report.responseLoss++;return route.abort('connectionreset');}
 }
 if(req.method()==='POST'&&/\/runs$|\/continuations|gateway/.test(u.pathname))return route.abort();
 return route.continue();
});
await context.routeWebSocket('**/*',s=>{if(['127.0.0.1','localhost'].includes(new URL(s.url()).hostname))s.connectToServer();else s.close()});
const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
const shot=async name=>{const p=path.join(out,name+'.png');await page.screenshot({path:p});report.screenshots.push(p);};
const ready=async()=>{await page.locator('.react-flow__node').first().waitFor({timeout:60000});await page.locator('.common-loading-overlay').waitFor({state:'hidden',timeout:60000});await page.waitForTimeout(500)};
const targetMatches=(snapshot,ref)=>snapshot.nodes.filter(n=>n.data?.lcos_ref?.artifactId===ref.artifactId&&n.data.lcos_ref.revisionId===ref.revisionId);
const waitTarget=async(surface,ref)=>{for(let i=0;i<30;i++){const s=await canvas('surface-core-'+surface);if(targetMatches(s,ref).length)return s;await page.waitForTimeout(300)}throw Error('Target did not receive '+surface)};
async function carry(id,surface){
 const source=page.locator('.react-flow__node[data-id="'+id+'"]'),target=page.locator('[data-lcos-surface-dock] button[data-lcos-surface="'+surface+'"]');
 const a=await source.boundingBox(),b=await target.boundingBox();assert.ok(a&&b);
 const p={x:a.x+a.width*.65,y:a.y+a.height*.65};await page.waitForFunction(({p,id})=>document.elementFromPoint(p.x,p.y)?.closest('.react-flow__node')?.getAttribute('data-id')===id,{p,id},{timeout:60000});const hit=await page.evaluate(p=>document.elementFromPoint(p.x,p.y)?.closest('.react-flow__node')?.getAttribute('data-id'),p);assert.equal(hit,id);
 await page.mouse.move(p.x,p.y);await page.mouse.down({button:'right'});await page.mouse.move(p.x+14,p.y+10,{steps:4});await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:24});await page.waitForTimeout(800);await shot('hover-'+surface);await page.mouse.up({button:'right'});await page.waitForTimeout(1700);
}
try{
 await page.goto(base+'/canvas/surface-core-main');await ready();
 await carry(source.id,'context');const contextAfter=await waitTarget('context',source.data.lcos_ref);
 report.checks.push('Main text physically right-carried to Context; destination persisted without opening it');
 assert.equal(page.url(),base+'/canvas/surface-core-main');
 const countContext=targetMatches(contextAfter,source.data.lcos_ref).length,posts=report.posts.length;
 await carry(source.id,'context');assert.equal(report.posts.length,posts);assert.equal(targetMatches(await canvas('surface-core-context'),source.data.lcos_ref).length,countContext);
 report.checks.push('Repeated drop reuses destination version without another POST or node');
 loseNext=true;await carry(source.id,'workflow');await waitTarget('workflow',source.data.lcos_ref);assert.equal(report.responseLoss,1);
 await page.waitForTimeout(1200);assert.ok(!(await page.locator('body').innerText()).includes('核对放置结果'),'committed lost response is automatically inspected');
 report.checks.push('Workflow committed response loss automatically resolves through GET without resubmission');
 const preImagePosts=report.posts.length;await carry(image.id,'context');assert.equal(report.posts.length,preImagePosts);
 report.checks.push('Material already visible in target from original import is reused, no duplicate explicit View');
 await page.locator('[data-lcos-surface="context"]').click();await page.waitForURL('**/canvas/surface-core-context');await ready();
 const received=targetMatches(contextAfter,source.data.lcos_ref)[0];await page.locator('.react-flow__node[data-id="'+received.id+'"]').waitFor();await shot('context-received');
 await page.reload();await ready();assert.equal(await page.locator('.react-flow__node[data-id="'+received.id+'"]').count(),1);
 await page.locator('[data-lcos-surface="main"]').click();await page.waitForURL('**/canvas/surface-core-main');await ready();
 const afterMain=await canvas('surface-core-main');
 const geometry=s=>s.nodes.map(n=>({id:n.id,position:n.position,parent:n.parentId??n.parent_id??null})).sort((a,b)=>a.id.localeCompare(b.id));
 assert.deepEqual(geometry(afterMain),geometry(beforeMain));
 report.checks.push('Original navigation/reload loads received node, returning to source preserves all original coordinates');
 assert.equal(report.errors.length,0);report.passed=true;await shot('source-preserved');
}catch(e){report.failure=e.stack;report.body=await page.locator('body').innerText().catch(()=> '');await shot('failure');process.exitCode=1}
finally{await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,out}));await browser.close()}
