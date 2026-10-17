import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { installedRoot } from '../lab/pilot/build-pilot.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = process.argv.find(value => value.startsWith('--base-url='))?.slice(11);
assert.ok(base && new URL(base).hostname === '127.0.0.1');
const loss = process.argv.includes('--lose-final-response');
const dropHistoryResponse=process.argv.find(value=>value.startsWith('--drop-history-response='))?.slice(24);
assert.ok(dropHistoryResponse===undefined||['undo','redo'].includes(dropHistoryResponse));assert.ok(!loss||!dropHistoryResponse,'editing loss and history loss are separate deliberate intents');
const historyRoundtrip = process.argv.includes('--history-roundtrip');
const inspectOriginalHistory = process.argv.includes('--inspect-original-history');
const useExistingOutline = process.argv.includes('--use-existing-outline');
const existingNodeId = process.argv.find(value => value.startsWith('--node-id='))?.slice(10);
const fromTitle=process.argv.find(value=>value.startsWith('--from-title='))?.slice(13)??'Alpha';
const toTitle=process.argv.find(value=>value.startsWith('--to-title='))?.slice(11)??'Alpha live edited';
assert.ok(fromTitle!==toTitle&&!/[\r\n]/.test(fromTitle+toTitle),'each declared edit must change one real existing heading');
const escaped=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const output = path.join(root, useExistingOutline?'output/原生文本整合_20261017e/导图整页回归':'output/原流程融合_20261017c/导图整页验证', new Date().toISOString().replace(/[:.]/g, '-'));
await fs.mkdir(output, { recursive: true });
const health = await (await fetch(base + '/health')).json();
assert.equal(health.realCoreConnected, true); assert.ok(health.runtimeLabel.startsWith('isolated-'));
const report = { passed: false, base, pid: health.pid, loss, dropHistoryResponse, historyRoundtrip, inspectOriginalHistory, checks: [], errors: [], screenshots: [], batches: [], receiptGets: [], modelRequests: [], fixture: null };
const get = async route => {
  const response = await fetch(base + route, { cache: 'no-store' }); assert.equal(response.status, 200, route);
  const body = await response.json(); if ('ok' in body) { assert.equal(body.ok, true); return body.value; }
  assert.equal(body.code, 0); return body.data;
};
const mapping = await get('/api/lcos/translation'), projectId = mapping.projectId, canvasId = 'surface-core-main';
const prefix = '/api/lcos/core/projects/' + encodeURIComponent(projectId);
const beforeCanvas = await get('/api/canvas/v1/canvases/' + canvasId), beforeGraph = await get(prefix + '/graph');
const beforeRuns = await get(prefix + '/runs');
report.beforeCounts={artifacts:beforeGraph.artifacts.length,runs:beforeRuns.length};
const existingIds = new Set(beforeCanvas.nodes.map(node => node.id));
const { chromium } = createRequire(path.join(installedRoot, 'package.json'))('playwright-core');
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', serviceWorkers: 'block' });
let phase = 'create', source, withheld = false, historyWithheld=false;
await context.route('**/*', async route => {
  const request = route.request(), address = new URL(request.url());
  if (!['blob:', 'data:'].includes(address.protocol) && address.origin !== base) return route.abort();
  if(inspectOriginalHistory&&request.method()==='GET'&&address.pathname.endsWith('/page-Da_DfwiK.js')){
    const response=await route.fetch(),source=await response.text(),marker='const __lcosInspectNativeHistory=';
    assert.equal(source.split(marker).length-1,1,'exact existing original O8 inspector seam');
    const body=source.replace(marker,'window.__LCOS_TEST_RAW_HISTORY__=()=>({canvasId:__lcosHistoryCanvasId,currentIndex:p.current,history:structuredClone(x.current)});'+marker);
    report.rawHistoryInstrumentation='read-only test response copy of original O8 x.current/p.current; no product source/API change';
    return route.fulfill({response,body});
  }
  if (request.method() === 'POST' && /\/(runs|dispatch|generations|checkout)(?:\/|$)/.test(address.pathname)) {
    report.modelRequests.push(address.pathname); return route.abort();
  }
  if (request.method() === 'POST' && /\/canvases\/[^/]+\/nodes:batchActions$/.test(address.pathname)) {
    const body = request.postDataJSON(); report.batches.push({ phase, path: address.pathname, query: address.search, time: Date.now(), body });
    if (phase === 'edit' && loss && !withheld) {
      withheld = true; const response = await route.fetch(); report.withheld = { status: response.status(), body: await response.json() };
      return route.abort('failed');
    }
    if(dropHistoryResponse&&phase==='history-'+dropHistoryResponse&&!historyWithheld){historyWithheld=true;const response=await route.fetch();report.historyWithheld={phase,status:response.status(),body:await response.json()};return route.abort('failed');}
  }
  return route.continue();
});
await context.routeWebSocket('**/*', socket => socket.close());
const page = await context.newPage(); page.on('pageerror', error => report.errors.push(error.message));
page.on('response', response => { const address = new URL(response.url()); if (response.request().method() === 'GET' && address.pathname.includes('/text-save-receipts/')) report.receiptGets.push({ path: address.pathname, status: response.status(), time: Date.now() }); });
const screenshot = async name => { await page.waitForTimeout(700); const file = path.join(output, name + '.png'); await page.screenshot({ path: file }); report.screenshots.push(file); };
const waitFor = async (read, predicate, label) => { for (let n = 0; n < 100; n++) { const value = await read(); if (predicate(value)) return value; await page.waitForTimeout(150); } throw new Error(label); };
const currentText = () => get(prefix + '/curation/canvas-text?' + new URLSearchParams({ canvasId, spatialId: source.id }));
const history = () => page.evaluate(({ canvasId, nodeId }) => window.__LCOS_NODE_LAB__?.api?.inspectNativeHistory({ canvasId, requestedCanvasId: canvasId, nodeId }), { canvasId, nodeId: source.id });
const rawHistory = () => page.evaluate(() => window.__LCOS_TEST_RAW_HISTORY__?.());
const assertExactHistoryNode = async (snapshot,label) => {
  if(!inspectOriginalHistory)return;
  const raw=await rawHistory();assert.equal(raw?.canvasId,canvasId);const node=raw.history[raw.currentIndex]?.state?.nodes?.find(node=>node.id===source.id);
  assert.ok(node,label+' original current history node');assert.equal(node.data.text,snapshot.body);assert.equal(node.data.lcos_ref.revisionId,snapshot.revisionId);assert.equal(node.data.lcos_ref.artifactId,snapshot.artifactId);assert.equal(node.data.lcos_ref.artifactViewId,snapshot.viewId);
  report.rawHistory??={};report.rawHistory[label]=raw;
};
const liveNode = () => page.evaluate(id => window.__LCOS_NODE_LAB__?.api?.getNode(id), source.id);
const editorActionsReady = () => page.locator('[data-media-viewer] [data-native-mindmap-actions] button').first().waitFor({ timeout: 30_000 });
const persist = () => fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
const returnToNode = async () => {
  await page.locator('[data-media-viewer] header').getByRole('button', { name: /返回|Back/ }).click();
  await page.locator('[data-media-viewer]').waitFor({ state: 'hidden', timeout: 20_000 });
};
const textMenuAction=async name=>{await page.getByTestId('lcos-native-text-view-menu').getByRole('button').click();await page.getByRole('menuitem',{name,exact:true}).click()};
async function verifyHistoryOnly(action,committed){
  const pending=await waitFor(()=>page.evaluate(({canvasId,nodeId})=>window.__LCOS_NATIVE_TEXT_SAVE_PORT__.getPending({canvasId,nodeId}),{canvasId,nodeId:source.id}),value=>value?.source==='native-history'&&value.historyPhase===action&&['response-lost','no-receipt-yet','response-processing-late'].includes(value.status),'original history loss did not retain its source/phase');
  assert.equal(historyWithheld,true);assert.equal(report.historyWithheld.status,200);const count=()=>report.batches.filter(batch=>batch.phase==='history-'+action).length;assert.equal(count(),1);report.historyLoss??={};report.historyLoss[action]={pending,committed,observedAt:Date.now(),historyBeforeVerify:await history()};await persist();
  await page.waitForTimeout(30_000);assert.equal(count(),1,'the actual original history worker cannot replay the unconfirmed direction');assert.ok(Date.now()-report.historyLoss[action].observedAt>=30_000);
  await page.locator('.react-flow__node[data-id="'+source.id+'"]').click({position:{x:12,y:12}});await textMenuAction('核对原保存');
  await waitFor(()=>page.evaluate(({canvasId,nodeId})=>window.__LCOS_NATIVE_TEXT_SAVE_PORT__.getPending({canvasId,nodeId}),{canvasId,nodeId:source.id}),value=>value===null,'original more-menu GET recovery did not naturally retire the exact history pending');
  assert.equal(count(),1,'the original more-menu verification must not send a history POST');assert.ok(report.receiptGets.some(item=>item.status===200&&item.path.endsWith('/'+encodeURIComponent(pending.claimedRequestId))));const after=await currentText(),node=await liveNode();assert.equal(after.revisionId,committed.revisionId);assert.equal(after.body,committed.body);assert.equal(node.data.text,after.body);assert.equal(node.data.lcos_ref.revisionId,after.revisionId);await assertExactHistoryNode(after,'history-'+action+'-GET');report.historyLoss[action].after={snapshot:after,history:await history(),node};await screenshot('history-'+action+'-GET-only-restored');
}
async function originalHistoryRoundtrip(saved,beforeSave){
      await returnToNode();phase='history-undo';
      const savedEntry=await history();assert.equal(savedEntry.currentIndex,report.historyAfterSave.currentIndex);assert.equal(savedEntry.historySize,report.historyAfterSave.historySize);
      report.historyRoundtripResult={savedEntry};
      const point=await page.locator('.react-flow__pane').first().evaluate(element=>{const r=element.getBoundingClientRect();for(const fy of [.08,.16,.84,.92])for(const fx of [.08,.16,.84,.92]){const x=r.left+r.width*fx,y=r.top+r.height*fy,hit=document.elementFromPoint(x,y);if(hit?.closest('.react-flow__pane')&&!hit.closest('.react-flow__node,button,input,textarea,[contenteditable="true"],.react-flow__controls,.react-flow__minimap'))return{x,y}}});
      assert.ok(point,'one unobstructed original canvas point is required for native Undo');await page.mouse.click(point.x,point.y);await page.keyboard.press('Control+z');
      const undone=await waitFor(currentText,value=>value.body===beforeSave.body&&value.revisionId!==saved.revisionId,'original Undo did not return the exact preceding body');
      assert.equal(report.batches.filter(batch=>batch.phase==='history-undo').length,1);assert.equal(report.batches.find(batch=>batch.phase==='history-undo').body.lcos_expected_revisions[source.id],saved.revisionId);if(dropHistoryResponse==='undo')await verifyHistoryOnly('undo',undone);
      report.historyRoundtripResult.undone=undone;report.historyRoundtripResult.undoImmediately={history:await history(),live:await liveNode()};await persist();
      const undoHistory=await waitFor(history,value=>value?.ok&&value.currentIndex===savedEntry.currentIndex-1,'original Undo history index did not settle within 15s');assert.equal(undoHistory.historySize,savedEntry.historySize);
      const undoNode=await liveNode();assert.equal(undoNode.data.lcos_ref.revisionId,undone.revisionId);assert.equal(undoNode.data.text,beforeSave.body);await screenshot('05-original-undo-exact-text');
      await assertExactHistoryNode(undone,'undo');
      phase='history-redo';await page.mouse.click(point.x,point.y);await page.keyboard.press('Control+Shift+z');
      const redone=await waitFor(currentText,value=>value.body===saved.body&&value.revisionId!==undone.revisionId,'original Redo did not return the exact saved body');
      assert.equal(report.batches.filter(batch=>batch.phase==='history-redo').length,1);assert.equal(report.batches.find(batch=>batch.phase==='history-redo').body.lcos_expected_revisions[source.id],undone.revisionId);if(dropHistoryResponse==='redo')await verifyHistoryOnly('redo',redone);
      report.historyRoundtripResult.redone=redone;report.historyRoundtripResult.redoImmediately={history:await history(),live:await liveNode()};await persist();
      const redoHistory=await waitFor(history,value=>value?.ok&&value.currentIndex===savedEntry.currentIndex,'original Redo history index did not settle within 15s');assert.equal(redoHistory.historySize,savedEntry.historySize);
      const redoNode=await liveNode();assert.equal(redoNode.data.lcos_ref.revisionId,redone.revisionId);assert.equal(redoNode.data.text,saved.body);
      await assertExactHistoryNode(redone,'redo');
      assert.equal(report.batches.filter(batch=>batch.phase==='history-undo').length,1);assert.equal(report.batches.filter(batch=>batch.phase==='history-redo').length,1);
      report.historyRoundtripResult={savedEntry,undone,undoHistory,redone,redoHistory};await screenshot('06-original-redo-exact-text');
      if(dropHistoryResponse==='redo'){phase='history-post-recovery-undo';await page.mouse.click(point.x,point.y);await page.keyboard.press('Control+z');const opposite=await waitFor(currentText,value=>value.body===beforeSave.body&&value.revisionId!==redone.revisionId,'the opposite Undo after real Redo receipt did not use the new revision');const oppositeHistory=await waitFor(history,value=>value?.currentIndex===savedEntry.currentIndex-1,'opposite history index did not settle');assert.equal(oppositeHistory.historySize,savedEntry.historySize);const request=report.batches.filter(batch=>batch.phase===phase);assert.equal(request.length,1);assert.equal(request[0].body.lcos_expected_revisions[source.id],redone.revisionId);await assertExactHistoryNode(opposite,'history-redo-recovered-opposite-undo');report.historyRoundtripResult.finalAfterRecovery={action:'undo',snapshot:opposite,history:oppositeHistory};await screenshot('07-opposite-undo-after-redo-loss-recovery');}
      report.checks.push('same original saved entry: one native Undo and one native Redo; exact body/current revision/live ref roundtrip; no history growth and one declared CAS write per gesture');await persist();
}
const body = ['# Alpha', '- Child', '# Beta', '', '```js', 'opaque()', '```', ''].join('\n');
let opaqueBlock;
try {
  await page.goto(base + '/canvas/' + canvasId); await page.locator('[data-lcos-professional-surface-state="ready"]').waitFor({ state: 'attached', timeout: 60_000 });
  if (existingNodeId) {
    source = beforeCanvas.nodes.find(node => node.id === existingNodeId);
    assert.ok(source?.data?.lcos_ref?.entityType === 'artifact', 'only an explicitly selected existing synthetic primary text may be reused');
  } else {
    await page.getByTestId('canvas-dockbar-add-node-btn').click();
    await page.getByTestId('canvas-dockbar-add-text-node-btn').click();
    const canvas = await waitFor(() => get('/api/canvas/v1/canvases/' + canvasId), value => value.nodes.some(node => !existingIds.has(node.id) && node.data?.lcos_ref?.entityType === 'artifact'), 'original Text factory did not produce a real primary material');
    source = canvas.nodes.find(node => !existingIds.has(node.id) && node.data?.lcos_ref?.entityType === 'artifact');
  }
  report.fixture = { nodeId: source.id, ref: source.data.lcos_ref, setup: useExistingOutline?'Reuse explicitly selected synthetic primary Text already rich-pasted through original G7. No direct seed write.':'Original add Text UI creates primary material. The existing native save port seeds artificial outline bytes; actual edited save is through original Viewer buttons.' };
  await fs.writeFile(path.join(output, 'fixture.json'), JSON.stringify(report.fixture, null, 2));
  const nodeBody = page.locator(`[data-native-first-text-body="${source.id}"]`);
  await page.waitForFunction(id => document.querySelector(`[data-native-first-text-body="${id}"]`)?.getAttribute('data-native-first-state') === 'ready', source.id);
  phase = 'seed';
  if(useExistingOutline){assert.ok(existingNodeId,'a pre-existing original-paste outline requires its explicit node ID');const snapshot=await currentText();assert.ok(snapshot.body.startsWith('# '+fromTitle+'\n'));assert.match(snapshot.body,/# Beta/);assert.ok(!snapshot.body.includes('# '+toTitle+'\n'));report.seed={status:'existing-original-paste',snapshot};opaqueBlock=snapshot.body.match(/```[^\n]*\nopaque\(\)\n```/)?.[0];assert.ok(opaqueBlock,'keep the exact pre-existing opaque code block');}
  else{const seeded = await page.evaluate(async input => {
    const port = window.__LCOS_NATIVE_TEXT_SAVE_PORT__; if (!port) throw new Error('real native save port unavailable');
    const result = await port.save(input); if (result.status === 'confirmed' || result.status === 'unchanged') port.acknowledge(result.operationId);
    return result;
  }, { projectId, canvasId, nodeId: source.id, artifactId: source.data.lcos_ref.artifactId, expectedRevisionId: source.data.lcos_ref.revisionId, body });
  assert.ok(['confirmed', 'unchanged'].includes(seeded.status), JSON.stringify(seeded)); report.seed = seeded;opaqueBlock='```js\nopaque()\n```';}
  await page.evaluate(async id => { await window.__LCOS_NODE_LAB__.api.fitView({ nodes: [{ id }], padding: .45, maxZoom: 1.1, duration: 0 }); }, source.id);
  await nodeBody.click({ position: { x: 40, y: 60 } });
  assert.equal(await page.locator('.native-first-toolbar').count(),0,'the extra text toolbar must be retired');
  assert.equal(await page.getByTestId('lcos-native-text-view-menu').count(),1,'text actions belong to the original JT/Hde menu');
  if (await nodeBody.getAttribute('data-native-first-mode') !== 'mindmap') await textMenuAction('导图');
  await page.waitForFunction(id => document.querySelector(`[data-native-first-text-body="${id}"]`)?.getAttribute('data-native-first-mode') === 'mindmap', source.id);
  await nodeBody.locator('.native-first-map-root').waitFor({ state: 'visible' });
  report.nodeFace = await nodeBody.evaluate(element => {
    const scroll = element.querySelector('.native-first-map-scroll'), map = element.querySelector('.native-first-map');
    const root = element.querySelector('.native-first-map-root'), branch = element.querySelector('.native-first-map button');
    if (!scroll || !map || !root || !branch) throw new Error('Actual node map face missing');
    const paint = node => { const style = getComputedStyle(node); return { background: style.backgroundColor, color: style.color, border: style.borderColor, fontSize: style.fontSize }; };
    const start = { x: scroll.scrollLeft, y: scroll.scrollTop };
    scroll.scrollLeft = 0; scroll.scrollTop = 0; const minimum = { x: scroll.scrollLeft, y: scroll.scrollTop };
    scroll.scrollLeft = scroll.scrollWidth; scroll.scrollTop = scroll.scrollHeight; const maximum = { x: scroll.scrollLeft, y: scroll.scrollTop };
    scroll.scrollLeft = start.x; scroll.scrollTop = start.y;
    const style = getComputedStyle(scroll);
    return { root: paint(root), branch: paint(branch), scroll: { clientWidth: scroll.clientWidth, clientHeight: scroll.clientHeight,
      scrollWidth: scroll.scrollWidth, scrollHeight: scroll.scrollHeight, overflowX: style.overflowX, overflowY: style.overflowY, minimum, maximum, restored: start }, map: { width: map.clientWidth, height: map.clientHeight } };
  });
  assert.notEqual(report.nodeFace.root.background, report.nodeFace.root.color);assert.notEqual(report.nodeFace.branch.background, report.nodeFace.branch.color);
  assert.equal(report.nodeFace.scroll.minimum.x, 0);assert.equal(report.nodeFace.scroll.minimum.y, 0);
  if (report.nodeFace.scroll.scrollWidth > report.nodeFace.scroll.clientWidth) assert.ok(report.nodeFace.scroll.maximum.x > 0);
  if (report.nodeFace.scroll.scrollHeight > report.nodeFace.scroll.clientHeight) assert.ok(report.nodeFace.scroll.maximum.y > 0);
  await screenshot('00-original-node-map-face-light-and-scroll');
  await textMenuAction('编辑导图');
  await page.locator('[data-native-mindmap-editing]').waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('[data-lcos-map-editor]').waitFor();
  assert.equal(await page.getByRole('dialog').count(), 1); assert.equal(await page.locator('.inline-note-editor-scrim').count(), 0);
  assert.equal(await page.locator('[data-lcos-map-editor]').getAttribute('role'), 'region');
  await editorActionsReady();
  assert.equal(await page.locator('[data-media-viewer] [data-native-mindmap-actions] button').count(), 6);
  assert.equal(await page.locator('[data-lcos-map-editor]').evaluate(element => getComputedStyle(element).position), 'relative');
  assert.equal(await page.locator('[data-lcos-map-editor]').evaluate(element => getComputedStyle(element).boxShadow), 'none');
  await screenshot('01-original-viewer-map-edit');
  report.declaredEditIntent={fromTitle,toTitle};
  const alpha = () => page.locator('g.lcos-mindmap-topic').filter({ hasText: new RegExp('^(?:'+escaped(fromTitle)+'|'+escaped(toTitle)+')$') });
  await alpha().dblclick(); await page.locator('foreignObject input').fill(toTitle);
  await returnToNode();
  await textMenuAction('编辑导图'); await alpha().waitFor();
  await editorActionsReady();
  assert.equal(await page.locator('g.lcos-mindmap-topic').filter({ hasText: new RegExp('^'+escaped(toTitle)+'$') }).count(), 1);
  await screenshot('02-unsaved-draft-resumed');
  const beforeSave = await currentText(); report.historyBeforeSave = await history(); phase = 'edit';
  await page.getByRole('button', { name: '保存导图', exact: true }).click();
  if (loss) {
    const verify = page.getByRole('button', { name: '只核对上次保存，不会重复提交', exact: true });
    await verify.waitFor({ timeout: 45_000 });
    const writes = report.batches.filter(batch => batch.phase === 'edit').length; assert.equal(writes, 1); assert.equal(withheld, true);
    const pendingBefore = await page.evaluate(({canvasId,nodeId}) => window.__LCOS_NATIVE_TEXT_SAVE_PORT__.getPending({canvasId,nodeId}), {canvasId,nodeId:source.id});
    assert.equal(pendingBefore.status,'response-lost');assert.ok(pendingBefore.body.includes('# '+toTitle+'\n'));report.pendingBeforeClose=pendingBefore;await persist();
    assert.equal(await page.locator('[data-lcos-map-editor]').count(), 1);
    await returnToNode(); await textMenuAction('编辑导图');
    await verify.waitFor();await editorActionsReady();
    assert.equal(await page.locator('g.lcos-mindmap-topic').filter({hasText:new RegExp('^'+escaped(toTitle)+'$')}).count(),1);
    await screenshot('03-lost-response-draft-and-verify');
    report.lossObservation={start:Date.now(),pendingBefore,history:await history()};
    await page.waitForTimeout(30_000);
    report.lossObservation.end=Date.now();report.lossObservation.elapsedMs=report.lossObservation.end-report.lossObservation.start;
    assert.ok(report.lossObservation.elapsedMs>=30_000);assert.equal(report.batches.filter(batch=>batch.phase==='edit').length,1,'original inner retry/cooldown must not replay the held text during real 30s observation');
    assert.equal(await page.locator('[data-lcos-map-editor]').count(),1);assert.equal(await page.locator('[data-lcos-native-text-reading]').count(),0,'Core matching body cannot falsely show a confirmed reading');
    const savedBeforeVerify=await currentText();assert.notEqual(savedBeforeVerify.revisionId,beforeSave.revisionId);assert.ok(savedBeforeVerify.body.includes('# '+toTitle+'\n'));
    await persist();
    await verify.click();await page.locator('[data-lcos-native-text-reading]').waitFor({timeout:30_000});
    const saved=await currentText(),live=await liveNode();assert.equal(saved.revisionId,savedBeforeVerify.revisionId);assert.equal(saved.body,savedBeforeVerify.body);assert.ok(saved.body.includes(opaqueBlock),'original opaque block bytes must survive map editing');
    assert.equal(live.data.lcos_ref.revisionId,saved.revisionId);assert.equal(live.data.text,saved.body);
    assert.equal(report.batches.filter(batch=>batch.phase==='edit').length,1,'real receipt GET recovery cannot send another POST');
    assert.ok(report.receiptGets.some(get=>get.status===200),'original verify must retrieve the actual stored HTTP batch receipt');
    const pendingAfterRecovery=await page.evaluate(({canvasId,nodeId})=>window.__LCOS_NATIVE_TEXT_SAVE_PORT__.getPending({canvasId,nodeId}),{canvasId,nodeId:source.id});
    assert.equal(pendingAfterRecovery,null,'original recovered queue and editor acknowledgement must consume the exact pending save');
    report.pendingAfterRecovery=pendingAfterRecovery;
    report.saved=saved;report.liveAfterRecovery=live;report.historyAfterSave=await history();
    assert.equal(report.historyAfterSave.ok,true);assert.equal(report.historyAfterSave.historySize,report.historyBeforeSave.historySize+1);assert.equal(report.historyAfterSave.currentIndex,report.historyBeforeSave.currentIndex+1);
    await assertExactHistoryNode(saved,'saved');
    await screenshot('04-lost-response-real-get-receipt-confirmed-reading');
    report.checks.push('actual successful server reply withheld; original close/reopen retains pending draft; real 30s observation has one POST; original verify GET recovers stored exact HTTP receipt and confirms exact Core/live node ref; one original O8 entry');
    await persist();
    if(historyRoundtrip)await originalHistoryRoundtrip(saved,beforeSave);
  } else {
    await page.locator('[data-lcos-native-text-reading]').waitFor({ timeout: 30_000 });
    const saved = await waitFor(currentText, value => value.revisionId !== beforeSave.revisionId, 'real Core revision did not advance');
    assert.ok(saved.body.includes('# '+toTitle+'\n')); assert.ok(saved.body.includes(opaqueBlock),'preserve the original exact opaque code block');
    assert.equal(report.batches.filter(batch => batch.phase === 'edit').length, 1);
    report.saved = saved; await screenshot('03-real-confirmed-version-reading');
    report.historyAfterSave=await waitFor(history,value=>value?.ok&&value.currentIndex===report.historyBeforeSave.currentIndex+1,'normal save history entry did not settle');await assertExactHistoryNode(saved,'saved');
    if(historyRoundtrip)await originalHistoryRoundtrip(saved,beforeSave);
    if(await page.locator('[data-media-viewer]').count())await returnToNode(); await page.reload();
    await page.locator('[data-lcos-professional-surface-state="ready"]').waitFor({ state: 'attached', timeout: 60_000 });
    const reloaded = await currentText(),expectedReload=report.historyRoundtripResult?.finalAfterRecovery?.snapshot??report.historyRoundtripResult?.redone??saved; assert.equal(reloaded.revisionId, expectedReload.revisionId); assert.equal(reloaded.body, expectedReload.body);
    report.checks.push('original node toolbar → same wa/d2/c2 edit slot; original buttons save one native history/batch; exact Core revision/body/fence readback; reload retains result');
  }
  const after = await get(prefix + '/graph'), afterRuns = await get(prefix + '/runs');
  report.afterCounts={artifacts:after.artifacts.length,runs:afterRuns.length};
  assert.equal(after.artifacts.length, beforeGraph.artifacts.length + (existingNodeId ? 0 : 1)); assert.equal(afterRuns.length, beforeRuns.length);
  report.checks.push((existingNodeId ? 'existing explicitly synthetic material reused' : 'one explicitly synthetic material created') + '; no new Run or model call; no separate editor dialog; unsaved outer close resumes same draft');
  assert.deepEqual(report.errors, []); assert.deepEqual(report.modelRequests, []); report.passed = true;
} catch (error) {
  report.failure = error.message; report.dom = await page.locator('body').innerText().catch(() => '');
  if(source)report.failureState={core:await currentText().catch(error=>({error:error.message})),live:await liveNode().catch(error=>({error:error.message})),history:await history().catch(error=>({error:error.message})),pending:await page.evaluate(({canvasId,nodeId})=>window.__LCOS_NATIVE_TEXT_SAVE_PORT__?.getPending({canvasId,nodeId}),{canvasId,nodeId:source.id}).catch(error=>({error:error.message}))};
  await screenshot('failure').catch(() => {}); throw error;
} finally {
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify({passed:report.passed,pid:report.pid,loss:report.loss,dropHistoryResponse:report.dropHistoryResponse,batches:report.batches.length,failure:report.failure,report:path.join(output,'report.json')}));
  await context.close(); await browser.close();
}
