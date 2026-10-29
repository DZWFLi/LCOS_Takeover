import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { isDeepStrictEqual as same } from 'node:util';
import { currentGen2Root } from '../lab/current-gen2-resources.mjs';

const option = name => process.argv.find(arg => arg.startsWith('--' + name + '='))?.slice(name.length + 3);
const expectedPid = Number(option('expected-pid')), proofPath = option('owned-marker-report');
const cleanupAll = process.argv.includes('--cleanup-all');
assert.ok(Number.isSafeInteger(expectedPid) && expectedPid > 0 && proofPath, 'Exact PID and previous POST receipt report required');
const origin = 'http://127.0.0.1:56311', projectId = 'disposable-surface-core-facade', base = '/api/lcos/core/projects/' + projectId;
const main = 'surface-core-main', contextCanvas = 'surface-core-context', targetId = 'surface-context-image';
const proof = JSON.parse(await fs.readFile(proofPath, 'utf8')); assert.equal(proof.pid, expectedPid);
const receipt = proof.receipts?.find(row => row.key === main + '/surface-main-image')?.marker;
assert.ok(receipt?.id && receipt.scope === 'local' && receipt.sourceSurfaceRef === 'main');
assert.ok(proof.writes.some(row => row.method === 'POST' && row.path === base + '/spatial-markers' && row.markerId === receipt.id && row.permitted && row.status >= 200 && row.status < 300));
const ownedReceipts = cleanupAll ? proof.receipts.map(row => row.marker) : [receipt];
for (const marker of ownedReceipts) {
  assert.equal(marker.projectId, projectId); assert.equal(marker.scope, 'local');
  assert.ok(proof.writes.some(row => row.method === 'POST' && row.path === base + '/spatial-markers' && row.markerId === marker.id
    && row.permitted && row.status >= 200 && row.status < 300 && same(row.body, { targetRef: marker.targetRef, scope: marker.scope, sourceSurfaceRef: marker.sourceSurfaceRef })));
}
const out = path.resolve('output/原生固定目录_20261026/Context点击诊断-' + new Date().toISOString().replace(/[:.]/g, '-'));
await fs.mkdir(out, { recursive: true });
const report = { passed: false, pid: expectedPid, output: out, originalFailure: proofPath, receipt, ownedReceipts, cleanupAll, writes: [], blocked: [], states: [], screenshots: [], pageErrors: [], modelSends: 0 };
let page, browser, stage = 'preflight';
const get = async route => { const response = await fetch(origin + route, { redirect: 'error', signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 200, route); const payload = await response.json(); return payload.value ?? payload.data ?? payload; };
const markerRows = () => get(base + '/spatial-markers');
async function facts() {
  const graph = await get(base + '/graph'), messages = {}, canvases = {};
  for (const session of await get(base + '/conversations')) { const payload = await get(base + '/conversations/' + encodeURIComponent(session.id) + '/messages?limit=1000');
    assert.equal(Boolean(payload.hasMore ?? payload.nextCursor), false); messages[session.id] = Array.isArray(payload) ? payload : payload.messages ?? payload.items; }
  for (const id of new Set([main,contextCanvas,...(graph.workspaces ?? []).map(row => row.canvasId).filter(Boolean)])) canvases[id] = await get('/api/canvas/v1/canvases/' + encodeURIComponent(id));
  return { graph, messages, canvases, runs: await get(base + '/runs'), bindings: await get(base + '/spatial/bindings'), collections: await get(base + '/collections'), markers: await markerRows() };
}
const before = await facts(); assert.deepEqual(before.markers.find(row => row.id === receipt.id), receipt);
for (const marker of ownedReceipts) assert.deepEqual(before.markers.find(row => row.id === marker.id), marker);
await fs.writeFile(path.join(out, 'before-facts.json'), JSON.stringify(before, null, 2));
try {
  const health = await get('/health'); assert.equal(health.pid, expectedPid); assert.equal(health.realCoreConnected, true);
  const { chromium } = createRequire(path.join(currentGen2Root, 'package.json'))('playwright-core');
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-networking','--disable-sync','--no-first-run'] });
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 }, locale: 'zh-CN', serviceWorkers: 'block' });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    if (['data:','blob:'].includes(url.protocol)) return route.continue();
    if (url.origin !== origin || url.pathname.startsWith('/api/lcos/core/projects/') && !url.pathname.startsWith(base + '/')) { report.blocked.push({ stage, path: url.pathname, method }); return route.abort(); }
    if (method === 'GET' && url.pathname === '/lcos/agent-ui.js') { const response = await route.fetch({ timeout: 120000 }), source = await response.text();
      return route.fulfill({ response, body: source + `\nwindow.__CONTEXT_CLICK_READ__=()=>{const c=useCanvasStore.getState(),s=useLcosShellStore.getState(),n=currentNativeNavigationScene(),a=window.__LCOS_NODE_LAB__?.api;return{canvas:c.canvasId,workspace:s.activeWorkspaceId,windowCanvas:window.__LCOS_NODE_LAB__?.currentCanvasId,apiIsScene:a===n?.api,apiIsFlow:a===c.rfInstance,viewport:a?.getViewport(),scene:n&&{canvas:n.canvasId,workspace:n.workspaceId,surface:n.surfaceRef},nodes:a?.getNodes().map(x=>({id:x.id,selected:x.selected,hidden:x.hidden,selectable:x.selectable,draggable:x.draggable,data:{locked:x.data?.locked,disabled:x.data?.disabled}}))}};` }); }
    if (['GET','HEAD','OPTIONS'].includes(method)) return route.continue();
    let body; try { body = request.postDataJSON(); } catch { body = null; }
    const row = { stage, path: url.pathname, method, body, permitted: false }; report.writes.push(row);
    if (method === 'POST' && url.pathname === '/api/events') row.permitted = true;
    if (method === 'POST' && [main,contextCanvas].some(id => ['/api/lcos/canvases/' + id + '/execution:reconcile','/api/lcos/canvases/' + id + '/conversations:reconcile'].includes(url.pathname)) && same(body, {})) row.permitted = true;
    if (method === 'POST' && url.pathname === base + '/navigation/resolve' && same(body, { targetRef: receipt.targetRef })) row.permitted = true;
    if (method === 'DELETE' && stage === 'cleanup-original-directory') {
      const owned = ownedReceipts.find(marker => url.pathname === base + '/spatial-markers/' + encodeURIComponent(marker.id));
      if (owned && same((await markerRows()).find(row => row.id === owned.id), owned)) row.permitted = true;
    }
    if (method === 'POST' && [main,contextCanvas].some(id => url.pathname === '/api/canvas/v1/canvases/' + id + '/nodes:batchActions')) {
      const old = await get(url.pathname.replace('/nodes:batchActions',''));
      row.permitted = body?.created_by_role === 'user' && body.actions?.length === 1 && body.actions[0].action === 'update'
        && body.actions[0].updates?.every(patch => { const node = old.nodes.find(node => node.id === patch.id); return node && Object.entries(patch).every(([key,value]) =>
          key === 'canvas_id' ? value === old.id || value === old.canvas_id || url.pathname.includes('/' + value + '/')
            : ['parent_id','parentId'].includes(key) ? (value ?? '') === (node.parent_id ?? node.parentId ?? '')
            : key === 'data' ? Object.entries(value).every(([field,next]) => same(next,node.data?.[field])) : same(value,node[key])); });
    }
    if (row.permitted) return route.continue(); report.blocked.push(row); return route.abort();
  });
  await context.routeWebSocket('**/*', socket => socket.close()); page = await context.newPage(); page.setDefaultTimeout(30000);
  page.on('pageerror', error => report.pageErrors.push(String(error)));
  const ready = async id => { await page.waitForFunction(id => window.__CONTEXT_CLICK_READ__?.().canvas === id && window.__CONTEXT_CLICK_READ__?.().scene?.canvas === id, id, { timeout: 90000 });
    await page.locator('[data-native-navigation-layer][data-native-navigation-state="ready"]').waitFor(); };
  const shot = async label => { const file = path.join(out,label+'.png'); await page.screenshot({ path:file }); report.screenshots.push(file); };
  const inspect = async label => { const value = await page.evaluate(({label,targetId}) => {
    const element = document.querySelector('.react-flow__node[data-id="'+targetId+'"]'), box = element?.getBoundingClientRect();
    const images = [...(element?.querySelectorAll('img') ?? [])].map(img=>({src:img.currentSrc,box:img.getBoundingClientRect().toJSON(),complete:img.complete,natural:img.naturalWidth}));
    const points = box ? [{name:'old-script',x:Math.max(75,box.x+Math.min(18,box.width/3)),y:Math.max(90,box.y+Math.min(18,box.height/3))},
      {name:'centre',x:box.x+box.width/2,y:box.y+box.height/2}].map(point=>{const hit=document.elementFromPoint(point.x,point.y);return{...point,hit:hit?.outerHTML.slice(0,1200),nodeId:hit?.closest('.react-flow__node')?.getAttribute('data-id')};}) : [];
    return{label,read:window.__CONTEXT_CLICK_READ__(),target:element&&{class:element.className,attrs:[...element.attributes].map(a=>[a.name,a.value]),box:box.toJSON(),pointerEvents:getComputedStyle(element).pointerEvents},points,images,
      toolbars:[...document.querySelectorAll('[data-testid="canvas-node-toolbar"]')].map(el=>({html:el.outerHTML.slice(0,1800),box:el.getBoundingClientRect().toJSON(),display:getComputedStyle(el).display,visibility:getComputedStyle(el).visibility}))};
  },{label,targetId});report.states.push(value);console.log(JSON.stringify({stage,label,points:value.points,selected:value.read.nodes?.filter(n=>n.selected),toolbars:value.toolbars.length}));return value;};
  stage = 'context-via-original-dock'; await page.goto(origin+'/canvas/'+main,{waitUntil:'domcontentloaded'}); await ready(main);
  await page.getByTestId('common-loading-overlay').waitFor({state:'hidden'});
  if (!cleanupAll) {
  if(await page.getByRole('button',{name:'收起对话',exact:true}).isVisible())await page.getByRole('button',{name:'收起对话',exact:true}).click();
  await page.locator('[data-lcos-surface="context"]').click();await ready(contextCanvas);
  await page.evaluate(id=>window.__LCOS_NODE_LAB__.api.fitView({nodes:[{id}],padding:1.2,minZoom:.4,maxZoom:1,duration:0}),targetId);
  const first=await inspect('after-original-fit-before-click');await shot('01-context-before-click');
  const point=first.points.find(row=>row.name==='old-script');assert.ok(point);await page.mouse.click(point.x,point.y);
  await inspect('old-script-click-immediate');await page.waitForTimeout(250);await inspect('old-script-click-250ms');await shot('02-context-old-point');
  const second=await inspect('before-centre-click'),centre=second.points.find(row=>row.name==='centre');assert.equal(centre.nodeId,targetId,'Centre is the real original target');
  await page.mouse.click(centre.x,centre.y);await inspect('centre-click-immediate');await page.waitForTimeout(250);await inspect('centre-click-250ms');await shot('03-context-centre-click');
  }
  stage='cleanup-original-directory';await page.locator('[data-lcos-surface="main"]').click();await ready(main);
  await page.getByTestId('common-loading-overlay').waitFor({state:'hidden'});
  await page.locator('button[data-native-navigation-directory-trigger]').click();const directory=page.locator('[data-native-navigation-directory]');await directory.waitFor();
  for (const owned of ownedReceipts) {
    const remove=directory.locator('[data-native-navigation-directory-remove="'+owned.id+'"]');await remove.waitFor();await remove.click();
    await page.waitForFunction(async({base,id})=>{const p=await(await fetch(base+'/spatial-markers')).json();return!p.value.some(row=>row.id===id);},{base,id:owned.id});
  }
  if(before.markers.length===ownedReceipts.length)await directory.getByText('还没有固定目标。',{exact:true}).waitFor();
  await page.keyboard.press('Escape');await shot('04-own-receipts-cleaned');
  const after=await facts();await fs.writeFile(path.join(out,'after-facts.json'),JSON.stringify(after,null,2));
  const strip=graph=>Object.fromEntries(Object.entries(graph).filter(([key])=>!['changeSets','mutationChangeSets','spatialMarkers','spatialMarkerIntents','projectionVersion','spatialVersion'].includes(key)));
  assert.deepEqual(strip(after.graph),strip(before.graph));for(const key of ['messages','canvases','runs','bindings','collections'])assert.deepEqual(after[key],before[key],key+' unchanged');
  assert.deepEqual(after.markers,before.markers.filter(row=>!ownedReceipts.some(owned=>owned.id===row.id)));assert.deepEqual(report.blocked,[]);assert.deepEqual(report.pageErrors,[]);
  report.canonicalFactsUnchanged=true;report.cleanedReceipts=ownedReceipts.map(row=>row.id);report.passed=true;
}catch(error){report.failure=error.stack;process.exitCode=1;if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}
finally{report.remainingOwnMarkers=(await markerRows()).filter(row=>ownedReceipts.some(owned=>owned.id===row.id));await browser?.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,stage,report:path.join(out,'report.json'),failure:report.failure,remainingOwnMarkers:report.remainingOwnMarkers},null,2));}
