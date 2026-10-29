import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { parseOriginalDonorScript } from '../lab/agent-node-transform.mjs';
import { currentGen2Root } from '../lab/current-gen2-resources.mjs';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';
import { transformNativeLightThemeScript } from '../lab/native-light-theme-transform.mjs';

const root = process.cwd(), dependency = createRequire(path.join(currentGen2Root, 'package.json'));
const webDependency = createRequire(path.join(currentGen2Root, 'huabu/apps/web/package.json'));
const esbuild = dependency('esbuild'), { chromium } = dependency('playwright-core');
const store = path.join(currentGen2Root, 'huabu/node_modules/.pnpm');
const traverseFolder = (await fs.readdir(store)).find(value => value.startsWith('@babel+traverse@'));
assert.ok(traverseFolder, 'Reuse the installed parser traversal; do not download dependencies.');
const traverse = dependency(path.join(store, traverseFolder, 'node_modules/@babel/traverse/lib/index.js')).default;
const output = path.resolve('output/Glyth思绪详情_20261026', new Date().toISOString().replaceAll(':', '-'));
await fs.mkdir(output, { recursive: true });
const report = { passed: false, checks: [], measurements: [], errors: [], network: [], coreWrites: 0, modelCalls: 0,
  scope: 'Controlled original IQe/pr Popover, its actual bundled Radix/portal/focus closure, and original gm ActionButton. Only React/JSX/ReactDOM are shared with the isolated real React root; no Popover or Button double. Actual new node-local model/leaf/CSS. No running project, Core or model.' };

// Select the real donor binding closures using Babel's lexical bindings, so
// neither the vendor application bootstrap nor a replacement Radix is run.
async function sourceModule(file) {
  const source = transformNativeLightThemeScript(path.basename(file), await fs.readFile(file, 'utf8')), program = parseOriginalDonorScript(source, file);
  let scope; traverse({ type: 'File', program }, { Program(value) { scope = value.scope; value.stop(); } });
  const exports = new Map(program.body.flatMap(node => node.type === 'ExportNamedDeclaration' ? node.specifiers : [])
    .map(value => [value.exported.name ?? value.exported.value, value.local.name]));
  return { file, source, program, scope, exports };
}
const assets = path.resolve('reference/tapnow-installed/resources/web/assets');
const index = await sourceModule(path.join(assets, 'index-BAQXnPag.js'));
const course = await sourceModule(path.join(assets, 'course-api-base-url-CifxI1ia.js'));
const indexSeeds = new Set(['IQe', 'vRt']);
const replacements = new Map([['w', 'const w=React;'], ['v', 'const v=JSX;'], ['N7e', 'const N7e=ReactDOM;']]);
function extract(module, seeds, isCourse = false) {
  const selected = new Map(), queue = [...seeds], imports = new Map();
  while (queue.length) {
    const name = queue.pop(); if (selected.has(name)) continue;
    const binding = module.scope.getBinding(name); assert.ok(binding, 'Missing original binding ' + name);
    const node = binding.path.node; selected.set(name, node);
    if (!isCourse && replacements.has(name)) continue;
    if (binding.kind === 'module') {
      const original = binding.path.parentPath.node.source.value;
      if (isCourse && original === './index-BAQXnPag.js') {
        const imported = node.imported?.name ?? node.imported?.value;
        const actual = index.exports.get(imported); assert.ok(actual, 'Missing actual original index export ' + imported);
        indexSeeds.add(actual); imports.set(name, `import{${actual} as ${name}}from'actual-original-index';`);
      } else {
        const originalSpec = module.source.slice(node.start, node.end);
        imports.set(name, `import{${originalSpec}}from${JSON.stringify(path.resolve(path.dirname(module.file), original).replaceAll('\\', '/'))};`);
      }
      continue;
    }
    binding.path.traverse({ ReferencedIdentifier(value) {
      const dependency = value.scope.getBinding(value.node.name);
      if (dependency?.scope === module.scope && !selected.has(value.node.name)) queue.push(value.node.name);
    } });
  }
  const declarations = new Map();
  for (const [name, node] of selected) {
    if (imports.has(name)) continue;
    if (!isCourse && replacements.has(name)) { declarations.set(node.start, replacements.get(name)); continue; }
    const source = module.source.slice(node.start, node.end);
    declarations.set(node.start, node.type === 'VariableDeclarator' ? 'var ' + source + ';' : source);
  }
  return { source: `import * as React from'react';import * as JSX from'react/jsx-runtime';import * as ReactDOM from'react-dom';\n`
    + [...imports.values()].join('\n') + '\n' + [...declarations].sort((a, b) => a[0] - b[0]).map(row => row[1]).join('\n')
    + '\nexport{' + [...seeds].join(',') + '};', count: selected.size };
}
const courseParts = extract(course, ['gm'], true), indexParts = extract(index, indexSeeds);
report.originalBindings = { index: indexParts.count, course: courseParts.count };
await buildPilotEntry('lab/pilot/native-glyth-thought-detail.tsx', path.join(output, 'nativeReact-leaf.js'), 'browser', { nativeReact: true });
report.nativeReactBuild = true;
const fixture = `import React,{useState}from'react';import{createRoot}from'react-dom/client';
import{IQe as NativePopover,vRt as OriginalTooltipProvider}from'actual-original-index';import{gm as NativeButton}from'actual-original-course';
import{NativeGlythThoughtDetail,emptyNativeGlythThoughtDetail,updateNativeGlythThoughtDetail,nativeGlythThoughtDetailDelay}from'./lab/pilot/native-glyth-thought-detail.tsx';
import'./lab/pilot/native-glyth-node-layout.css';
const events=[];let update;const identity={projectId:'fixture-only',conversationId:'conversation',canvasId:'main',nodeId:'glyth'};
window.__THOUGHT_DETAIL__={set:next=>update(next),events:()=>events.slice(),pure:{empty:emptyNativeGlythThoughtDetail,update:updateNativeGlythThoughtDetail,delay:nativeGlythThoughtDetailDelay}};
function App(){const[state,setState]=useState({thought:undefined,identity,suppressed:false,mounted:true,plain:false});update=next=>setState(old=>({...old,...next}));
return <><button id="outside">节点之外</button><textarea id="composer" defaultValue="原草稿与光标保留"/><button id="right-view">原右栏目标</button>
<div id="node" className="lcos-conversation-node-shell" data-lcos-native-conversation-drop-target="glyth" data-native-glyth-appearance="egg/violet/curious"
style={{width:121,height:142,display:'flex',alignItems:'center',gap:10,minWidth:230}} onClick={()=>events.push({type:'node-click'})} onPointerDown={()=>events.push({type:'node-pointer'})}>
<span className="lcos-glyth-presence" style={{width:72,height:72,position:'relative',flex:'0 0 72px'}}>原Glyth</span><div>
<button id="title" aria-haspopup="dialog" onClick={event=>{event.stopPropagation();events.push({type:'title'});}}>原协作者</button>
<div className="native-glyth-status" style={{marginTop:4,fontSize:12,opacity:.78}}>
{state.plain?<span className="native-glyth-summary">正在连接原会话，原先的状态文字保留。</span>:<button id="primary" className="native-glyth-state-action" onClick={event=>{event.stopPropagation();events.push({type:'primary'});}}><span>原回答、审阅与恢复入口</span></button>}
{state.mounted?<NativeGlythThoughtDetail {...state} NativePopover={NativePopover} NativeButton={NativeButton} onOpenProcess={thought=>{events.push({type:'process',thought});document.getElementById('right-view').focus();}}/>:null}
</div></div></div></>;}
document.addEventListener('keydown',event=>{if(event.key===' ')events.push({type:'space',target:event.target.id});});
createRoot(document.getElementById('app')).render(<React.StrictMode><OriginalTooltipProvider><App/></OriginalTooltipProvider></React.StrictMode>);`;
const built = await esbuild.build({ stdin: { contents: fixture, loader: 'tsx', resolveDir: root, sourcefile: 'controlled-original-thought-detail.tsx' },
  bundle: true, jsx: 'automatic', platform: 'browser', format: 'iife', write: false, outfile: path.join(output, 'fixture.js'),
  plugins: [{ name: 'actual-original-popover-and-button', setup(build) {
    build.onResolve({ filter: /^actual-original-(index|course)$/ }, args => ({ path: args.path, namespace: 'original-parts' }));
    build.onLoad({ filter: /.*/, namespace: 'original-parts' }, args => ({ contents: args.path.endsWith('index') ? indexParts.source : courseParts.source, loader: 'js', resolveDir: assets }));
    build.onResolve({ filter: /^(react(?:\/.*)?|react-dom(?:\/.*)?)$/ }, args => {
      for (const resolver of [webDependency, dependency]) try { return { path: resolver.resolve(args.path) }; } catch {}
      throw Error('Missing already-installed React dependency ' + args.path);
    });
  } }], logLevel: 'silent' });
const js = built.outputFiles.find(file => file.path.endsWith('.js')).text;
const css = built.outputFiles.find(file => file.path.endsWith('.css'))?.text ?? '';
await fs.writeFile(path.join(output, 'fixture.js'), js); await fs.writeFile(path.join(output, 'fixture.css'), css);
const vendorCss = (await Promise.all(['index-C0AQWjts.css', 'course-api-base-url-BUoLME80.css'].map(async name => {
  try { return await fs.readFile(path.join(assets, name), 'utf8'); } catch { return ''; }
}))).join('\n');
const lightTheme = await fs.readFile(path.resolve('lab/native-light-theme.css'), 'utf8');
const thought = (i, extra = {}) => ({ key: 'progress-' + i, scope: 'scope-1', text: '公开进展 ' + i, tone: 'working', source: 'progress',
  occurredAt: new Date().toISOString(), sourceItemId: 'item-' + i, sticky: false, ...extra });
let browser, page;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-networking', '--disable-sync', '--no-first-run'] });
  const context = await browser.newContext({ viewport: { width: 800, height: 720 }, locale: 'zh-CN', serviceWorkers: 'block' });
  await context.route('**/*', route => { report.network.push({ method: route.request().method(), url: route.request().url() }); return route.abort(); });
  page = await context.newPage(); page.on('pageerror', error => report.errors.push(String(error))); page.setDefaultTimeout(10000);
  await page.setContent('<!doctype html><html data-theme="light" data-lcos-theme="light"><head><title>Actual original Thought detail</title></head><body style="margin:0;background:#f7f7fa;min-height:100vh"><div id="app" style="margin:70px 80px;width:140px"></div></body></html>');
  await page.addStyleTag({ content: vendorCss + '\n' + lightTheme + '\n' + css });
  await page.evaluate(() => {
    const timers = new Set(), request = window.setTimeout, cancel = window.clearTimeout;
    window.setTimeout = (callback, delay, ...args) => {
      const owned = typeof callback === 'function' && callback.toString().includes('updateNativeGlythThoughtDetail');
      let id = request(() => { timers.delete(id); callback(...args); }, delay);
      if (owned) timers.add(id); return id;
    };
    window.clearTimeout = id => { timers.delete(id); return cancel(id); };
    const listeners = new Set(), add = document.addEventListener.bind(document), remove = document.removeEventListener.bind(document);
    document.addEventListener = (type, callback, options) => { if (type === 'visibilitychange' && callback.toString().includes('setHidden(document.hidden)')) listeners.add(callback);
      if (ownChrome(callback)) chromeListeners.push({ target: document, type, callback }); return add(type, callback, options); };
    document.removeEventListener = (type, callback, options) => { listeners.delete(callback);
      const at = chromeListeners.findIndex(row => row.target === document && row.type === type && row.callback === callback); if (at >= 0) chromeListeners.splice(at, 1); return remove(type, callback, options); };
    window.__THOUGHT_DETAIL_LIFETIME__ = () => ({ timers: timers.size, visibilityListeners: listeners.size });
    const chromeObservers = [], chromeListeners = [], originalResize = window.ResizeObserver, originalMutation = window.MutationObserver;
    for (const [name, Original, matches] of [['ResizeObserver', originalResize, callback => callback.toString().includes('view.requestAnimationFrame(measure)')],
      ['MutationObserver', originalMutation, callback => callback.toString().includes('relevant(record.target)')]]) {
      window[name] = class extends Original {
        constructor(callback) { super(callback); this.owned = matches(callback); this.targets = new Set(); if (this.owned) chromeObservers.push(this); }
        observe(target, options) { if (this.owned) this.targets.add(target); return super.observe(target, options); }
        unobserve(target) { if (this.owned) this.targets.delete(target); return super.unobserve?.(target); }
        disconnect() { this.targets.clear(); return super.disconnect(); }
      };
    }
    const eventAdd = EventTarget.prototype.addEventListener, eventRemove = EventTarget.prototype.removeEventListener;
    const ownChrome = callback => callback?.toString().includes('view.requestAnimationFrame(measure)') || callback?.toString().includes('relevant(event.target');
    EventTarget.prototype.addEventListener = function(type, callback, options) { if (ownChrome(callback)) chromeListeners.push({ target: this, type, callback }); return eventAdd.call(this, type, callback, options); };
    EventTarget.prototype.removeEventListener = function(type, callback, options) { const at = chromeListeners.findIndex(row => row.target === this && row.type === type && row.callback === callback); if (at >= 0) chromeListeners.splice(at, 1); return eventRemove.call(this, type, callback, options); };
    window.__THOUGHT_CHROME_LIFETIME__ = () => ({ listeners: chromeListeners.length, observed: chromeObservers.reduce((sum, observer) => sum + observer.targets.size, 0) });
    let hidden = false; Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    window.__CONTROL_THOUGHT_DOCUMENT_VISIBILITY__ = value => { hidden = value; document.dispatchEvent(new Event('visibilitychange')); };
  });
  await page.addScriptTag({ content: js });
  const trigger = page.locator('[data-native-glyth-thought-trigger="glyth"]'), detail = page.locator('[data-native-glyth-thought-detail]');
  await trigger.waitFor();
  const set = async value => { await page.evaluate(value => window.__THOUGHT_DETAIL__.set(value), value); };
  const readEvents = () => page.evaluate(() => window.__THOUGHT_DETAIL__.events());
  const settleOriginalPaint = () => page.evaluate(async () => {
    const content = document.querySelector('[data-native-glyth-thought-detail]');
    const original = content?.closest('[data-radix-popper-content-wrapper]');
    await Promise.all((original?.getAnimations({ subtree: true }) ?? []).map(animation => animation.finished.catch(() => {})));
  });
  const box = async label => { const value = await page.evaluate(label => {
    const node = document.getElementById('node'), trigger = document.querySelector('[data-native-glyth-thought-trigger]'), status = node.querySelector('.native-glyth-status');
    return { label, node: node.getBoundingClientRect().toJSON(), trigger: trigger?.getBoundingClientRect().toJSON(), status: status.getBoundingClientRect().toJSON(),
      detail: document.querySelector('[data-native-glyth-thought-detail]')?.getBoundingClientRect().toJSON(), active: document.activeElement?.outerHTML.slice(0, 230) };
  }, label); report.measurements.push(value); return value; };
  const baseline = await box('empty-closed'); assert.equal(baseline.node.width, 121); assert.equal(baseline.node.height, 142);
  await trigger.click(); await detail.waitFor(); assert.match(await detail.innerText(), /还没有可显示的进展/);
  assert.equal(await trigger.getAttribute('aria-expanded'), 'true'); await detail.getByRole('button', { name: '查看对话' }).click();
  await detail.waitFor({ state: 'detached' }); assert.equal((await readEvents()).at(-1).thought, undefined);
  assert.equal(await page.locator('#right-view').evaluate(element => element === document.activeElement), true);
  assert.ok(!(await readEvents()).some(row => row.type === 'node-click' || row.type === 'node-pointer'));
  await page.locator('#primary').click(); assert.equal((await readEvents()).filter(row => row.type === 'primary').length, 1);
  report.checks.push('Actual original gm finite props yields one semantic disclosure; empty Popover reads honestly and opens the original conversation callback with undefined. Existing primary still fires once; disclosure click/pointer does not open/select the node.');
  const pure = await page.evaluate(() => {
    const { empty, update, delay } = window.__THOUGHT_DETAIL__.pure;
    const t = i => ({ key: 'k' + i, scope: 's', text: '公开 ' + i, tone: 'working', source: 'progress', sticky: false });
    let s = update(empty('identity'), { identity: 'identity', thought: t(1), engaged: false }, 100);
    s = update(s, { identity: 'identity', thought: t(2), engaged: false }, 500); const before = { current: s.current.key, pending: s.pending.key, delay: delay(s, false, 1399) };
    s = update(s, { identity: 'identity', thought: t(2), engaged: false }, 1399); const edge = s.current.key;
    s = update(s, { identity: 'identity', thought: t(2), engaged: false }, 1400); const after = s.current.key;
    for (let i = 3; i <= 8; i++) s = update(s, { identity: 'identity', thought: t(i), engaged: true }, 2000 + i);
    const engaged = { current: s.current.key, pending: s.pending.key, rows: s.history.map(r => r.key), delay: delay(s, true, 10000) };
    s = update(s, { identity: 'identity', thought: t(8), engaged: true, acceptPending: true }, 2010); const explicit = s.current.key;
    s = update(s, { identity: 'other', thought: { ...t(9), scope: 'new-scope' }, engaged: false }, 2020);
    return { before, edge, after, engaged, explicit, reset: { current: s.current.key, rows: s.history.length } };
  });
  assert.deepEqual(pure.before, { current: 'k1', pending: 'k2', delay: 1 }); assert.equal(pure.edge, 'k1'); assert.equal(pure.after, 'k2');
  assert.deepEqual(pure.engaged, { current: 'k2', pending: 'k8', rows: ['k5', 'k6', 'k7', 'k8'], delay: undefined }); assert.equal(pure.explicit, 'k8'); assert.deepEqual(pure.reset, { current: 'k9', rows: 1 });
  report.checks.push('Actual pure node model enforces exact 1300ms minimum from display, no per-event debounce, engaged freezes latest pending, last four observed records, explicit pending acceptance and identity/scope reset.');
  const original = thought(1, { detail: '公开的完整长句。'.repeat(30) }); await set({ thought: original });
  await trigger.click(); await detail.waitFor(); await page.waitForFunction(() => document.activeElement?.matches('[data-native-glyth-thought-detail]'));
  assert.equal(await detail.locator('[data-native-glyth-thought-current]').innerText(), original.detail);
  await settleOriginalPaint(); await page.screenshot({ path: path.join(output, '00-original-popover-long-copy.png') });
  await set({ thought: thought(2) }); await detail.locator('[data-native-glyth-thought-pending]').waitFor();
  assert.equal(await detail.locator('[data-native-glyth-thought-current]').innerText(), original.detail);
  await page.keyboard.press('Escape'); await detail.waitFor({ state: 'detached' });
  await page.waitForFunction(() => document.activeElement?.matches('[data-native-glyth-thought-trigger]'));
  await trigger.click(); await detail.waitFor(); assert.equal(await detail.locator('[data-native-glyth-thought-current]').innerText(), original.detail);
  await detail.locator('[data-native-glyth-thought-pending]').click(); assert.equal(await detail.locator('[data-native-glyth-thought-current]').innerText(), thought(2).text);
  for (let i = 3; i <= 7; i++) { await set({ thought: thought(i) }); await detail.locator('[data-native-glyth-thought-pending]').click(); }
  const history = await detail.locator('[data-native-glyth-thought-history] li').allTextContents(); assert.deepEqual(history, [thought(6).text, thought(5).text]);
  await settleOriginalPaint(); await page.screenshot({ path: path.join(output, '01-original-popover-long-copy-history.png') });
  const after = await box('original-open-history'); assert.deepEqual(after.node, baseline.node, 'Original node footprint remains unchanged.');
  await detail.locator('[data-native-glyth-thought-process]').click(); await detail.waitFor({ state: 'detached' });
  const opened = (await readEvents()).filter(row => row.type === 'process').at(-1); assert.equal(opened.thought.sourceItemId, 'item-7');
  assert.equal(await page.locator('#right-view').evaluate(element => element === document.activeElement), true);
  report.checks.push('Real original pr unmounts and reopens content without losing current/pending/history; actual long public detail reads in the original Popover, pending explicit acceptance works, two prior summaries display, process callback receives the exact displayed thought rather than pending/newest. Escape returns to the real gm BUTTON.');
  await page.locator('#composer').fill('新的原草稿'); await page.locator('#composer').press('Home'); await page.locator('#composer').press('ArrowRight');
  const caret = await page.locator('#composer').evaluate(element => [element.selectionStart, element.selectionEnd]);
  await trigger.hover(); assert.equal(await detail.count(), 0, 'Hover alone does not open or focus the Composer.');
  assert.equal(await page.locator('#composer').evaluate(element => element === document.activeElement), true);
  await trigger.click(); await detail.waitFor(); await page.locator('#outside').click(); await detail.waitFor({ state: 'detached' });
  assert.equal(await page.locator('#outside').evaluate(element => element === document.activeElement), true);
  assert.equal(await page.locator('#composer').inputValue(), '新的原草稿'); assert.deepEqual(await page.locator('#composer').evaluate(element => [element.selectionStart, element.selectionEnd]), caret);
  await page.keyboard.press('Space'); assert.ok((await readEvents()).some(row => row.type === 'space' && row.target === 'outside'));
  report.checks.push('Pointer hover cannot open the click Popover or steal Composer focus; original outside pointer dismisses without late focus theft. Existing draft/caret survive, global Space outside this surface remains observable.');
  await set({ thought: thought(8, { scope: 'new-scope', tone: 'attention', source: 'attention', sticky: true }) });
  await trigger.click(); await detail.waitFor(); assert.match(await detail.innerText(), /需要你/); assert.equal(await detail.locator('[data-native-glyth-thought-history]').count(), 0);
  await set({ thought: thought(9, { scope: 'third-scope', tone: 'error', source: 'recovery', sticky: true }) });
  await detail.waitFor({ state: 'detached' }); await trigger.click(); await detail.waitFor(); assert.match(await detail.innerText(), /暂时中断/);
  await set({ suppressed: true }); await detail.waitFor({ state: 'detached' }); assert.equal(await trigger.isDisabled(), true);
  await set({ suppressed: false, thought: undefined, plain: true }); await page.waitForFunction(() => !document.querySelector('[data-native-glyth-thought-trigger]').disabled);
  for (const width of [360, 320]) { await page.setViewportSize({ width, height: 820 }); await trigger.click(); await detail.waitFor(); const m = await box('narrow-' + width); assert.ok(m.detail.x >= 0 && m.detail.right <= width + 1); assert.equal(m.node.width, 121); assert.equal(m.node.height, 142); await page.keyboard.press('Escape'); await detail.waitFor({ state: 'detached' }); }
  await page.emulateMedia({ reducedMotion: 'reduce' }); await trigger.click(); await detail.waitFor();
  assert.equal(await detail.evaluate(element => getComputedStyle(element).animationName), 'none'); await page.emulateMedia({ forcedColors: 'active' });
  assert.equal(await detail.evaluate(element => getComputedStyle(element).boxShadow), 'none'); await settleOriginalPaint(); await page.screenshot({ path: path.join(output, '02-narrow-forced-colors.png') });
  await page.emulateMedia({ forcedColors: 'none', reducedMotion: 'no-preference' });
  report.checks.push('Attention and recovery remain readable; actual scope change closes and clears old detail/history, actual suppressed owner disables only its disclosure. 320/360 original Popover remains inside viewport with fixed121×142 node; reduced/forced-colors preserve reading without motion/glass.');
  await page.locator('#outside').click(); await detail.waitFor({ state: 'detached' });
  await page.evaluate(() => {
    const chrome = document.createElement('div'); chrome.id = 'original-chrome-fixture';
    // These are controlled original DOM owners, using the same real boxes as
    // the400px project failure. No fake collision array or popup setter.
    chrome.innerHTML = '<header class="canvas-header-chrome" style="position:fixed;inset:0 0 auto;height:60px;background:white;z-index:100">原顶栏</header>'
      + '<div data-lcos-surface-dock style="position:fixed;left:16px;right:16px;bottom:96px;height:62px;background:#eef0fa;z-index:100"><button>原三视图</button></div>'
      + '<ol data-sonner-toaster data-y-position="bottom" style="position:fixed;left:16px;right:16px;bottom:16px;z-index:1000;margin:0;padding:0;list-style:none"><li data-sonner-toast data-visible="true" style="height:71px;background:white;box-shadow:0 3px 12px #888;padding:8px;box-sizing:border-box">画布中的任务暂时无法更新，已有内容保留。<button>重试更新</button></li></ol>';
    document.body.append(chrome);
  });
  const intersects = (a, b) => a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y;
  const shortRead = async label => {
    await settleOriginalPaint();
    const value = await detail.evaluate((element, label) => {
      const rect = value => value.getBoundingClientRect().toJSON(), process = element.querySelector('[data-native-glyth-thought-process]'), heading = element.querySelector('.native-glyth-thought-detail-heading');
      const hit = value => { const r = value.getBoundingClientRect(); const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!e && value.contains(e); };
      return { label, detail: rect(element), process: rect(process), heading: rect(heading), processHit: hit(process), headingHit: hit(heading),
        scrollTop: element.scrollTop, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight,
        availableHeight: getComputedStyle(element).getPropertyValue('--radix-popover-content-available-height'),
        chrome: [...document.querySelectorAll('.canvas-header-chrome,[data-lcos-surface-dock],[data-sonner-toast]')].map(item => ({ name: item.className || item.tagName, rect: rect(item) })) };
    }, label); report.measurements.push(value); return value;
  };
  for (const [width, height, top] of [[360, 400, 110], [360, 320, 62], [320, 400, 110]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(top => { const node = document.getElementById('node'); Object.assign(node.style, { position: 'fixed', left: '137px', top: top + 'px', transform: 'scale(.7)', transformOrigin: 'top left' }); }, top);
    await set({ thought: thought(20 + height + width, { scope: 'short-' + width + '-' + height, detail: '这是已公开的较长进展，原输入与任务保留。'.repeat(16) }), plain: false });
    await trigger.click(); await detail.waitFor(); await settleOriginalPaint();
    let value = await shortRead('short-' + width + '-' + height + '-heading');
    assert.ok(value.clientHeight < value.scrollHeight, 'The actual body consumes original Radix available height.');
    assert.equal(value.headingHit, true); assert.ok(value.chrome.every(item => !intersects(value.detail, item.rect)), 'Original flip/shift must avoid actual native header/Dock/toast rectangles.');
    await detail.hover(); await page.mouse.wheel(0, 2400);
    await page.waitForFunction(() => { const el = document.querySelector('[data-native-glyth-thought-process]'), r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); });
    value = await shortRead('short-' + width + '-' + height + '-process'); assert.equal(value.processHit, true);
    assert.ok(value.chrome.every(item => !intersects(value.detail, item.rect))); assert.ok(value.scrollTop > 0);
    await page.mouse.wheel(0, -2400); await page.waitForFunction(() => document.querySelector('[data-native-glyth-thought-detail]').scrollTop === 0);
    value = await shortRead('short-' + width + '-' + height + '-heading-return'); assert.equal(value.headingHit, true);
    await page.keyboard.press('Escape'); await detail.waitFor({ state: 'detached' });
    await page.waitForFunction(() => window.__THOUGHT_CHROME_LIFETIME__().listeners === 0 && window.__THOUGHT_CHROME_LIFETIME__().observed === 0);
  }
  await page.setViewportSize({ width: 360, height: 400 });
  await page.evaluate(() => { document.getElementById('node').style.top = '110px'; });
  await trigger.click(); await detail.waitFor(); await settleOriginalPaint();
  await page.evaluate(() => { document.querySelector('[data-sonner-toast]').style.height = '160px'; });
  await page.waitForFunction(() => { const el = document.querySelector('[data-native-glyth-thought-detail]'), toast = document.querySelector('[data-sonner-toast]'); return el.getBoundingClientRect().bottom <= toast.getBoundingClientRect().top; });
  let resized = await shortRead('open-native-toast-resize'); assert.ok(resized.chrome.every(item => !intersects(resized.detail, item.rect)));
  await detail.hover(); await page.mouse.wheel(0, 2400); await page.waitForFunction(() => { const el = document.querySelector('[data-native-glyth-thought-process]'), r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); });
  await page.evaluate(() => { document.querySelector('.canvas-header-chrome').style.height = '80px'; });
  await page.waitForFunction(() => document.querySelector('[data-native-glyth-thought-detail]').getBoundingClientRect().top >= 88);
  const headerResized = await shortRead('open-native-header-resize'); assert.ok(headerResized.detail.height < resized.detail.height);
  assert.ok(headerResized.chrome.every(item => !intersects(headerResized.detail, item.rect)));
  await page.evaluate(() => document.querySelector('[data-lcos-surface-dock]').remove());
  const beforeLastToast = await shortRead('last-toast-before-removal');
  await page.evaluate(() => document.querySelector('[data-sonner-toast]').remove());
  await page.waitForFunction(() => document.querySelector('[data-native-glyth-thought-detail]').getBoundingClientRect().height > 140);
  const afterLastToast = await shortRead('last-toast-removed-native-padding-released');
  assert.ok(afterLastToast.detail.height > beforeLastToast.detail.height + 40);
  assert.equal(await detail.evaluate(element => element.closest('[role="dialog"]').getAttribute('data-side')), 'bottom');
  assert.ok(afterLastToast.chrome.every(item => !intersects(afterLastToast.detail, item.rect)));
  await page.keyboard.press('Escape'); await detail.waitFor({ state: 'detached' });
  await page.evaluate(() => { document.getElementById('original-chrome-fixture').remove(); const node = document.getElementById('node'); for (const key of ['position', 'left', 'top', 'transform', 'transformOrigin']) node.style[key] = ''; });
  await page.setViewportSize({ width: 800, height: 720 });
  report.checks.push('Original pr/Radix flip/shift consumes measured native header/Dock/Sonner boxes at360x400,360x320,320x400; its available-height variable scrolls one real body so heading and process are each physically hit after real wheel scrolling. Open toast resize is remeasured, and every close releases chrome listeners/observers. No z-index increase or hidden toast.');
  await set({ thought: thought(10, { scope: 'visibility-scope' }) }); await detail.waitFor({ state: 'detached' });
  await trigger.click(); await detail.waitFor(); await page.evaluate(() => window.__CONTROL_THOUGHT_DOCUMENT_VISIBILITY__(true));
  await detail.waitFor({ state: 'detached' }); assert.equal(await page.evaluate(() => window.__THOUGHT_DETAIL_LIFETIME__().timers), 0);
  await page.evaluate(() => window.__CONTROL_THOUGHT_DOCUMENT_VISIBILITY__(false));
  await page.waitForFunction(() => !document.querySelector('[data-native-glyth-thought-trigger]').getAttribute('aria-disabled') || document.querySelector('[data-native-glyth-thought-trigger]').getAttribute('aria-disabled') === 'false');
  await trigger.click(); await detail.waitFor(); assert.match(await detail.innerText(), /公开进展 10/);
  report.checks.push('Controlled document visibility event closes the actual original Popover and releases the leaf timer; showing the same node preserves its confirmed public summary and allows an explicit reopen. No hidden DOM is retained.');
  await page.locator('#outside').click(); await detail.waitFor({ state: 'detached' });
  await set({ thought: thought(11, { scope: 'timer-scope' }) });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const timedAt = Date.now(); await set({ thought: thought(12, { scope: 'timer-scope' }) });
  await page.waitForFunction(() => window.__THOUGHT_DETAIL_LIFETIME__().timers > 0);
  await page.waitForFunction(() => window.__THOUGHT_DETAIL_LIFETIME__().timers === 0);
  report.realTimerElapsedMs = Date.now() - timedAt;
  assert.ok(report.realTimerElapsedMs >= 1050, 'The actual browser replacement must not collapse into an immediate render.');
  await trigger.click(); await detail.waitFor(); assert.match(await detail.innerText(), /公开进展 12/);
  await page.locator('#outside').click(); await detail.waitFor({ state: 'detached' });
  await set({ thought: thought(13, { scope: 'timer-scope' }) }); await page.waitForFunction(() => window.__THOUGHT_DETAIL_LIFETIME__().timers > 0);
  await set({ mounted: false }); assert.equal(await trigger.count(), 0);
  await page.waitForTimeout(1400); assert.equal(await detail.count(), 0); assert.deepEqual(report.errors, []);
  report.cleanup = await page.evaluate(() => window.__THOUGHT_DETAIL_LIFETIME__()); assert.deepEqual(report.cleanup, { timers: 0, visibilityListeners: 0 });
  report.chromeCleanup = await page.evaluate(() => window.__THOUGHT_CHROME_LIFETIME__()); assert.deepEqual(report.chromeCleanup, { listeners: 0, observed: 0 });
  report.checks.push('The real browser timer performs delayed replacement while disengaged; unmount during another pending replacement clears that timer and the one owned visibility listener, with no later content/focus revival under StrictMode.');
  assert.ok(report.network.every(row => row.method === 'GET'), 'No domain or model request'); report.passed = true;
} catch (error) {
  report.failure = error.stack; process.exitCode = 1;
  if (page) { report.dom = await page.locator('#app').innerHTML().catch(() => ''); report.failureActive = await page.evaluate(() => document.activeElement?.outerHTML);
    report.failurePopover = await page.locator('[data-native-glyth-thought-detail]').evaluate(element => element.closest('[data-radix-popper-content-wrapper]')?.outerHTML).catch(() => null);
    await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {}); }
} finally {
  await browser?.close(); await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, output, checks: report.checks, failure: report.failure }, null, 2));
}
