import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {currentGen2Root} from '../lab/current-gen2-resources.mjs';
const dependency=createRequire(path.join(currentGen2Root,'package.json'));
const {chromium}=dependency('playwright-core'),ts=dependency('typescript');
const source=await fs.readFile('lab/pilot/native-navigation-layout-watch.ts','utf8');
const js=ts.transpileModule(source.replace('export function','function'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const out=path.resolve('output/屏边导航布局观察_20261026');await fs.mkdir(out,{recursive:true});
const report={passed:false,scope:'Actual observer source in isolated real browser DOM; no product scene or Core writes',checks:[],coreWrites:0,modelCalls:0,errors:[]};
let browser,page;
try{
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-networking','--disable-sync','--no-first-run']});
 const context=await browser.newContext({viewport:{width:700,height:500},serviceWorkers:'block'});await context.route('**/*',route=>route.abort());
 page=await context.newPage();page.on('pageerror',error=>report.errors.push(String(error)));
 await page.setContent('<!doctype html><style>#owner{width:100px;height:50px;overflow:auto;transition:width .25s linear}#owner.open{width:220px}#text{height:150px}</style><div id="owner"><div id="text">original text</div></div><div data-native-navigation-layer><span id="ours">pin</span></div>');
 await page.addScriptTag({content:js+`;window.samples=[];window.cancelled=0;window.visibility=0;window.watch=watchNativeNavigationLayout(document,()=>samples.push({width:document.getElementById('owner').getBoundingClientRect().width,time:performance.now()}),()=>cancelled++,()=>visibility++);watch.sync([document.getElementById('owner')]);`});
 await page.waitForTimeout(80);await page.evaluate(()=>samples.length=0);
 await page.evaluate(()=>document.getElementById('text').firstChild.textContent='changed actual text');
 await page.waitForFunction(()=>samples.length>0);report.checks.push('original text mutation remeasures the actual DOM');
 await page.waitForTimeout(40);await page.evaluate(()=>samples.length=0);
 await page.evaluate(()=>document.getElementById('ours').textContent='own layer text');await page.waitForTimeout(60);
 assert.equal(await page.evaluate(()=>samples.length),0,'own portal mutation cannot feed an endless layout loop');
 report.checks.push('own navigation layer mutations do not create a measurement loop');
 await page.evaluate(()=>{samples.length=0;document.getElementById('owner').classList.add('open');});await page.waitForTimeout(340);
 const widths=await page.evaluate(()=>samples.map(row=>row.width));
 assert.ok(widths.some(width=>width>102&&width<218));assert.ok(widths.some(width=>width>=219));
 report.transitionWidths=widths;report.checks.push('real CSS geometry transition samples intermediate boxes and the final box');
 await page.evaluate(()=>{samples.length=0;document.getElementById('owner').scrollTop=35;});await page.waitForFunction(()=>samples.length>0);
 report.checks.push('capture scroll of an original inner owner schedules remeasurement');
 await page.waitForTimeout(60);await page.evaluate(()=>{watch.sync([]);samples.length=0;document.getElementById('owner').style.height='65px';});
 await page.waitForTimeout(60);await page.evaluate(()=>samples.length=0);
 // No resize callback after releasing the old owner; its transition is also
 // no longer relevant. A generic DOM mutation may still schedule one read.
 await page.evaluate(()=>document.getElementById('owner').dispatchEvent(new TransitionEvent('transitionrun',{bubbles:true,propertyName:'width'})));
 await page.waitForTimeout(60);assert.equal(await page.evaluate(()=>samples.length),0);
 report.checks.push('releasing an owner stops its resize observation and transition frame loop');
 await page.evaluate(()=>{watch.dispose();samples.length=0;document.getElementById('text').textContent='after dispose';window.dispatchEvent(new Event('resize'));document.dispatchEvent(new Event('visibilitychange'));});
 await page.waitForTimeout(70);assert.equal(await page.evaluate(()=>samples.length),0);assert.equal(await page.evaluate(()=>visibility),0);
 report.checks.push('dispose releases DOM, scroll, resize, transition, visibility listeners and scheduled frames');
 assert.deepEqual(report.errors,[]);report.passed=true;
}catch(error){report.failure=error.stack;process.exitCode=1;}finally{await browser?.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
