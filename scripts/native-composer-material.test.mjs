import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { extractNativeComposerContainers, transformNativeComposerFrame } from '../lab/native-composer-source-transform.mjs';
import { currentGen2Root } from '../lab/current-gen2-resources.mjs';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';

const root=path.resolve(import.meta.dirname,'..'),dependency=createRequire(path.join(currentGen2Root,'package.json'));
const webDependency=createRequire(path.join(currentGen2Root,'huabu/apps/web/package.json'));
const esbuild=dependency('esbuild'),{chromium}=dependency('playwright-core');
const output=path.join(root,'output/原Composer交互材质_20261026',new Date().toISOString().replace(/[:.]/g,'-'));await fs.mkdir(output,{recursive:true});
const asset='agent-host-provider-uVo_bky5.js',original=await fs.readFile(path.join(root,'reference/tapnow-installed/resources/web/assets',asset),'utf8');
const transformed=transformNativeComposerFrame(asset,original),marker='\n/* LCOS controlled Composer slots: original Bl/Gy/FM/Dy containers. */\n';
assert.equal(transformed.slice(0,transformed.indexOf(marker)),original);
const classes=extractNativeComposerContainers(original);
const parts='import * as a from "react";import * as o from "react/jsx-runtime";const M=(...v)=>v.filter(Boolean).join(" ");\n'+transformed.slice(transformed.indexOf(marker));
await buildPilotEntry('lab/pilot/native-composer-material.ts',path.join(output,'nativeReact-material.js'),'browser',{nativeReact:true});
const entry=`import React,{useCallback,useRef,useState}from'react';import{createRoot}from'react-dom/client';
import{LCOSNativeComposerParts as p}from'original-composer-parts';
import{useNativeComposerMaterial}from'./lab/pilot/native-composer-material.ts';
const events=[];let update;window.__COMPOSER_FIXTURE__={set:next=>update(next),events:()=>events.slice()};
function App(){const[state,setState]=useState({disabled:false,suppressed:false,hidden:false,inert:false,ariaHidden:false,display:'',opacity:'',classHidden:false,key:0,show:true,submitDisabled:false,text:'保留这份原草稿'});update=next=>setState(old=>({...old,...next}));
const surface=useRef(null),input=useRef(null);useNativeComposerMaterial(surface,{disabled:state.disabled,suppressed:state.suppressed});
const originalRef=useCallback(node=>{events.push({type:'original-ref',value:!!node});if(!node)window.__LAST_SURFACE__=surface.current;surface.current=node;},[]);
const log=(type,value)=>events.push({type,value});
return <><button id="outside">输入之外</button><div id="visibility-owner" hidden={state.hidden} inert={state.inert||undefined} aria-hidden={state.ariaHidden||undefined} className={state.classHidden?'fixture-hidden':''} style={{display:state.display,opacity:state.opacity,transition:'opacity 40ms linear'}}>
{state.show?<p.Frame key={state.key} className="native-composer-view" heading={<div id="heading">原会话标题</div>} options={<div id="options">原会话选项</div>} feedback={<div id="feedback">原反馈保留</div>}
surfaceProps={{ref:originalRef,'data-lcos-composer-reference-surface':true,onDragOver:event=>{event.preventDefault();log('drag-over');},onDrop:event=>{event.preventDefault();log('drop',event.dataTransfer.getData('text/plain'));},onPaste:event=>{event.preventDefault();log('paste',event.clipboardData.getData('text/plain'));}}}
references={<p.ReferenceFrame><p.Button id="reference" onClick={()=>log('reference')}>原显式引用</p.Button></p.ReferenceFrame>}
editor={<p.EditorFrame><textarea id="input" ref={input} aria-label="原输入" readOnly={state.disabled} value={state.text} onChange={event=>setState(old=>({...old,text:event.target.value}))} onKeyDown={event=>log('key',event.key)} className="fixture-input"/></p.EditorFrame>}
actions={<p.ToolbarFrame start={<p.Button id="attach" onPointerDown={()=>log('caret',input.current.selectionStart)} onClick={()=>log('attach')}>附</p.Button>}
end={<p.Button id="submit" disabled={state.submitDisabled} onClick={()=>log('submit',state.text)}>送</p.Button>}/>}/>:null}</div></>;}
createRoot(document.getElementById('app')).render(<App/>);`;
const built=await esbuild.build({stdin:{contents:entry,loader:'tsx',resolveDir:root,sourcefile:'controlled-original-composer-material.tsx'},bundle:true,jsx:'automatic',platform:'browser',format:'iife',write:false,outfile:path.join(output,'fixture.js'),plugins:[{name:'actual-native-parts',setup(build){
  build.onResolve({filter:/^original-composer-parts$/},()=>({path:'parts',namespace:'original-parts'}));
  build.onLoad({filter:/.*/,namespace:'original-parts'},()=>({contents:parts,loader:'jsx',resolveDir:root}));
  build.onResolve({filter:/^(react(?:\/.*)?|react-dom(?:\/.*)?)$/},args=>{for(const resolver of[webDependency,dependency])try{return{path:resolver.resolve(args.path)};}catch{}throw Error('Missing frontend dependency '+args.path);});
}}],logLevel:'silent'});
const js=built.outputFiles.find(file=>file.path.endsWith('.js')).text,css=built.outputFiles.find(file=>file.path.endsWith('.css')).text;
const vendorCss=(await Promise.all(['index-C0AQWjts.css','agent-host-provider-BKODGS2y.css'].map(name=>fs.readFile(path.join(root,'reference/tapnow-installed/resources/web/assets',name),'utf8')))).join('\n');
const theme=await fs.readFile(path.join(root,'lab/native-light-theme.css'),'utf8');
await fs.writeFile(path.join(output,'fixture.js'),js);await fs.writeFile(path.join(output,'fixture.css'),css);
const report={passed:false,scope:'Isolated actual original Bl/Gy/FM/Dy parts and original compiled CSS, real React, original W1 passive interaction plus new native adapter. No running LCOS page, Core, model or actual submission.',checks:[],measurements:[],network:[],errors:[],nativeReactBuild:true};
let browser,page;
const frames=(count=8)=>page.evaluate(count=>new Promise(resolve=>{const next=()=>--count<=0?resolve():requestAnimationFrame(next);requestAnimationFrame(next);}),count);
try{
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-networking','--disable-sync','--no-first-run']});
  const context=await browser.newContext({viewport:{width:800,height:700},reducedMotion:'no-preference',serviceWorkers:'block'});
  await context.route('**/*',route=>{report.network.push({method:route.request().method(),url:route.request().url()});return route.abort();});
  page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',error=>report.errors.push(String(error)));
  await page.setContent('<!doctype html><html data-lcos-theme="light"><head><title>Original Composer passive material</title></head><body style="margin:0;background:linear-gradient(125deg,#dfeef3,#f4e4f1);min-height:100vh"><div id="app" style="position:relative;width:460px;margin:90px 130px"></div></body></html>');
  await page.addStyleTag({content:vendorCss+'\n'+theme+'\n'+css+'\n.fixture-input{display:block;width:100%;min-height:48px;background:transparent;color:inherit;font:14px/20px sans-serif;resize:none;border:0;padding:0;outline:none}.fixture-hidden{display:none!important}'});
  // Observation instruments browser APIs without replacing their behavior.
  await page.evaluate(()=>{
    const listeners=[],observers=[],raf=new Set(),add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener;
    const relevant=(target,type)=>(target===window&&type==='blur')||(target===document&&['visibilitychange','animationend','transitionend'].includes(type))||(target instanceof MediaQueryList&&type==='change')||(target instanceof Element&&target.matches('[data-canvas-input-bubble]')&&['pointerenter','pointermove','pointerleave','pointerdown','pointercancel'].includes(type));
    const capture=value=>typeof value==='boolean'?value:!!value?.capture;
    EventTarget.prototype.addEventListener=function(type,listener,options){if(relevant(this,type)&&!listeners.some(row=>row.target===this&&row.type===type&&row.listener===listener&&row.capture===capture(options)))listeners.push({target:this,type,listener,capture:capture(options)});return add.call(this,type,listener,options);};
    EventTarget.prototype.removeEventListener=function(type,listener,options){const index=listeners.findIndex(row=>row.target===this&&row.type===type&&row.listener===listener&&row.capture===capture(options));if(index>=0)listeners.splice(index,1);return remove.call(this,type,listener,options);};
    for(const name of ['MutationObserver','ResizeObserver']){const Original=window[name];window[name]=class extends Original{constructor(callback){super(callback);this.targets=new Set();observers.push(this);}observe(target,options){this.targets.add(target);return super.observe(target,options);}unobserve(target){this.targets.delete(target);return super.unobserve?.(target);}disconnect(){this.targets.clear();return super.disconnect();}};}
    const request=window.requestAnimationFrame,cancel=window.cancelAnimationFrame;window.requestAnimationFrame=callback=>{let id=request(time=>{raf.delete(id);callback(time);});raf.add(id);return id;};window.cancelAnimationFrame=id=>{raf.delete(id);return cancel(id);};
    window.__READ_MATERIAL_LIFETIME__=()=>({listeners:listeners.length,types:listeners.map(row=>row.type),observed:observers.reduce((sum,row)=>sum+row.targets.size,0),raf:raf.size});
  });
  await page.addScriptTag({content:js});const bubble=page.locator('[data-canvas-input-bubble]'),input=page.getByRole('textbox',{name:'原输入'});await input.waitFor();
  const set=async next=>{await page.evaluate(next=>window.__COMPOSER_FIXTURE__.set(next),next);await frames(2);};
  const measure=async label=>{const value=await bubble.evaluate((element,label)=>{const css=getComputedStyle(element),light=getComputedStyle(element,'::before'),box=el=>el.getBoundingClientRect().toJSON();return{label,bubble:box(element),content:box(element.firstElementChild),editor:box(element.querySelector('textarea')),button:box(element.querySelector('#submit')),classes:element.className,children:element.children.length,active:element.getAttribute('data-lcos-native-composer-material-active'),hover:element.getAttribute('data-lcos-window-material-hover'),x:element.style.getPropertyValue('--lcos-window-light-x'),opacity:light.opacity,display:light.display,lightPointer:light.pointerEvents,lightZ:light.zIndex,contentZ:getComputedStyle(element.firstElementChild).zIndex,blur:css.backdropFilter,border:css.borderWidth,background:css.backgroundColor,padding:css.padding,selection:[element.querySelector('textarea').selectionStart,element.querySelector('textarea').selectionEnd],text:element.querySelector('textarea').value,lifetime:window.__READ_MATERIAL_LIFETIME__()};},label);report.measurements.push(value);return value;};
  let value=await measure('original-idle'),baseline=value;
  assert.equal(value.classes,classes.bubble);assert.equal(value.children,1);assert.equal(value.contentZ,'10');assert.equal(value.lightZ,'0');assert.equal(value.lightPointer,'none');assert.equal(value.opacity,'0');
  const rect=await bubble.boundingBox();await page.mouse.move(rect.x+rect.width*.85,rect.y+12);
  await page.waitForFunction(()=>parseFloat(document.querySelector('[data-canvas-input-bubble]').style.getPropertyValue('--lcos-window-light-x'))>84.8);
  value=await measure('original-hover-85percent');assert.equal(value.hover,'true');assert.ok(Math.abs(parseFloat(value.x)-85)<.2);await page.waitForFunction(()=>parseFloat(getComputedStyle(document.querySelector('[data-canvas-input-bubble]'),'::before').opacity)>.99);
  await page.screenshot({path:path.join(output,'01-original-bubble-hover.png')});
  for(const key of ['bubble','content','editor','button','blur','border','background','padding'])assert.deepEqual(value[key],baseline[key],'Optical hover preserves original '+key);
  report.checks.push('actual original Frame classes, one z10 content child, 50px blur/border/padding/geometry remain unchanged; W1 light follows actual pointer to85% below content without new wrapper or hit area');
  await input.fill('这份草稿和原引用都保留');await input.press('Home');await input.press('ArrowRight');await input.press('ArrowRight');await input.press('ArrowRight');
  const selection=await input.evaluate(el=>[el.selectionStart,el.selectionEnd]);await page.mouse.move(700,600);await page.waitForFunction(()=>!document.querySelector('[data-canvas-input-bubble]').style.getPropertyValue('--lcos-window-light-x'));
  await page.waitForFunction(()=>Math.abs(parseFloat(getComputedStyle(document.querySelector('[data-canvas-input-bubble]'),'::before').opacity)-.55)<.01);
  value=await measure('static-focus');assert.equal(value.hover,null);assert.deepEqual(value.selection,selection);assert.equal(value.text,'这份草稿和原引用都保留');
  await page.locator('#attach').click();const events=await page.evaluate(()=>window.__COMPOSER_FIXTURE__.events());assert.equal(events.filter(row=>row.type==='caret').at(-1).value,selection[0]);assert.equal(events.filter(row=>row.type==='attach').length,1);
  assert.equal(await bubble.getAttribute('data-lcos-window-material-hover'),null);assert.equal(await bubble.evaluate(el=>el.style.getPropertyValue('--lcos-window-light-x')),'');
  await bubble.evaluate(element=>{const data=new DataTransfer();data.setData('text/plain','original-reference');element.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:data}));element.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data}));element.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));});
  const afterEvents=await page.evaluate(()=>window.__COMPOSER_FIXTURE__.events());for(const type of ['drag-over','drop','paste'])assert.equal(afterEvents.filter(row=>row.type===type).length,1);assert.equal(await input.inputValue(),'这份草稿和原引用都保留');
  report.checks.push('focus gets static .55 light without caret/text change; original press resets pointer light and original pre-blur caret callback fires; Drop/Paste still reach exactly one existing handler');
  await set({submitDisabled:true});await page.mouse.move(rect.x+rect.width*.7,rect.y+12);await page.waitForFunction(()=>document.querySelector('[data-canvas-input-bubble]').dataset.lcosWindowMaterialHover==='true');assert.equal(await page.locator('#submit').isDisabled(),true);assert.equal(await bubble.getAttribute('data-lcos-native-composer-material-active'),'true');
  await set({disabled:true});await page.waitForFunction(()=>document.querySelector('[data-canvas-input-bubble]').getAttribute('data-lcos-native-composer-material-active')==='false');assert.equal(await bubble.getAttribute('data-lcos-window-material-hover'),null);assert.equal(await bubble.evaluate(el=>el.style.getPropertyValue('--lcos-window-light-x')),'');
  await page.waitForFunction(()=>parseFloat(getComputedStyle(document.querySelector('[data-canvas-input-bubble]'),'::before').opacity)<.01);
  await set({disabled:false,suppressed:true});assert.equal(await bubble.getAttribute('data-lcos-native-composer-material-active'),'false');await set({suppressed:false});
  report.checks.push('a disabled submit button alone does not disable input material; true readOnly/disabled and suppressed release pointer interaction and clear old light instead of pretending to think');
  for(const [name,patch,restore]of [['hidden',{hidden:true},{hidden:false}],['inert',{inert:true},{inert:false}],['aria-hidden',{ariaHidden:true},{ariaHidden:false}],['display-none',{display:'none'},{display:''}],['hidden-class',{classHidden:true},{classHidden:false}]]){
    await page.mouse.move(rect.x+rect.width*.75,rect.y+12);await set(patch);await page.waitForFunction(()=>document.querySelector('[data-canvas-input-bubble]').getAttribute('data-lcos-native-composer-material-active')==='false');assert.equal(await bubble.evaluate(el=>el.style.getPropertyValue('--lcos-window-light-x')),'');await page.mouse.move(700,600);await set(restore);await page.waitForFunction(()=>document.querySelector('[data-canvas-input-bubble]').getAttribute('data-lcos-native-composer-material-active')==='true');assert.equal(await bubble.getAttribute('data-lcos-window-material-hover'),null);report.checks.push('native ancestry '+name+' cleans the existing interaction; re-show starts centered without stale hover');
  }
  await set({opacity:'0'});await page.waitForFunction(()=>document.querySelector('[data-canvas-input-bubble]').getAttribute('data-lcos-native-composer-material-active')==='false');await set({opacity:'1'});await page.waitForFunction(()=>document.querySelector('[data-canvas-input-bubble]').getAttribute('data-lcos-native-composer-material-active')==='true');
  await input.click();await page.emulateMedia({reducedMotion:'reduce'});await frames(3);await page.mouse.move(rect.x+rect.width*.8,rect.y+12);assert.equal(await bubble.evaluate(el=>el.style.getPropertyValue('--lcos-window-light-x')),'');value=await measure('reduced-static-focus');assert.equal(value.opacity,'0.55');
  await page.emulateMedia({forcedColors:'active'});value=await measure('forced-colors');assert.equal(value.display,'none');assert.equal(await input.inputValue(),'这份草稿和原引用都保留');await page.screenshot({path:path.join(output,'02-forced-colors-original-input.png')});
  await page.emulateMedia({forcedColors:'none',reducedMotion:'no-preference'});
  report.checks.push('real opacity transition completion re-evaluates visibility; browser reduced-motion disables pointer following but keeps static focus, forced-colors removes decoration and preserves original input');
  await page.mouse.move(700,600);await page.mouse.move(rect.x+rect.width*.9,rect.y+12);await set({key:1});await input.waitFor();await frames(3);assert.equal(await bubble.count(),1);assert.equal(await page.evaluate(()=>window.__LAST_SURFACE__.isConnected),false);assert.equal(await page.evaluate(()=>window.__LAST_SURFACE__.style.getPropertyValue('--lcos-window-light-x')),'');
  await page.evaluate(()=>window.__LAST_SURFACE__.dispatchEvent(new PointerEvent('pointermove',{clientX:200,clientY:200,pointerType:'mouse',bubbles:true})));assert.equal(await page.evaluate(()=>window.__LAST_SURFACE__.style.getPropertyValue('--lcos-window-light-x')),'');
  await set({show:false});await bubble.waitFor({state:'detached'});await frames(3);const lifetime=await page.evaluate(()=>window.__READ_MATERIAL_LIFETIME__());assert.equal(lifetime.listeners,0);assert.equal(lifetime.observed,0);assert.equal(lifetime.raf,0);report.cleanup=lifetime;
  report.checks.push('actual Frame/ref replacement releases old host; a detached old pointer event cannot revive it; final unmount leaves0 material listeners,0 observed targets,0 RAF');
  assert.deepEqual(report.errors,[]);assert.ok(report.network.every(row=>row.method==='GET'),'No business or model request');report.passed=true;
}catch(error){report.failure=error.stack;process.exitCode=1;if(page)try{report.failureDom=await page.evaluate(()=>({owner:document.getElementById('visibility-owner')?.outerHTML,material:document.querySelector('[data-canvas-input-bubble]')?.outerHTML,lifetime:window.__READ_MATERIAL_LIFETIME__?.()}));await page.screenshot({path:path.join(output,'failure.png')});}catch{}}
finally{await browser?.close();await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,output,checks:report.checks,failure:report.failure},null,2));}
