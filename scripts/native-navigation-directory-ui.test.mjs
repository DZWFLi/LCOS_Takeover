import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { currentGen2Root } from '../lab/current-gen2-resources.mjs';

const root = process.cwd(), dependency = createRequire(path.join(currentGen2Root, 'package.json'));
const webDependency = createRequire(path.join(currentGen2Root, 'huabu/apps/web/package.json'));
const esbuild = dependency('esbuild'), { chromium } = dependency('playwright-core');
const out = path.join(root, 'output/导航目录UI_20261026/删除焦点交接'); await fs.mkdir(out, { recursive: true });
const fixture = `import {useSyncExternalStore} from 'react';
const api={id:'original-api'},listeners=new Set(),canvasListeners=new Set(),shellListeners=new Set();
const marker={id:'only-marker'},row={marker,title:'最后一个固定目标',kindLabel:'图片',originLabel:'主画布',status:'ready',detail:'',candidates:[]};
let removals=0;let canvas={canvasId:'main',rfInstance:api},shell={projectId:'p'},pending;
let state={scene:{projectId:'p',canvasId:'main',api},open:false,status:'ready',error:'',rows:[row],busy:null,pending:false,query:'',scroll:0};
const emit=list=>{for(const listener of [...list])listener();};
const publish=patch=>{state={...state,...patch};emit(listeners);};
export const navigationDirectorySnapshot=()=>state;
export const subscribeNavigationDirectory=listener=>{listeners.add(listener);return()=>listeners.delete(listener);};
export const nativeNavigationSnapshot=()=>navigationState;
let navigationState={scene:null};
export const subscribeNativeNavigation=listener=>{listeners.add(listener);return()=>listeners.delete(listener);};
export function canvasStore(selector){return selector(useSyncExternalStore(listener=>{canvasListeners.add(listener);return()=>canvasListeners.delete(listener);},()=>canvas));}
canvasStore.getState=()=>canvas;
export function shellStore(selector){return selector(useSyncExternalStore(listener=>{shellListeners.add(listener);return()=>shellListeners.delete(listener);},()=>shell));}
shellStore.getState=()=>shell;
export const setNavigationDirectoryOpen=(_canvas,open)=>publish({open});
export const refreshNavigationDirectory=async()=>{};
export const setNavigationDirectoryQuery=query=>publish({query});
export const setNavigationDirectoryScroll=scroll=>publish({scroll});
export const selectNavigationDirectoryMarker=async()=>{};
export const verifyNavigationDirectoryPending=async()=>{};
export const backNavigationDirectoryPlaces=()=>publish({selectedMarkerId:undefined});
export async function removeNavigationDirectoryMarker(id){
 const owner=state.scene;removals++;publish({busy:id,error:''});
 const ok=await new Promise(resolve=>{pending=resolve;});
 if(canvas.rfInstance!==owner.api||shell.projectId!==owner.projectId)return;
 if(ok==='unknown'){publish({busy:null,pending:true,error:'取消结果待核对，没有重复提交。'});return;}
 if(!ok){publish({busy:null,error:'暂时无法取消固定，原目标和记录保留。'});return;}
 publish({busy:null,selectedMarkerId:undefined,status:'loading'});await new Promise(resolve=>setTimeout(resolve,5));
 if(ok==='read-error'){publish({status:'error',error:'暂时无法读取已固定目标，原记录保留。'});return;}
 publish({rows:[],status:'ready'});
}
window.__DIRECTORY_LEAF__={
 reset(){removals=0;navigationState={scene:null};canvas={canvasId:'main',rfInstance:api};shell={projectId:'p'};state={scene:{projectId:'p',canvasId:'main',api},open:false,status:'ready',error:'',rows:[row],busy:null,pending:false,query:'',scroll:0};emit(canvasListeners);emit(shellListeners);emit(listeners);},
 finish(ok=true){const resolve=pending;pending=undefined;if(!resolve)throw Error('No pending removal');resolve(ok);},
 replaceApi(){canvas={...canvas,rfInstance:{id:'replacement-api'}};emit(canvasListeners);},
 layout(ids=[],incomplete=false){navigationState={scene:{projectId:'p',canvasId:'main',api},facts:{markers:[{id:'only-marker'}]},unplacedMarkerIds:ids,layoutIncomplete:incomplete};emit(listeners);},
 snapshot(){return {open:state.open,status:state.status,rows:state.rows.length,busy:state.busy,error:state.error,pending:state.pending,removals};}
};`;
const entry = `import React from 'react';import {createRoot} from 'react-dom/client';import {createPortal} from 'react-dom';
import {LCOSNativeNavigationDirectoryEntry} from './lab/pilot/native-navigation-directory.tsx';
import './lab/pilot/native-navigation-directory.css';
import './lab/pilot/native-navigation-directory-state';
// Deliberately finite props, as in the original gs/br. The UI must bridge the real BUTTON.
function NativeButton({onClick,children,className,disabled}){return <button type="button" onClick={onClick} className={className} disabled={disabled}>{children}</button>;}
// Controlled Popover double owns dismissal only. It does not move focus and adds no global Escape listener.
function NativePopover({open,onOpenChange,children,content,contentClassName}){return <><div onClick={()=>onOpenChange(!open)}>{children}</div>{open?createPortal(<div role="dialog" className={contentClassName} style={{position:'fixed',top:60,left:12}} onKeyDown={event=>{if(event.key==='Escape')onOpenChange(false);}}>{content}</div>,document.body):null}</>;}
createRoot(document.getElementById('app')).render(<LCOSNativeNavigationDirectoryEntry canvasId="main" NativeButton={NativeButton} NativePopover={NativePopover}/>);`;
const result = await esbuild.build({ stdin: { contents: entry, loader: 'tsx', resolveDir: root, sourcefile: 'actual-directory-ui-leaf.tsx' },
  bundle: true, jsx: 'automatic', platform: 'browser', format: 'iife', write: false, outfile: path.join(out, 'leaf.js'),
  plugins: [{ name: 'controlled-original-owners', setup(build) {
    build.onResolve({ filter: /native-navigation-directory-state$/ }, () => ({ path: 'directory-fixture', namespace: 'fixture' }));
    build.onResolve({ filter: /native-navigation-state$/ }, () => ({ path: 'directory-fixture', namespace: 'fixture' }));
    build.onResolve({ filter: /native-canvas-port$/ }, () => ({ path: 'canvas-fixture', namespace: 'fixture' }));
    build.onResolve({ filter: /lcosShellStore$/ }, () => ({ path: 'shell-fixture', namespace: 'fixture' }));
    build.onResolve({ filter: /^(react(?:\/.*)?|react-dom(?:\/.*)?|lucide-react)$/ }, args => {
      for (const resolver of [webDependency, dependency]) { try { return { path: resolver.resolve(args.path) }; } catch {} }
      throw Error('Installed frontend dependency missing: ' + args.path);
    });
    build.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'js',
      contents: args.path === 'directory-fixture' ? fixture : args.path === 'canvas-fixture'
        ? "export {canvasStore as default} from 'directory-fixture';" : "export {shellStore as useLcosShellStore} from 'directory-fixture';" }));
    build.onResolve({ filter: /^directory-fixture$/ }, () => ({ path: 'directory-fixture', namespace: 'fixture' }));
  } }], logLevel: 'silent' });
const js = result.outputFiles.find(file => file.path.endsWith('.js'))?.text;
const css = result.outputFiles.find(file => file.path.endsWith('.css'))?.text ?? '';
assert.ok(js);
const report = { passed: false, scope: 'Actual directory TSX/CSS with real React and a finite-props gs/br-style button double; controlled asynchronous deletion/state/API, Popover double only owns dismissal. Does not prove original pr or Core integration.',
  browserPath: 'Browser plugin not available; regular Playwright isolated blank DOM', checks: [], coreWrites: 0, modelCalls: 0, realSceneTouched: false, errors: [] };
let browser, page;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-networking', '--disable-sync', '--no-first-run'] });
  const context = await browser.newContext({ viewport: { width: 360, height: 820 }, locale: 'zh-CN', serviceWorkers: 'block' });
  await context.route('**/*', route => route.abort());
  page = await context.newPage(); page.on('pageerror', error => report.errors.push(String(error))); page.setDefaultTimeout(10000);
  await page.setContent('<!doctype html><html><head><title>Directory deletion focus leaf</title></head><body style="min-height:100vh;margin:0"><button id="outside">目录外按钮</button><div id="app"></div></body></html>');
  await page.addStyleTag({ content: css }); await page.addScriptTag({ content: js });
  assert.equal(await page.title(), 'Directory deletion focus leaf'); assert.equal(page.url(), 'about:blank');
  const trigger = page.locator('button[data-native-navigation-directory-trigger]'); await trigger.waitFor();
  assert.equal(await trigger.getAttribute('aria-haspopup'), 'dialog'); assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
  const directory = page.locator('[data-native-navigation-directory]'), search = page.getByRole('searchbox', { name: '搜索固定目标' }), remove = page.locator('[data-native-navigation-directory-remove="only-marker"]');
  const open = async () => { await trigger.click(); await directory.waitFor(); await page.waitForFunction(() => document.activeElement?.matches('[data-native-navigation-directory] input[type=search]')); };
  const reset = async () => { await page.evaluate(() => window.__DIRECTORY_LEAF__.reset()); await directory.waitFor({ state: 'hidden' }); await open(); };
  const settle = async (ok = true) => { await page.evaluate(ok => window.__DIRECTORY_LEAF__.finish(ok), ok); await page.waitForFunction(() => !window.__DIRECTORY_LEAF__.snapshot().busy); await page.waitForTimeout(80); };
  await open(); await remove.click(); assert.equal(await remove.isDisabled(), true); await settle();
  assert.equal(await remove.count(), 0); assert.equal(await search.evaluate(element => document.activeElement === element), true, 'product restores focus after the final delete button unmounts');
  await page.screenshot({ path: path.join(out, '01-last-delete-search-focused.png') });
  await page.keyboard.press('Escape'); await directory.waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.activeElement?.matches('button[data-native-navigation-directory-trigger]'));
  assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
  report.checks.push('actual last-row delete -> BODY fallback is handed to original search -> content Escape reaches original dismissal -> actual finite-props BUTTON regains focus; no forced test focus or global Escape listener');

  await reset(); await remove.click();
  await page.evaluate(() => { document.body.tabIndex = -1; document.body.focus(); });
  assert.equal(await page.evaluate(() => document.activeElement === document.body), true); await settle();
  assert.equal(await search.evaluate(element => document.activeElement === element), true);
  await page.evaluate(() => document.body.removeAttribute('tabindex'));
  report.checks.push('focusin on BODY itself is only a browser fallback and does not cancel the pending last-row focus handoff');

  await reset(); await remove.click(); await page.mouse.click(340, 780); await settle();
  assert.equal(await search.evaluate(element => document.activeElement === element), false);
  report.checks.push('a new real pointerdown on the blank BODY is user intent and cancels the old deletion focus handoff');

  await reset(); await remove.click(); await page.locator('#outside').click(); await settle();
  assert.equal(await page.locator('#outside').evaluate(element => document.activeElement === element), true);
  report.checks.push('user moves focus outside while deletion awaits: completion does not steal it');

  await reset(); await remove.click(); await directory.getByRole('button', { name: '关闭固定目录', exact: true }).click();
  await directory.waitFor({ state: 'hidden' }); const closedActive = await page.evaluate(() => document.activeElement.tagName); await settle();
  assert.equal(await directory.count(), 0); assert.equal(await page.evaluate(() => document.activeElement.tagName), closedActive);
  report.checks.push('closing the original Popover while deletion awaits cancels its focus handoff; no late input/trigger focus');

  await reset(); await remove.click(); await page.evaluate(() => window.__DIRECTORY_LEAF__.replaceApi());
  await directory.waitFor({ state: 'hidden' }); await page.evaluate(() => window.__DIRECTORY_LEAF__.finish()); await page.waitForTimeout(80); assert.equal(await directory.count(), 0);
  assert.equal(await search.count(), 0); assert.equal(await page.evaluate(() => document.activeElement?.matches('[data-native-navigation-directory] input') ?? false), false);
  report.checks.push('same canvasId with a replaced native API hides the old owner and cancels deletion focus');

  await reset(); await remove.click(); await settle('read-error');
  assert.equal(await search.count(), 0); assert.equal(await remove.count(), 0);
  const retry = directory.getByRole('button', {name:'重新读取固定目标',exact:true});
  assert.equal(await retry.count(),1,'A failed read has one original retry, not duplicate header/body refresh entries');
  assert.equal(await retry.evaluate(element => document.activeElement === element), true);
  assert.match(await directory.innerText(), /暂时无法读取已固定目标/);
  report.checks.push('deletion succeeded but refresh failed: one original error retry remains and receives fallback focus when search/row controls are absent; header/body duplicate removed');

  await reset(); await remove.click(); await settle('unknown');
  assert.equal(await remove.isDisabled(), true); assert.equal(await page.evaluate(() => window.__DIRECTORY_LEAF__.snapshot().pending), true);
  await page.keyboard.press('Enter'); assert.equal(await page.evaluate(() => window.__DIRECTORY_LEAF__.snapshot().removals), 1);
  report.checks.push('unknown cancellation remains pending, preserves its record and never repeats the delete request');

  await reset(); await remove.click(); await settle(false);
  assert.equal(await remove.count(), 1); assert.equal(await remove.isDisabled(), false);
  assert.equal(await remove.evaluate(element => document.activeElement === element), true);
  assert.match(await directory.innerText(), /暂时无法取消固定/);
  report.checks.push('failed deletion keeps the original action and retry focus, without jumping to search');

  await reset(); await remove.click(); await page.locator('#outside').click();
  await page.evaluate(() => { const outside = document.getElementById('outside'); outside.remove(); });
  assert.equal(await page.evaluate(() => document.activeElement === document.body), true); await settle();
  assert.equal(await search.evaluate(element => document.activeElement === element), false);
  report.checks.push('after intervening user focus later falls back to BODY, old deletion still cannot reclaim focus');
  await reset();await page.evaluate(()=>window.__DIRECTORY_LEAF__.layout(['only-marker','only-marker','unknown']));
  await page.waitForFunction(()=>document.querySelector('[data-native-navigation-directory-layout-notice]')?.textContent.includes('1 项图钉'));
  assert.match(await trigger.getAttribute('aria-label'),/1 项图钉在目录中/);
  await page.keyboard.press('Escape');await directory.waitFor({state:'hidden'});
  assert.match(await trigger.getAttribute('aria-label'),/已固定目标，1 项；1 项图钉在目录中/);
  await trigger.click();await directory.waitFor();assert.equal(await remove.count(),1);
  await page.evaluate(()=>window.__DIRECTORY_LEAF__.replaceApi());await directory.waitFor({state:'hidden'});
  assert.equal(await trigger.getAttribute('aria-label'),'已固定目标');
  report.checks.push('canonical count and deduplicated compact directory fallback survive close; replaced API cannot inherit another owner’s layout notice');
  assert.deepEqual(report.errors, []); report.passed = true;
} catch (error) { report.failure = error.stack; if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {}); process.exitCode = 1; }
finally { await browser?.close(); await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify({ ...report, report: path.join(out, 'report.json') }, null, 2)); }
