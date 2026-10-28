import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { isDeepStrictEqual as same } from 'node:util';
import { currentGen2Root } from '../lab/current-gen2-resources.mjs';

const option = name => process.argv.find(arg => arg.startsWith('--' + name + '='))?.slice(name.length + 3);
const phase = option('phase') ?? 'reproduce'; assert.ok(['reproduce', 'navigation', 'projection'].includes(phase));
const origin = 'http://127.0.0.1:56311', fixture = JSON.parse(await fs.readFile('output/方法嵌套成员与混合现场_20261025/fixture.json', 'utf8'));
const prefix = '/api/lcos/core/projects/' + fixture.projectId, output = path.resolve('output/方法嵌套成员与混合现场_20261025/实屏', new Date().toISOString().replace(/[:.]/g, '-'));
await fs.mkdir(output, { recursive: true });
const report = { passed: false, phase, output, browser: 'Browser plugin not available; existing Playwright Core / Chrome', checks: [], writes: [], blockedExternal: [], pageErrors: [], httpErrors: [], screenshots: [], modelSends: 0 };
const save = () => fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
const get = async route => { const r = await fetch(origin + route, { redirect: 'error', signal: AbortSignal.timeout(20000) }); const b = await r.json(); assert.ok(r.ok && b.ok !== false, route); return b.value ?? b.data ?? b; };
const health = await get('/health'); assert.equal(health.pid, Number(option('expected-pid'))); assert.equal(health.realCoreConnected, true); report.pid = health.pid;
const messagesRoute = prefix + '/conversations/' + fixture.liveSessionId + '/messages?limit=1000';
const facts = async () => ({ graph: await get(prefix + '/graph'), presentations: await get(prefix + '/presentations'),
  messages: await get(messagesRoute), execution: await get(prefix + '/execution-projection'), main: await get('/api/canvas/v1/canvases/surface-core-main') });
const before = await facts(); let page, browser, failOuterRead = false, delayGraph = false, releaseGraph, markGraph;
try {
  const { chromium } = createRequire(path.join(currentGen2Root, 'package.json'))('playwright-core');
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-networking', '--disable-sync', '--no-first-run'] });
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 }, locale: 'zh-CN', serviceWorkers: 'block' });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) { report.blockedExternal.push({ protocol: url.protocol, host: url.host }); return route.abort(); }
    if (request.method() === 'GET' && failOuterRead && url.pathname === prefix + '/collections/' + fixture.nested.outer.id + '/members') {
      failOuterRead = false; (report.injectedFailures ??= []).push(url.pathname);
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, error: { code: 'CONTROLLED_READ_FAILURE', message: 'One controlled collection read failure' } }) });
    }
    if (request.method() === 'GET' && delayGraph && url.pathname === prefix + '/graph') {
      delayGraph = false; const response = await route.fetch(); markGraph?.(); await new Promise(resolve => { releaseGraph = resolve; });
      try { return await route.fulfill({ response }); } catch (error) { if (!request.failure()) throw error; }
      return;
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      const write = { method: request.method(), path: url.pathname, permitted: false }; report.writes.push(write);
      const body = request.postDataJSON();
      if (url.pathname === '/api/events' || url.pathname.endsWith('/execution:reconcile') && same(body, {})) write.permitted = true;
      else if (url.pathname.endsWith('/nodes:batchActions')) {
        const current = await get('/api/canvas/v1/canvases/' + body.canvas_id);
        write.permitted = !body.lcos_operation && body.actions?.every(action => action.action === 'update' && action.updates?.every(node => {
          const old = current.nodes.find(row => row.id === node.id);
          return old && Object.entries(node).every(([key, value]) => ['id', 'type', 'data', 'position', 'measured'].includes(key) && same(value, old[key]));
        }));
      }
      // Original existing workspaces may be visited; no new model, Run or provider operation is permitted.
      if (!write.permitted) { await save(); return route.abort(); }
    }
    if (url.pathname === '/lcos/agent-ui.js') {
      const response = await route.fetch({ timeout: 120000 }); return route.fulfill({ response, body: await response.text() + '\nwindow.__METHOD_NESTED_READ__=()=>{const s=useLcosShellStore.getState(),c=useCanvasStore.getState();return{canvas:c.canvasId,workspace:s.composerTarget?.workspaceId,prompt:s.composerPrompt,target:s.composerTarget,caret:s.composerCaret,refs:useLcosReferenceStore.getState().draft.orderedEntityRefs,windows:s.windows,viewport:c.rfInstance?.getViewport(),document:performance.timeOrigin}};' });
    }
    return route.continue();
  });
  await context.routeWebSocket('**/*', socket => socket.close());
  page = await context.newPage(); page.setDefaultTimeout(30000);
  page.on('pageerror', error => report.pageErrors.push(String(error)));
  page.on('response', response => { if (response.status() >= 400) report.httpErrors.push({ path: new URL(response.url()).pathname, status: response.status() }); });
  const read = () => page.evaluate(() => window.__METHOD_NESTED_READ__());
  const shot = async name => {
    await page.evaluate(async () => { await Promise.all(document.getAnimations().filter(animation => Number.isFinite(animation.effect?.getComputedTiming().endTime)).map(animation => animation.finished.catch(() => {}))); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
    const file = path.join(output, name + '.png'); await page.screenshot({ path: file }); report.screenshots.push(file); await save();
  };
  await page.goto(origin + '/canvas/surface-core-main', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.locator('[data-lcos-professional-surface-state=ready]').waitFor({ state: 'attached', timeout: 120000 });
  await page.getByTestId('common-loading-overlay').waitFor({ state: 'hidden', timeout: 60000 });
  report.pageIdentity = { url: page.url(), title: await page.title(), nonBlank: (await page.locator('body').innerText()).length > 100 };
  assert.ok(report.pageIdentity.url.endsWith('/canvas/surface-core-main') && report.pageIdentity.title && report.pageIdentity.nonBlank);
  assert.equal(await page.locator('vite-error-overlay').count(), 0);
  const input = page.getByRole('textbox', { name: 'Composer 输入', exact: true }); await input.fill('逐层查看方法集合与Scope，保留这份原稿，不发送。');
  await input.evaluate(element => { element.setSelectionRange(2, 7); element.dispatchEvent(new Event('select', { bubbles: true })); });
  report.inputBefore = await read();
  const more = page.getByRole('button', { name: '浏览全部', exact: true }); if (!await more.isVisible()) await page.getByTestId('canvas-dockbar-workflow-btn').click();
  const guide = page.getByRole('button', { name: '知道了', exact: true }); if (await guide.isVisible()) await guide.click(); await more.click();
  const gallery = page.locator('[data-native-workflow-gallery]'), method = page.locator('[data-native-workflow-preview]');
  await gallery.getByRole('textbox').fill('方法嵌套与混合现场联调'); await gallery.getByRole('textbox').press('Enter');
  await gallery.getByText(fixture.title, { exact: true }).first().click();
  await page.waitForFunction(title => document.querySelector('[data-native-workflow-preview]')?.innerText.includes(title), fixture.nested.outer.title);
  if (phase === 'reproduce') {
    assert.equal(await method.locator('[data-native-method-member]').filter({ hasText: fixture.nested.outer.title }).count(), 0);
    assert.equal(await method.locator('[data-native-method-member]').filter({ hasText: fixture.nested.scopeTitle }).count(), 0);
    await shot('01-original-method-static-aggregate-entries');
    report.checks.push('Reproduced the actual original method detail: collection and nested Scope titles are present but have no member action; aggregate navigation is not connected.');
  } else if (phase === 'navigation') {
    const preview = page.locator('.native-library-content-preview'), library = page.locator('[data-library-view=library]'), viewer = page.locator('[data-media-viewer]');
    const member = (type, id) => method.locator('[data-native-method-member=' + JSON.stringify(JSON.stringify([type, id])) + ']');
    const row = (title, action = '进入') => preview.getByRole('button', { name: action + ' ' + title, exact: true });
    const back = title => preview.getByRole('button', { name: '返回 ' + title, exact: true });
    const originalInput = report.inputBefore;
    const sameInput = async () => { const value = await read(); const address = ({ focusInput, ...rest }) => rest;
      assert.equal(value.prompt, originalInput.prompt); assert.deepEqual(value.refs, originalInput.refs); assert.deepEqual(value.windows, originalInput.windows);
      assert.deepEqual(address(value.target), address(originalInput.target)); assert.equal(value.document, originalInput.document); return value;
    };
    const open = async (type, id) => {
      const button = member(type, id); await button.scrollIntoViewIfNeeded(); report.lastMember = { key: JSON.stringify([type, id]), scroll: await method.evaluate(element => element.scrollTop) };
      await button.click(); await preview.waitFor(); await library.waitFor(); await gallery.waitFor({ state: 'hidden' });
      assert.equal(await page.locator('.native-library-content-preview').count(), 1); assert.deepEqual((await read()).windows, originalInput.windows);
    };
    const returnMethod = async () => {
      await back(fixture.title).click(); await preview.waitFor({ state: 'hidden' }); await gallery.waitFor();
      await page.waitForFunction(key => document.activeElement?.getAttribute('data-native-method-member') === key, report.lastMember.key);
      assert.equal(await method.getAttribute('data-method-id'), fixture.scopeId);
      assert.ok(Math.abs(await method.evaluate(element => element.scrollTop) - report.lastMember.scroll) < 2); await sameInput();
      await gallery.getByRole('button', { name: '返回方法列表', exact: true }).click();
      assert.equal(await gallery.getByRole('textbox').inputValue(), '方法嵌套与混合现场联调');
      await gallery.getByText(fixture.title, { exact: true }).first().click();
    };
    const returnLeaf = async () => { await page.getByRole('button', { name: '返回库内预览', exact: true }).click(); await viewer.waitFor({ state: 'hidden' }); await preview.waitFor(); };

    await open('collection', fixture.nested.outer.id); await row(fixture.nested.inner.title).waitFor(); await shot('02-method-to-original-collection');
    await row(fixture.nested.inner.title).click(); await row(fixture.source.artifactTitle, '查看').click(); await viewer.waitFor();
    await page.locator('[data-lcos-native-text-reading]').waitFor(); assert.equal(await page.locator('[data-lcos-window-body=reader]').count(), 0); await returnLeaf();
    await row(fixture.source.noteTitle, '查看').click(); await viewer.getByText(fixture.source.noteBody, { exact: true }).waitFor(); await shot('03-inner-collection-original-note'); await returnLeaf();
    await back(fixture.nested.outer.title).click(); await row(fixture.nested.scopeTitle).click(); await row(fixture.nested.outer.title).click();
    await row(fixture.nested.inner.title).waitFor(); await back(fixture.title).waitFor();
    report.checks.push('Method → original outer/inner Collection → exact material and Note in original Viewer → original trail; a Scope/Collection cycle returns to its existing ancestor without another window.');
    await returnMethod(); await shot('04-original-method-member-restored');

    await open('scope', fixture.nested.scopeId); await row(fixture.nested.outer.title).click(); await row(fixture.nested.inner.title).click();
    const target = fixture.nested.cross.workflow; await row(target.name).click();
    await page.waitForFunction(id => window.__METHOD_NESTED_READ__().canvas === id, target.canvasId); await page.getByTestId('common-loading-overlay').waitFor({ state: 'hidden', timeout: 60000 });
    await shot('05-nested-original-worksite'); await page.getByTestId('canvas-header-logo-button').click();
    await page.waitForFunction(() => window.__METHOD_NESTED_READ__().canvas === 'surface-core-main'); await row(target.name).waitFor(); await back(fixture.nested.outer.title).waitFor();
    await page.waitForFunction(key => document.activeElement?.getAttribute('data-native-scope-member') === key, JSON.stringify(['workspace', target.id]));
    await shot('06-original-nested-trail-after-worksite');
    await back(fixture.nested.outer.title).click(); await back(fixture.nested.scopeTitle).click(); await returnMethod();
    report.checks.push('Nested Scope → outer/inner Collection → existing Workflow worksite → original header Back restores the exact original Library trail/member, then root Back restores the original method and draft.');

    await open('scope', fixture.nestedMethod.scopeId); await row(fixture.source.conversationTitle).click();
    await page.getByText('这是一段人工准备的嵌套入口验证历史；没有请求模型，也没有发送新消息。', { exact: true }).waitFor();
    await returnLeaf(); await row(fixture.source.runTitle).click(); await page.locator('[data-native-task-detail]').getByRole('heading', { name: fixture.source.runTitle, exact: true }).waitFor();
    await shot('07-nested-method-original-task-panel'); await returnLeaf(); await returnMethod();
    report.checks.push('Nested Workflow Scope uses its original method Library detail; its real conversation and Run enter the existing right panel and return through the same trail to the originating method.');

    failOuterRead = true; await open('collection', fixture.nested.outer.id);
    await page.waitForFunction(() => document.querySelector('.native-library-content-preview')?.innerText.includes('集合暂时打不开'));
    await preview.getByRole('button', { name: '重新读取', exact: true }).click(); await row(fixture.nested.inner.title).waitFor(); await returnMethod();
    assert.equal(report.injectedFailures?.length, 1); report.checks.push('One controlled original Collection GET failure retains the source method/input; the original reread button reads the same collection and returns successfully.');

    const started = new Promise(resolve => { markGraph = resolve; }); delayGraph = true;
    await member('collection', fixture.nested.outer.id).click(); await started;
    await gallery.getByTestId('common-dialog-close-btn').click(); await gallery.waitFor({ state: 'hidden' });
    const moreAgain = page.getByRole('button', { name: '浏览全部', exact: true }); if (!await moreAgain.isVisible()) await page.getByTestId('canvas-dockbar-workflow-btn').click(); await moreAgain.click();
    await gallery.getByRole('textbox').fill('方法嵌套与混合现场联调'); await gallery.getByRole('textbox').press('Enter');
    await gallery.getByText(fixture.title, { exact: true }).first().click(); releaseGraph(); await page.waitForTimeout(350);
    assert.equal(await preview.isVisible(), false); assert.equal(await method.getAttribute('data-method-id'), fixture.scopeId); await sameInput();
    report.checks.push('Closing then reopening the same method before an old member read completes prevents late original Library navigation into the new preview.');

    await gallery.getByTestId('common-dialog-close-btn').click(); await gallery.waitFor({ state: 'hidden' }); await page.setViewportSize({ width: 360, height: 800 });
    const narrowMore = page.getByRole('button', { name: '浏览全部', exact: true }); if (!await narrowMore.isVisible()) await page.getByTestId('canvas-dockbar-workflow-btn').click(); await narrowMore.click();
    await gallery.getByRole('textbox').fill('方法嵌套与混合现场联调'); await gallery.getByRole('textbox').press('Enter');
    await gallery.getByText(fixture.title, { exact: true }).first().click(); await open('scope', fixture.nested.scopeId); await row(fixture.nested.outer.title).click(); await row(fixture.nested.inner.title).click();
    await shot('08-narrow-original-nested-detail'); report.narrowPreview = await preview.boundingBox();
    assert.ok(report.narrowPreview.x >= 0 && report.narrowPreview.x + report.narrowPreview.width <= 361 && report.narrowPreview.y >= 0 && report.narrowPreview.y + report.narrowPreview.height <= 801);
    await back(fixture.nested.outer.title).click(); await back(fixture.nested.scopeTitle).click(); await returnMethod();
    assert.equal(await method.evaluate(element => element.scrollWidth > element.clientWidth), false); await shot('09-narrow-original-method-return');
    await gallery.getByTestId('common-dialog-close-btn').click(); await input.waitFor(); await sameInput();
    report.checks.push('At 360px, the same original Library preview and nested return controls fit the viewport; the original method and unsent input remain intact.');
  } else {
    throw new Error('Projection checks will be connected after real navigation passes.');
  }
  const after = await facts(); assert.deepEqual(after, before); assert.deepEqual(report.pageErrors, []); assert.ok(report.writes.every(row => row.permitted)); report.passed = true;
} catch (error) {
  report.error = String(error.stack ?? error); process.exitCode = 1;
  if (page) { const file = path.join(output, 'failure.png'); await page.screenshot({ path: file }).catch(() => {}); report.screenshots.push(file); report.body = await page.locator('body').innerText().catch(() => '<unavailable>'); }
} finally { await save(); await browser?.close(); }
console.log(JSON.stringify({ passed: report.passed, phase, checks: report.checks, error: report.error, output }, null, 2));
