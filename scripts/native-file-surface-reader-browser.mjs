import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import path from 'node:path';import {createRequire} from 'node:module';import {currentGen2Root} from '../lab/current-gen2-resources.mjs';
const root=path.resolve(import.meta.dirname,'..'),base='http://127.0.0.1:56255',source=process.argv[2];assert.ok(source);
const prior=JSON.parse(await fs.readFile(source,'utf8'));assert.equal(prior.runtime,'isolated-file-surface-drop-20261020');assert.equal(prior.dropPassed,true);
const health=await(await fetch(base+'/health')).json();assert.equal(health.runtimeLabel,prior.runtime);
const out=path.join(root,'output/文件跨现场真实Drop_20261020','reader-'+new Date().toISOString().replace(/[:.]/g,'-'));await fs.mkdir(out,{recursive:true});
const report={passed:false,scope:'Existing file card → existing Reader → original same-version download; no media playback claim',checks:[],errors:[],screenshots:[]};
const {chromium}=createRequire(path.join(currentGen2Root,'package.json'))('playwright-core');const browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({viewport:{width:1600,height:1050},serviceWorkers:'block',acceptDownloads:true});
await context.route('**/*',r=>{const u=new URL(r.request().url());return ['127.0.0.1','localhost'].includes(u.hostname)||['blob:','data:'].includes(u.protocol)?r.continue():r.abort()});
await context.routeWebSocket('**/*',s=>{if(['127.0.0.1','localhost'].includes(new URL(s.url()).hostname))s.connectToServer();else s.close()});
const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
try{await page.goto(base+'/canvas/surface-core-main');await page.locator('.react-flow__node').first().waitFor({timeout:60000});await page.locator('.common-loading-overlay').waitFor({state:'hidden',timeout:60000});
 const envelope=await(await fetch(base+'/api/canvas/v1/canvases/surface-core-main')).json(),nodes=envelope.data.nodes;
 for(const fixture of prior.fixtures){const node=nodes.find(n=>n.data?.lcos_ref?.artifactId===fixture.reference.artifactId&&n.data.lcos_ref.revisionId===fixture.reference.revisionId);assert.ok(node);
  await page.locator('.react-flow__node[data-id="'+node.id+'"]').getByRole('button',{name:'查看文件',exact:true}).click();await page.locator('[data-media-viewer]').waitFor();
  await page.waitForFunction(async()=>{const m=await import('/assets/course-api-base-url-CifxI1ia.js'),s=m.LCOSNativeMaterialViewerRuntime.getState();return s.phase==='open'&&s.session?.lcosControlled?.requestKey},{},{timeout:30000});
  await page.getByRole('button',{name:'下载当前阅读版本',exact:true}).waitFor({timeout:30000});
  if(fixture.name.endsWith('.json'))assert.match(await page.locator('[data-media-viewer]').innerText(),/file-surface-drop/);
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'下载当前阅读版本',exact:true}).click();const download=await downloadPromise;const downloaded=path.join(out,fixture.name);await download.saveAs(downloaded);
  assert.deepEqual(await fs.readFile(downloaded),await fs.readFile(fixture.fixturePath));report.checks.push(fixture.name+': actual received/source file card opens existing Reader and downloads exact original bytes');
  const screen=path.join(out,fixture.name+'.png');await page.screenshot({path:screen});report.screenshots.push(screen);await page.locator('[data-media-viewer] button').first().click();await page.locator('[data-media-viewer]').waitFor({state:'hidden'});
 }
 assert.deepEqual(report.errors,[]);report.passed=true;
}catch(error){report.failure=error.stack;report.body=await page.locator('body').innerText().catch(()=> '');await page.screenshot({path:path.join(out,'failure.png')});process.exitCode=1}
finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,out}));await browser.close()}
