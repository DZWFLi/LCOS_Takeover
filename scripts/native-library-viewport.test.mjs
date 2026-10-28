import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { parseOriginalDonorScript as parse } from '../lab/agent-node-transform.mjs';
import { currentGen2Root } from '../lab/current-gen2-resources.mjs';
import { transformNativeLibraryViewportScript as transform } from '../lab/native-library-viewport-transform.mjs';
import { transformSurfaceDockScript } from '../lab/surface-dock-transform.mjs';
import { transformNativeAssemblyLibraryScript } from '../lab/native-assembly-library-transform.mjs';
import { transformNativeMaterialRailScript } from '../lab/native-material-rail-transform.mjs';
import { transformNativeLibraryContextsScript } from '../lab/native-library-contexts-transform.mjs';

const root = path.resolve(import.meta.dirname, '..'), assets = path.join(root, 'reference/tapnow-installed/resources/web/assets');
const dependency = createRequire(path.join(currentGen2Root, 'package.json')), web = createRequire(path.join(currentGen2Root, 'huabu/apps/web/package.json'));
const esbuild = dependency('esbuild'), { chromium } = dependency('playwright-core');
const pnpm = path.join(currentGen2Root, 'huabu/node_modules/.pnpm'), traverseFolder = (await fs.readdir(pnpm)).find(name => name.startsWith('@babel+traverse@'));
const traverse = dependency(path.join(pnpm, traverseFolder, 'node_modules/@babel/traverse/lib/index.js')).default;
const output = path.join(root, 'output/原Library绘制归属_20261026', new Date().toISOString().replace(/[:.]/g, '-')); await fs.mkdir(output, { recursive: true });
const report = { passed: false, checks: [], measurements: [], errors: [], network: [], models: 0, coreWrites: 0,
  scope: 'Actual original jF final Fragment expression and all original props/handlers/ref slots; preceding jF hooks byte-identical. Installed React and real Chrome, actual original IQe/Radix Popover dependency closure. Library data/header/list/motion/dialog leaves are controlled; not full live jF business hooks/Core/project. Real original CSS + paint Canvas305 + body Dock40/Chat45.' };
const walk = (node, callback) => { if (!node?.type) return; callback(node); for (const value of Object.values(node))
  if (Array.isArray(value)) value.forEach(child => walk(child, callback)); else if (value?.type) walk(value, callback); };
const one = (ast, predicate) => { const values = []; walk(ast, node => { if (predicate(node)) values.push(node); }); assert.equal(values.length, 1); return values[0]; };
const prop = (object, key) => object?.properties?.find(item => (item.key?.name ?? item.key?.value) === key);
let browser, page;
try {
  const file = 'page-Da_DfwiK.js', original = await fs.readFile(path.join(assets, file), 'utf8'), changed = transform(file, original);
  assert.equal(transform(file, changed), changed); assert.equal(transform('other.js', 'not JS'), 'not JS');
  assert.throws(() => transform(file, original.replace('"data-library-panel":!0', '"unknown-library-panel":!0')), /panel.*seam/);
  assert.throws(() => transform(file, changed.replace(',zIndex:46', ',zIndex:60')), /partially installed/);
  const oldAst = parse(original, file), newAst = parse(changed, file);
  const oldOwner = one(oldAst, node => node.type === 'VariableDeclarator' && node.id?.name === 'jF').init;
  const newOwner = one(newAst, node => node.type === 'VariableDeclarator' && node.id?.name === 'jF').init;
  const oldReturn = oldOwner.body.body.findLast(node => node.type === 'ReturnStatement').argument;
  const newReturn = newOwner.body.body.findLast(node => node.type === 'ReturnStatement').argument;
  assert.equal(changed.slice(newOwner.start, newReturn.start), original.slice(oldOwner.start, oldReturn.start), 'all original hooks/refs/callback bodies and owner params remain byte-identical');
  assert.equal(changed.slice(newReturn.end, newOwner.end), original.slice(oldReturn.end, oldOwner.end));
  assert.equal(newReturn.callee.name, 'LCOSNativeLibraryViewport'); assert.equal(newReturn.arguments.length, 1);
  assert.equal(changed.slice(newReturn.arguments[0].start, newReturn.arguments[0].end).replace(',zIndex:46', ''), original.slice(oldReturn.start, oldReturn.end), 'original full Fragment/siblings/props stay byte-identical except the one root layer');
  const eG = ast => one(ast, node => node.type === 'VariableDeclarator' && node.id?.name === 'eG');
  assert.equal(changed.slice(eG(newAst).start, eG(newAst).end), original.slice(eG(oldAst).start, eG(oldAst).end), 'Canvas containment/camera DOM unchanged');
  const base = transformNativeMaterialRailScript(file, transformNativeAssemblyLibraryScript(file, transformSurfaceDockScript(file, original)));
  const composed = transformNativeLibraryContextsScript(file, base); assert.equal(transformNativeLibraryContextsScript(file, composed), composed);
  assert.match(composed, /LCOSNativeLibraryViewport\(r\.jsxs\(r\.Fragment/);
  assert.equal(await fs.readFile(path.join(assets, file), 'utf8'), original);
  report.checks.push('exact original jF return only: one Fragment, original hooks/refs/motion/handlers/siblings unchanged; eG paint/camera unchanged; full existing Library transform prefix composes/idempotent');

  // The existing original ReactDOM export, as already used by SurfaceDock.
  const indexSource = await fs.readFile(path.join(assets, 'index-BAQXnPag.js'), 'utf8'), indexAst = parse(indexSource, 'index');
  const namespaces = indexAst.body.flatMap(node => node.type === 'ExportNamedDeclaration' ? node.specifiers : []).filter(node => node.exported?.name === 'hD');
  assert.equal(namespaces.length, 1); assert.equal(namespaces[0].local.name, 'Au'); assert.match(indexSource, /Au\.createPortal/);
  const portalNode = one(newAst, node => node.type === 'FunctionDeclaration' && node.id?.name === 'LCOSNativeLibraryViewport');
  const portalSource = changed.slice(portalNode.start, portalNode.end), returnSource = changed.slice(newReturn.start, newReturn.end);
  const unwrappedReturn = changed.slice(newReturn.arguments[0].start, newReturn.arguments[0].end);

  // Extract the actual Popover/Radix closure using original lexical bindings;
  // replace only its existing shared React/JSX/ReactDOM namespaces.
  let moduleScope; traverse({ type: 'File', program: indexAst }, { Program(p) { moduleScope = p.scope; p.stop(); } });
  const replacements = new Map([['w', 'const w=React;'], ['v', 'const v=JSX;'], ['N7e', 'const N7e=ReactDOM;']]);
  const seeds = ['IQe','vRt'], selected = new Map(), queue = [...seeds], declarations = new Map();
  while (queue.length) {
    const name = queue.pop(); if (selected.has(name)) continue;
    const binding = moduleScope.getBinding(name); assert.ok(binding, name); const node = binding.path.node; selected.set(name, node);
    if (replacements.has(name)) { declarations.set(node.start, replacements.get(name)); continue; }
    assert.notEqual(binding.kind, 'module', 'Popover closure uses the same installed namespaces rather than bootstrapping the app');
    binding.path.traverse({ ReferencedIdentifier(p) { const dep = p.scope.getBinding(p.node.name); if (dep?.scope === moduleScope && !selected.has(p.node.name)) queue.push(p.node.name); } });
    declarations.set(node.start, (node.type === 'VariableDeclarator' ? 'var ' : '') + indexSource.slice(node.start, node.end) + (node.type === 'VariableDeclarator' ? ';' : ''));
  }
  const actualPopover = `import*as React from'react';import*as JSX from'react/jsx-runtime';import*as ReactDOM from'react-dom';\n`
    + [...declarations].sort((a,b) => a[0]-b[0]).map(row => row[1]).join('\n') + '\nexport{IQe,vRt};';
  report.popoverBindings = selected.size;
  const fixture = `import React,{useContext,useEffect,useRef,useState}from'react';import*as JSX from'react/jsx-runtime';import*as ReactDOM from'react-dom';import{createRoot}from'react-dom/client';import{IQe as NativePopover,vRt as TooltipProvider}from'actual-original-popover';
const LCOSNativeLibraryReactDOM=ReactDOM;${portalSource}
const Ctx=React.createContext('missing'),events=[];let update;let serial=0;
const returned=new Function('scope','with(scope){return '+${JSON.stringify(returnSource)}+'}');
const originalPaint=new Function('scope','with(scope){return '+${JSON.stringify(unwrappedReturn)}+'}');
const Motion=React.forwardRef(({initial,animate,exit,transition,...props},ref)=><div {...props} ref={ref}/>);
const Presence=({children})=><>{children}</>;
function Header({onClose}){const[open,setOpen]=useState(false);return <header style={{height:32,display:'flex'}}><button onClick={onClose}>关闭原库</button><NativePopover trigger='click' side='bottom' align='start' collisionPadding={16} open={open} onOpenChange={setOpen} content={<button data-actual-header-menu onClick={()=>events.push('header-menu')}>原库下拉项</button>}><button data-actual-header-trigger>原库菜单</button></NativePopover></header>}
function List({onApplyAsset}){const[open,setOpen]=useState(false),ctx=useContext(Ctx),id=useRef(++serial);useEffect(()=>{events.push('list-mount');return()=>events.push('list-cleanup')},[]);return <div data-test-library-list data-context={ctx} data-instance={id.current} style={{height:'100%',overflowY:'auto'}}><NativePopover trigger='click' side='bottom' align='start' collisionPadding={16} open={open} onOpenChange={setOpen} content={<div data-actual-row-preview><p>{ctx}</p><button data-actual-row-action onClick={()=>onApplyAsset({id:'Brief'})}>查看原Brief</button></div>}><button data-test-library-brief style={{display:'block',marginTop:20,height:36}}>Brief</button></NativePopover>{Array.from({length:35},(_,i)=><button key={i} style={{display:'block',height:36}}>原列表行 {i}</button>)}</div>}
const Tab=()=> <div style={{height:24}}>原空间切换</div>,Search=()=> <input aria-label='原库搜索' style={{height:24}}/>,Modal=({open,onOpenChange})=>open?ReactDOM.createPortal(<div data-test-original-modal style={{position:'fixed',inset:80,zIndex:60,background:'white'}}><button onClick={()=>onOpenChange(false)}>关闭原弹层</button></div>,document.body):null;
function App(){const[state,setState]=useState({mounted:true,hidden:false,context:'same-project',legacy:false,modal:false});update=patch=>setState(old=>({...old,...patch}));const file=useRef(null);
const values={r:JSX,mt:{div:Motion},qt:Presence,ie:(...v)=>v.filter(x=>typeof x==='string').join(' '),je:{hidden:{},visible:{},exitTransition:{},enterTransition:{}},X:state.hidden,le:Math.min(320,innerWidth-32),p:false,H:false,ne:null,ae:false,me:false,y:'private',E:'',A:[],R:false,T:null,Ae:[],Ze:false,v:new Set(),P:null,G:null,ce:null,$:state.modal?{kind:'upload'}:null,t:x=>x,fe:file,xe:{current:null},iF:Header,cw:Tab,P2:Search,sF:List,AS:Modal,LCOSNativeLibraryViewport,Mt:()=>events.push('original-drop-capture'),ut:asset=>events.push('apply-'+asset.id),x:()=>setState(old=>({...old,mounted:false})),U:()=>setState(old=>({...old,modal:false}))};
const scope=new Proxy(values,{has:()=>true,get:(obj,key)=>key===Symbol.unscopables?undefined:key in obj?obj[key]:key in globalThis?globalThis[key]:()=>{}});
return <Ctx.Provider value={state.context}><div id='paint' data-canvas-container style={{position:'relative',contain:'paint',height:305,overflow:'hidden',background:'#eee'}}>{state.mounted?(state.legacy?originalPaint(scope):returned(scope)):null}</div><div id='chat' style={{position:'fixed',top:305,bottom:0,left:0,right:0,zIndex:45,background:'#ddd'}}>原Chat45</div><div id='dock' data-lcos-surface-dock style={{position:'fixed',zIndex:40,left:80,top:176,width:190,height:58,background:'#ced'}}><button>Context</button></div></Ctx.Provider>}
window.__LIBRARY_VIEWPORT__={set:patch=>update(patch),events:()=>events.slice()};createRoot(document.getElementById('app')).render(<React.StrictMode><TooltipProvider><App/></TooltipProvider></React.StrictMode>);`;
  const built = await esbuild.build({ stdin: { contents: fixture, loader: 'tsx', resolveDir: root, sourcefile: 'actual-original-library-return.tsx' }, bundle: true, jsx: 'automatic', platform: 'browser', format: 'iife', write: false, outfile: path.join(output, 'fixture.js'), logLevel: 'silent',
    plugins: [{ name: 'actual-original-popover', setup(build) {
      build.onResolve({ filter: /^actual-original-popover$/ }, () => ({ path: 'popover', namespace: 'original-parts' }));
      build.onLoad({ filter: /.*/, namespace: 'original-parts' }, () => ({ contents: actualPopover, loader: 'js', resolveDir: assets }));
      build.onResolve({ filter: /^(react(?:\/.*)?|react-dom(?:\/.*)?)$/ }, args => { for (const resolver of [web,dependency]) try { return { path: resolver.resolve(args.path) }; } catch {} throw Error('Missing installed React dependency'); });
    } }] });
  const js = built.outputFiles.find(file => file.path.endsWith('.js')).text; await fs.writeFile(path.join(output, 'fixture.js'), js);
  const css = (await Promise.all(['index-C0AQWjts.css','course-api-base-url-BUoLME80.css'].map(name => fs.readFile(path.join(assets, name), 'utf8').catch(() => '')))).join('\n');
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-networking','--disable-sync','--no-first-run'] });
  const context = await browser.newContext({ viewport: { width: 360, height: 800 }, locale: 'zh-CN', serviceWorkers: 'block' });
  await context.route('**/*', route => { report.network.push(route.request().url()); return route.abort(); });
  page = await context.newPage(); page.on('pageerror', error => report.errors.push(String(error))); page.setDefaultTimeout(12000);
  await page.setContent('<!doctype html><html><head></head><body style="margin:0"><div id="app"></div></body></html>'); await page.addStyleTag({ content: css }); await page.addScriptTag({ content: js });
  await page.locator('[data-test-library-brief]').waitFor();
  const snapshot = async label => {
    const result = await page.evaluate(() => { const box = element => { if (!element) return; const r=element.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,z:getComputedStyle(element).zIndex};};
      const panel=document.querySelector('[data-library-panel]'),list=document.querySelector('[data-test-library-list]'),row=document.querySelector('[data-test-library-brief]');const r=row.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
      return {panel:box(panel),canvas:box(document.getElementById('paint')),dock:box(document.getElementById('dock')),list:box(list),row:box(row),parent:panel.parentElement.tagName,unique:document.querySelectorAll('[data-library-panel]').length,input:document.querySelectorAll('input[type=file]').length,context:list.dataset.context,instance:list.dataset.instance,rowHit:row.contains(hit),events:window.__LIBRARY_VIEWPORT__.events()}; });
    report.measurements.push({ label,...result }); return result;
  };
  let measured = await snapshot('360x800'); assert.equal(measured.parent,'BODY'); assert.equal(measured.unique,1); assert.equal(measured.input,1);
  assert.equal(measured.panel.z,'46'); assert.equal(measured.panel.top,64); assert.equal(measured.panel.bottom,740); assert.ok(measured.list.height>400); assert.equal(measured.rowHit,true); assert.equal(measured.context,'same-project');
  const instance=measured.instance,mounts=measured.events.filter(x=>x==='list-mount').length;
  await page.screenshot({ path:path.join(output,'01-original-library-viewport.png') });
  report.checks.push('360x800 paint Canvas305 + body Dock40/Chat45: single original Fragment and hidden input move to BODY, panel64..740 and real list budget/hit restored; source width/bottom retained');
  for(const viewport of [{width:360,height:400},{width:1500,height:900}]){
    await page.setViewportSize(viewport); await page.evaluate(()=>window.__LIBRARY_VIEWPORT__.set({context:'same-project-updated'})); await page.waitForFunction(()=>document.querySelector('[data-test-library-list]')?.dataset.context==='same-project-updated');
    measured=await snapshot(viewport.width+'x'+viewport.height); assert.equal(measured.panel.bottom,viewport.height-60);assert.equal(measured.panel.top,64);assert.equal(measured.parent,'BODY');assert.equal(measured.unique,1);assert.equal(measured.instance,instance);assert.equal(measured.events.filter(x=>x==='list-mount').length,mounts);assert.equal(measured.rowHit,true);
  }
  report.checks.push('400 short / desktop resize retain same original panel/list instance and live React context; no reparent-on-breakpoint or extra mount/Library-closed lifecycle');
  await page.setViewportSize({width:360,height:800});
  const actualMenuHit=async selector=>page.locator(selector).evaluate(element=>{const r=element.getBoundingClientRect();return {z:getComputedStyle(element.closest('[data-radix-popper-content-wrapper]')?.firstElementChild??element).zIndex,hit:element.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};});
  const waitMenuHit=async selector=>page.waitForFunction(selector=>{const element=document.querySelector(selector);if(!element)return false;const r=element.getBoundingClientRect();return r.width>0&&r.height>0&&r.x+r.width/2>=0&&r.y+r.height/2>=0&&element.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));},selector);
  await page.locator('[data-test-library-brief]').click();await page.locator('[data-actual-row-action]').waitFor();await waitMenuHit('[data-actual-row-action]');let hit=await actualMenuHit('[data-actual-row-action]');report.measurements.push({label:'actual-row-popover',...hit});assert.equal(hit.hit,true);await page.locator('[data-actual-row-action]').click();assert.ok((await page.evaluate(()=>window.__LIBRARY_VIEWPORT__.events())).includes('apply-Brief'));
  await page.keyboard.press('Escape');await page.locator('[data-actual-header-trigger]').click();await page.locator('[data-actual-header-menu]').waitFor();await waitMenuHit('[data-actual-header-menu]');hit=await actualMenuHit('[data-actual-header-menu]');report.measurements.push({label:'actual-header-popover',...hit});assert.equal(hit.hit,true);await page.locator('[data-actual-header-menu]').click();await page.keyboard.press('Escape');
  await page.screenshot({path:path.join(output,'02-original-popover-above-library.png')});
  report.checks.push('actual original IQe/Radix row preview and header Popover remain above Library46 and clickable; original onApplyAsset handler identity/callback reached, Escape uses original dismissal');
  await page.evaluate(()=>window.__LIBRARY_VIEWPORT__.set({modal:true}));await page.locator('[data-test-original-modal]').waitFor();assert.equal(await page.locator('[data-test-original-modal] button').evaluate(element=>{const r=element.getBoundingClientRect();return element.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),true);await page.locator('[data-test-original-modal] button').click();await page.locator('[data-test-original-modal]').waitFor({state:'detached'});
  report.checks.push('entire original Fragment keeps related modal props/close handler and the original hidden-file ref; controlled modal remains above the root without a second Library/root');
  await page.locator('[data-library-panel]').dispatchEvent('drop');assert.ok((await page.evaluate(()=>window.__LIBRARY_VIEWPORT__.events())).includes('original-drop-capture'));
  await page.evaluate(()=>window.__LIBRARY_VIEWPORT__.set({mounted:false}));await page.locator('[data-library-panel]').waitFor({state:'detached'});assert.equal(await page.locator('input[type=file]').count(),0);assert.equal(await page.locator('[data-test-library-list]').count(),0);
  report.checks.push('original root capture handler stays on same panel; closing original owner removes the sole panel, hidden input and child effects with no orphan');
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.network,[]);report.passed=true;
}catch(error){report.error={message:error.message,stack:error.stack};if(page){report.failureDom=await page.evaluate(()=>[...document.querySelectorAll('[data-actual-row-action],[data-actual-header-menu],[data-radix-popper-content-wrapper]')].map(element=>{const r=element.getBoundingClientRect(),c=getComputedStyle(element),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return{tag:element.tagName,attrs:element.getAttributeNames().map(key=>[key,element.getAttribute(key)]),box:{x:r.x,y:r.y,width:r.width,height:r.height},z:c.zIndex,opacity:c.opacity,pointer:c.pointerEvents,parent:element.parentElement?.tagName,hit:hit?.outerHTML.slice(0,450)};})).catch(()=>[]);await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});}process.exitCode=1;}
finally{await browser?.close();await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,checks:report.checks.length,error:report.error?.message,report:path.join(output,'report.json')}));}
