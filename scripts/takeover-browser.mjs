export default async function measureTakeover(page) {
  const origin = 'http://127.0.0.1:17874';
  const context = page.context();
  const report = {
    startedAt: new Date().toISOString(), origin, mode: 'fixture-only-no-core',
    blockedHttp: [], blockedWs: [],
    requests: [], errors: [], consoleErrors: [], frames: []
  };
  const safeUrl = value => {
    try { const u = new URL(value); return u.origin + u.pathname; }
    catch { return String(value).slice(0, 250); }
  };
  await context.unroute('**/*');
  await context.route('**/*', async route => {
    const request = route.request();
    const u = new URL(request.url());
    if (u.origin === origin) {
      report.requests.push({ method: request.method(), path: u.pathname });
      await route.continue();
    } else {
      report.blockedHttp.push({ method: request.method(), url: safeUrl(u.href) });
      await route.abort('blockedbyclient');
    }
  });
  await context.routeWebSocket(/.*/, socket => {
    report.blockedWs.push(safeUrl(socket.url()));
    socket.close();
  });
  await context.addInitScript(() => {
    window.__DSH_FRAME_MEASUREMENT__ = { csp: [], errors: [] };
    addEventListener('securitypolicyviolation', event => {
      let blockedURI = event.blockedURI;
      try { const u = new URL(blockedURI); blockedURI = u.origin + u.pathname; } catch {}
      window.__DSH_FRAME_MEASUREMENT__.csp.push({ directive: event.effectiveDirective, blockedURI });
    });
    addEventListener('error', event => {
      window.__DSH_FRAME_MEASUREMENT__.errors.push(String(event.message || 'resource-error').slice(0, 300));
    });
  });
  page.on('pageerror', error => report.errors.push(error.message.slice(0, 700)));
  page.on('console', message => {
    if (message.type() === 'error') report.consoleErrors.push(message.text().slice(0, 1000));
  });
  const handleDialog = dialog => dialog.type() === 'beforeunload' ? dialog.accept() : dialog.dismiss();
  page.on('dialog', handleDialog);
  await page.goto(origin + '/takeover/');
  await page.waitForTimeout(5000);
  report.url = page.url();
  report.title = await page.title();
  report.body = (await page.locator('body').innerText()).slice(0, 12000);
  report.canvasNodeCount = await page.locator('.react-flow__node').count();
  report.fixtureBadge = await page.locator('#lcos-offline-fixture-badge').count();
  report.bridgePresent = await page.evaluate(() => Boolean(window.tapDesktop));
  report.apiChecks = await page.evaluate(async () => {
    const checks = [
      ['GET', '/health'], ['GET', '/api/compat/status'],
      ['GET', '/api/canvas/v1/canvases/offline-fixture-canvas'],
      ['GET', '/api/library/v1/spaces/SPACE_TYPE_PRIVATE/folders'],
      ['POST', '/api/canvas/v1/canvases/offline-fixture-canvas'],
      ['DELETE', '/api/library/v1/assets/test-not-real'],
      ['GET', '/api/unknown-not-real']
    ];
    const results = [];
    for (const [method, path] of checks) {
      const response = await fetch(path, {
        method, headers: { 'content-type': 'application/json' },
        ...(method === 'GET' ? {} : { body: '{}' })
      });
      results.push({ method, path, status: response.status, body: await response.json() });
    }
    return results;
  });
  report.navigationProbe = await page.evaluate(async () => {
    let fetchBlocked = false;
    try { await fetch('https://example.invalid/dsh-validation'); } catch { fetchBlocked = true; }
    const remoteOpenBlocked = window.open('https://example.invalid/dsh-validation') === null;
    const protocolOpenBlocked = window.open('tapnow://dsh-validation') === null;
    const anchor = document.createElement('a');
    anchor.href = 'tapnow://dsh-validation';
    anchor.textContent = 'isolated validation probe';
    document.body.append(anchor);
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    anchor.dispatchEvent(event);
    const protocolAnchorBlocked = event.defaultPrevented;
    anchor.remove();
    return { fetchBlocked, remoteOpenBlocked, protocolOpenBlocked, protocolAnchorBlocked,
      directLocationProtection: 'not-implemented; no direct custom-protocol navigation was attempted' };
  });
  for (const frame of page.frames()) {
    const frameMeasurement = await frame.evaluate(() => window.__DSH_FRAME_MEASUREMENT__).catch(() => undefined);
    report.frames.push({ url: safeUrl(frame.url()), measurement: frameMeasurement || null });
  }
  await page.screenshot({ path: 'output/playwright/dsh03-takeover-canvas.png', fullPage: true });
  report.finishedAt = new Date().toISOString();
  const eventResponse = await page.request.get(origin + '/api/events');
  const eventEnvelope = await eventResponse.json();
  report.diagnostics = eventEnvelope.events.filter(event =>
    event.at >= report.startedAt && event.at <= report.finishedAt &&
    ['remote-fetch-attempt', 'remote-fetch-blocked', 'csp-blocked', 'navigation-blocked', 'api-response'].includes(event.kind)
  );
  report.networkBoundary = 'Context HTTP routes continue only this exact loopback origin; all WebSockets close. CSP and fetch hooks may block attempts before context routes see them. Direct custom-protocol location navigation is not covered.';
  await page.request.post(origin + '/api/events', {
    data: { source: 'browser-validation', kind: 'takeover-browser-measured', detail: report }
  });
  page.off('dialog', handleDialog);
  return report;
}
