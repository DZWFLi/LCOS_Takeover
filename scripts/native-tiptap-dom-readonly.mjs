import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire}from'node:module';
import{fileURLToPath}from'node:url';
import{installedRoot}from'../lab/pilot/build-pilot.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),base='http://127.0.0.1:56239',nodeId='text-a34ae67c-c735-4b2f-9d1a-e6b5caff5cb9';
const output=path.join(root,'output/原生文本整合_20261017e/Tiptap只读DOM诊断',new Date().toISOString().replace(/[:.]/g,'-'));await fs.mkdir(output,{recursive:true});
const health=await(await fetch(base+'/health')).json();assert.equal(health.pid,44908);assert.equal(health.realCoreConnected,true);
const{chromium}=createRequire(path.join(installedRoot,'package.json'))('playwright-core');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN',serviceWorkers:'block'});
const report={passed:false,scope:'Read-only isolated candidate DOM/CSS diagnostics; all business writes blocked; no edit/fill/paste',pid:health.pid,blocked:[],errors:[],snapshots:[]};
await context.route('**/*',async route=>{const r=route.request(),u=new URL(r.url());if(!['data:','blob:'].includes(u.protocol)&&u.origin!==base)return route.abort();if(['POST','PUT','PATCH','DELETE'].includes(r.method())){report.blocked.push({method:r.method(),path:u.pathname});return route.abort()}return route.continue()});await context.routeWebSocket('**/*',socket=>socket.close());
const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
async function measure(label){return page.evaluate(label=>{
 const selector='[data-media-viewer]:has([data-native-tiptap-save-anchor]) .media-viewer__text-panel .canvas-text-markdown';
 const editor=document.querySelector('[data-media-viewer] [contenteditable="true"]');
 const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right}};
 const ancestors=[];for(let e=editor;e;e=e.parentElement){const s=getComputedStyle(e);ancestors.push({tag:e.tagName,class:e.className,attributes:[...e.attributes].filter(a=>a.name.startsWith('data-')||['contenteditable','style'].includes(a.name)).map(a=>[a.name,a.value]),padding:{top:s.paddingTop,right:s.paddingRight,bottom:s.paddingBottom,left:s.paddingLeft,block:s.paddingBlock},overflow:{x:s.overflowX,y:s.overflowY},rect:rect(e),scroll:{top:e.scrollTop,height:e.scrollHeight,client:e.clientHeight},actionHeight:s.getPropertyValue('--native-tiptap-action-height')});if(e.hasAttribute('data-media-viewer'))break}
 const matching=[];function rules(list,sheet,layers=[]){for(const r of list){if(r.cssRules?.length&&!r.selectorText){rules(r.cssRules,sheet,[...layers,r.cssText.slice(0,r.cssText.indexOf('{')).trim()]);continue}if(!r.selectorText||!r.style)continue;let matches=false;try{matches=!!editor&&editor.matches(r.selectorText)}catch{}if(!matches)continue;const relevant=[...r.style].filter(p=>p.startsWith('padding')||p==='all'||p==='box-sizing');if(relevant.length)matching.push({sheet,selector:r.selectorText,layers,properties:relevant.map(p=>({property:p,value:r.style.getPropertyValue(p),priority:r.style.getPropertyPriority(p)}))})}}for(const sheet of document.styleSheets){try{rules(sheet.cssRules,sheet.href)}catch(e){matching.push({sheet:sheet.href,error:e.message})}}
 const bar=document.querySelector('.media-viewer__text-actions'),viewer=editor?.closest('[data-media-viewer]');
 return{label,viewport:{width:innerWidth,height:innerHeight},selector,count:document.querySelectorAll(selector).length,anchorCount:document.querySelectorAll('[data-native-tiptap-save-anchor]').length,editorCount:document.querySelectorAll('[data-media-viewer] [contenteditable="true"]').length,ancestors,matchingRules:matching,bar:bar?{rect:rect(bar),class:bar.className,html:bar.outerHTML.slice(0,500)}:null,viewerVariable:viewer?getComputedStyle(viewer).getPropertyValue('--native-tiptap-action-height'):null,stylesheets:[...document.styleSheets].map(s=>s.href)};
},label)}
try{
 await page.goto(base+'/canvas/surface-core-main');await page.locator('[data-lcos-professional-surface-state="ready"]').waitFor({state:'attached',timeout:60000});
 await page.evaluate(id=>window.__LCOS_NODE_LAB__.api.fitView({nodes:[{id}],padding:.45,maxZoom:1.1,duration:0}),nodeId);
 const body=page.locator('[data-native-first-text-body="'+nodeId+'"]');await body.dblclick();await page.locator('[data-media-viewer] [contenteditable="true"]').waitFor({timeout:30000});await page.locator('.media-viewer__text-actions').waitFor();await page.waitForTimeout(700);
 report.snapshots.push(await measure('1440-open-stable'));
 await page.setViewportSize({width:320,height:1000});await page.waitForTimeout(600);report.snapshots.push(await measure('320-open-stable'));
 report.layerProbe=await page.evaluate(()=>{
  const selector='[data-media-viewer]:has([data-native-tiptap-save-anchor]) .media-viewer__text-panel .canvas-text-markdown',editor=document.querySelector(selector);
  const padding=()=>getComputedStyle(editor).paddingBottom,before=padding();
  const style=document.createElement('style');style.textContent='@layer utilities { '+selector+' { padding-bottom:calc(var(--native-tiptap-action-height,60px) + 56px)!important; } }';document.head.append(style);
  const after=padding(),cssText=style.textContent;style.remove();return{selector,before,after,removed:padding(),cssText,scope:'Reversible isolated page stylesheet only; no source or Core changes'};
 });
 await page.screenshot({path:path.join(output,'320-readonly.png')});
 report.agentCss={};const css=await page.evaluate(async()=>({status:(await fetch('/lcos/agent-ui.css')).status,text:await(await fetch('/lcos/agent-ui.css')).text()}));report.agentCss={status:css.status,containsAnchor:css.text.includes('data-native-tiptap-save-anchor'),containsPaddingRule:css.text.includes('--native-tiptap-action-height'),excerpts:[...css.text.matchAll(/[^{}]*\{[^{}]*(?:--native-tiptap-action-height)[^{}]*\}/g)].map(m=>m[0])};
 report.passed=true;
}catch(error){report.failure={message:error.message,stack:error.stack}}
finally{await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));await context.close();await browser.close()}
console.log(JSON.stringify({passed:report.passed,failure:report.failure?.message,report:path.join(output,'report.json'),layerProbe:report.layerProbe,snapshots:report.snapshots.map(s=>({label:s.label,count:s.count,anchorCount:s.anchorCount,padding:s.ancestors[0]?.padding,variable:s.viewerVariable,matching:s.matchingRules}))}));
