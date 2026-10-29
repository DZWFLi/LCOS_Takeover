import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { isDeepStrictEqual } from 'node:util';
import { currentGen2Root } from '../lab/current-gen2-resources.mjs';

const option = name => process.argv.find(arg => arg.startsWith('--' + name + '='))?.slice(name.length + 3);
assert.ok(process.argv.includes('--execute-readonly'), 'This harness has no connect or send mode.');
const expectedPid = Number(option('expected-pid')); assert.ok(Number.isSafeInteger(expectedPid) && expectedPid > 0);
const origin = 'http://127.0.0.1:56311', projectId = 'disposable-surface-core-facade', canvasId = 'surface-core-main';
const conversationId = 'connected-conversation-4244107f-aa59-4466-85e2-7ca53e230009', base = '/api/lcos/core/projects/' + projectId;
const output = path.resolve(option('output-root') ?? 'output/思绪与原通知接回_20261026/思绪真实原页/' + new Date().toISOString().replace(/[:.]/g, '-'));
await fs.mkdir(output, { recursive: true });
const report = { passed: false, expectedPid, checks: [], screenshots: [], geometry: [], blockedWrites: [], external: [], protocols: [],
  pageErrors: [], routeErrors: [], socketsBlocked: [], sseBlocked: [], forwardedWrites: 0, modelCalls: 0, submittedPrompts: 0,
  notClaimed: ['Actual Main conversation has no active progress: this live run verifies honest empty detail and original conversation flow.',
    'Long text, pending freeze and local history use controlled actual-original-component tests; no synthetic event is injected into this real page.',
    'All browser writes are blocked, including existing telemetry and spatial reconciliation.'] };
const safe = value => String(value).replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, '[REDACTED]').replace(/\bBearer\s+[^\s"']+/gi, 'Bearer [REDACTED]');
async function get(route) {
  const response = await fetch(origin + route, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 200, route); const payload = await response.json();
  assert.ok(payload.ok === true || payload.code === 0 || route === '/health'); return payload.value ?? payload.data ?? payload;
}
async function facts() {
  const names = ['graph', 'presentations', 'bindings', 'runs', 'markers', 'operations', 'connected', 'sessions'];
  const routes = ['/graph', '/presentations', '/spatial/bindings', '/execution-projection', '/spatial-markers', '/conversation-continuations', '/connected-conversations', '/conversations'];
  const data = Object.fromEntries((await Promise.all(routes.map(route => get(base + route)))).map((value, index) => [names[index], value]));
  data.messages = {}; data.canvases = {};
  for (const session of data.sessions) {
    const payload = await get(base + '/conversations/' + session.id + '/messages?limit=1000');
    assert.equal(Boolean(payload.hasMore ?? payload.nextCursor), false);
    data.messages[session.id] = Array.isArray(payload) ? payload : payload.messages ?? payload.items;
    assert.ok(Array.isArray(data.messages[session.id]));
  }
  for (const id of ['surface-core-main', 'surface-core-context', 'surface-core-workflow']) data.canvases[id] = await get('/api/canvas/v1/canvases/' + id);
  return data;
}
async function poll(read, matches, label, timeout = 30000) {
  const end = Date.now() + timeout; let value;
  do { value = await read(); if (matches(value)) return value; await new Promise(resolve => setTimeout(resolve, 100)); } while (Date.now() < end);
  throw Error(label + ' timed out; last=' + JSON.stringify(value));
}
let before, browser, page, input, stage = 'initial';
try {
  const health = await get('/health'); assert.equal(health.pid, expectedPid); assert.equal(health.realCoreConnected, true);
  before = await facts(); const canonical = before.connected.find(row => row.id === conversationId); assert.ok(canonical?.conversationSessionId);
  assert.equal(before.messages[canonical.conversationSessionId].length, 4);
  const binding = before.bindings.filter(row => row.projectId === projectId && row.canvasId === canvasId && row.entityType === 'conversation' && row.entityId === conversationId && row.spatialKind === 'node');
  assert.equal(binding.length, 1); const nodeId = binding[0].spatialId; report.nodeId = nodeId;
  const projection = await get(base + '/connected-conversations/' + conversationId + '/collaboration-session');
  assert.equal(projection.userState, 'ready'); assert.equal(projection.capabilities.canSend, false); assert.equal(projection.activity.activeRunId, undefined);
  report.actualProjection = { userState: projection.userState, capabilities: projection.capabilities, activeRunId: null };
  const { chromium } = createRequire(path.join(currentGen2Root, 'package.json'))('playwright-core');
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-networking', '--disable-sync', '--no-first-run'] });
  const context = await browser.newContext({ viewport: { width: 1700, height: 1100 }, locale: 'zh-CN', serviceWorkers: 'block' });
  await context.route('**/*', async route => { try {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    if (['data:', 'blob:'].includes(url.protocol)) return route.continue();
    if (!['http:', 'https:'].includes(url.protocol)) { report.protocols.push({ stage, protocol: url.protocol }); return route.abort(); }
    if (url.origin !== origin || url.pathname.startsWith('/api/lcos/core/projects/') && !url.pathname.startsWith(base + '/')) { report.external.push({ stage, method, path: url.pathname }); return route.abort(); }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) { report.blockedWrites.push({ stage, method, path: url.pathname, forwarded: false }); return route.abort(); }
    if (method === 'GET' && request.headers().accept?.includes('text/event-stream')) { report.sseBlocked.push({ stage, path: url.pathname }); return route.abort(); }
    if (url.pathname === '/lcos/agent-ui.js') {
      const response = await route.fetch({ timeout: 120000 }), source = await response.text();
      assert.ok(source.includes('data-native-glyth-thought-trigger'));
      return route.fulfill({ response, body: source + '\nwindow.__THOUGHT_READ__=()=>{const s=useLcosShellStore.getState(),c=useCanvasStore.getState();return{projectId:s.projectId,selection:readNativeConversationSelection()?.connectedConversationId,target:s.composerTarget,prompt:s.composerPrompt,caret:s.composerCaret,references:useLcosReferenceStore.getState().draft.orderedEntityRefs,windowCount:s.windows.length,canvasId:c.canvasId,viewport:window.__LCOS_NODE_LAB__?.api?.getViewport?.()};};' });
    }
    return route.continue();
  } catch (error) { report.routeErrors.push({ stage, error: safe(error.stack ?? error) }); await route.abort().catch(() => {}); } });
  await context.routeWebSocket('**/*', socket => { report.socketsBlocked.push({ stage, path: new URL(socket.url()).pathname }); socket.close(); });
  page = await context.newPage(); page.setDefaultTimeout(30000); page.on('pageerror', error => report.pageErrors.push(safe(error)));
  const read = () => page.evaluate(() => window.__THOUGHT_READ__?.());
  const settleOriginalPaint = () => page.evaluate(async () => {
    const original = document.querySelector('[data-native-glyth-thought-detail]')?.closest('[data-radix-popper-content-wrapper]');
    await Promise.all((original?.getAnimations({ subtree: true }) ?? [])
      .filter(animation => Number.isFinite(animation.effect?.getComputedTiming().endTime))
      .map(animation => animation.finished.catch(() => {})));
  });
  const shot = async name => { await settleOriginalPaint(); const filename = path.join(output, name + '.png'); await page.screenshot({ path: filename }); report.screenshots.push(filename); };
  await page.goto(origin + '/canvas/' + canvasId, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.locator('[data-lcos-professional-surface-state="ready"]').waitFor({ state: 'attached', timeout: 90000 });
  const node = page.locator('.lcos-conversation-node-shell[data-lcos-node-id=' + JSON.stringify(nodeId) + ']');
  await poll(() => node.getAttribute('data-lcos-conversation-reference-status'), value => value === 'ready', 'actual canonical node ready');
  // The original initially-open assistant finishes its own target effect after
  // the canvas is ready. Measure its settled owner, not an earlier null slot.
  await poll(read, value => value?.target?.nodeId === 'canvas:' + canvasId && value.target.intent === 'delegate', 'original startup assistant target settled');
  const trigger = node.locator('[data-native-glyth-thought-trigger]'), detail = page.locator('[data-native-glyth-thought-detail=' + JSON.stringify(nodeId) + ']');
  const baseline = await node.boundingBox(), shellBefore = await read(); assert.ok(baseline);
  stage = 'empty-original-popover'; await trigger.click(); await detail.waitFor();
  await settleOriginalPaint();
  assert.match(await detail.innerText(), /还没有.*进展|暂无.*进展|没有.*进展/);
  assert.equal(await page.locator('[data-native-glyth-thought-current]').count(), 0);
  assert.equal(await page.locator('[data-native-glyth-thought-history]').count(), 0);
  assert.equal(await page.locator('[data-lcos-workview="conversation"]').count(), 0);
  assert.deepEqual((await read()).viewport, shellBefore.viewport); assert.equal((await read()).windowCount, 0);
  const afterOpen = await node.boundingBox(); for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(afterOpen[key] - baseline[key]) < .6, 'Popover does not resize/move original node');
  report.geometry.push({ stage, node: baseline, afterOpen, detail: await detail.boundingBox() }); await shot('01-original-empty-detail');
  await page.keyboard.press('Escape'); await detail.waitFor({ state: 'detached' });
  assert.equal(await trigger.evaluate(element => element === document.activeElement), true, 'Escape returns to original real Button');
  assert.deepEqual((await read()).target, shellBefore.target); report.checks.push('Original empty detail is honest, retains fixed physical node/camera and original Button Escape focus, with no new window or session.');

  stage = 'same-original-conversation'; await trigger.press('Enter'); await detail.waitFor();
  await detail.locator('[data-native-glyth-thought-process]').click(); await detail.waitFor({ state: 'detached' });
  const frame = page.locator('[data-lcos-native-chat-frame]'); await frame.waitFor();
  await poll(() => frame.locator('[data-chat-message-id]').count(), value => value === 4, 'exact actual 4-message conversation');
  await poll(read, value => value?.selection === conversationId && value.target?.receiverConversationId === conversationId, 'same original receiver');
  assert.equal(await frame.count(), 1); assert.equal((await read()).windowCount, 0);
  input = page.getByRole('textbox', { name: 'Composer 输入', exact: true }); await input.waitFor(); assert.equal(await input.inputValue(), '');
  const text = '思绪原页只读验证稿，不发送。'; await input.fill(text); await input.press('Home'); await input.press('ArrowRight'); await input.press('ArrowRight');
  const draftBefore = await read(), selectionBefore = await input.evaluate(element => ({ start: element.selectionStart, end: element.selectionEnd }));
  await trigger.click(); await detail.waitFor(); await page.keyboard.press('Escape'); await detail.waitFor({ state: 'detached' });
  const draftAfter = await read(); for (const key of ['target', 'prompt', 'caret', 'references', 'viewport']) assert.deepEqual(draftAfter[key], draftBefore[key], 'detail preserves original input ' + key);
  assert.deepEqual(await input.evaluate(element => ({ start: element.selectionStart, end: element.selectionEnd })), selectionBefore);
  const primary = node.locator('[data-native-glyth-primary="session-options"]'); await primary.click();
  await frame.locator('[data-lcos-conversation-continuation] [aria-expanded="true"]').waitFor();
  assert.equal((await read()).selection, conversationId); assert.equal(await input.inputValue(), text); await shot('02-primary-and-draft-retained');
  await input.fill(''); assert.equal(await input.inputValue(), '');
  await frame.getByRole('button', { name: '收起对话', exact: true }).click();
  // The original hD retains its collapsed frame in the DOM (aria-hidden and
  // zero width); hiding is its intended lifecycle, not an unmount contract.
  await frame.waitFor({ state: 'hidden' }); assert.equal(await frame.getAttribute('aria-hidden'), 'true');
  report.checks.push('Empty detail opens same original right rail/4 real messages; opening and Escape preserve input/caret/references/camera, and the original reconnect primary still opens original options without connecting. Own local verification draft is cleared.');

  const panOriginalNodeIntoView = async height => {
    // A canvas node outside the camera is reached by the original physical
    // middle-button pan. DOM scrollIntoView would scroll clipped ancestors,
    // producing a different layout instead of moving the original camera.
    const pans = [];
    for (let attempt = 0; attempt < 8; attempt++) {
      const box = await node.boundingBox(); assert.ok(box);
      const dx = 180 - box.x - box.width / 2, dy = height * .4 - box.y - box.height / 2;
      if (Math.abs(dx) < 3 && Math.abs(dy) < 3) { report.geometry.push({ stage, originalPans: pans, arrivedNode: box }); return; }
      const point = await page.locator('.react-flow__pane').evaluate((element, delta) => {
        const points = [];
        for (const fy of [.2, .1, .35, .55, .7]) for (const fx of [.85, .7, .5, .3, .15]) {
          const x = innerWidth * fx, y = innerHeight * fy, hit = document.elementFromPoint(x, y);
          if (hit?.closest('.react-flow__pane') && !hit.closest('.react-flow__node,button,[role="dialog"],[data-sonner-toast]')) {
            const roomX = delta.dx < 0 ? x - 16 : innerWidth - 16 - x, roomY = delta.dy < 0 ? y - 76 : innerHeight - 110 - y;
            points.push({ x, y, score: Math.min(Math.abs(delta.dx), Math.max(0, roomX)) + Math.min(Math.abs(delta.dy), Math.max(0, roomY)) });
          }
        }
        return points.sort((a, b) => b.score - a.score)[0] ?? null;
      }, { dx, dy }); assert.ok(point, 'A genuine blank original pane hit is required for pan');
      const to = { x: Math.max(16, Math.min(344, point.x + dx)), y: Math.max(76, Math.min(height - 110, point.y + dy)) };
      const previous = (await read()).viewport;
      await page.mouse.move(point.x, point.y); await page.mouse.down({ button: 'middle' });
      await page.mouse.move(to.x, to.y, { steps: 12 }); await page.mouse.up({ button: 'middle' });
      const next = await poll(read, value => value?.viewport && (Math.abs(value.viewport.x - previous.x) > 1 || Math.abs(value.viewport.y - previous.y) > 1), 'physical original camera movement');
      pans.push({ point, to, before: previous, after: next.viewport });
    }
    report.geometry.push({ stage, failedOriginalPans: pans }); throw Error('Original physical pan did not bring target into the viewport');
  };
  for (const height of [820, 400]) {
    stage = 'mobile-' + height; await page.setViewportSize({ width: 360, height });
    await panOriginalNodeIntoView(height); await trigger.click(); await detail.waitFor();
    await settleOriginalPaint(); const box = await detail.boundingBox(); assert.ok(box); assert.ok(box.x >= -1 && box.x + box.width <= 361 && box.y >= -1 && box.y + box.height <= height + 1, 'original Popover collision stays inside viewport');
    const hitRead = locator => locator.evaluate(element => { const r = element.getBoundingClientRect(); const points = [[.5,.5],[.1,.5],[.9,.5],[.5,.1],[.5,.9]];
      return { rect: r.toJSON(), width:r.width, height:r.height, hits:points.map(([x,y])=>element.contains(document.elementFromPoint(r.x+r.width*x,r.y+r.height*y))),
        blockers:points.map(([x,y])=>document.elementFromPoint(r.x+r.width*x,r.y+r.height*y)?.outerHTML.slice(0,350)) }; });
    const headingHit = await hitRead(detail.locator('.native-glyth-thought-detail-heading')); report.geometry.push({ stage, headingHit });
    assert.ok(headingHit.hits.every(Boolean), 'Reading heading remains outside original header/chrome hit regions');
    const process = detail.locator('[data-native-glyth-thought-process]');
    const scrolls = [];
    for (let attempt = 0; attempt < 6; attempt++) {
      const hit = await hitRead(process); if (hit.hits.every(Boolean)) break;
      const scrolling = await detail.evaluate(element => ({ top: element.scrollTop, clientHeight: element.clientHeight, scrollHeight: element.scrollHeight, rect: element.getBoundingClientRect().toJSON() }));
      if (scrolling.scrollHeight <= scrolling.clientHeight) break;
      await page.mouse.move(scrolling.rect.x + scrolling.rect.width / 2, scrolling.rect.y + scrolling.rect.height / 2);
      await page.mouse.wheel(0, 90); await page.waitForTimeout(80); scrolls.push(scrolling);
    }
    const hit = await hitRead(process); report.geometry.push({ stage, detail: box, process: hit, originalWheels: scrolls });
    assert.ok(hit.width > 0 && hit.height > 0 && hit.hits.every(Boolean)); await shot('03-' + stage + '-original-popover');
    await page.keyboard.press('Escape'); await detail.waitFor({ state: 'detached' }); assert.equal(await trigger.evaluate(element => element === document.activeElement), true);
  }
  report.checks.push('360×820 and 360×400 use original Popover collision, real reachable process action and Escape focus; no second drawer/window or new node is created.');
  assert.deepEqual(report.external, []); assert.deepEqual(report.protocols, []); assert.deepEqual(report.routeErrors, []); assert.deepEqual(report.pageErrors, []);
  report.passed = true;
} catch (error) {
  report.error = safe(error.stack ?? error); process.exitCode = 1;
  if (page) { report.dom = safe(await page.locator('body').innerText().catch(() => '')); await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {}); }
} finally {
  if (input && page && await input.isVisible().catch(() => false)) await input.fill('').catch(() => {});
  if (before) try { const after = await facts(); const changed = Object.keys(before).filter(key => !isDeepStrictEqual(before[key], after[key])); assert.deepEqual(changed, []); report.factsUnchanged = true; }
  catch (error) { report.protectionError = safe(error.stack ?? error); report.passed = false; process.exitCode = 1; }
  await browser?.close(); await fs.writeFile(path.join(output, 'report.json'), JSON.stringify({ ...report, stage }, null, 2));
  console.log(JSON.stringify({ passed: report.passed, stage, factsUnchanged: report.factsUnchanged, blockedWrites: report.blockedWrites.length, pageErrors: report.pageErrors.length,
    modelCalls: 0, report: path.join(output, 'report.json'), error: report.error, protectionError: report.protectionError }, null, 2));
}
