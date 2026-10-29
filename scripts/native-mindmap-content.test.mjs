import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { installedRoot } from '../lab/pilot/build-pilot.mjs';
import { transformNativeMindMapContent } from '../lab/native-outline-transform.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'output/原流程融合_20261017c'); await fs.mkdir(output, { recursive: true });
const require = createRequire(path.join(installedRoot, 'package.json'));
const uiRequire = createRequire(path.join(installedRoot, 'huabu/apps/web/package.json'));
const esbuild = require('esbuild'), { chromium } = require('playwright-core');
const editorPath = path.join(root, 'lcos/huabu/apps/web/src/lcos/nodes/text/MindMapEditor.tsx');
const original = await fs.readFile(editorPath, 'utf8'), transformed = transformNativeMindMapContent(original, { sourcePath: editorPath });
assert.equal(transformNativeMindMapContent(transformed, { sourcePath: editorPath }), transformed);
await esbuild.transform(transformed, { loader: 'tsx', jsx: 'automatic' });
assert.ok(transformed.includes('return embedded ? content : createPortal('));
for (const name of ['updateText', 'addChild', 'addSibling', 'removeNode', 'liftNode', 'findText', 'findBranch']) {
  const start = original.indexOf('function ' + name + '('), end = original.indexOf('\r\n}\r\n', start) + 3;
  assert.ok(start >= 0 && end > start && transformed.includes(original.slice(start, end)), `${name} owner retained`);
}

const stubCanvas = `const store={getState:()=>window.fixture.canvas};export default store;`;
const stubShell = `export const useLcosShellStore={getState:()=>({projectId:window.fixture.snapshot.projectId})};`;
const initialBody = ['# Alpha', '- Child', '# Beta', '', '```js', 'opaque()', '```', ''].join('\n');
const app = `
import React,{useState} from 'react';import{createRoot}from'react-dom/client';
import{NativeMindMapEditing}from'./lab/pilot/native-mindmap-editing';
const initialBody=${JSON.stringify(initialBody)};
const f=window.fixture={snapshot:{projectId:'p',canvasId:'c',spatialId:'n',artifactId:'a',viewId:'v',revisionId:'r1',fileRecordId:'f1',title:'Map',body:initialBody},
 writes:[],verifies:[],saved:[],pending:null,saveMode:'confirmed',closed:0};
const api={};f.canvas={status:'ready',canvasId:'c',rfInstance:api,nodes:[{id:'n',data:{lcos_ref:{version:1,entityType:'artifact',entityId:'a',artifactId:'a',artifactViewId:'v',revisionId:'r1'}}}]};
const confirmed=input=>{const value={...f.snapshot,body:input.body,revisionId:'r'+(Number(f.snapshot.revisionId.slice(1))+1)};f.snapshot=value;f.canvas.nodes[0].data.lcos_ref.revisionId=value.revisionId;return{status:'confirmed',operationId:'op',value}};
window.__LCOS_NATIVE_TEXT_SAVE_PORT__={
 save:async input=>{f.writes.push(input);f.pending={...input,operationId:'op',status:'waiting-batch',settled:false};
  if(f.saveMode==='hold')return new Promise(resolve=>{f.resolveSave=()=>{const result=confirmed(input);f.pending={...f.pending,status:'confirmed',settled:true,result};resolve(result)}});
  if(f.saveMode==='unknown'||f.saveMode==='unknown-advanced'){if(f.saveMode==='unknown-advanced'){confirmed(input);f.canvas.nodes[0].data.lcos_ref.revisionId=input.expectedRevisionId}f.pending.status='response-lost';return{status:'response-lost',operationId:'op'}};
  const result=confirmed(input);f.pending={...f.pending,status:'confirmed',settled:true,result};return result;},
 verify:async id=>{f.verifies.push(id);return f.pending?.result??{status:'readback-matched-unconfirmed',operationId:id,value:f.snapshot}},
 acknowledge:id=>{if(!f.pending?.settled)return false;f.pending=null;return true},
 getPending:()=>f.pending};
function Button({label,children,disabled,onClick}){return <button aria-label={label} disabled={disabled} onClick={onClick}>{children}</button>}
function App(){const[open,setOpen]=useState(true),[saved,setSaved]=useState('');const close=()=>{f.closed++;setOpen(false)};
 return <><button onClick={()=>{setSaved('');setOpen(true)}}>Open</button>{open&&<div data-media-viewer role='dialog' tabIndex={-1} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();close()}}}>
 <button onClick={close}>Original back</button>{saved?<p>{saved}</p>:<NativeMindMapEditing projectId='p' canvasId='c' nodeId='n' artifactId='a' revisionId={f.canvas.nodes[0].data.lcos_ref.revisionId}
  parts={{ActionBar:React.Fragment,ActionButton:Button}} actionsSelector='[data-native-mindmap-actions="fixture"]'
  onCancel={()=>{f.cancelled=true;setOpen(false)}} onSaved={value=>{f.saved.push(value);setSaved('Saved '+value.revisionId)}}/>}
 <div data-native-mindmap-actions='fixture'/></div>}</>}
createRoot(document.getElementById('app')).render(<App/>);`;
const built = await esbuild.build({ stdin: { contents: app, loader: 'tsx', resolveDir: root }, bundle: true, write: false,
  outdir: 'fixture', jsx: 'automatic', format: 'esm', platform: 'browser', target: 'es2022', logLevel: 'silent',
  nodePaths: [path.join(installedRoot, 'node_modules')], plugins: [{ name: 'fixture-read-ports', setup(build) {
    build.onResolve({ filter: /^[^./]/ }, args => {
      try { return { path: uiRequire.resolve(args.path) }; } catch { return undefined; }
    });
    build.onLoad({ filter: /native-canvas-port\.ts$/ }, () => ({ contents: stubCanvas, loader: 'ts' }));
    build.onLoad({ filter: /lcosShellStore\.ts$/ }, () => ({ contents: stubShell, loader: 'ts' }));
    build.onLoad({ filter: /MindMapEditor\.tsx$/ }, args => ({ contents: transformed, loader: 'tsx', resolveDir: path.dirname(args.path) }));
  } }] });
const js = built.outputFiles.find(file => file.path.endsWith('.js')).text, css = built.outputFiles.find(file => file.path.endsWith('.css'))?.text ?? '';
const legacyCss = await fs.readFile(path.join(root, 'lcos/huabu/apps/web/src/lcos/nodes/text/text-faces.css'), 'utf8');
const server = http.createServer((req, res) => {
  const isJs = req.url === '/app.js'; res.setHeader('Content-Type', isJs ? 'text/javascript' : 'text/html');
  res.end(isJs ? js : '<!doctype html><html><head><style>' + legacyCss + '\nbody{margin:0;color:#242625;background:white}button{padding:8px}[data-media-viewer]{height:85vh}.mindmap-editor-stage{height:400px}.lcos-mindmap-link{fill:none;stroke:#999}.lcos-mindmap-topic text{fill:#242625}' + css + '</style></head><body><div id="app"></div><script type="module" src="/app.js"></script></body></html>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const result = { passed: false, kind: 'actual transformed Gen1 editor + production content leaf; simulated read/save ports, not full App/Core QA', checks: [], errors: [] };
let activePage;
async function fixture() {
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 } }), page = await context.newPage();
  activePage = page;
  page.on('pageerror', error => result.errors.push(error.message));
  await page.route('**/*', async route => {
    const address = new URL(route.request().url());
    if (address.origin !== base) return route.abort();
    if (address.pathname.startsWith('/api/lcos/core/')) {
      const value = await page.evaluate(pathname => pathname.includes('canvas-text') ? window.fixture.snapshot
        : { artifact: { id: 'a', projectId: 'p', managed: true, kind: 'markdown', currentRevisionId: window.fixture.snapshot.revisionId } }, address.pathname);
      return route.fulfill({ json: { ok: true, value } });
    }
    return route.continue();
  });
  await page.goto(base); await page.locator('[data-lcos-map-editor]').waitFor();
  await page.getByRole('button', { name: '保存导图', exact: true }).waitFor();
  return { context, page };
}
const branch = page => page.locator('g.lcos-mindmap-topic').filter({ hasText: /^Alpha(?: changed)?$/ });
try {
  {
    const { context, page } = await fixture();
    assert.equal(await page.getByRole('dialog').count(), 1); assert.equal(await page.locator('.inline-note-editor-scrim').count(), 0);
    assert.equal(await page.locator('[data-lcos-map-editor]').evaluate(element => getComputedStyle(element).position), 'relative');
    assert.equal(await page.locator('[data-lcos-map-editor]').evaluate(element => getComputedStyle(element).boxShadow), 'none');
    assert.equal(await page.locator('[data-lcos-map-editor]').evaluate(element => element.classList.contains('mindmap-editor')), false);
    assert.equal(await page.locator('[data-native-mindmap-actions] button').count(), 6);
    await branch(page).dblclick(); await page.locator('foreignObject input').fill('Alpha changed');
    await page.getByRole('button', { name: 'Original back', exact: true }).click();
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await page.locator('g.lcos-mindmap-topic').filter({ hasText: /^Alpha changed$/ }).waitFor();
    await branch(page).click(); await page.keyboard.press('Tab');
    const input = page.locator('foreignObject input'); await input.waitFor(); await input.fill('New child'); await page.keyboard.press('Escape');
    await page.keyboard.press('Escape'); assert.equal(await page.getByRole('dialog').count(), 0);
    await page.getByRole('button', { name: 'Open', exact: true }).click(); await branch(page).waitFor();
    await page.getByRole('button', { name: '保存导图', exact: true }).click();
    await page.getByText('Saved r2', { exact: true }).waitFor();
    const writes = await page.evaluate(() => window.fixture.writes); assert.equal(writes.length, 1);
    assert.equal(writes[0].expectedRevisionId, 'r1'); assert.match(writes[0].body, /Alpha changed/); assert.match(writes[0].body, /opaque\(\)/);
    result.checks.push('one outer dialog; buttons portal into original slot; draft survives outer close; local Tab/Escape; source/fence retained; exact base revision submitted once');
    await page.screenshot({ path: path.join(output, 'mindmap-content-fixture-saved.png') }); await context.close();
  }
  for (const mode of ['unknown', 'unknown-advanced']) {
    const { context, page } = await fixture(); await page.evaluate(mode => { window.fixture.saveMode = mode; }, mode);
    await branch(page).dblclick(); await page.locator('foreignObject input').fill('Unknown draft');
    await page.getByRole('button', { name: '保存导图', exact: true }).click();
    await page.getByRole('button', { name: '只核对上次保存，不会重复提交', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: '保存导图', exact: true }).isDisabled(), true);
    await page.getByRole('button', { name: 'Original back', exact: true }).click(); await page.getByRole('button', { name: 'Open', exact: true }).click();
    await page.getByRole('button', { name: '只核对上次保存，不会重复提交', exact: true }).click();
    const state = await page.evaluate(() => ({ writes: window.fixture.writes.length, verifies: window.fixture.verifies.length, saved: window.fixture.saved.length }));
    assert.deepEqual(state, { writes: 1, verifies: 1, saved: 0 });
    if (mode === 'unknown-advanced') assert.deepEqual(await page.evaluate(() => ({ core: window.fixture.snapshot.revisionId,
      node: window.fixture.canvas.nodes[0].data.lcos_ref.revisionId })), { core: 'r2', node: 'r1' });
    await page.getByText('Unknown draft', { exact: true }).waitFor();
    result.checks.push(mode + ': receipt survives unmount; only original verify called, no duplicate write or false confirmed save'); await context.close();
  }
  {
    const { context, page } = await fixture(); await page.evaluate(() => { window.fixture.saveMode = 'hold'; });
    await branch(page).dblclick(); await page.locator('foreignObject input').fill('Late draft');
    await page.getByRole('button', { name: '保存导图', exact: true }).click();
    await page.getByRole('button', { name: 'Original back', exact: true }).click();
    await page.evaluate(() => window.fixture.resolveSave()); await page.getByRole('button', { name: 'Open', exact: true }).click();
    await page.getByText('Saved r2', { exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => ({ writes: window.fixture.writes.length, saved: window.fixture.saved.length })), { writes: 1, saved: 1 });
    result.checks.push('saving outer close retains draft and terminal receipt; resume consumes exact late confirmation once'); await context.close();
  }
  {
    const { context, page } = await fixture();
    await branch(page).click(); await page.keyboard.press('Control+c'); await page.keyboard.press('Control+v');
    assert.equal(await page.locator('g.lcos-mindmap-topic').filter({ hasText: /^Alpha$/ }).count(), 2);
    assert.equal(await page.locator('g.lcos-mindmap-topic').filter({ hasText: /^Child$/ }).count(), 2);
    await page.getByRole('button', { name: 'Original back', exact: true }).click(); await page.getByRole('button', { name: 'Open', exact: true }).click();
    await page.locator('g.lcos-mindmap-topic').filter({ hasText: /^Map$/ }).click(); await page.keyboard.press('Control+v');
    assert.equal(await page.locator('g.lcos-mindmap-topic').filter({ hasText: /^Child$/ }).count(), 3);
    await page.getByRole('button', { name: '保存导图', exact: true }).click(); await page.getByText('Saved r2', { exact: true }).waitFor();
    const body = await page.evaluate(() => window.fixture.writes[0].body);
    assert.equal((body.match(/opaque\(\)/g) ?? []).length, 1);
    result.checks.push('original branch keyboard copy/paste keeps subtree and clipboard across close, fresh IDs and opaque document content retained once'); await context.close();
  }
  {
    const { context, page } = await fixture();
    await branch(page).dblclick(); await page.locator('foreignObject input').fill('Retained but stale');
    await page.evaluate(() => { window.fixture.snapshot.revisionId = 'r9'; window.fixture.canvas.nodes[0].data.lcos_ref.revisionId = 'r9'; });
    await page.getByRole('button', { name: '保存导图', exact: true }).click();
    await page.getByText('原正文已更新，导图草稿已保留；没有覆盖新的版本。', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.fixture.writes.length), 0);
    await page.getByRole('button', { name: '取消本次编辑', exact: true }).click(); await page.getByRole('button', { name: 'Open', exact: true }).click();
    await branch(page).waitFor(); assert.equal(await page.getByText('Retained but stale', { exact: true }).count(), 0);
    result.checks.push('changed revision cannot submit a stale draft; explicit cancel discards only that draft and resumes current body'); await context.close();
  }
  assert.deepEqual(result.errors, []); result.passed = true;
} catch (error) {
  result.failure = error.message;
  result.dom = await activePage?.locator('body').innerText().catch(() => '');
  result.state = await activePage?.evaluate(() => ({ writes: window.fixture?.writes, saved: window.fixture?.saved, pending: window.fixture?.pending })).catch(() => null);
  await activePage?.screenshot({ path: path.join(output, 'mindmap-content-fixture-failure.png') }).catch(() => {});
  throw error;
}
finally {
  await browser.close(); await new Promise(resolve => server.close(resolve));
  await fs.writeFile(path.join(output, 'mindmap-content-fixture-result.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
}
