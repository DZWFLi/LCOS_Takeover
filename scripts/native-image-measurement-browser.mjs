import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import {spawn} from 'node:child_process';import {createRequire} from 'node:module';
import {currentGen2Root} from '../lab/current-gen2-resources.mjs';
import {reserveLoopbackPort,waitForHealth,queryCommandLine,matchesProcessIdentity,stopExactProcess,waitForExit} from './native-execution-browser.mjs';
const root=path.resolve(import.meta.dirname,'..'),stamp=new Date().toISOString().replace(/[:.]/g,'-');
const label='isolated-image-measurement-'+Date.now(),runtime=path.join(root,'.runtime',label),out=path.join(root,'output','图片测量保存修复_20261020','browser-'+stamp);
await fs.mkdir(out,{recursive:true});const port=await reserveLoopbackPort(),origin='http://127.0.0.1:'+port;
const {chromium}=createRequire(path.join(currentGen2Root,'package.json'))('playwright-core');
const launcherScript=path.join(root,'scripts/start-full-integration.mjs'),serverScript=path.join(root,'lab/server.mjs');
const report={passed:false,label,port,runtime,originalUserDatabaseOpened:false,modelExecution:false,steps:[],requests:[],pageErrors:[],apiFailures:[],screenshots:[],cleanup:{}};
let browser,launcher,health,stdout='',stderr='',state={closed:null};const pending=[];
try{
 launcher=spawn(process.execPath,[launcherScript,'--native-rail-pilot','--port='+port,'--runtime-label='+label],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
 launcher.stdout.on('data',b=>stdout+=b);launcher.stderr.on('data',b=>stderr+=b);launcher.once('close',(code,signal)=>state.closed={code,signal});
 health=await waitForHealth(origin,state,()=>stderr.slice(-2500));assert.equal(health.runtimeLabel,label);assert.equal(health.realCoreConnected,true);report.health={pid:health.pid,realCoreConnected:health.realCoreConnected};
 const read=async p=>{const r=await fetch(origin+p);assert.equal(r.status,200,p);const b=await r.json();return b.value??b.data;};
 const canvasPath='/api/canvas/v1/canvases/surface-core-main',graphPath='/api/lcos/core/projects/disposable-surface-core-facade/graph';
 const before=await read(canvasPath),beforeGraph=await read(graphPath),image=before.nodes.find(n=>n.type==='image');assert.ok(image.data.lcos_workspace_membership);
 const originalBytes=Buffer.from(await(await fetch(image.data.src)).arrayBuffer());
 browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({viewport:{width:1440,height:950},serviceWorkers:'block'});
 await context.route('**/*',route=>{const u=new URL(route.request().url());if(!['data:','blob:'].includes(u.protocol)&&u.origin!==origin)return route.abort();if(/\/runs|\/continuation|gateway/.test(u.pathname)&&!['GET','HEAD','OPTIONS'].includes(route.request().method()))return route.abort();return route.continue();});
 await context.routeWebSocket(/.*/,s=>{if(new URL(s.url()).host===new URL(origin).host)s.connectToServer();else s.close();});
 const page=await context.newPage();page.on('pageerror',e=>report.pageErrors.push(e.message));
 page.on('response',response=>{const url=new URL(response.url());if(url.origin!==origin)return;
 if(url.pathname.endsWith('/nodes:batchActions'))pending.push((async()=>{const body=response.request().postDataJSON(),answer=await response.json();report.requests.push({path:url.pathname,status:response.status(),body,response:answer});})());
 else if(response.status()>=400&&!url.pathname.startsWith('/api/events'))report.apiFailures.push({path:url.pathname,status:response.status()});});
 const ready=async()=>{await page.waitForFunction(()=>!!window.__LCOS_NODE_LAB__?.api,{},{timeout:90000});await page.locator('.common-loading-overlay').waitFor({state:'hidden',timeout:60000});await page.waitForTimeout(2800);await Promise.all(pending);};
 await page.goto(origin+'/canvas/surface-core-main',{waitUntil:'domcontentloaded',timeout:90000});await ready();
 const measurement=report.requests.find(r=>r.body.actions?.some(a=>a.updates?.some(n=>n.id===image.id&&n.data?.__metadata&&n.data?.lcos_workspace_membership)));
 assert.ok(measurement,'real original first-load measurement must send the complete image DTO');assert.equal(measurement.status,200,JSON.stringify(measurement.response));
 const measured=measurement.body.actions.flatMap(a=>a.updates??[]).find(n=>n.id===image.id).measured;
 assert.deepEqual((await read(canvasPath)).nodes.find(n=>n.id===image.id).measured,measured);
 assert.equal(report.requests.some(r=>r.status>=400),false);assert.equal(report.pageErrors.length,0);
 const shot=async name=>{const p=path.join(out,name+'.png');await page.screenshot({path:p});report.screenshots.push(p);};await shot('01-first-load-measurement-saved');
 report.steps.push('Original first-load image measurement sent full DTO and saved with HTTP 200');
 const source=page.locator('.react-flow__node[data-id="'+image.id+'"]');await source.click();await page.waitForTimeout(300);
 report.resizeControls=await source.locator('.react-flow__resize-control,[data-resize-handle],[data-lcos-node-resize]').evaluateAll(rows=>rows.map(el=>({className:el.className,resize:el.getAttribute('data-resize-handle')})));
 const resize=source.locator('.react-flow__resize-control.handle.bottom.right');
 if(await resize.count()===1){const rect=await resize.boundingBox();assert.ok(rect);await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await page.mouse.down();await page.mouse.move(rect.x+rect.width/2+45,rect.y+rect.height/2+30,{steps:12});await page.mouse.up();await page.waitForTimeout(2000);await Promise.all(pending);report.steps.push('Original selected image resize handle completed');}
 await page.reload({waitUntil:'domcontentloaded',timeout:90000});await ready();await shot('02-reloaded-measurement-persisted');
 assert.equal(report.requests.some(r=>r.status>=400),false,JSON.stringify(report.requests.filter(r=>r.status>=400)));assert.equal(report.pageErrors.length,0);
 const after=await read(canvasPath);assert.deepEqual(after.nodes.find(n=>n.id===image.id).data.lcos_ref,image.data.lcos_ref);assert.deepEqual(after.nodes.find(n=>n.id===image.id).data.lcos_workspace_membership,image.data.lcos_workspace_membership);
 assert.deepEqual(await read(graphPath),beforeGraph,'Core artifact/revision/membership data remain unchanged');assert.deepEqual(Buffer.from(await(await fetch(image.data.src)).arrayBuffer()),originalBytes);
 report.steps.push('Reload preserved saved dimensions, exact reference and membership; Core graph and file bytes unchanged');report.savedImage=after.nodes.find(n=>n.id===image.id);report.passed=true;
}catch(error){report.error=error.stack;throw error;}
finally{
 await browser?.close();
 try{if(health?.pid){const command=await queryCommandLine(health.pid);if(matchesProcessIdentity(command,serverScript,label,port)){stopExactProcess(health.pid,serverScript,label,port);report.cleanup.serverStopped=true;}}if(launcher&&!(await waitForExit(launcher,5000))){const command=await queryCommandLine(launcher.pid);if(matchesProcessIdentity(command,launcherScript,label,port)){stopExactProcess(launcher.pid,launcherScript,label,port);report.cleanup.launcherStopped=true;}}}catch(error){report.cleanup.error=String(error);}
 if(report.cleanup.serverStopped){const relative=path.relative(path.join(root,'.runtime'),path.resolve(runtime));assert.equal(relative,label);assert.ok(!path.isAbsolute(relative)&&relative.startsWith('isolated-image-measurement-')&&!relative.includes(path.sep));await fs.rm(runtime,{recursive:true,force:true});report.cleanup.runtimeRemoved=true;}
 await fs.writeFile(path.join(out,'launcher.stdout.log'),stdout);await fs.writeFile(path.join(out,'launcher.stderr.log'),stderr);await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,steps:report.steps,error:report.error,requests:report.requests.map(r=>({status:r.status,path:r.path})),resizeControls:report.resizeControls,report:path.join(out,'report.json'),cleanup:report.cleanup},null,2));
}
