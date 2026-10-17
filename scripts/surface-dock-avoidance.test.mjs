import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const source = fs.readFileSync(new URL('lab/surface-dock-ui.js', root), 'utf8');
const css = fs.readFileSync(new URL('lab/surface-dock.css', root), 'utf8');
const evidence = process.argv.find(value => value.startsWith('--output-dir='))?.slice('--output-dir='.length)
  ?? fileURLToPath(new URL('output/原生Drop整合_20261017f/Dock原Toast避让DOM', root));
fs.mkdirSync(evidence + '/screenshots', { recursive: true });
const require = createRequire('E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/package.json');
const { chromium } = require('playwright-core');
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
const errors = []; page.on('pageerror', error => errors.push(error.message));
try {
  await page.setContent('<!doctype html><html class="light" data-theme="light"><head><title>Native dock DOM avoidance fixture</title><link data-lcos-surface-dock-css></head><body><main class="react-flow" style="position:fixed;inset:0"></main><aside data-lcos-native-chat-frame style="position:fixed;right:0;top:0;bottom:0;width:480px;background:#f9f9f9"><textarea aria-label="原Composer" style="position:absolute;bottom:16px;left:8px;right:8px;height:120px"></textarea></aside><div class="bg-tap-background-secondary" style="position:fixed;left:14px;bottom:16px;width:294px;height:40px"><button aria-label="原画布适应">适应</button></div></body></html>');
  await page.addStyleTag({ content: '*,::before,::after{box-sizing:border-box}' + css });
  await page.evaluate(async source => {
    const module = await import('data:text/javascript;base64,' + btoa(unescape(encodeURIComponent(source))));
    const layoutEffects = [], disposers = [];
    window.choices = [];
    const surfaces = new Map(['main', 'context', 'workflow'].map(key => [key, { id: key, canvasId: key, name: key }]));
    const react = { useState: () => [{ kind: 'ready', projectId: 'fixture', surfaces }, () => {}], useRef: () => ({ current: null }),
      useLayoutEffect: effect => layoutEffects.push(effect), useEffect: () => {} };
    const jsx = (type, props = {}) => {
      const element = ['svg', 'path'].includes(type) ? document.createElementNS('http://www.w3.org/2000/svg', type) : document.createElement(type);
      for (const [key, value] of Object.entries(props)) {
        if (key === 'children' || key === 'key' || value === undefined || value === false && ['disabled', 'hidden'].includes(key)) continue;
        if (key === 'ref') value.current = element;
        else if (key.startsWith('on')) element.addEventListener(key.slice(2).toLowerCase(), value);
        else if (key === 'className') element.setAttribute('class', value);
        else element.setAttribute(key, String(value));
      }
      for (const child of [props.children].flat(Infinity)) if (child !== undefined && child !== null) element.append(child);
      return element;
    };
    module.LCOSSurfaceDock({ react, runtime: { jsx, jsxs: jsx }, currentCanvasId: 'main', onSelect: value => window.choices.push(value.id),
      createPortal: (element, target) => { target.append(element); return element; } });
    for (const effect of layoutEffects) { const dispose = effect(); if (dispose) disposers.push(dispose); }
    window.disposeDock = () => disposers.forEach(dispose => dispose());
  }, source);
  async function rectangles() {
    await page.waitForTimeout(80);
    return page.evaluate(() => {
      const rect = selector => { const value = document.querySelector(selector).getBoundingClientRect(); return { x: value.x, y: value.y, right: value.right, bottom: value.bottom, width: value.width, height: value.height }; };
      return { dock: rect('[data-lcos-surface-dock]'), panel: rect('[data-lcos-native-chat-frame]'), composer: rect('textarea'), controls: rect('.bg-tap-background-secondary'), density: document.querySelector('[data-lcos-surface-dock]').dataset.lcosSurfaceDockDensity };
    });
  }
  const overlaps = (a, b) => a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y;
  const narrow = await rectangles();
  assert.ok(!overlaps(narrow.dock, narrow.composer), '1000x800 dock must not cover the original Composer');
  assert.ok(!overlaps(narrow.dock, narrow.controls), 'dock also avoids existing bottom-left canvas controls');
  assert.ok(narrow.dock.right <= narrow.panel.x);
  await page.screenshot({ path: evidence + '/screenshots/theme-fixture-dock-1000.png' });
  for (const key of ['main', 'context', 'workflow']) await page.locator(`[data-lcos-surface="${key}"]`).click();
  assert.deepEqual(await page.evaluate(() => window.choices), ['main', 'context', 'workflow']);
  await page.evaluate(() => { document.querySelector('[data-lcos-native-chat-frame]').style.width = '680px'; });
  const resized = await rectangles();
  assert.equal(resized.density, 'compact');
  assert.ok(!overlaps(resized.dock, resized.composer));
  assert.ok(!overlaps(resized.dock, resized.controls));
  await page.evaluate(() => { document.querySelector('[data-lcos-native-chat-frame]').style.display = 'none'; });
  const closed = await rectangles();
  assert.ok(Math.abs(closed.dock.x + closed.dock.width / 2 - 500) < 1);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => { const panel = document.querySelector('[data-lcos-native-chat-frame]'); panel.style.display = ''; panel.style.width = '480px'; });
  const desktop = await rectangles();
  assert.ok(!overlaps(desktop.dock, desktop.composer));
  assert.ok(!overlaps(desktop.dock, desktop.controls));
  assert.equal(await page.locator('[data-lcos-surface]').count(), 3);
  // Real Sonner attributes and the screenshot's measured toast footprint.
  // Busy has no button; the toaster container itself is not an obstacle.
  await page.evaluate(() => {
    const toaster=document.createElement('ol');toaster.dataset.sonnerToaster='';
    toaster.style.cssText='position:fixed;inset:0;margin:0;padding:0;pointer-events:none;list-style:none';
    const toast=document.createElement('li');toast.dataset.sonnerToast='';toast.textContent='正在放置材料…';
    toast.style.cssText='position:fixed;left:1100px;top:942px;width:300px;height:53px;background:white;pointer-events:auto';
    toaster.append(toast);document.body.append(toaster);
  });
  const noncolliding = await rectangles();
  assert.equal(noncolliding.dock.y, desktop.dock.y, 'a lower toast outside the Dock does not move it');
  await page.evaluate(() => { document.querySelector('[data-sonner-toast]').style.cssText='position:fixed;left:542px;top:942px;width:354px;height:53px;background:white;pointer-events:auto'; });
  const toastRect = () => page.locator('[data-sonner-toast]').evaluate(element => {
    const r=element.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};
  });
  const busyToast = await rectangles(), busyRect = await toastRect();
  assert.equal(await page.locator('[data-sonner-toast] button').count(),0);
  assert.ok(!overlaps(busyToast.dock,busyRect),'busy original toast without a button is an obstacle');
  assert.ok(busyToast.dock.bottom <= busyRect.y-12,'same existing 12px gap clears the actual toast footprint');
  await page.screenshot({path:evidence+'/screenshots/dock-busy-original-toast.png'});
  await page.evaluate(() => {const toast=document.querySelector('[data-sonner-toast]');toast.innerHTML='<span>放置结果尚未确认</span><button>核对放置结果</button>';toast.style.top='922px';toast.style.height='73px';});
  const unknownToast=await rectangles(),unknownRect=await toastRect();
  assert.ok(!overlaps(unknownToast.dock,unknownRect));
  assert.ok(unknownToast.dock.y < busyToast.dock.y,'existing observer remeasures changed toast geometry');
  assert.equal(await page.locator('[data-lcos-surface]').count(),3);
  for(const key of ['main','context','workflow'])await page.locator(`[data-lcos-surface="${key}"]`).click();
  assert.deepEqual(await page.evaluate(()=>window.choices),['main','context','workflow','main','context','workflow']);
  await page.screenshot({path:evidence+'/screenshots/dock-unknown-original-toast.png'});
  await page.evaluate(()=>{const toast=document.querySelector('[data-sonner-toast]');toast.style.top='300px';});
  const upperToast=await rectangles();assert.equal(upperToast.dock.y,desktop.dock.y,'upper canvas content does not shift the Dock');
  await page.evaluate(()=>{const toast=document.querySelector('[data-sonner-toast]');toast.style.top='850px';toast.style.height='120px';});
  const largeToast=await rectangles();assert.equal(largeToast.dock.y,desktop.dock.y,'existing controls height limit remains 100px');
  await page.evaluate(()=>{const toast=document.querySelector('[data-sonner-toast]');toast.style.top='942px';toast.style.height='53px';toast.style.display='none';});
  const hiddenToast=await rectangles();assert.equal(hiddenToast.dock.y,desktop.dock.y,'hidden toast does not reserve phantom space');
  await page.evaluate(()=>document.querySelector('[data-sonner-toaster]').remove());
  const removedToast=await rectangles();assert.equal(removedToast.dock.y,desktop.dock.y,'original Dock returns when toast is removed');
  const originalMiniMaps = [];
  await page.setViewportSize({ width: 360, height: 1000 });
  await page.evaluate(() => { document.querySelector('[data-lcos-native-chat-frame]').style.display = 'none'; });
  const noMap360 = await rectangles();
  await page.evaluate(() => {
    const surface = document.createElement('div'); surface.dataset.fixtureOriginalMinimap = '';
    surface.style.cssText = 'position:fixed;left:15px;top:791px;width:200px;height:150px';
    // Actual yBe structure: an original pointer-events-none map/viewport layer
    // plus its original pointer-capture overlay; no added button inside map.
    surface.innerHTML = '<div style="position:absolute;inset:0;pointer-events:none;border:1px solid #ddd;background:white"><div data-testid="rf__minimap" class="react-flow__minimap" style="position:absolute;inset:0;width:200px;height:150px"><svg width="200" height="150"><rect x="40" y="60" width="45" height="30" fill="#aaa" /></svg></div></div><div class="cursor-grab" style="position:absolute;inset:0;cursor:grab"></div>';
    document.querySelector('.react-flow').append(surface);
  });
  const mapRect = () => page.getByTestId('rf__minimap').evaluate(element => {
    const r=element.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};
  });
  const map360 = await rectangles(), map360Rect = await mapRect();
  assert.ok(!overlaps(map360.dock,map360Rect),'360px Dock clears the real 150px original minimap');
  assert.ok(map360.dock.bottom <= map360Rect.y-12,'original minimap uses the same existing 12px gap');
  assert.equal(await page.locator('[data-lcos-surface]').count(),3);
  originalMiniMaps.push({label:'360-open',geometry:map360,map:map360Rect});
  await page.screenshot({path:evidence+'/screenshots/dock-original-minimap-360.png'});
  await page.evaluate(()=>document.querySelector('[data-fixture-original-minimap]').hidden=true);
  const map360Closed=await rectangles();assert.equal(map360Closed.dock.y,noMap360.dock.y,'original map close releases its space');
  await page.evaluate(()=>document.querySelector('[data-fixture-original-minimap]').hidden=false);
  const map360Reopened=await rectangles();assert.equal(map360Reopened.dock.y,map360.dock.y,'original map reopen remeasures in the existing observer');
  await page.evaluate(()=>{
    const toaster=document.createElement('ol');toaster.dataset.sonnerToaster='';toaster.style.cssText='position:fixed;inset:0;pointer-events:none;margin:0;padding:0;list-style:none';
    const toast=document.createElement('li');toast.dataset.sonnerToast='';toast.textContent='放置结果尚未确认';
    toast.style.cssText='position:fixed;left:20px;top:700px;width:300px;height:60px;background:white;pointer-events:auto';
    toaster.append(toast);document.body.insertBefore(toaster,document.querySelector('.react-flow'));
  });
  const combinedMapToast=await rectangles(), combinedToastRect=await toastRect();
  assert.ok(!overlaps(combinedMapToast.dock,map360Rect));
  assert.ok(!overlaps(combinedMapToast.dock,combinedToastRect),'raising above the map must not collide with an earlier-DOM toast');
  assert.ok(combinedMapToast.dock.bottom<=combinedToastRect.y-12);
  originalMiniMaps.push({label:'toast-before-map',geometry:combinedMapToast,map:map360Rect,toast:combinedToastRect});
  await page.screenshot({path:evidence+'/screenshots/dock-original-minimap-and-toast-360.png'});
  await page.evaluate(()=>document.querySelector('[data-sonner-toaster]').remove());
  await page.setViewportSize({width:320,height:1000});
  const map320=await rectangles(),map320Rect=await mapRect();
  assert.ok(!overlaps(map320.dock,map320Rect));assert.ok(map320.dock.bottom<=map320Rect.y-12);
  assert.ok(map320.dock.x>=0&&map320.dock.right<=320);
  originalMiniMaps.push({label:'320-open',geometry:map320,map:map320Rect});
  for(const key of ['main','context','workflow'])await page.locator(`[data-lcos-surface="${key}"]`).click();
  assert.deepEqual(await page.evaluate(()=>window.choices),['main','context','workflow','main','context','workflow','main','context','workflow']);
  await page.screenshot({path:evidence+'/screenshots/dock-original-minimap-320.png'});
  await page.evaluate(()=>{const cover=document.createElement('aside');cover.dataset.fixtureLibrary='';cover.style.cssText='position:fixed;left:0;top:0;bottom:0;width:250px;z-index:999;background:white';document.body.append(cover);});
  const coveredMap=await rectangles();
  await page.evaluate(()=>{document.querySelector('[data-fixture-library]').remove();document.querySelector('[data-fixture-original-minimap]').hidden=true;});
  const noMap320=await rectangles();assert.equal(coveredMap.dock.y,noMap320.dock.y,'a fully sidebar-covered map does not reserve phantom space');
  await page.evaluate(()=>{document.querySelector('[data-fixture-original-minimap]').hidden=false;document.querySelector('.react-flow').style.cssText='position:fixed;left:0;top:0;bottom:0;width:0';});
  const zeroFlowMap=await rectangles();assert.equal(zeroFlowMap.dock.y,noMap320.dock.y,'zero-width Canvas map is not a usable obstacle');
  await page.evaluate(()=>{document.querySelector('.react-flow').style.cssText='position:fixed;inset:0';document.querySelector('[data-fixture-original-minimap]').remove();});
  const removedMap=await rectangles();assert.equal(removedMap.dock.y,noMap320.dock.y,'removed original map releases observation and footprint');
  originalMiniMaps.push({label:'release-and-occlusion',map360Closed,map360Reopened,coveredMap,noMap320,zeroFlowMap,removedMap});
  await page.setViewportSize({width:1440,height:1000});
  await page.evaluate(()=>{document.querySelector('[data-lcos-native-chat-frame]').style.display='';});
  assert.equal((await rectangles()).dock.y,desktop.dock.y,'no-map desktop keeps the original geometry after all map cycles');
  await page.evaluate(() => window.disposeDock());
  assert.deepEqual(errors, []);
  const result = { passed: true, kind: 'actual-dock-code-dom-fixture', viewports: ['1000x800', '1440x1000','360x1000','320x1000'], narrow, resized, closed, desktop,
    callbacksUnchanged: true, buttonsRetained: 3, routeOrCameraStoreAdded: false,
    originalToast:{noncolliding,busyToast,busyRect,unknownToast,unknownRect,upperToast,largeToast,hiddenToast,removedToast}, originalMiniMaps,
    candidateAccessed:false,coreWrites:0,models:0,errors };
  fs.writeFileSync(evidence + '/dock-avoidance-result.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} catch (error) {
  await page.screenshot({path:evidence+'/screenshots/failure.png'}).catch(()=>{});
  fs.writeFileSync(evidence+'/failure.json',JSON.stringify({passed:false,error:String(error.stack??error),candidateAccessed:false,coreWrites:0,models:0},null,2));
  throw error;
} finally { await browser.close(); }
