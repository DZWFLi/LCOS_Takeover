export default async function measureAblations(controlPage) {
  const origin = 'http://127.0.0.1:17874';
  const browser = controlPage.context().browser();
  const profiles = ['control', 'no-billing', 'canvas-library-only', 'no-canvas-data', 'no-agent-chunk'];
  const reports = [];
  for (const profile of profiles) {
    const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 1000 }, locale: 'zh-CN' });
    const page = await context.newPage();
    const report = { profile, startedAt: new Date().toISOString(), denied: [], externalBlocked: [], errors: [], responses: [] };
    await context.routeWebSocket(/.*/, socket => { report.externalBlocked.push(socket.url().split('?')[0]); socket.close(); });
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url()), pathname = url.pathname;
      if (url.origin !== origin) {
        report.externalBlocked.push(url.origin + pathname);
        await route.abort('blockedbyclient'); return;
      }
      const diagnostic = ['/api/events', '/health'].includes(pathname);
      const canvasRead = pathname === '/api/canvas/v1/canvases/offline-fixture-canvas' && request.method() === 'GET';
      const libraryRead = pathname.startsWith('/api/library/') && request.method() === 'GET';
      const denyApi = !diagnostic && (
        (profile === 'no-billing' && (pathname.startsWith('/api/billing/') || pathname.startsWith('/api/bff/billing/'))) ||
        (profile === 'canvas-library-only' && pathname.startsWith('/api/') && !canvasRead && !libraryRead) ||
        (profile === 'no-canvas-data' && pathname.startsWith('/api/canvas/'))
      );
      if (denyApi) {
        report.denied.push({ method: request.method(), path: pathname, type: 'api', status: 503 });
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 50300, message: 'Deliberately disconnected by local ablation experiment.', msg: 'Local ablation: disconnected.', data: null }) });
        return;
      }
      if (profile === 'no-agent-chunk' && pathname === '/assets/agent-host-provider-uVo_bky5.js') {
        report.denied.push({ method: request.method(), path: pathname, type: 'module', status: 404 });
        await route.fulfill({ status: 404, contentType: 'text/plain', body: 'Removed only for this fresh experiment context.' }); return;
      }
      await route.continue();
    });
    await context.addInitScript(() => {
      window.__ABLATION_CSP__ = [];
      addEventListener('securitypolicyviolation', event => {
        let blocked = event.blockedURI;
        try { const u = new URL(blocked); blocked = u.origin === 'null' ? u.protocol + '//' + u.host + u.pathname : u.origin + u.pathname; } catch {}
        window.__ABLATION_CSP__.push({ directive: event.effectiveDirective, blocked });
      });
    });
    page.on('pageerror', error => report.errors.push(error.message.slice(0, 400)));
    page.on('response', response => {
      const url = new URL(response.url());
      if (url.pathname.endsWith('.js') || url.pathname.startsWith('/api/')) {
        report.responses.push({ path: url.pathname, status: response.status(), bytes: Number(response.headers()['content-length']) || 0 });
      }
    });
    page.on('dialog', dialog => dialog.type() === 'beforeunload' ? dialog.accept() : dialog.dismiss());
    await page.goto(origin + '/takeover/');
    await page.waitForTimeout(4500);
    report.url = page.url();
    report.title = await page.title();
    report.body = (await page.locator('body').innerText()).slice(0, 9000);
    report.nodes = await page.locator('.react-flow__node').count();
    report.bridgePresent = await page.evaluate(() => Boolean(window.tapDesktop));
    report.csp = await page.evaluate(() => window.__ABLATION_CSP__ || []);
    report.interaction = {};
    if (report.nodes === 2) {
      try {
        const intro = page.getByRole('dialog');
        if (await intro.count()) await intro.first().getByRole('button', { name: '关闭', exact: true }).first().click({ timeout: 2500 });
        const remainingClose = page.getByRole('button', { name: '关闭', exact: true });
        if (await remainingClose.count()) await remainingClose.last().click({ timeout: 2500 });
        await page.waitForTimeout(700);
        const node = page.locator('.react-flow__node').first();
        const before = await node.boundingBox();
        await page.mouse.move(before.x + before.width / 2, before.y + 8);
        await page.mouse.down();
        await page.mouse.move(before.x + before.width / 2 + 90, before.y + 58, { steps: 10 });
        await page.mouse.up();
        await page.waitForTimeout(350);
        const after = await node.boundingBox();
        report.interaction.drag = { before, after, moved: Boolean(after && Math.abs(after.x - before.x) > 10) };
        await page.mouse.move(42, 449);
        await page.waitForTimeout(350);
        await page.mouse.click(42, 449);
        await page.waitForTimeout(650);
        const folder = page.getByText('夺舍计划 · 模拟材料', { exact: true });
        report.interaction.libraryFolderVisible = await folder.count() > 0;
        if (report.interaction.libraryFolderVisible) {
          await folder.click({ timeout: 2500 });
          await page.waitForTimeout(500);
          report.interaction.libraryAssetsVisible = await page.getByText('合成图片条目', { exact: true }).count() > 0 &&
            await page.getByText('合成文档条目', { exact: true }).count() > 0;
        }
      } catch (error) { report.interaction.error = error.message.slice(0, 600); }
    } else {
      await page.waitForTimeout(6000);
      report.nodesAfterExtendedWait = await page.locator('.react-flow__node').count();
      report.urlAfterExtendedWait = page.url();
    }
    const modules = [...new Map(report.responses.filter(item => item.path.endsWith('.js') && item.status === 200).map(item => [item.path, item])).values()];
    report.successfulJsModules = modules.length;
    report.successfulJsBytes = modules.reduce((sum, item) => sum + item.bytes, 0);
    await page.screenshot({ path: 'output/playwright/ablation-' + profile + '.png', fullPage: true });
    report.finishedAt = new Date().toISOString();
    const events = await (await page.request.get(origin + '/api/events')).json();
    report.diagnostics = events.events.filter(event => event.at >= report.startedAt && event.at <= report.finishedAt &&
      ['remote-fetch-attempt', 'remote-fetch-blocked', 'navigation-blocked'].includes(event.kind));
    const saved = await page.request.post(origin + '/api/events', { data: { source: 'ablation', kind: 'ablation-measured', detail: report } });
    if (!saved.ok()) throw new Error('Could not save ablation report: ' + profile);
    reports.push(report);
    await context.close();
  }
  return reports.map(report => ({ profile: report.profile, url: report.url, nodes: report.nodes, successfulJsModules: report.successfulJsModules,
    successfulJsBytes: report.successfulJsBytes, interaction: report.interaction, nodesAfterExtendedWait: report.nodesAfterExtendedWait,
    denied: report.denied, errors: report.errors }));
}
