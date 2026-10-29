import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { currentGen2Root } from '../lab/current-gen2-resources.mjs';
const base='http://127.0.0.1:56255',root=path.resolve(import.meta.dirname,'..'),label='isolated-file-surface-drop-20261020';
const health=await(await fetch(base+'/health')).json();assert.equal(health.runtimeLabel,label);assert.ok(health.realCoreConnected&&health.nativeRailPilot);
const out=path.join(root,'output/文件跨现场真实Drop_20261020',new Date().toISOString().replace(/[:.]/g,'-'));await fs.mkdir(out,{recursive:true});
const get=async url=>{const r=await fetch(base+url,{cache:'no-store'}),e=await r.json();assert.equal(r.status,200,JSON.stringify(e));return e.code===0?e.data:e.value};
const canvas=s=>get('/api/canvas/v1/canvases/surface-core-'+s);
const resumePath=process.argv.find(v=>v.startsWith('--resume='))?.slice(9),previous=resumePath?JSON.parse(await fs.readFile(resumePath,'utf8')):null;
if(previous)assert.equal(previous.runtime,label);
const ffmpeg='C:/Users/1/.local/bin/ffmpeg.exe';
const fixtures=[{name:'合成视频.mp4',surface:'main',mime:'video/mp4'}, {name:'合成音频.wav',surface:'context',mime:'audio/wav'}, {name:'合成文件.json',surface:'workflow',mime:'application/json'}];
for(const f of fixtures){const prior=previous?.fixtures.find(v=>v.name===f.name);f.prior=prior;f.path=prior?(prior.fixturePath??path.join(path.dirname(resumePath),f.name)):path.join(out,f.name);if(prior){if(!fsSync.existsSync(f.path)){const dirs=(await fs.readdir(path.dirname(path.dirname(resumePath)))).sort().reverse();f.path=dirs.map(dir=>path.join(path.dirname(path.dirname(resumePath)),dir,f.name)).find(file=>fsSync.existsSync(file));assert.ok(f.path)}f.bytes=await fs.readFile(f.path);continue;}if(f.name.endsWith('.json'))await fs.writeFile(f.path,JSON.stringify({synthetic:true,task:'file-surface-drop',stamp:out}));else execFileSync(ffmpeg,['-hide_banner','-loglevel','error','-y',...(f.name.endsWith('.wav')?['-f','lavfi','-i','sine=frequency=660:duration=0.12','-ar','16000','-ac','1','-c:a','pcm_s16le']:['-f','lavfi','-i','color=c=green:s=32x32:d=0.12:r=25','-an','-c:v','libx264','-pix_fmt','yuv420p']),f.path],{timeout:30000,windowsHide:true});f.bytes=await fs.readFile(f.path)}
const report={passed:false,priorEvidence:resumePath??null,runtime:label,checks:[],uploads:[...(previous?.uploads??[])],posts:[...(previous?.posts??[])],errors:[],httpErrors:[],navigations:[],uploadNavigationIssues:[],screenshots:[],fixtures:[],responseLoss:previous?.responseLoss??0};
const {chromium}=createRequire(path.join(currentGen2Root,'package.json'))('playwright-core');
const browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({viewport:{width:1600,height:1050},serviceWorkers:'block'});
let loseNext=false;
await context.route('**/*',async route=>{const req=route.request(),u=new URL(req.url());if(!['127.0.0.1','localhost'].includes(u.hostname)&&!['data:','blob:'].includes(u.protocol))return route.abort();
 if(req.method()==='POST'&&u.pathname.endsWith('/materials:receive')){report.posts.push({path:u.pathname,body:req.postDataJSON()});if(loseNext){loseNext=false;const real=await route.fetch();assert.equal(real.status(),200);report.responseLoss++;return route.abort('connectionreset')}}
 if(req.method()==='POST'&&/\/runs$|\/continuations|gateway/.test(u.pathname))return route.abort();return route.continue()});
await context.routeWebSocket('**/*',s=>{if(['127.0.0.1','localhost'].includes(new URL(s.url()).hostname))s.connectToServer();else s.close()});
const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('framenavigated',f=>{if(f===page.mainFrame())report.navigations.push(f.url())});page.on('response',r=>{if(r.status()>=400)report.httpErrors.push({url:r.url(),status:r.status()})});
page.on('response',async r=>{if(r.status()===404&&r.url().includes('nodes:batchActions'))report.uploadNavigationIssues.push({url:r.url(),request:r.request().postDataJSON(),response:await r.json()});if(/\/api\/files\/upload-urls\/[^/]+\/complete$/.test(new URL(r.url()).pathname)&&r.status()===200){try{report.uploads.push((await r.json()).data)}catch{}}});
const shot=async name=>{const p=path.join(out,name+'.png');await page.screenshot({path:p});report.screenshots.push(p)};
const poll=async(name,read,predicate)=>{const until=Date.now()+45000;let v;while(Date.now()<until){v=await read();if(predicate(v))return v;await page.waitForTimeout(250)}throw Error(name+': '+JSON.stringify(v))};
const ready=async()=>{await page.locator('.react-flow__node').first().waitFor({timeout:60000});await page.locator('.common-loading-overlay').waitFor({state:'hidden',timeout:60000});await page.waitForTimeout(700)};
const navigate=async surface=>{if(page.url().endsWith('/canvas/surface-core-'+surface))return;await page.locator('[data-lcos-surface-dock] button[data-lcos-surface="'+surface+'"]').click();await page.waitForURL('**/canvas/surface-core-'+surface);await ready()};
const matches=(s,ref)=>s.nodes.filter(n=>n.data?.lcos_ref?.artifactId===ref.artifactId&&n.data.lcos_ref.revisionId===ref.revisionId);
const geom=n=>({position:n.position,parent:n.parentId??n.parent_id??null});
async function exposedPoint(id){const source=page.locator('.react-flow__node[data-id="'+id+'"]');await source.waitFor();for(let attempt=0;attempt<8;attempt++){
 const p=await source.evaluate(el=>{const r=el.getBoundingClientRect();for(const [x,y] of [[.5,.5],[.25,.25],[.7,.25],[.4,.65]]){const p={x:r.x+r.width*x,y:r.y+r.height*y},hit=document.elementFromPoint(p.x,p.y);if(hit?.closest('.react-flow__node')===el&&!hit.closest('button,textarea,input,[contenteditable="true"]'))return p}return null});if(p)return p;
 await page.mouse.move(800,500);await page.keyboard.down('Control');await page.mouse.wheel(0,200);await page.keyboard.up('Control');await page.waitForTimeout(400)}throw Error('No exposed original node '+id)}
async function carry(id,surface){const p=await exposedPoint(id),b=await page.locator('[data-lcos-surface-dock] button[data-lcos-surface="'+surface+'"]').boundingBox();assert.ok(b);await page.mouse.move(p.x,p.y);await page.mouse.down({button:'right'});await page.mouse.move(p.x+14,p.y+10,{steps:4});await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:24});await page.waitForTimeout(800);await shot('hover-'+id+'-'+surface);await page.mouse.up({button:'right'});await page.waitForTimeout(1500)}
try{
 await page.goto(base+'/canvas/surface-core-main');await ready();
 for(const f of fixtures){if(process.argv.includes('--remaining-only')&&f.prior&&previous.fixtures.indexOf(f.prior)<previous.fixtures.length-1){report.fixtures.push(f.prior);report.checks.push(f.name+': completed Drop/navigation evidence retained in '+resumePath);continue;}await navigate(f.surface);const before=await canvas(f.surface);const uploadCount=report.uploads.length;
  if(!f.prior){await page.getByTestId('canvas-dockbar-add-node-btn').click();const chooserPromise=page.waitForEvent('filechooser');await page.getByRole('option',{name:/上传/}).click();const chooser=await chooserPromise;assert.ok((await chooser.element().getAttribute('accept')).includes(path.extname(f.name)));await chooser.setFiles(f.path);}
  const imported=f.prior?report.uploads.find(v=>v.fileRecordId===f.prior.file.fileRecordId):await poll('original upload receipt',async()=>report.uploads[uploadCount],v=>v?.lcos_ref?.artifactId&&v.fileRecordId);
  const sourceSnapshot=await poll('original file carrier',()=>canvas(f.surface),s=>matches(s,imported.lcos_ref).length===1),source=matches(sourceSnapshot,imported.lcos_ref)[0];assert.equal(source.type,'text');assert.equal(source.data.lcos_file_ref.fileRecordId,imported.fileRecordId);assert.equal(source.data.lcos_file_ref.mimeType,f.mime);
  const raw=await fetch(base+'/api/surface-core/file-records/'+encodeURIComponent(imported.fileRecordId)+'/content');assert.equal(raw.status,200);assert.deepEqual(Buffer.from(await raw.arrayBuffer()),f.bytes);
  f.source=source;f.imported=imported;report.fixtures.push({name:f.name,surface:f.surface,nodeId:source.id,fixturePath:f.path,reference:source.data.lcos_ref,file:source.data.lcos_file_ref});report.checks.push(f.name+': original chooser imported one exact file/card; bytes unchanged');
  if(!f.prior)assert.equal(sourceSnapshot.nodes.length,before.nodes.length+1);console.log(JSON.stringify({stage:'imported',name:f.name,url:page.url(),liveNodes:await page.locator('.react-flow__node').count()}));
  if(!page.url().endsWith('/canvas/surface-core-'+f.surface)){report.checks.push('Upstream upload returned to project list; original project card reopens already-saved '+f.name);const title={main:'Main / 项目总览',context:'Context / 资料现场',workflow:'Workflow / 交付现场'}[f.surface];await page.getByText(title,{exact:true}).dblclick();await page.waitForURL('**/canvas/surface-core-'+f.surface);await ready();}
  const targets=['main','context','workflow'].filter(s=>s!==f.surface);
  for(const target of targets){if(f===fixtures[0]&&target===targets[1]&&report.responseLoss===0)loseNext=true;await carry(source.id,target);const receivedSnapshot=await poll('target '+target,()=>canvas(target),s=>matches(s,source.data.lcos_ref).length===1),received=matches(receivedSnapshot,source.data.lcos_ref)[0];
   assert.equal(received.type,'text');assert.deepEqual(received.data.lcos_file_ref,{...source.data.lcos_file_ref,artifactViewId:received.data.lcos_ref.artifactViewId});assert.deepEqual(geom((await canvas(f.surface)).nodes.find(n=>n.id===source.id)),geom(source));
   assert.equal(page.url(),base+'/canvas/surface-core-'+f.surface);report.checks.push(f.name+': '+f.surface+' → '+target+' saves exact original file card, source stays');
   const count=report.posts.length;await carry(source.id,target);assert.equal(report.posts.length,count);assert.equal(matches(await canvas(target),source.data.lcos_ref).length,1);report.checks.push(f.name+': duplicate '+target+' drop sends zero POST');
   await navigate(target);await page.locator('.react-flow__node[data-id="'+received.id+'"]').waitFor({timeout:30000});await page.reload();await ready();await page.locator('.react-flow__node[data-id="'+received.id+'"]').waitFor();await shot('received-'+f.name+'-'+target);
   await navigate(f.surface);
  }
 }
 assert.equal(report.responseLoss,1);assert.equal(report.uploads.length,3);assert.equal(report.posts.length,6);assert.deepEqual(report.errors.filter(e=>e!=='HTTP Error 501'),[]);report.dropPassed=true;report.passed=report.uploadNavigationIssues.length===0;report.scope='Drop verification only; recorded upstream upload-navigation failure is not repaired or counted as a pass';report.checks.push('Actual original navigation/reload retains all six received cards; no duplicate imports or media-playback claim');
}catch(e){report.failure=e.stack;report.body=await page.locator('body').innerText().catch(()=> '');await shot('failure');process.exitCode=1}
finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,out}));await browser.close()}
