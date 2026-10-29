import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { currentGen2Root } from '../lab/current-gen2-resources.mjs';

const argument=name=>process.argv.find(value=>value.startsWith('--'+name+'='))?.slice(name.length+3);
const address=new URL(argument('base-url')??'http://127.0.0.1:56311');assert.equal(address.protocol,'http:');assert.equal(address.hostname,'127.0.0.1');assert.equal(address.pathname,'/');const origin=address.origin;
const output = path.resolve(import.meta.dirname, '../output/原生文件Drop整合_20261017i/库上传选择器只读', new Date().toISOString().replace(/[:.]/g, '-'));
await fs.mkdir(output, { recursive: true });
const health = await (await fetch(origin + '/health')).json();
assert.equal(health.runtimeLabel,'isolated-node-carry-20261020');if(argument('expected-pid'))assert.equal(health.pid,Number(argument('expected-pid')));
const prefix = '/api/lcos/core/projects/disposable-surface-core-facade';
const get = async url => {
  const response = await fetch(origin + url), body = await response.json();
  assert.equal(response.status, 200); return 'ok' in body ? body.value : body.data;
};
const facts = async () => Object.fromEntries(await Promise.all([
  ['graph', prefix + '/graph'], ['runs', prefix + '/runs'], ['presentations', prefix + '/presentations'],
  ['bindings', prefix + '/spatial/bindings'], ['pins', prefix + '/color-pins'],
  ...['main', 'context', 'workflow'].map(x => [x, '/api/canvas/v1/canvases/surface-core-' + x]),
].map(async ([key, url]) => [key, await get(url)])));
const report = { at: new Date().toISOString(), health, output, blockedWrites: [], remoteBlocked: [], pageErrors: [], chooser: null, passed: false };
const before = await facts();
const { chromium } = createRequire(path.join(currentGen2Root, 'package.json'))('playwright-core');
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  args: ['--disable-background-networking', '--disable-sync', '--disable-component-update', '--no-first-run'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', serviceWorkers: 'block' });
await context.route('**/*', async route => {
  const request = route.request(), url = new URL(request.url());
  if (['data:', 'blob:'].includes(url.protocol)) return route.continue();
  if (url.origin !== origin) { report.remoteBlocked.push(request.url()); return route.abort(); }
  if(url.pathname==='/lcos/agent-ui.js'){const response=await route.fetch();const source=await response.text();return route.fulfill({response,body:source+`
const __chooseOriginal=LCOSNativeFileLibraryChoose;LCOSNativeFileLibraryChoose=(...args)=>{const row={space:args[2],activeSpace:args[3].getState().activeSpace,privateSpace:args[5],input:args[1].current?.outerHTML,connected:args[1].current?.isConnected,activation:navigator.userActivation.isActive};(window.__LIBRARY_CHOOSE_TRACE__??=[]).push(row);const value=__chooseOriginal(...args);row.result=value;return value;};
document.addEventListener('click',e=>{if(e.target?.matches?.('input[type=file]')){const row={captureDefault:e.defaultPrevented,activation:navigator.userActivation.isActive};(window.__LIBRARY_CLICK_TRACE__??=[]).push(row);queueMicrotask(()=>row.finalDefault=e.defaultPrevented);}},true);`});}
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
    report.blockedWrites.push({ method: request.method(), path: url.pathname }); return route.abort();
  }
  return route.continue();
});
await context.routeWebSocket('**/*', socket => socket.close());
const page = await context.newPage();
page.setDefaultTimeout(16000);
page.on('pageerror', error => report.pageErrors.push(error.message));
page.on('filechooser', async chooser => { report.chooser = { accept: await chooser.element().getAttribute('accept') }; });
const read = () => page.evaluate(async () => {
  const { aa: store } = await import('/assets/UnlimitedModeToggle-D4wysAbz.js');
  const state = store.getState(), host = window.__LCOS_NODE_LAB__;
  return { activeSpace: state.activeSpace, activeSpaceType: typeof state.activeSpace, isOpen: state.isOpen,
    host: host && { projectId: host.projectId, canvasId: host.canvasId, currentCanvasId: host.currentCanvasId, api: !!host.api },
    fileInputs: [...document.querySelectorAll('input[type=file]')].map(input => ({ accept: input.accept, connected: input.isConnected, outerHTML: input.outerHTML })),
    toasts: [...document.querySelectorAll('[data-sonner-toast]')].map(el => el.textContent),
    dialogs: [...document.querySelectorAll('[role=dialog]')].map(el => el.textContent?.slice(0, 300)),chooseTrace:window.__LIBRARY_CHOOSE_TRACE__,clickTrace:window.__LIBRARY_CLICK_TRACE__ };
});
try {
  await page.goto(origin + '/canvas/surface-core-context');
  await page.getByRole('textbox', { name: 'Composer 输入', exact: true }).waitFor({ timeout: 60000 });
  await page.getByRole('status', { name: 'Loading canvas' }).waitFor({ state: 'hidden', timeout: 45000 });
  await page.getByTestId('canvas-dockbar-assets-btn').click();
  report.beforeClick = await read();
  await page.locator('[data-library-view="library"]').getByRole('button', { name: '添加', exact: true }).click();
  await page.getByRole('menuitem', { name: /上传/ }).click();
  await page.waitForTimeout(150);
  report.afterClick = await read();
  await page.screenshot({ path: path.join(output, '01-after-real-upload-menu.png') });
  report.factsUnchanged = JSON.stringify(await facts()) === JSON.stringify(before);
  assert.equal(report.factsUnchanged, true); assert.equal(report.pageErrors.length, 0);
  report.passed = true;
} catch (error) { report.error = String(error.stack ?? error); process.exitCode = 1; }
finally {
  await browser.close();
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
