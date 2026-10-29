export default async function measureComponentCut(controlPage) {
  const origin = 'http://127.0.0.1:17876';
  const context = await controlPage.context().browser().newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 1000 }, locale: 'zh-CN' });
  const page = await context.newPage();
  const report = { startedAt: new Date().toISOString(), mode: 'cut-and-editable-component', requests: [], externalBlocked: [], errors: [] };
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) { report.externalBlocked.push(url.origin + url.pathname); await route.abort('blockedbyclient'); return; }
    report.requests.push({ method: request.method(), path: url.pathname });
    await route.continue();
  });
  await context.routeWebSocket(/.*/, socket => { report.externalBlocked.push(socket.url().split('?')[0]); socket.close(); });
  page.on('pageerror', error => report.errors.push(error.message.slice(0, 500)));
  page.on('dialog', dialog => dialog.type() === 'beforeunload' ? dialog.accept() : dialog.dismiss());
  await page.goto(origin + '/takeover/');
  await page.waitForTimeout(4500);
  report.url = page.url();
  report.nodes = await page.locator('.react-flow__node').count();
  report.customComponent = await page.locator('[data-lcos-panel="editable-canvas-component"]').count();
  report.originalChatInput = await page.getByText('随心输入', { exact: true }).count();
  report.promoDialogs = await page.getByRole('dialog').count();
  report.originalChatLabel = await page.getByText('新建对话', { exact: true }).count();
  await page.getByText('展开接管边界', { exact: true }).click({ timeout: 3000 });
  report.detailsToggleWorks = await page.locator('[data-lcos-panel] details').getAttribute('open') !== null;
  const node = page.locator('.react-flow__node').first();
  const before = await node.boundingBox();
  await page.mouse.move(before.x + before.width / 2, before.y + 8);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 100, before.y + 68, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(350);
  const after = await node.boundingBox();
  report.drag = { before, after, moved: after.x - before.x > 10 };
  await page.mouse.move(42, 449); await page.waitForTimeout(300); await page.mouse.click(42, 449);
  await page.getByText('夺舍计划 · 模拟材料', { exact: true }).click({ timeout: 4000 });
  await page.waitForTimeout(600);
  report.libraryAssetsVisible = await page.getByText('合成图片条目', { exact: true }).count() > 0 &&
    await page.getByText('合成文档条目', { exact: true }).count() > 0;
  report.body = (await page.locator('body').innerText()).slice(0, 12000);
  await page.screenshot({ path: 'output/playwright/cut-custom-component.png', fullPage: true });
  report.finishedAt = new Date().toISOString();
  const envelope = await (await page.request.get(origin + '/api/events')).json();
  report.diagnostics = envelope.events.filter(event => event.at >= report.startedAt && event.at <= report.finishedAt &&
    ['remote-fetch-attempt', 'remote-fetch-blocked', 'csp-blocked', 'api-response'].includes(event.kind));
  report.agentApiRequests = report.requests.filter(request => request.path.startsWith('/api/agent-gateway/'));
  report.attributionRequests = report.requests.filter(request => request.path.startsWith('/api/tracking-attribution/'));
  report.sentryAttempts = report.diagnostics.filter(event => JSON.stringify(event.detail).includes('sentry.io'));
  const saved = await page.request.post(origin + '/api/events', { data: { source: 'cut-measurement', kind: 'cut-measured', detail: report } });
  if (!saved.ok()) throw new Error('Cut measurement was not saved.');
  await context.close();
  return { url: report.url, nodes: report.nodes, customComponent: report.customComponent, originalChatInput: report.originalChatInput,
    promoDialogs: report.promoDialogs, detailsToggleWorks: report.detailsToggleWorks, drag: report.drag.moved,
    libraryAssetsVisible: report.libraryAssetsVisible, agentApiRequests: report.agentApiRequests, attributionRequests: report.attributionRequests,
    sentryAttempts: report.sentryAttempts.length, errors: report.errors };
}
