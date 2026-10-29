import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';

/** A disposable loopback leaf fixture, never the candidate server/Core. The
 * actual source-extracted Text/toolbar/menu functions are supplied by entry;
 * Markdown parsing, Radix and Flow positioning remain explicit test leaves. */
export async function runNativeTextActionsBrowserFixture({ entry, temp, root, dep, esbuild, agentFixtureModule }) {
  const output = path.join(root, 'output/原生文本整合_20261017e/独立原动作链浏览器');
  await fs.mkdir(output, { recursive: true });
  const outfile = path.join(temp, 'browser-fixture.js');
  await esbuild.build({ entryPoints: [entry], outfile, bundle: true, platform: 'browser', format: 'esm', target: 'es2022', jsx: 'automatic', logLevel: 'warning',
    plugins: [{ name: 'same-explicit-fixture-leaves', setup(build) {
      build.onResolve({ filter: /^\/lcos\/(native-flow|agent-ui)\.js$/ }, args => ({ path: args.path, namespace: 'fixture' }));
      build.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path.includes('native-flow')
        ? 'export const useViewport=()=>globalThis.__TEXT_ACTION_FIXTURE__.viewport;'
        : agentFixtureModule, loader: 'js' }));
      build.onResolve({ filter: /^[^./][^:]*$/ }, args => { try { return { path: dep.resolve(args.path) }; } catch {} });
    } }] });
  const donorCSS = await Promise.all(['index-C0AQWjts.css', 'course-api-base-url-qS4rKGhC.css'].map(name =>
    fs.readFile(path.join(root, 'reference/tapnow-installed/resources/web/assets', name), 'utf8')));
  const fixtureCSS = await fs.readFile(outfile.replace(/\.js$/, '.css'), 'utf8');
  const initialization = function initialize() {
    const listeners = new Set(), portListeners = new Set(), body = '# 原文\n' + Array.from({ length: 90 }, (_, index) => `第 ${index + 1} 行正文：长文应该在原文本区域内滚动。`).join('\n');
    const reference = { version: 1, entityType: 'artifact', entityId: 'artifact', artifactId: 'artifact', artifactViewId: 'view', revisionId: 'r1' };
    const fixture = window.__TEXT_ACTION_FIXTURE__ = {
      node: { id: 'node', type: 'text', data: { title: '合成文本', text: body, lcos_ref: reference }, width: 360, height: 280, position: { x: 100, y: 110 } },
      viewport: { x: 0, y: 0, zoom: 1 }, events: [], pending: null, queued: null, mapDrafts: new Map(), failRead: false, viewerReady: true,
      notifyPort: () => [...portListeners].forEach(listener => listener()),
    };
    fixture.api = {
      getNodes: () => [fixture.node], getNode: id => id === 'node' ? fixture.node : undefined, getEdges: () => [], getViewport: () => fixture.viewport,
      getSelection: () => ({ nodeIds: ['node'], edgeIds: [] }), subscribeNative: listener => { listeners.add(listener); return () => listeners.delete(listener); },
      updateNode: (id, patch) => { fixture.node = { ...fixture.node, ...patch }; [...listeners].forEach(listener => listener()); },
      updateNodeData: (id, patch) => { fixture.node = { ...fixture.node, data: { ...fixture.node.data, ...patch } }; [...listeners].forEach(listener => listener()); },
      fitView: async () => true, deleteElements: input => fixture.events.push({ kind: 'delete', input }),
    };
    window.__LCOS_NODE_LAB__ = { projectId: 'project', canvasId: 'canvas', currentCanvasId: 'canvas', api: fixture.api };
    window.__LCOS_NATIVE_TEXT_SAVE_PORT__ = {
      subscribe: listener => { portListeners.add(listener); return () => portListeners.delete(listener); },
      getPending: () => fixture.pending, readQueuedAutosave: () => fixture.queued, acknowledge: () => false,
      verify: async operationId => ({ status: 'unconfirmed', operationId, reason: 'HTTP 503 internal_uuid_do_not_display' }),
      resumeAutosave: () => false,
    };
    window.fetch = async route => fixture.failRead ? Response.json({ ok: false, error: { message: 'HTTP 503 internal_uuid_do_not_display' } }, { status: 503 })
      : Response.json({ ok: true, value: String(route).includes('canvas-text?')
        ? { projectId: 'project', canvasId: 'canvas', spatialId: 'node', artifactId: 'artifact', viewId: 'view', revisionId: 'r1', fileRecordId: 'file', title: '合成文本', body }
        : { artifact: { id: 'artifact', projectId: 'project', kind: 'text', managed: true, currentRevisionId: 'r1', availability: 'available' } } });
    window.IS_REACT_ACT_ENVIRONMENT = true;
  };
  const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>独立原动作链组件验证</title><style>${donorCSS.join('\n')}\n${fixtureCSS}
    body{margin:0;background:#f5f6f5;color:#242625}#fixture{padding:140px 30px 30px}
    [data-original-node-shell]{width:var(--fixture-node-width,360px);height:280px;border:1px solid #d9ded9;border-radius:16px;background:white;overflow:hidden}
    body>div{position:relative;margin:140px 30px 30px;width:var(--fixture-node-width,360px)}
    [data-original-float]{position:absolute;top:0;left:0;width:100%;--float-scale:1}
    [role=menu]{position:absolute;top:10px;left:0;z-index:50;background:white;color:#242625;padding:8px;border:1px solid #ddd;border-radius:12px}
    [role=menuitem]{display:block;padding:6px 10px;width:100%;text-align:left;color:#242625}
    [data-markdown-leaf] p{margin:0 0 8px;line-height:22px}
    </style><body><script>(${initialization.toString()})()</script><script type="module">import * as app from '/fixture.js';window.fixtureApp=app;await app.render();window.fixtureReady=true;</script></body></html>`;
  const server = http.createServer(async (request, response) => {
    if (request.method !== 'GET') { response.writeHead(405); response.end(); return; }
    if (request.url === '/') { response.setHeader('content-type', 'text/html; charset=utf-8'); response.end(html); }
    else if (request.url === '/fixture.js') { response.setHeader('content-type', 'text/javascript'); response.end(await fs.readFile(outfile)); }
    else { response.writeHead(404); response.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const { chromium } = dep('playwright-core');
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
    args: ['--disable-background-networking', '--disable-sync', '--no-first-run'] });
  const context = await browser.newContext({ viewport: { width: 1000, height: 700 }, locale: 'zh-CN', serviceWorkers: 'block' });
  const report = { passed: false, scope: 'disposable Chrome; actual original e4/r4/s4/n4/ua/rBe/iBe/xl/zde/JT/Vde/Hde + real owner; controlled Markdown/Radix/Flow leaves, no full-app focus/portal/scaling claim',
    candidateWrites: 0, realCoreWrites: 0, models: 0, errors: [], blocked: [], measurements: [], screenshots: [] };
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin !== origin || route.request().method() !== 'GET') {
      report.blocked.push(route.request().url()); return route.abort();
    }
    return route.continue();
  });
  await context.routeWebSocket('**/*', socket => socket.close());
  const page = await context.newPage(); page.on('pageerror', error => report.errors.push(error.message));
  const shot = async name => { const file = path.join(output, name); await page.screenshot({ path: file, fullPage: true }); report.screenshots.push(file); };
  try {
    await page.goto(origin); await page.waitForFunction(() => window.fixtureReady && document.querySelector('[data-native-first-state="ready"]'));
    await page.getByTestId('lcos-native-text-view-menu').getByRole('button').click();
    assert.equal(await page.getByRole('menuitem', { name: '正文', exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole('menuitem', { name: '导图', exact: true }).isEnabled(), true);
    assert.equal(await page.getByTestId('canvas-node-toolbar').count(), 1); await shot('01-原动作带与原菜单.png');
    await page.getByTestId('lcos-native-text-view-menu').getByRole('button').click();
    for (const width of [360, 320]) {
      await page.evaluate(async width => {
        document.documentElement.style.setProperty('--fixture-node-width', width + 'px');
        const f = window.__TEXT_ACTION_FIXTURE__; f.node.width = width; f.viewport.zoom = width === 320 ? .65 : 1;
        await window.fixtureApp.render();
      }, width);
      const measurement = await page.evaluate(() => {
        const body = document.querySelector('[data-testid="original-text-content"]'), toolbar = document.querySelector('[data-testid="canvas-node-toolbar"]');
        return { width: document.querySelector('[data-original-node-shell]').clientWidth, toolbarCount: document.querySelectorAll('[data-testid="canvas-node-toolbar"]').length,
          moreCount: document.querySelectorAll('[data-testid="lcos-native-text-view-menu"]').length, originalToolGroups: toolbar.querySelectorAll(':scope > ul').length,
          toolbarTop: toolbar.style.top, bodyClientHeight: body.clientHeight, bodyScrollHeight: body.scrollHeight, bodyOverflow: getComputedStyle(body).overflowY };
      });
      assert.equal(measurement.toolbarCount, 1); assert.equal(measurement.moreCount, 1); assert.equal(measurement.originalToolGroups, 4);
      assert.equal(measurement.toolbarTop, width === 320 ? '-60px' : '-48px');
      report.measurements.push(measurement);
    }
    await page.evaluate(async () => {
      const f = window.__TEXT_ACTION_FIXTURE__;
      f.pending = { operationId: 'A', status: 'unknown', canvasId: 'canvas', nodeId: 'node', artifactId: 'artifact' };
      await window.fixtureApp.update(() => f.notifyPort());
    });
    await page.getByTestId('lcos-native-text-view-menu').getByRole('button').click();
    await page.getByRole('menuitem', { name: '核对原保存', exact: true }).click();
    await page.getByRole('status').waitFor();
    await page.evaluate(async () => { const f = window.__TEXT_ACTION_FIXTURE__; f.pending = null; await window.fixtureApp.update(() => f.notifyPort()); f.failRead = true; });
    await page.getByRole('button', { name: '重读正文', exact: true }).click();
    await page.getByRole('status').filter({ hasText: '正文版本暂时无法核对' }).waitFor();
    const failure = await page.evaluate(() => {
      const body = document.querySelector('[data-testid="original-text-content"]'), status = document.querySelector('[role=status]');
      body.scrollTop = 100;
      return { label: '320px长正文与两条真实失败提示', nodeHeight: document.querySelector('[data-original-node-shell]').clientHeight,
        bodyClientHeight: body.clientHeight, bodyScrollHeight: body.scrollHeight, bodyOverflow: getComputedStyle(body).overflowY, scrollTop: body.scrollTop,
        statusHeight: status.getBoundingClientRect().height, statusOverflow: getComputedStyle(status).overflowY, statusText: status.textContent,
        secondToolbar: document.querySelectorAll('.native-first-toolbar').length };
    });
    assert.ok(failure.bodyClientHeight > 80 && failure.bodyScrollHeight > failure.bodyClientHeight && failure.scrollTop > 0);
    assert.ok(failure.statusHeight < failure.nodeHeight * .55); assert.equal(failure.bodyOverflow, 'auto'); assert.equal(failure.secondToolbar, 0);
    assert.ok(failure.statusText.includes('草稿已保留') && failure.statusText.includes('正文版本暂时无法核对'));
    assert.ok(!/HTTP|internal_uuid/.test(failure.statusText)); report.measurements.push(failure); await shot('02-320窄卡正文与失败状态均可滚动.png');
    assert.deepEqual(report.errors, []); report.passed = true;
  } catch (error) { report.failure = String(error.stack ?? error); }
  finally { await context.close(); await browser.close(); await new Promise(resolve => server.close(resolve));
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); }
  return report;
}
