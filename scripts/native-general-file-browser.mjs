import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { currentGen2Root } from '../lab/current-gen2-resources.mjs';

// Actual original menu/input and mouse/keyboard only. No Canvas/store writes
// from evaluate, fixture nodes, camera setters, model calls or upload replay.
const arg = name => process.argv.find(x => x.startsWith('--' + name + '='))?.slice(name.length + 3);
assert.ok(arg('base-url') && process.argv.includes('--commit'), 'Declare a coordinated isolated runtime and synthetic upload.');
const address = new URL(arg('base-url'));
assert.equal(address.protocol, 'http:'); assert.equal(address.hostname, '127.0.0.1'); assert.equal(address.pathname, '/');
const origin = address.origin, kind = arg('kind') ?? 'pdf', entry = arg('entry') ?? 'canvas';
assert.ok(['pdf', 'txt'].includes(kind)); assert.ok(['canvas', 'library'].includes(entry));
const undoRedo = process.argv.includes('--undo-redo'); assert.ok(!undoRedo || entry === 'canvas');
const roundtrips=Number(arg('roundtrips')??1);assert.ok(Number.isInteger(roundtrips)&&roundtrips>=1&&roundtrips<=3);
const root = path.resolve(import.meta.dirname, '..'), stamp = new Date().toISOString().replace(/[:.]/g, '-');
const output = path.join(root, 'output/原生文件Drop整合_20261017i/原文件真实页面', stamp);
await fs.mkdir(output, { recursive: true });
const health = await (await fetch(origin + '/health')).json();
assert.ok(health.realCoreConnected && health.nativeRailPilot && health.runtimeLabel?.startsWith('isolated-'));
if (arg('expected-pid')) assert.equal(health.pid, Number(arg('expected-pid')));
const canvasId = 'surface-core-context', projectId = 'disposable-surface-core-facade';
const name = '原流程实测-' + stamp + '.' + kind;
let bytes;
if (kind === 'pdf') {
  const original = await fs.readFile(path.join(root, 'lcos/huabu/apps/web/src/lcos/professional/__fixtures__/reader-pages.pdf'));
  const eof = original.lastIndexOf(Buffer.from('%%EOF'));
  assert.ok(eof > 0, 'The synthetic source PDF must retain its actual EOF marker.');
  // Keep object/xref offsets and the final EOF intact; a trailing comment
  // after EOF would make our test input invalid under the existing importer.
  bytes = Buffer.concat([original.subarray(0, eof), Buffer.from('% Original menu synthetic run ' + stamp + '\n'), original.subarray(eof)]);
} else bytes = Buffer.from('# 原流程文件实测\n\n这是通过原添加菜单导入的合成文字。\n' + stamp + '\n');
const fixture = path.join(output, name); await fs.writeFile(fixture, bytes);
const get = async pathname => {
  const response = await fetch(origin + pathname, { redirect: 'error', cache: 'no-store' }), body = await response.json();
  assert.equal(response.status, 200, JSON.stringify({ pathname, body }));
  if ('ok' in body) { assert.equal(body.ok, true); return body.value; }
  assert.equal(body.code, 0); return body.data;
};
const prefix = '/api/lcos/core/projects/' + projectId;
const facts = async () => ({ graph: await get(prefix + '/graph'), runs: await get(prefix + '/runs'),
  presentations: await get(prefix + '/presentations'), bindings: await get(prefix + '/spatial/bindings'),
  pins: await get(prefix + '/color-pins'), canvases: Object.fromEntries(await Promise.all(['main', 'context', 'workflow'].map(async surface => {
    const id = 'surface-core-' + surface; return [id, await get('/api/canvas/v1/canvases/' + id)];
  }))) });
let before = await facts(); await fs.writeFile(path.join(output, 'startup-before-facts.json'), JSON.stringify(before, null, 2));
const report = { at: new Date().toISOString(), health, output, kind, entry, undoRedo, fixture: { name, bytes: bytes.length },
  scope: 'Actual original App upload chooser → one shipped manager → actual isolated Core → original carrier/Viewer/history. Not an OS drag or all-format claim.',
  checks: [], writes: [], startupWrites: [], diagnosticPosts: [], remoteBlocked: [], blockedWrites: [], pageErrors: [], consoleErrors: [], apiErrors: [], screenshots: [], passed: false };
const { chromium } = createRequire(path.join(currentGen2Root, 'package.json'))('playwright-core');
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  args: ['--disable-background-networking', '--disable-sync', '--disable-component-update', '--no-first-run'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', serviceWorkers: 'block' });
let imported, created;
await context.route('**/*', async route => {
  const request = route.request(), url = new URL(request.url());
  if (['data:', 'blob:'].includes(url.protocol)) return route.continue();
  if (url.origin !== origin || !['http:', 'https:'].includes(url.protocol)) {
    report.remoteBlocked.push(request.method() + ' ' + url.origin + url.pathname); return route.abort();
  }
  if(process.argv.includes('--trace-history')&&url.pathname==='/assets/page-Da_DfwiK.js'){
    const response=await route.fetch();let source=await response.text();const seam='const __lcosInspectNativeHistory=';assert.equal(source.split(seam).length,2);
    const probe=`window.__LCOS_TEST_HISTORY_READ__=()=>{const brief=n=>({id:n.id,dataId:n.data?.id,type:n.type,position:n.position,width:n.width,height:n.height,measured:n.measured,ref:n.data?.lcos_ref,member:n.data?.lcos_workspace_membership});return{index:p.current,suppressed:y.current,native:b.current.map(brief),entries:x.current.map(e=>({nodes:e.state.nodes.map(brief),operations:e.lcos_history_operations}))}};`;
    source=source.replace(seam,probe+seam);return route.fulfill({response,body:source});
  }
  if (process.argv.includes('--trace-measurements') && url.pathname === '/startup-history-intent.js') {
    const response = await route.fetch();
    const source = await response.text();
    const probe = `
;(()=>{const original=window.__LCOS_NATIVE_INTENT__,trace=[];let uploadApi;
const copy=node=>node?{id:node.id,type:node.type,measured:node.measured,position:node.position,data:{title:node.data?.title,lcos_ref:node.data?.lcos_ref,lcos_file_ref:node.data?.lcos_file_ref,lcos_upload_url:node.data?.lcos_upload_url}}:null;
window.__LCOS_TEST_MEASUREMENT_TRACE__=trace;
window.__LCOS_NATIVE_INTENT__={...original,tagChanges(changes,getNode,canvasId){
 const host=window.__LCOS_NODE_LAB__;if(changes.some(c=>c.type==='add'&&c.item?.data?.lcos_upload_url))uploadApi=host?.api;
 const row=changes.some(c=>c.type==='dimensions')?{canvasId,sameApi:host?.api===uploadApi,before:changes.map(c=>({id:c.id,type:c.type,dimensions:c.dimensions,resizing:c.resizing,lookedUp:copy(getNode(c.id))})),nodes:host?.api?.getNodes?.().map(copy)}:null;
 const value=original.tagChanges(changes,getNode,canvasId);if(row){row.after=changes.map(c=>({id:c.id,type:c.type,dimensions:c.dimensions,resizing:c.resizing}));trace.push(row);}return value;
}};})();`;
    return route.fulfill({ response, body: source + probe });
  }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
    if (url.pathname === '/api/events' && request.method() === 'POST') {
      report.diagnosticPosts.push({ method: request.method(), path: url.pathname }); return route.continue();
    }
    if (url.pathname === '/api/lcos/canvases/' + canvasId + '/execution:reconcile' && request.method() === 'POST') {
      // Existing boot-time display reconciliation does not create/dispatch a Run.
      // Record it separately; blocking it would manufacture an unrelated toast.
      report.startupWrites.push({ method: request.method(), path: url.pathname }); return route.continue();
    }
    const allowed = /^\/api\/files\/upload-urls(?:\/[^/]+(?:\/complete)?)?$/.test(url.pathname)
      || url.pathname.startsWith('/api/lcos-upload-staging/')
      || url.pathname.endsWith('/nodes:batchActions');
    const row = { method: request.method(), path: url.pathname };
    if (!allowed) { report.blockedWrites.push(row); return route.abort(); }
    if (url.pathname.endsWith('/nodes:batchActions')) {
      row.body = request.postDataJSON(); assert.equal(row.body.canvas_id, canvasId);
      assert.equal(entry, 'canvas', 'Library import must never create a Canvas node.');
    }
    report.writes.push(row);
  }
  return route.continue();
});
await context.routeWebSocket('**/*', socket => socket.close());
const page = await context.newPage(); page.setDefaultTimeout(16000);
page.on('pageerror', error => report.pageErrors.push(error.message));
page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text().slice(0, 1400)); });
page.on('dialog', dialog => dialog.type() === 'beforeunload' ? dialog.accept() : dialog.dismiss());
page.on('response', async response => {
  const url = new URL(response.url());
  if (url.origin !== origin) return;
  if (response.status() >= 400) {
    const failure = { path: url.pathname, status: response.status() };
    if (url.pathname.endsWith('/nodes:batchActions')) { try { failure.body = await response.json(); } catch {} }
    report.apiErrors.push(failure);
  }
  if (/\/api\/files\/upload-urls\/[^/]+\/complete$/.test(url.pathname) && response.status() === 200) {
    try { imported = (await response.json()).data; } catch {}
  }
});
const shot = async label => {
  const file = path.join(output, label + '.png'); await page.screenshot({ path: file });
  await fs.writeFile(path.join(output, label + '.aria.txt'), await page.locator('body').ariaSnapshot()); report.screenshots.push(file);
};
const poll = async (label, read, predicate, ms = 40000) => {
  const limit = Date.now() + ms; let value;
  while (Date.now() < limit) { value = await read(); if (predicate(value)) return value; await new Promise(resolve => setTimeout(resolve, 200)); }
  report.pollFailure={label,lastReadback:value};throw new Error(label + ': condition timed out; exact readback retained in report.');
};
try {
  await page.goto(origin + '/canvas/' + canvasId);
  const input = page.getByRole('textbox', { name: 'Composer 输入', exact: true });
  await input.waitFor({ timeout: 60000 });
  await page.getByRole('status', { name: 'Loading canvas' }).waitFor({ state: 'hidden', timeout: 45000 });
  before = await facts(); await fs.writeFile(path.join(output, 'before-facts.json'), JSON.stringify(before, null, 2));
  const draft = '保留未发送的想法 · ' + stamp; await input.fill(draft);
  if (entry === 'canvas') {
    await page.getByTestId('canvas-dockbar-add-node-btn').click();
    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('option', { name: /上传/ }).click();
    const chooser = await chooserPromise; report.accept = await chooser.element().getAttribute('accept');
    assert.ok(report.accept?.includes('.' + kind)); await chooser.setFiles(fixture);
  } else {
    await page.getByTestId('canvas-dockbar-assets-btn').click();
    await page.locator('[data-library-view="library"]').getByRole('button', { name: '添加', exact: true }).click();
    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('menuitem', { name: /上传/ }).click();
    const chooser = await chooserPromise; report.accept = await chooser.element().getAttribute('accept'); await chooser.setFiles(fixture);
  }
  await poll('exact imported receipt', async () => imported, value => value?.lcos_ref?.artifactId && value.fileRecordId);
  report.receipt = imported;
  const raw = await fetch(origin + '/api/surface-core/file-records/' + encodeURIComponent(imported.fileRecordId) + '/content', { redirect: 'error' });
  assert.equal(raw.status, 200); assert.deepEqual(Buffer.from(await raw.arrayBuffer()), bytes);
  report.checks.push('Original chooser/manager single import returns exact Core identity and original bytes.');
  assert.equal(report.writes.filter(row => row.path === '/api/files/upload-urls' && row.method === 'POST').length, 1);
  assert.equal(report.writes.filter(row => row.path.endsWith('/complete')).length, 1);
  if (entry === 'canvas') {
    const after = await poll('canonical native carrier', () => get('/api/canvas/v1/canvases/' + canvasId), value => {
      created = value.nodes.find(node => node.data?.lcos_ref?.artifactId === imported.lcos_ref.artifactId); return !!created;
    });
    assert.equal(after.nodes.length, before.canvases[canvasId].nodes.length + 1);
    report.created = created;
    assert.equal(created.data.lcos_ref.revisionId, imported.lcos_ref.revisionId);
    assert.equal(created.data.lcos_upload_url, undefined);
    const node = page.locator('.react-flow__node[data-id=' + JSON.stringify(String(created.id)) + ']');
    await node.waitFor();
    // The original create gesture decides the viewport/release position.
    // If it is unreachable, report it; do not use camera/store setters.
    await node.click({ position: { x: 30, y: 20 } });
    await shot('01-original-file-carrier');
    if (kind === 'pdf') {
      assert.equal(created.type, 'text'); assert.equal(created.data.lcos_file_ref.fileRecordId, imported.fileRecordId);
      await node.getByRole('button', { name: '查看文件', exact: true }).click();
    } else {
      assert.equal(created.data.lcos_file_ref, undefined); assert.match(created.data.text, /原流程文件实测/);
      await node.dblclick({ position: { x: 90, y: 70 } });
    }
    await page.locator('[data-media-viewer]').waitFor();
    report.viewer = await poll('original Viewer real open', () => page.evaluate(async () => {
      const mod = await import('/assets/course-api-base-url-CifxI1ia.js'); const state = mod.LCOSNativeMaterialViewerRuntime.getState();
      return { phase: state.phase, session: state.session ? { id: state.session.id, lcosControlled: {requestKey:state.session.lcosControlled?.requestKey} } : null };
    }), state => state.phase === 'open' && state.session && state.session.lcosControlled?.requestKey);
    if (kind === 'txt') assert.ok((await page.locator('[data-media-viewer]').innerText()).includes(stamp), 'The exact imported text must be read, without entering an unsupported pinned-View editor.');
    if (kind === 'pdf') {
      await page.locator('[data-lcos-pdf-current-page="1"] canvas').waitFor({ timeout: 30000 });
      await page.getByRole('button', { name: '第 2 页', exact: true }).click();
      await page.locator('[data-lcos-pdf-current-page="2"] canvas').waitFor({ timeout: 30000 });
      report.checks.push('The actual PDF renderer paints source pages and its original page rail switches to page 2.');
    }
    report.viewerStyles=await page.evaluate(()=>[document.body,document.querySelector('[data-media-viewer]'),document.querySelector('.native-material-format-body'),document.querySelector('.native-material-text-reading')].filter(Boolean).map(element=>{const s=getComputedStyle(element),box=element.getBoundingClientRect();return{class:element.className,font:s.fontFamily,size:s.fontSize,lineHeight:s.lineHeight,box:{x:box.x,y:box.y,width:box.width,height:box.height}};}));
    await shot('02-original-file-viewer'); await page.keyboard.press('Escape');
    await page.locator('[data-media-viewer]').waitFor({ state: 'hidden' });
    assert.equal(await input.inputValue(), draft); assert.equal(await input.count(), 1);
    assert.equal(await page.locator('[data-lcos-window-body="reader"]').count(), 0);
    report.checks.push('Canonical carrier → original single Viewer → Escape returns to same unsent draft.');
    if (undoRedo) {
     report.historyRoundtrips=[];
     report.historyObservations=[];
     const inspectHistory=async(label)=>{const value=await page.evaluate(({canvasId,nodeId})=>({history:window.__LCOS_NODE_LAB__?.api?.inspectNativeHistory?.({canvasId,nodeId}),raw:window.__LCOS_TEST_HISTORY_READ__?.(),focus:{tag:document.activeElement?.tagName,label:document.activeElement?.getAttribute('aria-label')}}),{canvasId,nodeId:created.id});report.historyObservations.push({label,...value});return value;};
     for(let iteration=0;iteration<roundtrips;iteration++){
      const historyNode=page.locator('.react-flow__node[data-id='+JSON.stringify(created.id)+']');
      await historyNode.waitFor();
      // Canvas Undo must receive focus. A quick second click in a native
      // title enters its editor, whose local text undo is correctly separate.
      const focus=await page.evaluate(iteration=>{const pane=document.querySelector('.react-flow__pane');if(!pane)return null;const box=pane.getBoundingClientRect();
        for(const fy of iteration%2?[.65,.45,.25]:[.25,.45,.65])for(const fx of [.5,.3,.7,.2,.8]){const point={x:box.x+box.width*fx,y:box.y+box.height*fy};if(document.elementFromPoint(point.x,point.y)?.classList.contains('react-flow__pane'))return point;}return null;},iteration);
      assert.ok(focus,'An actual exposed Canvas background receives keyboard focus');await page.mouse.click(focus.x,focus.y);await inspectHistory('before-undo-'+iteration);await page.keyboard.press('Control+z');
      await poll('original Undo removes carrier', () => get('/api/canvas/v1/canvases/' + canvasId), value => !value.nodes.some(row => row.id === created.id));
      report.afterUndo = await facts();
      const workspace = report.afterUndo.graph.workspaces.find(row => row.canvasId === canvasId);
      const members = report.afterUndo.graph.workspaceMemberships ?? [];
      assert.ok(!members.some(row => row.workspaceId === workspace.id && row.artifactViewId === created.data.lcos_ref.artifactViewId), 'Undo must also remove the exact Workspace membership.');
      await inspectHistory('core-undo-returned-'+iteration);
      await page.waitForFunction(({canvasId,nodeId})=>{const api=window.__LCOS_NODE_LAB__?.api;return api?.inspectNativeHistory?.({canvasId,nodeId})?.canRedo===true&&!api?.readOriginalNode?.(nodeId);},{canvasId,nodeId:created.id});
      await page.keyboard.press('Control+Shift+z');
      await inspectHistory('after-redo-key-'+iteration);
      await poll('original Redo restores the same exact View and version', () => get('/api/canvas/v1/canvases/' + canvasId), value => value.nodes.some(row => row.data?.lcos_ref?.artifactViewId === created.data.lcos_ref.artifactViewId && row.data?.lcos_ref?.revisionId === imported.lcos_ref.revisionId));
      report.afterRedo = await facts();
      const recreated = report.afterRedo.canvases[canvasId].nodes.filter(row => row.data?.lcos_ref?.artifactViewId === created.data.lcos_ref.artifactViewId);
      assert.equal(recreated.length, 1);
      assert.equal(recreated[0].data.lcos_ref.artifactId, imported.lcos_ref.artifactId);
      assert.equal(recreated[0].data.lcos_ref.revisionId, imported.lcos_ref.revisionId);
      assert.equal(recreated[0].data.lcos_file_ref?.fileRecordId, created.data.lcos_file_ref?.fileRecordId);
      assert.ok(report.afterRedo.bindings.some(row => row.canvasId === canvasId && row.spatialId === recreated[0].id && row.entityId === recreated[0].data.lcos_ref.entityId));
      report.restoredSpatial = { before: created.id, after: recreated[0].id, artifactViewId: created.data.lcos_ref.artifactViewId };
      const restored = report.afterRedo.graph.workspaceMemberships ?? [];
      assert.ok(restored.some(row => row.workspaceId === workspace.id && row.artifactViewId === created.data.lcos_ref.artifactViewId));
      report.historyRoundtrips.push(report.restoredSpatial);created=recreated[0];
     }
      report.checks.push('Original keyboard Undo/Redo updates carrier and exact Workspace membership, retaining source import.');
    }
  } else {
    await page.getByRole('textbox', { name: '搜索', exact: true }).fill(name);
    await page.getByRole('button', { name, exact: true }).first().waitFor();
    assert.equal(report.writes.filter(row => row.path.endsWith('/nodes:batchActions')).length, 0);
    report.checks.push('Original Library import refreshes exact project Library, with no cloud saveAssets and no Canvas placement.');
    await shot('01-original-library-import');
  }
  const after = await facts(); await fs.writeFile(path.join(output, 'after-facts.json'), JSON.stringify(after, null, 2));
  for (const other of ['surface-core-main', 'surface-core-workflow']) assert.deepEqual(after.canvases[other], before.canvases[other]);
  if (entry === 'library') assert.deepEqual(after.canvases, before.canvases);
  assert.deepEqual(after.runs, before.runs); assert.deepEqual(after.pins, before.pins);
  assert.deepEqual(report.pageErrors, []); report.passed = true;
} catch (error) {
  report.lastNativeHistory=await page.evaluate(({canvasId,nodeId})=>({history:window.__LCOS_NODE_LAB__?.api?.inspectNativeHistory?.({canvasId,nodeId}),raw:window.__LCOS_TEST_HISTORY_READ__?.(),focus:{tag:document.activeElement?.tagName,label:document.activeElement?.getAttribute('aria-label')}}),{canvasId,nodeId:created?.id??''}).catch(()=>null);
  report.failure = error.stack; await shot('99-failure').catch(() => {}); process.exitCode = 1;
} finally {
  if (process.argv.includes('--trace-measurements')) report.measurements = await page.evaluate(() => window.__LCOS_TEST_MEASUREMENT_TRACE__ ?? []).catch(() => []);
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ output, passed: report.passed, failure: report.failure, checks: report.checks })); await browser.close();
}
