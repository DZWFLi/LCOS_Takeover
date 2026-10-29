import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { currentGen2Root } from '../lab/current-gen2-resources.mjs';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';

const root = path.resolve(import.meta.dirname, '..'), dependency = createRequire(path.join(currentGen2Root, 'package.json'));
const webDependency = createRequire(path.join(currentGen2Root, 'huabu/apps/web/package.json'));
const esbuild = dependency('esbuild'), { chromium } = dependency('playwright-core');
const output = path.join(root, 'output/Glyth思绪材质_20261026', new Date().toISOString().replace(/[:.]/g, '-'));
await fs.mkdir(output, { recursive: true });
const report = { passed: false, output, scope: 'Actual M2/SiriWave renderer, new inert adapter, actual GlythBodyView and current node-layout CSS in a controlled React browser fixture. No running LCOS page/Core/model; no ThoughtBubble or full ThoughtView restoration claim.',
  checks: [], mapping: [], measurements: [], errors: [], network: [], coreWrites: 0, modelCalls: 0 };
await buildPilotEntry('lab/pilot/native-glyth-thought-material.tsx', path.join(output, 'nativeReact-leaf.js'), 'browser', { nativeReact: true });
report.nativeReactBuild = true;

const fixture = `import React from 'react';import {createRoot} from 'react-dom/client';
import {NativeGlythThoughtMaterial,nativeGlythThoughtRippleInput} from './lab/pilot/native-glyth-thought-material.tsx';
import {GlythBodyView} from './lcos/huabu/apps/web/src/lcos/ui/glyth/GlythBodyView.tsx';
import './lab/pilot/native-glyth-node-layout.css';
const root=createRoot(document.getElementById('app'));let props={layout:'object'},mounted=true,clicks=0,pointers=0,keys=0;
function draw(){root.render(mounted?<div id="owner" className="lcos-conversation-node-shell" data-lcos-native-conversation-drop-target="fixture" data-native-glyth-appearance={props.layout==='object'?'egg/violet/curious':undefined}
 style={{width:props.layout==='object'?121:230,height:props.layout==='object'?142:44,display:'flex',alignItems:'center',gap:10,minWidth:230}}
 onPointerDown={()=>pointers++} onKeyDown={()=>keys++}>
 <NativeGlythThoughtMaterial {...props}/>
 <GlythBodyView pose="idle" selected={props.selected} size={props.layout==='object'?72:44} left={0} top={0}
 {...(props.layout==='object'?{appearance:{shape:'egg',color:'violet',motion:'curious'}}:{})}/>
 <div id="label" style={{minWidth:0}}><button id="title" type="button" aria-haspopup="dialog" onClick={()=>clicks++} style={{maxWidth:270,fontSize:12}}>原协作者</button>
 <div id="status" aria-live="polite" style={{marginTop:4,fontSize:12,opacity:.78}}>原进展文字</div></div>
 </div>:null);}
window.__FIXTURE__={set(next){props={...props,...next};draw();},unmount(){mounted=false;draw();},map:nativeGlythThoughtRippleInput,read(){return{clicks,pointers,keys};}};draw();`;
const result = await esbuild.build({ stdin: { contents: fixture, loader: 'tsx', resolveDir: root, sourcefile: 'controlled-native-glyth-thought.tsx' },
  bundle: true, jsx: 'automatic', platform: 'browser', format: 'iife', write: false, outfile: path.join(output, 'fixture.js'),
  plugins: [{ name: 'real-renderer-read-observation', setup(build) {
    build.onResolve({ filter: /^(react(?:\/.*)?|react-dom(?:\/.*)?)$/ }, args => {
      for (const resolver of [webDependency, dependency]) { try { return { path: resolver.resolve(args.path) }; } catch {} }
      throw Error('Installed frontend dependency missing: ' + args.path);
    });
    build.onLoad({ filter: /[\\/]materials[\\/]spectralRipple\.ts$/ }, async args => {
      let source = await fs.readFile(args.path, 'utf8');
      const start = '  return {\n    update,', end = '      source.width = source.height = 0;\n    },\n  };\n}';
      source = source.replaceAll('\r\n', '\n');
      assert.equal(source.split(start).length, 2); assert.equal(source.split(end).length, 2);
      // Only expose inspect() reads from the real returned controller. No
      // phase/canvas/clock function is replaced and no setter is exported.
      source = source.replace(start, '  const controller = {\n    update,').replace(end,
        '      source.width = source.height = 0;\n    },\n  };\n  (globalThis.__M2_RENDERER_READS__ ??= []).push(() => controller.inspect());\n  return controller;\n}');
      return { contents: source, loader: 'ts', resolveDir: path.dirname(args.path) };
    });
  } }], logLevel: 'silent' });
const js = result.outputFiles.find(file => file.path.endsWith('.js'))?.text;
const css = result.outputFiles.find(file => file.path.endsWith('.css'))?.text ?? '';
assert.ok(js); await fs.writeFile(path.join(output, 'fixture.js'), js); await fs.writeFile(path.join(output, 'fixture.css'), css);
let browser, page;
const frames = (page, count = 8) => page.evaluate(count => new Promise(resolve => { const step = () => --count <= 0 ? resolve() : requestAnimationFrame(step); requestAnimationFrame(step); }), count);
const thought = (tone, source = 'progress', age = 0) => ({ key: tone+'/'+source+'/'+age, scope: 'controlled-only', tone, source,
  text: '受控原件生命周期验证', sticky: ['attention','error'].includes(tone), occurredAt: new Date(Date.now()-age).toISOString() });
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-networking','--disable-sync','--no-first-run'] });
  const context = await browser.newContext({ viewport: { width: 720, height: 700 }, reducedMotion: 'no-preference', serviceWorkers: 'block' });
  await context.route('**/*', route => { report.network.push(route.request().url()); return route.abort(); });
  page = await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', error => report.errors.push(String(error)));
  const boot = async (fallback = false) => {
    await page.setContent('<!doctype html><html data-theme="light"><head><title>Controlled real M2 leaf</title></head><body style="margin:0;background:#f5f6f7;min-height:2600px"><button id="outside">节点外</button><div id="app" style="position:relative;margin:80px 100px;width:max-content"></div></body></html>');
    await page.addStyleTag({ content: css });
    if (fallback) await page.evaluate(() => { HTMLCanvasElement.prototype.getContext = () => null; });
    await page.addScriptTag({ content: js }); await page.locator('[data-native-glyth-thought-material]').waitFor({ state: 'attached' });
    await frames(page, 3);
  };
  await boot();
  const inspect = () => page.evaluate(() => window.__M2_RENDERER_READS__.map(read => read()));
  const set = async props => { await page.evaluate(props => window.__FIXTURE__.set(props), props); await frames(page, 2); };
  const measure = async label => {
    const value = await page.evaluate(label => {
      const root=document.querySelector('[data-native-glyth-thought-material]'),field=root.querySelector('.lcos-soft-underlight-field'),owner=document.getElementById('owner'),button=document.getElementById('title'),status=document.getElementById('status');
      const box=el=>el.getBoundingClientRect().toJSON(),b=box(button),canvas=field.querySelector('canvas'), pixels=canvas.getContext('2d')?.getImageData(0,0,canvas.width,canvas.height).data;
      let painted=0,colored=0,minX=Infinity,minY=Infinity,maxX=-1,maxY=-1,alphaPeak=0;
      if(pixels)for(let i=3;i<pixels.length;i+=4){if(pixels[i])painted++;alphaPeak=Math.max(alphaPeak,pixels[i]);if(pixels[i]>=8){colored++;const at=(i-3)/4,x=at%canvas.width,y=Math.floor(at/canvas.width);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}}
      const coloredBounds=colored?{left:minX/canvas.width*field.clientWidth,right:(maxX+1)/canvas.width*field.clientWidth,top:minY/canvas.height*field.clientHeight,bottom:(maxY+1)/canvas.height*field.clientHeight,width:(maxX-minX+1)/canvas.width*field.clientWidth,height:(maxY-minY+1)/canvas.height*field.clientHeight}:null;
      const hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);
      return {label,owner:box(owner),material:box(root),field:box(field),body:box(owner.querySelector('.lcos-glyth-presence')),button:b,status:box(status),
        phase:root.dataset.ripplePhase,active:root.dataset.rippleActive,stale:root.dataset.stale,renderer:field.dataset.rippleRenderer,
        pointerEvents:getComputedStyle(root).pointerEvents,buttonHit:!!hit&&button.contains(hit),text:status.textContent,painted,colored,coloredBounds,alphaPeak,
        opacity:getComputedStyle(root).opacity,forcedDisplay:getComputedStyle(root).display,bodyZ:getComputedStyle(owner.querySelector('.lcos-glyth-presence')).zIndex,labelZ:getComputedStyle(document.getElementById('label')).zIndex,
        read:window.__M2_RENDERER_READS__.map(read=>read()),events:window.__FIXTURE__.read()};
    },label); report.measurements.push(value);return value;
  };
  const mappingCases = [
    [{}, {engaged:true,inView:true,hidden:false,now:Date.now()}, 'quiet',true],
    [{selected:true}, {engaged:false,inView:true,hidden:false,now:Date.now()}, 'quiet',true],
    [{thought:thought('thinking','task')}, {engaged:false,inView:true,hidden:false,now:Date.now()}, 'quiet',true],
    [{thought:thought('thinking','progress',61000)}, {engaged:true,inView:true,hidden:false,now:Date.now()}, 'quiet',true],
    [{thought:thought('thinking')}, {engaged:false,inView:true,hidden:false,now:Date.now()}, 'thinking',true],
    [{thought:thought('working'),suppressed:true}, {engaged:true,inView:true,hidden:false,now:Date.now()}, 'working',false],
    [{thought:thought('attention','attention')}, {engaged:false,inView:true,hidden:false,now:Date.now()}, 'attention',true],
    [{thought:thought('error','recovery')}, {engaged:false,inView:true,hidden:false,now:Date.now()}, 'error',true],
  ];
  for(const [props,environment,phase,active] of mappingCases){const value=await page.evaluate(({props,environment})=>window.__FIXTURE__.map(props,environment),{props,environment});assert.equal(value.phase,phase);assert.equal(value.active,active);report.mapping.push({input:{tone:props.thought?.tone,source:props.thought?.source,selected:props.selected,suppressed:props.suppressed},phase:value.phase,active:value.active,stale:value.stale});}
  report.checks.push('GUI hover/selected stays quiet; task/stale progress does not impersonate live thinking; real attention/error retain their own phase');
  const initial = await measure('object-idle');assert.equal(initial.active,'false');assert.equal(initial.owner.width,121);assert.equal(initial.owner.height,142);assert.equal(initial.field.height,64);assert.equal(initial.pointerEvents,'none');
  await page.locator('#owner').hover();await page.waitForFunction(()=>document.querySelector('[data-native-glyth-thought-material]').dataset.rippleActive==='true');
  let value=await measure('quiet-hover');assert.equal(value.phase,'quiet');assert.equal(value.read[0].running,false);assert.equal(value.buttonHit,true);
  await page.locator('#outside').click();await page.keyboard.press('Tab');await page.waitForFunction(()=>document.activeElement?.id==='title');
  value=await measure('quiet-focus');assert.equal(value.phase,'quiet');assert.equal(value.active,'true');
  await page.keyboard.press('Enter');await page.keyboard.press('Escape');assert.equal((await measure('original-actions')).events.clicks,1);assert.ok((await measure('original-keys')).events.keys>=2);
  await set({selected:true});await page.locator('#outside').click();value=await measure('quiet-selected');assert.equal(value.phase,'quiet');assert.equal(value.active,'true');
  report.checks.push('real pointer/focus/selected activates only static quiet; original button click, keyboard and hit remain usable; no new tab stop');
  await set({selected:false,thought:thought('thinking')});await page.waitForFunction(()=>{const r=window.__M2_RENDERER_READS__[0]();return r.renders>=20&&r.gain>=1.15&&r.running;});
  value=await measure('object-real-thinking');assert.equal(value.renderer,'siriwave-canvas');assert.ok(value.painted>0);assert.equal(value.field.height,64);assert.equal(value.bodyZ,'1');assert.equal(value.labelZ,'1');
  assert.ok(value.coloredBounds?.height>=10,'Actual M2 colored contour has visible vertical extent, not merely a nonzero alpha hairline');
  await page.screenshot({path:path.join(output,'01-object-real-M2-thinking.png')});
  await page.evaluate(()=>{const c=document.querySelector('.lcos-spectral-ripple-canvas');window.__PRIOR_M2_PIXELS__=c.getContext('2d').getImageData(0,0,c.width,c.height).data;});
  await frames(page,12);
  const changedPixels=await page.evaluate(()=>{const c=document.querySelector('.lcos-spectral-ripple-canvas'),next=c.getContext('2d').getImageData(0,0,c.width,c.height).data,prior=window.__PRIOR_M2_PIXELS__;let changed=0;for(let i=0;i<next.length;i+=4)if(next[i]!==prior[i]||next[i+1]!==prior[i+1]||next[i+2]!==prior[i+2]||next[i+3]!==prior[i+3])changed++;delete window.__PRIOR_M2_PIXELS__;return changed;});
  assert.ok(changedPixels>0,'Actual contour pixels change across real thinking frames');report.changedThinkingPixels=changedPixels;
  await page.screenshot({path:path.join(output,'01b-object-real-M2-next-frame.png')});
  await set({layout:'row'});value=await measure('row-real-thinking');assert.equal(value.owner.width,230);assert.equal(value.owner.height,44);assert.equal(value.field.height,64);assert.ok(value.material.top>=value.owner.top-10.1&&value.material.bottom<=value.owner.bottom+10.1);assert.ok(value.material.left>=value.body.left-10.1&&value.material.right<=value.body.right+10.1);assert.equal(value.buttonHit,true);
  await page.screenshot({path:path.join(output,'02-row-real-M2-thinking.png')});
  assert.equal((await inspect()).length,1,'Props/hover/size changes never remount the curves');
  report.checks.push('actual SiriWave draws nontransparent pixels; complete 64px field blends below actual GlythBodyView; 121×142 object and 230×44 row sizes unchanged, row extension <=10px each side');
  await set({suppressed:true});let controller=(await inspect())[0];assert.equal(controller.running,false);const stopped=controller.renders;await frames(page,10);assert.equal((await inspect())[0].renders,stopped);
  await set({suppressed:false});await page.waitForFunction(()=>window.__M2_RENDERER_READS__[0]().running);
  await set({thought:thought('thinking','task')});await page.waitForFunction(()=>!window.__M2_RENDERER_READS__[0]().running);value=await measure('task-is-quiet');assert.equal(value.phase,'quiet');assert.equal(value.read[0].running,false);
  await set({thought:thought('working','progress',61000)});value=await measure('stale-is-quiet');assert.equal(value.phase,'quiet');assert.equal(value.stale,'true');
  await set({thought:thought('thinking','progress',59940)});await page.waitForFunction(()=>document.querySelector('[data-native-glyth-thought-material]').dataset.stale==='true');assert.equal((await measure('freshness-expiry')).phase,'quiet');
  await page.evaluate(()=>{const schedule=window.setTimeout,delays=[];window.setTimeout=function(callback,delay,...args){delays.push(delay);return schedule.call(this,callback,delay,...args);};window.__READ_SCHEDULED_DELAYS__=()=>delays.slice();});
  await set({thought:thought('working','progress',-365*24*60*60*1000)});await frames(page,8);
  const futureDelays=await page.evaluate(()=>window.__READ_SCHEDULED_DELAYS__());assert.ok(futureDelays.includes(2147483647),'Future timestamps never overflow the browser timer limit');assert.ok(futureDelays.every(value=>value<=2147483647));assert.ok(futureDelays.length<10,'No 1ms overflow rescheduling loop');report.futureTimestampDelays=futureDelays;
  for(const tone of ['attention','done','error']){await set({thought:thought(tone,tone==='done'?'result':tone==='error'?'recovery':'attention')});await page.waitForFunction(()=>!window.__M2_RENDERER_READS__[0]().running);value=await measure(tone+'-static');assert.equal(value.phase,tone);assert.equal(value.read[0].running,false);assert.equal(value.text,'原进展文字');}
  report.checks.push('suppression stops and resumes original RAF; task/stale fallback stays quiet, actual progress ages to stale without inventing an event; attention/done/error settle statically and retain original text');
  await set({thought:thought('working')});await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>window.__M2_RENDERER_READS__[0]().reduced);await frames(page,3);value=await measure('reduced-motion');assert.equal(value.read[0].running,false);assert.ok(value.painted>0);
  await page.emulateMedia({reducedMotion:'no-preference',forcedColors:'active'});await frames(page,4);value=await measure('forced-colors');assert.equal(value.forcedDisplay,'none');assert.equal(value.read[0].running,false);assert.equal(value.text,'原进展文字');
  await page.emulateMedia({forcedColors:'none'});await page.waitForFunction(()=>window.__M2_RENDERER_READS__[0]().running);
  await page.evaluate(()=>scrollTo(0,2200));await page.waitForFunction(()=>!window.__M2_RENDERER_READS__[0]().inView&&!window.__M2_RENDERER_READS__[0]().running);
  await page.evaluate(()=>scrollTo(0,0));await page.waitForFunction(()=>window.__M2_RENDERER_READS__[0]().inView&&window.__M2_RENDERER_READS__[0]().running);
  report.checks.push('actual browser reduced-motion gives static pixels, forced-colors removes decoration without removing text; real viewport intersection stops/resumes animation');
  await page.evaluate(()=>{window.__CONTROLLED_DOCUMENT_HIDDEN__=true;Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.__CONTROLLED_DOCUMENT_HIDDEN__});document.dispatchEvent(new Event('visibilitychange'));});
  assert.equal((await inspect())[0].running,false);assert.equal((await measure('controlled-document-hidden')).active,'false');
  await page.evaluate(()=>{window.__CONTROLLED_DOCUMENT_HIDDEN__=false;document.dispatchEvent(new Event('visibilitychange'));});await page.waitForFunction(()=>window.__M2_RENDERER_READS__[0]().running);
  report.checks.push('controlled document.hidden visibilitychange stops/resumes the same renderer; this is not claimed as an OS background-tab measurement');
  await page.evaluate(()=>window.__FIXTURE__.unmount());await page.locator('[data-native-glyth-thought-material]').waitFor({state:'detached'});controller=(await inspect())[0];assert.equal(controller.destroyed,true);assert.equal(controller.running,false);assert.equal(await page.locator('.lcos-spectral-ripple-canvas').count(),0);
  const destroyedRenders=controller.renders;await frames(page,10);assert.equal((await inspect())[0].renders,destroyedRenders);
  report.checks.push('unmount destroys original controller and canvas, cancels RAF; updates after cleanup produce no extra render');
  await page.reload();await boot(true);await page.evaluate(()=>window.__FIXTURE__.set({thought:{key:'fallback',scope:'fixture',tone:'working',source:'progress',text:'受控fallback',sticky:false,occurredAt:new Date().toISOString()}}));
  await frames(page,3);value=await measure('no-canvas-fallback');assert.equal(value.renderer,'css-fallback');assert.equal(value.read[0].available,false);assert.equal(value.read[0].running,false);assert.equal(value.buttonHit,true);
  const fallbackBackground=await page.locator('.native-glyth-thought-material > .lcos-soft-underlight-field').evaluate(el=>getComputedStyle(el).backgroundImage);assert.notEqual(fallbackBackground,'none');
  await page.screenshot({path:path.join(output,'03-original-css-fallback.png')});
  await set({thought:undefined,selected:true});assert.equal(await page.locator('.native-glyth-thought-material > .lcos-soft-underlight-field').evaluate(el=>getComputedStyle(el).animationName),'none');
  await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.native-glyth-thought-material > .lcos-soft-underlight-field').evaluate(el=>getComputedStyle(el).animationName),'none');
  report.checks.push('unavailable 2D canvas retains original CSS color field and readable original action/text; quiet and reduced fallback never run a fake thinking loop');
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.network,[]);report.passed=true;
} catch(error) {
  report.failure=error.stack;process.exitCode=1;if(page)try{await page.screenshot({path:path.join(output,'failure.png')});}catch{}
} finally {
  await browser?.close();await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({passed:report.passed,output,checks:report.checks,failure:report.failure},null,2));
}
