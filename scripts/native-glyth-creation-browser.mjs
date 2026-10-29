import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { currentGen2Root } from '../lab/current-gen2-resources.mjs';
const option = name => process.argv.find(arg => arg.startsWith('--' + name + '='))?.slice(name.length + 3);
const phase = option('phase') ?? 'inspect'; assert.ok(['inspect', 'create', 'keyboard'].includes(phase));
const verifyHistory = process.argv.includes('--verify-history'); assert.ok(!verifyHistory || phase !== 'inspect');
const origin = 'http://127.0.0.1:56311', projectId = 'disposable-surface-core-facade', canvasId = 'surface-core-main';
const prefix = '/api/lcos/core/projects/' + projectId;
const output = path.resolve('output/原加号智能体创建_20261023/真实页面', new Date().toISOString().replaceAll(':', '-'));
await fs.mkdir(output, { recursive: true });
const report = { passed: false, phase, output, writes: [], errors: [], screenshots: [], checks: [], modelMessagesSubmitted: 0 };
const save = () => fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
const get = async route => { const r = await fetch(origin + route, { redirect: 'error', signal: AbortSignal.timeout(20000) });
  const b = await r.json(); assert.ok(r.ok); return b.value ?? b.data ?? b; };
const health = await get('/health'); assert.equal(health.pid, Number(option('expected-pid'))); assert.equal(health.realCoreConnected, true); report.pid = health.pid;
const before = await get('/api/canvas/v1/canvases/' + canvasId), conversations = await get(prefix + '/connected-conversations');
const priorMessagesPath = prefix + '/conversations/conversation-08d78311-43d1-4be1-97c5-52d5442839f4/messages?limit=1000';
const beforeMessages = await get(priorMessagesPath), beforeRuns = await get(prefix + '/execution-projection');
const priorHistories = new Map(await Promise.all(conversations.filter(row => row.conversationSessionId).map(async row =>
  [row.conversationSessionId, await get(prefix + '/conversations/' + row.conversationSessionId + '/messages?limit=1000')])));
report.before = { nodeIds: before.nodes.map(n => n.id), conversationIds: conversations.map(c => c.id), originalMessageCount: beforeMessages.length };
let browser, page, stage = 'opening';
try {
  const { chromium } = createRequire(path.join(currentGen2Root, 'package.json'))('playwright-core');
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-networking', '--disable-sync', '--no-first-run'] });
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 }, locale: 'zh-CN', serviceWorkers: 'block' });
  await context.addInitScript(() => {
    window.__GLYTH_DRAG_TRACE__ = [];
    for (const type of ['dragstart', 'dragenter', 'dragover', 'drop', 'dragend']) document.addEventListener(type, event => {
      if (window.__GLYTH_DRAG_TRACE__.length >= 100) return;
      window.__GLYTH_DRAG_TRACE__.push({ type, x: event.clientX, y: event.clientY, types: [...(event.dataTransfer?.types ?? [])],
        candidate: !!event.target?.closest?.('[data-native-glyth-candidate]'), pane: !!event.target?.closest?.('.react-flow__pane') });
    }, true);
  });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== origin) return route.abort();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      const row = { stage, method: request.method(), path: url.pathname, body: request.postDataJSON(), permitted: false }; report.writes.push(row);
      if (url.pathname === '/api/events' || url.pathname.endsWith('/execution:reconcile')) row.permitted = true;
      if (url.pathname.endsWith('/nodes:batchActions')) {
        const canvas = await get('/api/canvas/v1/canvases/' + canvasId);
        row.permitted = row.body.canvas_id === canvasId && row.body.created_by_role === 'user' && row.body.lcos_operation === undefined
          && row.body.actions?.every(action => action.action === 'update' && action.updates?.every(update => {
            const node = canvas.nodes.find(n => n.id === update.id); return node && JSON.stringify(update.position) === JSON.stringify(node.position)
              && JSON.stringify(update.data) === JSON.stringify(node.data);
          }));
        if (/^history-(create|delete)-(apply|undo|redo)$/.test(stage)) {
          const [_, kind, historyPhase] = stage.split('-'), restore = kind === 'create' && historyPhase === 'redo' || kind === 'delete' && historyPhase === 'undo';
          assert.equal(row.body.canvas_id, canvasId); assert.equal(row.body.lcos_operation?.kind, kind); assert.equal(row.body.lcos_operation?.phase, historyPhase);
          assert.equal(row.body.actions?.length, 1); const action = row.body.actions[0];
          assert.equal(action.action, restore ? 'create' : 'delete');
          if (restore) { assert.equal(action.creates.length, 1); assert.equal(action.creates[0].id, report.node.id);
            assert.deepEqual(action.creates[0].data.lcos_conversation_ref, report.node.data.lcos_conversation_ref);
            assert.deepEqual(action.creates[0].data.lcosGlythAppearance, report.chosenAppearance); }
          else assert.deepEqual(action.delete_ids, [report.node.id]);
          row.permitted = true;
        }
      }
      if (stage === 'creating' && phase !== 'inspect') {
        if (url.pathname === prefix + '/conversation-continuations') {
          assert.equal(report.operationId, undefined, 'One actual creation intent only.');
          assert.equal(row.body.input.mode, 'blank_new'); assert.equal(row.body.input.contextInheritance, 'none');
          assert.equal(row.body.input.connectedConversationId, undefined); report.operationId = row.body.input.operationId; row.permitted = true;
        } else if (url.pathname === prefix + '/conversation-continuations/' + report.operationId + '/recovery-actions') {
          assert.ok(['recover_external', 'recover_bind'].includes(row.body.input.action));
          assert.equal(report.writes.filter(x => x !== row && x.path === row.path && x.body?.input?.action === row.body.input.action).length, 0);
          row.permitted = true;
        } else if (url.pathname === '/api/lcos/canvases/' + canvasId + '/conversations:reconcile') {
          assert.equal(report.conversationId, undefined); report.conversationId = row.body.connectedConversationId;
          assert.deepEqual(row.body.initialPlacement.appearance, report.chosenAppearance);
          if (phase === 'keyboard') report.dropPosition = row.body.initialPlacement.position;
          else assert.deepEqual(row.body.initialPlacement.position, report.dropPosition); row.permitted = true;
        }
      }
      if (url.pathname.endsWith('/collaboration-send')) { report.modelMessagesSubmitted++; row.permitted = false; }
      await save(); if (!row.permitted) return route.abort();
    }
    if (url.pathname === '/lcos/agent-ui.js') { const response = await route.fetch({ timeout: 90000 });
      return route.fulfill({ response, body: await response.text() + '\nwindow.__GLYTH_CREATION_READ__=()=>{const s=useLcosShellStore.getState();return{projectId:s.projectId,workspaceId:s.activeWorkspaceId,target:s.composerTarget,prompt:s.composerPrompt,windows:s.windows}};' }); }
    return route.continue();
  });
  await context.routeWebSocket('**/*', socket => socket.close());
  page = await context.newPage(); page.setDefaultTimeout(30000); page.on('pageerror', error => report.errors.push(String(error)));
  const shot = async name => { const file = path.join(output, name + '.png'); await page.screenshot({ path: file }); report.screenshots.push(file); await save(); };
  await page.goto(origin + '/canvas/' + canvasId, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.locator('[data-lcos-professional-surface-state=ready]').waitFor({ state: 'attached', timeout: 90000 });
  const add = page.getByTestId('canvas-dockbar-add-node-btn'), candidate = page.locator('[data-native-glyth-candidate]');
  await add.click(); await candidate.waitFor(); assert.equal(await candidate.isEnabled(), true);
  const menu = page.locator('[data-add-node-menu]');
  report.menuLayers = await menu.evaluate(element => { const result = []; for(let e = element; e && e !== document.body; e = e.parentElement)
    result.push({ tag: e.tagName, className: e.className, attributes: [...e.attributes].filter(a => a.name.startsWith('data-')).map(a => [a.name,a.value]),
      position: getComputedStyle(e).position, zIndex: getComputedStyle(e).zIndex, opacity: getComputedStyle(e).opacity }); return result; });
  await candidate.click({ trial: true });
  const menuSettled = () => page.waitForFunction(() => { let element = document.querySelector('[data-add-node-menu]');
    if (!element) return false; while (element && element !== document.body) { if (Number(getComputedStyle(element).opacity) < .999) return false; element = element.parentElement; } return true; });
  await menuSettled();
  const vector = candidate.locator('[data-lcos-glyth-vector]'), firstFrame = await vector.innerHTML();
  await page.waitForFunction(frame => document.querySelector('[data-native-glyth-candidate] [data-lcos-glyth-vector]')?.innerHTML !== frame, firstFrame, { timeout: 8000 });
  report.originalMotionChanged = true;
  assert.ok((await menu.innerText()).includes('添加智能体')); assert.ok((await menu.innerText()).includes('上传'));
  await shot('01-original-plus-candidate');
  const first = await candidate.getAttribute('data-native-glyth-candidate');
  await menu.getByRole('button', { name: '刷新智能体形象', exact: true }).click();
  const second = await candidate.getAttribute('data-native-glyth-candidate'); assert.notEqual(second, first);
  assert.ok(!before.nodes.some(node => node.data?.lcosGlythAppearance && Object.values(node.data.lcosGlythAppearance).join('/') === second));
  await shot('02-refreshed-original-appearance');
  report.checks.push('Original plus opens a single original Add menu with a live Glyth candidate and retained creation/upload items; refresh changes its existing appearance combination.');
  if (phase === 'inspect') {
    await page.setViewportSize({ width: 480, height: 900 }); await candidate.waitFor(); await menuSettled();
    const upload = menu.getByText('上传', { exact: true }); await upload.scrollIntoViewIfNeeded(); await upload.click({ trial: true });
    report.narrowBottomHit = await upload.evaluate(element => { const r = element.getBoundingClientRect(); return element.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); });
    assert.equal(report.narrowBottomHit, true); await shot('03-narrow-original-menu');
    const box = await menu.boundingBox(); assert.ok(box && box.x >= 0 && box.x + box.width <= 481 && box.y >= 0 && box.y + box.height <= 901, 'Original menu stays within the narrow viewport.');
    assert.equal(report.writes.some(row => row.path.includes('/conversation-continuations')), false);
    report.checks.push('480px original menu remains inside the viewport and its bottom Upload item is actually reachable above the original conversation panel; inspecting and refreshing creates no conversation.');
  } else {
    const dragTo = async cancel => {
      const box = await candidate.boundingBox(); assert.ok(box); const to = { x: 630, y: 250 };
      const encoded = await candidate.getAttribute('data-native-glyth-candidate'), [shape, color, motion] = encoded.split('/');
      report.chosenAppearance = { shape, color, motion };
      report.dropPosition = await page.evaluate(point => window.__LCOS_NODE_LAB__.api.screenToFlowPosition(point), to);
      assert.equal(await page.evaluate(point => !!document.elementFromPoint(point.x, point.y)?.closest('.react-flow__pane'), to), true);
      await page.mouse.move(box.x + 27, box.y + box.height / 2); await page.mouse.down();
      await page.mouse.move(box.x + 55, box.y + box.height / 2, { steps: 6 }); await page.mouse.move(to.x, to.y, { steps: 18 });
      await page.waitForTimeout(350); if (cancel) await page.keyboard.press('Escape'); await page.mouse.up();
    };
    if (phase === 'create') {
    stage = 'cancel'; await dragTo(true); await page.waitForTimeout(250);
    assert.deepEqual((await get(prefix + '/connected-conversations')).map(row => row.id), conversations.map(row => row.id));
    assert.equal(report.writes.some(row => row.path.includes('/conversation-continuations')), false);
    await page.keyboard.press('Escape'); await menu.waitFor({ state: 'hidden' });
    await add.click(); await candidate.waitFor(); await candidate.click({ trial: true });
    stage = 'creating'; report.secondDragStart = await page.evaluate(() => window.__GLYTH_DRAG_TRACE__.length);
    await dragTo(false); report.dragTrace = await page.evaluate(() => window.__GLYTH_DRAG_TRACE__); await save();
    assert.ok(report.dragTrace.slice(report.secondDragStart).some(event => event.type === 'drop' && event.pane && event.types.includes('application/x-lcos-glyth-template')), 'The physical drag must actually reach the original canvas pane.');
    } else {
      const [shape, color, motion] = (await candidate.getAttribute('data-native-glyth-candidate')).split('/'); report.chosenAppearance = { shape, color, motion };
      stage = 'creating'; await candidate.focus(); await candidate.press('Enter');
    }
    await page.waitForFunction(ids => window.__LCOS_NODE_LAB__?.api?.getNodes().some(node => !ids.includes(node.id) && node.data?.lcosGlythAppearance)
      || !!document.querySelector('.native-glyth-notice')?.textContent.trim(), report.before.nodeIds, { timeout: 180000 });
    assert.ok(report.operationId && report.conversationId, 'Creation must follow the original service and projection requests.');
    await page.waitForFunction(id => window.__GLYTH_CREATION_READ__().target?.receiverConversationId === id, report.conversationId, { timeout: 60000 });
    const after = await get('/api/canvas/v1/canvases/' + canvasId), added = after.nodes.filter(node => !report.before.nodeIds.includes(node.id));
    assert.equal(added.length, 1); report.node = added[0]; assert.deepEqual(report.node.position, report.dropPosition);
    assert.deepEqual(report.node.data.lcosGlythAppearance, report.chosenAppearance); assert.equal(report.node.data.lcos_conversation_ref.connectedConversationId, report.conversationId);
    assert.equal((await get(prefix + '/connected-conversations')).length, conversations.length + 1);
    if (phase === 'keyboard') {
      assert.equal(report.node.data.title, '新对话');
      const carrier = page.locator('[data-lcos-node-id="' + report.node.id + '"]'); await carrier.click({ trial: true, position: { x: 30, y: 20 } });
      const box = await carrier.boundingBox(); assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width < 1020 && box.y + box.height < 1000);
      assert.equal(await carrier.evaluate(element => { const r = element.getBoundingClientRect(); return element.contains(document.elementFromPoint(r.x + 30, r.y + 20)); }), true);
      report.keyboardVisible = box;
    }
    report.operation = await get(prefix + '/conversation-continuations/' + report.operationId);
    assert.equal(report.operation.steps.external_create, 'confirmed'); assert.equal(report.operation.steps.core_bind, 'confirmed'); assert.equal(report.operation.requestConnectedConversationId, null);
    assert.ok(!conversations.some(row => row.conversationRef === report.operation.externalEvidence.externalSessionId), 'This must be a genuinely new native session.');
    const ui = await page.evaluate(() => window.__GLYTH_CREATION_READ__()); assert.deepEqual(ui.windows, []);
    await shot('03-real-drag-created-original-agent-and-conversation');
    if (verifyHistory) {
      report.history = [];
      const readHistory = () => page.evaluate(({ canvasId, nodeId }) => window.__LCOS_NODE_LAB__.api.inspectNativeHistory({ canvasId, nodeId }), { canvasId, nodeId: report.node.id });
      const settle = () => page.waitForFunction(() => { const state = window.__LCOS_NODE_LAB__?.api?.inspectExternalGeometrySync?.();
        return state?.active && !state.working && state.appliedVersion >= state.desiredVersion; }, undefined, { timeout: 60000 });
      await menu.waitFor({ state: 'hidden' }); await settle();
      const initial = await readHistory(); assert.equal(initial.currentEntry.operations.filter(op => op.operation.operationId === report.operationId && op.operation.kind === 'create').length, 1);
      assert.deepEqual(initial.undoTarget.nodes, []); report.creationHistory = initial;
      const bound = (await get(prefix + '/connected-conversations')).find(row => row.id === report.conversationId);
      const canonical = (await get(prefix + '/conversations')).find(row => row.id === bound.conversationSessionId);
      assert.equal(canonical.originMeta.continuationExternalSessionId, report.operation.externalEvidence.externalSessionId);
      const beforeTargetMessages = await get(prefix + '/conversations/' + canonical.id + '/messages?limit=1000'); assert.deepEqual(beforeTargetMessages, []);
      await page.keyboard.press('Escape'); await page.locator('.react-flow__pane').click({ position: { x: 200, y: 180 } });
      for (const [kind, historyPhase] of [['create','undo'], ['create','redo'], ['create','undo'], ['create','redo'], ['delete','apply'], ['delete','undo'], ['delete','redo'], ['delete','undo']]) {
        await settle();
        if (historyPhase === 'apply') {
          await page.locator('.react-flow__node[data-id="' + report.node.id + '"]').click({ position: { x: 5, y: 5 } });
          await page.waitForFunction(id => { const nodes = window.__LCOS_NODE_LAB__.api.getNodes().filter(node => node.selected); return nodes.length === 1 && nodes[0].id === id; }, report.node.id);
          assert.equal(await page.evaluate(() => document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement || document.activeElement?.isContentEditable), false);
        }
        stage = 'history-' + kind + '-' + historyPhase;
        const saved = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/nodes:batchActions'), { timeout: 60000 });
        await page.keyboard.press(historyPhase === 'apply' ? 'Delete' : historyPhase === 'undo' ? 'Control+z' : 'Control+Shift+z');
        const response = await saved; assert.equal(response.status(), 200, await response.text());
        const present = kind === 'create' && historyPhase === 'redo' || kind === 'delete' && historyPhase === 'undo';
        await page.waitForFunction(({ id, present }) => window.__LCOS_NODE_LAB__.api.getNodes().some(node => node.id === id) === present, { id: report.node.id, present });
        const fresh = await get('/api/canvas/v1/canvases/' + canvasId), matching = fresh.nodes.filter(node => node.id === report.node.id);
        assert.equal(matching.length, present ? 1 : 0); if (present) assert.deepEqual(matching[0], report.node);
        assert.deepEqual(fresh.nodes.filter(node => node.id !== report.node.id), before.nodes);
        assert.deepEqual((await get(prefix + '/connected-conversations')).find(row => row.id === report.conversationId), bound);
        assert.deepEqual((await get(prefix + '/conversations')).find(row => row.id === canonical.id), canonical);
        assert.deepEqual(await get(prefix + '/conversations/' + canonical.id + '/messages?limit=1000'), beforeTargetMessages);
        report.history.push({ kind, phase: historyPhase, present, version: fresh.version, originalHistory: await readHistory() });
        stage = 'history-settled'; await settle(); await shot('history-' + report.history.length + '-' + kind + '-' + historyPhase);
      }
      report.checks.push('Real original keyboard creation Undo/Redo twice, original Delete, deletion Undo/Redo/Undo preserve the same native/Core/node/appearance/position with no replacement creation, no messages and no new window.');
    }
    stage = 'refresh'; await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
    const glyph = page.locator('[data-native-glyth-appearance][data-lcos-node-id="' + report.node.id + '"]'); await glyph.waitFor();
    await glyph.locator('[data-lcos-glyth-vector]').click({ position: { x: 34, y: 35 }, timeout: 60000 });
    await page.waitForFunction(id => window.__GLYTH_CREATION_READ__().target?.receiverConversationId === id, report.conversationId);
    assert.deepEqual((await get('/api/canvas/v1/canvases/' + canvasId)).nodes.find(node => node.id === report.node.id).data.lcosGlythAppearance, report.chosenAppearance);
    await shot('04-refresh-and-original-glyph-opens-same-conversation');
    report.checks.push(phase === 'create' ? 'Real Escape-cancel creates nothing; one physical drag creates one source-free native conversation and one original bound node at the exact drop point, retains appearance after refresh and opens the same original conversation on glyph click.'
      : 'Original candidate Enter creates exactly one new conversation with the correct human title, a different chosen appearance and a visible clear placement; refresh and glyph click retain the same conversation.');
  }
  assert.deepEqual(await get(priorMessagesPath), beforeMessages); assert.deepEqual(await get(prefix + '/execution-projection'), beforeRuns);
  if (phase === 'inspect' && option('open-created')) {
    const existing = JSON.parse(await fs.readFile(option('open-created'), 'utf8')); assert.equal(existing.passed, true);
    await page.keyboard.press('Escape'); await page.setViewportSize({ width: 1500, height: 1000 });
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
    const glyph = page.locator('[data-lcos-node-id="' + existing.node.id + '"] [data-lcos-glyth-vector]'); await glyph.waitFor();
    await glyph.click({ position: { x: 34, y: 35 }, timeout: 60000 });
    await page.waitForFunction(id => window.__GLYTH_CREATION_READ__().target?.receiverConversationId === id, existing.conversationId);
    const input = page.getByRole('textbox', { name: 'Composer 输入', exact: true }); await input.fill('只核对输入准备状态，不发送。');
    const submit = page.getByRole('button', { name: '提交', exact: true });
    await page.waitForFunction(() => document.querySelector('button[aria-label="提交"]')?.disabled === false, undefined, { timeout: 60000 });
    assert.equal(await submit.isEnabled(), true); await input.fill('');
    await shot('04-existing-created-agent-ready-without-send');
    report.checks.push('An existing newly created empty agent reopens through its original glyph and actually prepares an enabled original Composer; no message is submitted. Original vector frames also change over time.');
  }
  for (const [id, messages] of priorHistories) assert.deepEqual(await get(prefix + '/conversations/' + id + '/messages?limit=1000'), messages);
  const finalConversations = await get(prefix + '/connected-conversations');
  for (const original of conversations) assert.equal(finalConversations.find(row => row.id === original.id)?.label, original.label);
  report.priorHistoriesUnchanged = priorHistories.size; report.oldLabelsUnchanged = true;
  assert.equal(report.modelMessagesSubmitted, 0); assert.deepEqual(report.errors, []);
  assert.ok(report.writes.every(row => row.permitted), 'No unowned write attempt is ignored.'); report.passed = true;
} catch (error) { report.error = { message: error.message, stack: error.stack }; process.exitCode = 1;
  if (page) { try { report.dragTrace = await page.evaluate(() => window.__GLYTH_DRAG_TRACE__); report.visible = await page.locator('body').innerText(); const file = path.join(output, 'failure.png'); await page.screenshot({ path: file }); report.screenshots.push(file); } catch {} }
} finally { await save(); await browser?.close(); }
console.log(JSON.stringify({ passed: report.passed, phase, output, operationId: report.operationId, conversationId: report.conversationId, checks: report.checks, error: report.error?.message }, null, 2));
