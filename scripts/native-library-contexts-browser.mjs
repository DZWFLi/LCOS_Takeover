import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const argument = process.argv.find(value => value.startsWith('--base-url='));
assert.ok(argument, 'Use --base-url=http://127.0.0.1:<isolated-port>');
const address = new URL(argument.slice('--base-url='.length));
assert.equal(address.protocol, 'http:'); assert.equal(address.hostname, '127.0.0.1');
assert.equal(address.pathname, '/'); assert.equal(address.username, ''); assert.equal(address.password, '');
const origin = address.origin;
const health = await (await fetch(origin + '/health')).json();
assert.ok(health.runtimeLabel?.startsWith('isolated-') && health.realCoreConnected && health.nativeRailPilot);
const projectId = 'disposable-surface-core-facade';
const prefix = `/api/lcos/core/projects/${projectId}`;
const output = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'output', '原流程施工_20261017b',
  '上下文方法验证-' + new Date().toISOString().replace(/[:.]/g, '-'));
await fs.mkdir(output, { recursive: true });
const report = { at: new Date().toISOString(), origin, output, pid: health.pid, runtimeLabel: health.runtimeLabel,
  browser: 'Browser plugin not available; existing Playwright Core and installed Chrome', viewport: { width: 1440, height: 1000 },
  checks: [], fixtureWrites: [], browserWrites: [], forbiddenWritesBlocked: [], externalBlocked: [], apiFailures: [],
  pageErrors: [], consoleErrors: [], screenshots: [], passed: false, providerOrModelExecution: false };
const get = async pathname => {
  const response = await fetch(origin + pathname, { redirect: 'error', cache: 'no-store' });
  assert.equal(response.status, 200, pathname);
  const value = await response.json();
  if ('ok' in value) { assert.equal(value.ok, true); return value.value; }
  assert.equal(value.code, 0); return value.data;
};
const check = async (name, task) => { await task(); report.checks.push(name); console.log('PASS ' + name); };
const { chromium } = createRequire('E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/package.json')('playwright-core');
let browser, context, page;
try {
  const beforeGraph = await get(prefix + '/graph');
  const beforePresentations = await get(prefix + '/presentations');
  const warehouse = await get(prefix + '/warehouse?kinds=context,workflow&limit=100');
  const saved = warehouse.items.find(item => item.kind === 'context' && item.entityRef.id === 'scope-surface-core-context');
  const method = warehouse.items.find(item => item.kind === 'workflow' && item.entityRef.id === 'scope-surface-core-workflow');
  assert.ok(saved && method, 'The isolated synthetic Scope fixtures must exist.');
  const main = await get('/api/canvas/v1/canvases/surface-core-main');
  const workflow = await get('/api/canvas/v1/canvases/surface-core-workflow');
  const mainText = main.nodes.find(node => node.id === 'surface-main-text');
  const workflowText = workflow.nodes.find(node => node.id === 'surface-workflow-text');
  assert.ok(mainText?.data.lcos_ref?.artifactViewId && workflowText?.data.lcos_ref?.artifactViewId);
  const mainMaterialTitle = beforeGraph.artifacts.find(artifact => artifact.id === mainText.data.lcos_ref.artifactId)?.title;
  assert.ok(mainMaterialTitle);
  const methodId = `presentation:workflow:${method.entityRef.id}`;
  const existing = beforePresentations.filter(presentation => presentation.id === methodId);
  assert.ok(existing.length <= 1);
  if (!existing.length) {
    const now = new Date().toISOString();
    const contract = { schemaVersion: 0, id: methodId, projectId, scopeId: method.entityRef.id, capability: 'workflow', renderer: 'workflow', version: 0,
      updatedBy: 'agent', createdAt: now, updatedAt: now,
      state: { memberViewIds: [workflowText.data.lcos_ref.artifactViewId], hiddenViewIds: [], positions: {},
        hierarchy: { parentByViewId: {}, orderByParent: {} }, presentationEdges: [], pinnedViewIds: [], emphasisByViewId: {}, workflowOperators: {},
        workflowActions: [
          { id: 'native-library-qa-read', label: '读取人工合成项目文字', description: '这是人工合成的库接入验证方法，不运行模型，也不修改原文件。', attachedViewIds: [workflowText.data.lcos_ref.artifactViewId], x: 0, y: 0 },
          { id: 'native-library-qa-plan', label: '整理下一步', description: '仅把方法加入未发送草稿，原输入必须保留。', attachedViewIds: [], x: 320, y: 0 },
        ], workflowActionEdges: [{ id: 'native-library-qa-edge', fromActionId: 'native-library-qa-read', toActionId: 'native-library-qa-plan', label: '阅读后整理' }] } };
    const response = await fetch(origin + prefix + '/presentations/' + encodeURIComponent(methodId), { method: 'PUT',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contract, expectedVersion: 0 }) });
    const receipt = await response.json();
    report.fixtureWrites.push({ method: 'PUT', id: methodId, status: response.status, kind: 'manually authored synthetic method; no Run or model' });
    assert.equal(response.status, 200); assert.equal(receipt.ok, true); assert.equal(receipt.value.id, methodId);
  } else assert.ok(existing[0].state.workflowActions?.length, 'Existing methods are preserved, never overwritten to make a test pass.');
  report.firstContextPresentationMissing = !beforePresentations.some(presentation => presentation.id === `presentation:context:${saved.entityRef.id}`);
  browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
    args: ['--disable-background-networking', '--disable-sync', '--no-first-run', '--lcos-library-context-qa-20261017'] });
  context = await browser.newContext({ viewport: report.viewport, locale: 'zh-CN', serviceWorkers: 'block' });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== origin) { report.externalBlocked.push({ method, origin: url.origin, path: url.pathname }); return route.abort(); }
    if (method === 'POST' && /collaboration-send|conversation-continuations|recovery-actions|agent\/gateway|\/runs(?:\/|$)/.test(url.pathname)) {
      report.forbiddenWritesBlocked.push(url.pathname); return route.abort();
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) report.browserWrites.push({ method, path: url.pathname });
    return route.continue();
  });
  await context.routeWebSocket('**/*', socket => socket.close());
  page = await context.newPage(); page.setDefaultTimeout(20000);
  page.on('pageerror', error => report.pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !/Statsig|Failed to load resource/.test(message.text())) report.consoleErrors.push(message.text().slice(0, 1200)); });
  page.on('response', response => { if (response.url().startsWith(origin) && response.status() >= 400)
    report.apiFailures.push({ path: new URL(response.url()).pathname, status: response.status() }); });
  const shot = async name => { const file = path.join(output, name + '.png'); await page.screenshot({ path: file });
    await fs.writeFile(path.join(output, name + '.aria.txt'), await page.locator('body').ariaSnapshot()); report.screenshots.push(file); };
  await page.goto(origin + '/canvas/surface-core-main', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-lcos-native-chat-frame] textarea').waitFor({ state: 'visible', timeout: 60000 });
  await check('one native Library entry and one Composer; correct page, no framework overlay', async () => {
    await page.waitForFunction(() => document.title.includes('Main'));
    assert.equal(await page.locator('[data-lcos-connected-agent-panel]').count(), 0);
    const draft = page.getByRole('textbox', { name: 'Composer 输入', exact: true });
    await draft.fill('库功能联调草稿 · 尚未发送。');
    await page.getByRole('heading', { name: 'Main · 项目总览', exact: true }).click();
    await page.locator('.react-flow__node[data-id="surface-main-text"].selected').waitFor();
    await page.getByTestId('canvas-dockbar-assets-btn').click();
    await page.locator('[data-lcos-native-library-contexts]').waitFor();
    assert.equal(await page.locator('[data-lcos-window-body="assembly"]').count(), 0);
    await shot('01-native-library');
  });
  const library = page.locator('[data-library-view="library"]');
  await check('original folder classification opens Core Saved Context in its original Popover', async () => {
    await library.getByText('已保存上下文', { exact: true }).click();
    await library.getByRole('button', { name: saved.title, exact: true }).click();
    await page.locator('[data-native-library-context-preview]').waitFor();
    await page.getByRole('button', { name: '加入当前选区', exact: true }).waitFor({ state: 'visible' });
    assert.equal(await page.locator('[data-lcos-native-saved-context-host],[data-lcos-native-workflow-host]').count(), 0);
    await shot('02-context-before');
  });
  let firstMembership;
  await check('native Add selection invokes original producer, reads back exact membership, keeps Popover', async () => {
    await page.getByRole('button', { name: '加入当前选区', exact: true }).click();
    await page.getByText('选中的材料已在上下文中', { exact: true }).waitFor({ timeout: 60000 });
    firstMembership = (await get(prefix + '/presentations')).find(presentation => presentation.id === `presentation:context:${saved.entityRef.id}`);
    assert.ok(firstMembership?.state.memberViewIds.includes(mainText.data.lcos_ref.artifactViewId));
    assert.equal(await page.locator('[data-native-library-context-preview]').count(), 1);
    await shot('03-context-membership');
  });
  await check('repeated Add is idempotent through the same Core membership owner', async () => {
    await page.getByRole('button', { name: '加入当前选区', exact: true }).click();
    await page.getByText('选中的材料已在上下文中', { exact: true }).waitFor({ timeout: 60000 });
    const next = (await get(prefix + '/presentations')).find(presentation => presentation.id === firstMembership.id);
    assert.equal(next.version, firstMembership.version); assert.deepEqual(next.state, firstMembership.state);
  });
  await check('exact context materials join the existing unsent native input', async () => {
    await page.getByRole('textbox', { name: 'Composer 输入', exact: true }).evaluate(editor => {
      editor.setSelectionRange(4, 9); editor.dispatchEvent(new Event('select', { bubbles: true }));
    });
    await page.getByRole('button', { name: '用于当前对话', exact: true }).click();
    await page.locator('[data-native-library-context-preview]').waitFor({ state: 'hidden' });
    await page.waitForFunction(() => {
      const editor = document.querySelector('[data-lcos-native-chat-frame] textarea[data-lcos-composer-input]');
      return editor && document.activeElement === editor && editor.selectionStart === 4 && editor.selectionEnd === 9;
    });
    assert.equal(await page.getByRole('textbox', { name: 'Composer 输入', exact: true }).inputValue(), '库功能联调草稿 · 尚未发送。');
    assert.ok(await page.locator('[data-lcos-composer-ref]').count() >= 1);
    await shot('04-context-reference');
  });
  await check('native search returns Workflow detail and applies the real method without source IDs', async () => {
    await library.getByRole('textbox', { name: '搜索', exact: true }).fill(method.title);
    await library.getByRole('button', { name: method.title, exact: true }).click();
    await page.locator('[data-native-library-method-preview]').waitFor();
    const preview = await page.locator('[data-native-library-method-preview]').innerText();
    assert.ok(preview.includes('读取') && preview.includes('整理'));
    assert.equal(preview.includes(projectId), false); assert.equal(preview.includes(methodId), false);
    await page.getByRole('button', { name: '使用方法', exact: true }).click();
    await page.locator('[data-native-library-method-preview]').waitFor({ state: 'hidden' });
    await page.waitForFunction(() => document.activeElement?.matches('[data-lcos-native-chat-frame] textarea[data-lcos-composer-input]'));
    const prompt = await page.getByRole('textbox', { name: 'Composer 输入', exact: true }).inputValue();
    assert.ok(prompt.startsWith('库功能联调草稿 · 尚未发送。') && prompt.includes('工作流方法：'));
    assert.equal(prompt.includes(projectId), false); assert.equal(prompt.includes(methodId), false);
    assert.equal(await page.getByRole('textbox', { name: 'Composer 输入', exact: true }).count(), 1);
    assert.equal(await page.getByRole('button', { name: '进入现场', exact: true }).count(), 0, 'No fake entry for a Scope with no real Workspace/Canvas.');
    await shot('05-workflow-method');
  });
  await check('refresh reads saved membership and keeps one native detail in a narrow viewport', async () => {
    await page.reload(); await page.locator('.react-flow').waitFor({ timeout: 60000 });
    await page.getByTestId('canvas-dockbar-assets-btn').click();
    await library.getByText('已保存上下文', { exact: true }).click();
    await library.getByRole('button', { name: saved.title, exact: true }).click();
    await page.locator('[data-native-library-context-preview]').getByText(mainMaterialTitle, { exact: true }).waitFor();
    const close = page.getByRole('button', { name: '收起对话', exact: true }); if (await close.isVisible()) await close.click();
    await page.setViewportSize({ width: 1000, height: 800 });
    await shot('06-context-refreshed-narrow');
  });
  const after = await get(prefix + '/graph');
  assert.deepEqual(after.artifacts, beforeGraph.artifacts); assert.deepEqual(after.artifactViews, beforeGraph.artifactViews);
  assert.deepEqual(after.fileRecords, beforeGraph.fileRecords); assert.deepEqual(after.artifactRevisions, beforeGraph.artifactRevisions);
  assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.consoleErrors, []); assert.deepEqual(report.forbiddenWritesBlocked, []);
  report.passed = true;
} catch (error) {
  report.failure = String(error.stack ?? error); process.exitCode = 1;
  if (page) { try { await page.screenshot({ path: path.join(output, 'failure.png') }); await fs.writeFile(path.join(output, 'failure.aria.txt'), await page.locator('body').ariaSnapshot()); } catch {} }
} finally {
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  await context?.close(); await browser?.close();
  console.log(JSON.stringify(report, null, 2));
}
