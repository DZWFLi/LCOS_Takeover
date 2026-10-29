import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { inflateSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const origin = 'http://127.0.0.1:17880';
const visualRoot = 'E:/AppMoved/.codex/visualizations/2026/10/12/01a131ff-c4d7-7b41-86a3-c67738f5917b';
const paramsProbe = process.argv.includes('--params-probe');
const evidencePath = path.join(root, 'evidence', paramsProbe ? 'surface-core-browser-params-probe.json' : 'surface-core-browser.json');
const { chromium } = createRequire('E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/package.json')('playwright-core');

const report = {
  at: new Date().toISOString(),
  target: origin,
  flow: 'original TapNow shell → Main/Context/Workflow Dock → Core-backed node edit and route persistence',
  browser: {
    engine: 'Chrome',
    headless: true,
    freshContext: true,
    viewport: { width: 1440, height: 1000 },
    locale: 'zh-CN',
    serviceWorkers: 'blocked',
    browserPlugin: 'unavailable in this session; using the explicitly requested installed playwright-core',
    dependenciesInstalled: false,
  },
  cases: [],
  pageErrors: [],
  consoleErrors: [],
  localFailedResponses: [],
  batchActionResponses: [],
  batchActionFailures: [],
  network: {
    externalHttpBlocked: [],
    nonHttpBlocked: [],
    webSocketsClosed: [],
    preNetworkExternalBlocked: [],
    policy: 'Only HTTP(S) requests whose origin exactly matches 127.0.0.1:17880 continue. All observed WebSockets are closed.',
  },
  httpBoundary: {
    probes: [],
    unsupportedUiCapabilitiesNotExercised: ['copy', 'delete', 'upload', 'rename'],
  },
  screenshots: {
    main: path.join(visualRoot, 'tapnow-real-core-surface-main.png'),
    context: path.join(visualRoot, 'tapnow-real-core-surface-context.png'),
    mobile: path.join(visualRoot, 'tapnow-real-core-surface-mobile.png'),
  },
  notes: [
    'All Core and canvas reads use the local HTTP API. No database, account profile, credentials, or existing browser profile is opened.',
    'Browser-triggered external blocks are expected network-boundary evidence; console errors are retained separately and are not reported as zero by assumption.',
  ],
};

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const safeUrl = value => {
  try {
    const url = new URL(value);
    return url.protocol + '//' + url.host + url.pathname;
  } catch {
    return String(value).slice(0, 300);
  }
};
const cleanText = value => String(value)
  .replace(/((?:token|secret|credential|authorization|api.?key)\s*[:=]\s*)[^\s,;]+/ig, '$1[redacted]')
  .replace(/https?:\/\/[^\s"'<>]+/g, value => safeUrl(value))
  .slice(0, 1000);
const safeParamValueKeys = new Set(['width', 'height', 'quality', 'aspectRatio', 'steps', 'duration', 'seed', 'mode', 'size', 'count', 'scale', 'format', 'strength', 'guidanceScale', 'cfgScale', 'model', 'provider']);
function summarizeParams(value) {
  if (value === undefined) return { present: false, type: 'undefined' };
  if (value === null) return { present: true, type: 'null', value: null };
  if (Array.isArray(value)) return { present: true, type: 'array', length: value.length, empty: value.length === 0, value: value.length === 0 ? [] : '[non-empty values omitted]' };
  if (typeof value === 'object') {
    const entries = Object.entries(value);
    const safeValues = {};
    for (const [key, entryValue] of entries) {
      if (safeParamValueKeys.has(key) && !/(token|secret|api|key|password|credential|authorization)/i.test(key)
        && (entryValue === null || ['string', 'number', 'boolean'].includes(typeof entryValue))) {
        safeValues[key] = entryValue;
      }
    }
    return {
      present: true,
      type: 'object',
      empty: entries.length === 0,
      keys: entries.map(([key]) => /(token|secret|api|key|password|credential|authorization)/i.test(key) ? '[redacted-key]' : key),
      ...(entries.length === 0 ? { value: {} } : {}),
      ...(Object.keys(safeValues).length ? { safeValues } : {}),
    };
  }
  if (typeof value === 'number' || typeof value === 'boolean') return { present: true, type: typeof value, value };
  return { present: true, type: typeof value, value: '[string omitted]' };
}

async function fetchJson(route, options = {}) {
  const response = await fetch(origin + route, options);
  let body;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { response, body };
}

async function readStatus() {
  const { response, body } = await fetchJson('/api/surface-core/status', {
    headers: { accept: 'application/json' },
  });
  assert.equal(response.status, 200, 'surface-core status API must be readable');
  assert.equal(body?.code, 0, 'surface-core status envelope code must be 0');
  return body.data;
}

async function readCanvas(canvasId) {
  const { response, body } = await fetchJson('/api/canvas/v1/canvases/' + encodeURIComponent(canvasId), {
    headers: { accept: 'application/json' },
  });
  assert.equal(response.status, 200, 'canvas read failed for ' + canvasId);
  assert.ok(Array.isArray(body?.data?.nodes), 'canvas detail must return data.nodes');
  return body.data;
}

async function readPngSummary(src) {
  const url = new URL(src, origin);
  assert.equal(url.origin, origin, 'image bytes must stay on the approved loopback origin');
  const response = await fetch(url);
  const bytes = Buffer.from(await response.arrayBuffer());
  const isPng = bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const idat = [];
  let hasIend = false;
  if (isPng) {
    for (let offset = 8; offset + 12 <= bytes.length;) {
      const length = bytes.readUInt32BE(offset);
      const type = bytes.subarray(offset + 4, offset + 8).toString('ascii');
      const dataStart = offset + 8;
      const dataEnd = dataStart + length;
      if (dataEnd + 4 > bytes.length) break;
      if (type === 'IDAT') idat.push(bytes.subarray(dataStart, dataEnd));
      if (type === 'IEND') {
        hasIend = true;
        break;
      }
      offset = dataEnd + 4;
    }
  }
  let decompressedBytes = 0;
  let inflateError = null;
  try {
    const decoded = inflateSync(Buffer.concat(idat));
    decompressedBytes = decoded.length;
  } catch (error) {
    inflateError = cleanText(error?.message || error);
  }
  return {
    status: response.status,
    contentType: response.headers.get('content-type'),
    bytes: bytes.length,
    isPng,
    hasIend,
    width: isPng ? bytes.readUInt32BE(16) : null,
    height: isPng ? bytes.readUInt32BE(20) : null,
    decompressedBytes,
    inflateError,
  };
}

async function recordCase(name, operation) {
  try {
    const detail = await operation();
    report.cases.push({ name, passed: true, detail: detail ?? null });
    console.log('PASS ' + name);
    return true;
  } catch (error) {
    const message = cleanText(error?.stack || error);
    report.cases.push({ name, passed: false, error: message });
    report.failures ??= [];
    report.failures.push({ name, error: message });
    console.error('FAIL ' + name + ': ' + cleanText(error?.message || error));
    return false;
  }
}

function workspaceBySurface(status) {
  return Object.fromEntries(status.workspaces.map(item => [item.preferredSurface, item]));
}

const textNodeOf = detail => detail.nodes.find(node => node.type === 'text');
const imageNodeOf = detail => detail.nodes.find(node => node.type === 'image');
const normalizeMarkdown = value => String(value || '')
  .replace(/^\s{0,3}#{1,6}\s*/gm, '')
  .replace(/\*\*|__/g, '')
  .replace(/^\s*>\s?/gm, '')
  .replace(/\r?\n/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();
const textNeedle = value => normalizeMarkdown(value).slice(0, 48);
function isExpectedBackgroundResponse(item) {
  if (item.method !== 'GET' || item.status !== 501 || !workspaces) return false;
  let pathname;
  try { pathname = new URL(item.url).pathname; } catch { return false; }
  if (pathname === '/api/bff/platform/config') return true;
  if (pathname === '/api/billing/v2/wallet/balance') return true;
  const canvasIds = new Set(Object.values(workspaces).map(workspace => workspace.canvasId));
  return Array.from(canvasIds).some(canvasId => pathname === '/api/v1/canvas/plugins/' + encodeURIComponent(canvasId));
}
function isExpectedNavigationReadAbort(item) {
  if (item.method !== 'GET' || item.failure !== 'net::ERR_ABORTED') return false;
  try { return new URL(item.url).pathname === '/api/surface-core/status'; } catch { return false; }
}
function classifyConsoleError(item) {
  const message = item.text || '';
  if (message.includes('[Statsig]') && message.includes('Offline experiment blocks remote fetch')) return 'expected_offline_external_block';
  if (message.includes('violates the following Content Security Policy directive') && message.includes('client-edge.tapnow.media')) return 'expected_external_csp_block';
  let pathname;
  try { pathname = new URL(item.location).pathname; } catch { pathname = ''; }
  if (isExpectedBackgroundResponse({ method: 'GET', status: 501, url: item.location })) return 'expected_unconnected_background';
  return 'unexplained';
}

await mkdir(path.dirname(evidencePath), { recursive: true });
await mkdir(visualRoot, { recursive: true });

let browser;
let context;
let page;
let status;
let workspaces;
let initialDetails;
const pendingFailureDetails = [];

try {
  await recordCase('service health identifies the original TapNow + real Core profile', async () => {
    const { response, body } = await fetchJson('/health');
    assert.equal(response.status, 200);
    assert.equal(body?.profile, 'original-tapnow-real-core-three-workspaces');
    assert.equal(body?.realCoreConnected, true);
    return { profile: body.profile, realCoreConnected: body.realCoreConnected };
  });

  await recordCase('Core status resolves three distinct real workspaces', async () => {
    status = await readStatus();
    assert.equal(typeof status.projectId, 'string');
    assert.ok(status.projectId.length > 0);
    assert.equal(status.core?.connected, true);
    assert.equal(typeof status.core?.origin, 'string');
    const coreOrigin = new URL(status.core.origin);
    assert.equal(coreOrigin.protocol, 'http:');
    assert.equal(coreOrigin.hostname, '127.0.0.1');
    assert.equal(status.workspaces.length, 3);
    workspaces = workspaceBySurface(status);
    assert.deepEqual(Object.keys(workspaces).sort(), ['context', 'main', 'workflow']);
    assert.equal(new Set(status.workspaces.map(item => item.id)).size, 3);
    assert.equal(new Set(status.workspaces.map(item => item.canvasId)).size, 3);
    assert.ok(status.workspaces.every(item => item.name && item.canvasId));
    return {
      connected: status.core.connected,
      coreOrigin: safeUrl(status.core.origin),
      projectId: status.projectId,
      workspaces: status.workspaces.map(({ id, name, preferredSurface, canvasId }) => ({ id, name, preferredSurface, canvasId })),
    };
  });

  if (status && workspaces) {
    await recordCase('each real canvas contains one independent image and text projection', async () => {
      initialDetails = Object.fromEntries(await Promise.all(
        ['main', 'context', 'workflow'].map(async surface => [surface, await readCanvas(workspaces[surface].canvasId)]),
      ));
      const textContents = [];
      for (const surface of ['main', 'context', 'workflow']) {
        const detail = initialDetails[surface];
        assert.equal(detail.nodes.length, 2, surface + ' should contain exactly two original nodes');
        assert.ok(textNodeOf(detail)?.data?.text, surface + ' text projection is empty');
        assert.ok(imageNodeOf(detail)?.data?.src, surface + ' image projection has no source');
        textContents.push(textNodeOf(detail).data.text);
      }
      assert.equal(new Set(textContents).size, 3, 'workspace text content must be isolated');
      return { surfaces: ['main', 'context', 'workflow'], nodeCounts: [2, 2, 2], distinctTextBodies: 3 };
    });
  }
  browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--disable-background-networking', '--disable-sync', '--disable-component-update', '--no-first-run'],
  });
  context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: 'zh-CN',
    serviceWorkers: 'block',
  });
  await context.route('**/*', async route => {
    const raw = route.request().url();
    let url;
    try {
      url = new URL(raw);
    } catch {
      report.network.nonHttpBlocked.push({ url: cleanText(raw), reason: 'invalid URL' });
      return route.abort('blockedbyclient');
    }
    if (!['http:', 'https:'].includes(url.protocol)) {
      report.network.nonHttpBlocked.push({ url: safeUrl(raw), protocol: url.protocol });
      return route.abort('blockedbyclient');
    }
    if (url.origin !== origin) {
      const item = { origin: url.origin, url: safeUrl(raw), method: route.request().method() };
      if (!report.network.externalHttpBlocked.some(previous => previous.url === item.url && previous.method === item.method)) {
        report.network.externalHttpBlocked.push(item);
      }
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  await context.routeWebSocket('**/*', socket => {
    report.network.webSocketsClosed.push({ url: safeUrl(socket.url()) });
    socket.close();
  });
  page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on('pageerror', error => report.pageErrors.push(cleanText(error?.stack || error)));
  page.on('console', message => {
    if (message.type() === 'error') {
      report.consoleErrors.push({
        text: cleanText(message.text()),
        location: message.location()?.url ? safeUrl(message.location().url) : '',
      });
    }
  });
  page.on('response', response => {
    if (response.status() < 400) {
      let successUrl;
      try { successUrl = new URL(response.url()); } catch { successUrl = null; }
      if (successUrl?.origin === origin && successUrl.pathname.endsWith('/nodes:batchActions') && response.request().method() === 'POST') {
        let requestShape = null;
        try {
          const body = response.request().postDataJSON();
          requestShape = {
            canvasId: body?.canvas_id ?? null,
            actionKinds: Array.isArray(body?.actions) ? body.actions.map(action => action?.action ?? null) : [],
            actions: Array.isArray(body?.actions) ? body.actions.map(action => ({
              kind: action?.action ?? null,
              patches: Array.isArray(action?.updates) ? action.updates.map(patch => ({
                id: patch?.id ?? null,
                keys: Object.keys(patch || {}),
                dataKeys: Object.keys(patch?.data || {}),
                params: summarizeParams(patch?.data?.params),
              })) : [],
              creates: Array.isArray(action?.creates) ? action.creates.length : 0,
            })) : [],
            revisionKeys: Object.keys(body?.lcos_expected_revisions || {}),
          };
        } catch {
          requestShape = { parseError: 'request JSON unavailable' };
        }
        const summary = { request: requestShape, response: { status: response.status() } };
        report.batchActionResponses.push(summary);
        console.log('BATCH_OK ' + JSON.stringify(summary));
      }
    }
    if (response.status() >= 400) {
      let url;
      try { url = new URL(response.url()); } catch { return; }
      if (url.origin === origin) {
        report.localFailedResponses.push({
          method: response.request().method(),
          url: safeUrl(response.url()),
          status: response.status(),
        });
        if (url.pathname.endsWith('/nodes:batchActions') && response.request().method() === 'POST') {
          let requestShape = null;
          try {
            const body = response.request().postDataJSON();
            requestShape = {
              canvasId: body?.canvas_id ?? null,
              actionKinds: Array.isArray(body?.actions) ? body.actions.map(action => action?.action ?? null) : [],
              actions: Array.isArray(body?.actions) ? body.actions.map(action => ({
                kind: action?.action ?? null,
                keys: Object.keys(action || {}),
                patches: Array.isArray(action?.updates) ? action.updates.map(patch => ({
                  id: patch?.id ?? null,
                  keys: Object.keys(patch || {}),
                  dataKeys: Object.keys(patch?.data || {}),
                  params: summarizeParams(patch?.data?.params),
                })) : [],
                creates: Array.isArray(action?.creates) ? action.creates.length : 0,
              })) : [],
              revisionKeys: Object.keys(body?.lcos_expected_revisions || {}),
            };
          } catch {
            requestShape = { parseError: 'request JSON unavailable' };
          }
          pendingFailureDetails.push((async () => {
            let errorBody = null;
            try { errorBody = await response.json(); } catch { /* Preserve only the status when no JSON envelope exists. */ }
            const summary = {
              request: requestShape,
              response: {
                code: errorBody?.error?.code ?? errorBody?.code ?? null,
                message: cleanText(errorBody?.error?.message ?? errorBody?.message ?? ''),
              },
            };
            report.batchActionFailures.push(summary);
            console.error('BATCH_FAIL ' + JSON.stringify(summary));
          })());
        }
      }
    }
  });
  page.on('requestfailed', request => {
    let url;
    try { url = new URL(request.url()); } catch { return; }
    if (url.origin === origin) {
      report.localFailedResponses.push({
        method: request.method(),
        url: safeUrl(request.url()),
        failure: cleanText(request.failure()?.errorText || 'request failed'),
      });
    }
  });
  page.on('dialog', dialog => {
    if (dialog.type() === 'beforeunload') void dialog.accept();
    else void dialog.dismiss();
  });

  if (status && workspaces && initialDetails) {
    const main = workspaces.main;
    await page.goto(origin + '/canvas/' + encodeURIComponent(main.canvasId), {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.waitForFunction(() => !!window.__LCOS_NODE_LAB__?.api, null, { timeout: 45000 });
    await page.waitForFunction(() => document.querySelectorAll('.react-flow__node').length === 2, null, { timeout: 45000 });
    await page.getByRole('navigation', { name: '工作现场' }).waitFor();

    const pageNodes = () => page.evaluate(() => ({
      canvasId: window.__LCOS_NODE_LAB__?.canvasId,
      mode: window.__LCOS_NODE_LAB__?.mode,
      nodes: window.__LCOS_NODE_LAB__?.api?.getNodes?.() || [],
      url: location.pathname,
      title: document.title,
    }));
    const nodeLocator = id => page.locator('.react-flow__node[data-id="' + id + '"]');
    const dock = () => page.getByRole('navigation', { name: '工作现场' });
    const waitForLoadingOverlayHidden = () => page.getByRole('status', { name: 'Loading canvas', exact: true })
      .waitFor({ state: 'hidden', timeout: 12000 });
    await waitForLoadingOverlayHidden();

    await recordCase('original non-empty ReactFlow root and existing shell controls remain', async () => {
      const state = await pageNodes();
      const roots = await page.locator('.react-flow').count();
      assert.equal(roots, 1, 'expected one original ReactFlow root');
      assert.equal(state.nodes.length, 2);
      assert.equal(state.canvasId, main.canvasId);
      assert.equal(state.mode, 'real-core-headless-huabu');
      assert.ok(state.url.includes(main.canvasId), 'URL should address the active canvas');
      const rename = page.getByRole('button', { name: '重命名画布', exact: true });
      assert.equal(await rename.count(), 1);
      assert.equal(await rename.isVisible(), true, 'original canvas rename control should remain visible');
      const oldSwitcher = page.locator('[data-testid="canvas-header-switcher-trigger"]');
      const oldSwitcherCount = await oldSwitcher.count();
      const oldSwitcherVisible = oldSwitcherCount ? await oldSwitcher.first().isVisible() : false;
      assert.equal(oldSwitcherVisible, false, 'legacy canvas switcher should be hidden');
      const frameworkOverlays = await page.locator('nextjs-portal, vite-error-overlay, #webpack-dev-server-client-overlay').count();
      assert.equal(frameworkOverlays, 0, 'no framework error overlay should be mounted');
      return {
        title: state.title,
        path: state.url,
        reactFlowRoots: roots,
        originalNodes: state.nodes.length,
        frameworkOverlays,
        renameVisible: true,
        legacySwitcherMounted: oldSwitcherCount > 0,
        legacySwitcherVisible: oldSwitcherVisible,
      };
    });

    await recordCase('Dock renders exactly Main, Context, Workflow and selects the active Main canvas', async () => {
      const nav = dock();
      const labels = await nav.getByRole('button').evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label')));
      assert.deepEqual(labels, ['Main', 'Context', 'Workflow']);
      assert.equal(await nav.getByRole('button', { name: 'Main', exact: true }).getAttribute('aria-pressed'), 'true');
      assert.equal(await nav.getByRole('button', { name: 'Context', exact: true }).getAttribute('aria-pressed'), 'false');
      assert.equal(await nav.getByRole('button', { name: 'Workflow', exact: true }).getAttribute('aria-pressed'), 'false');
      return { labels, selected: 'Main' };
    });

    if (paramsProbe) {
      report.executionScope = 'diagnostic-only: one original text-editor update to capture safe params shape; not a full QA pass';
      await recordCase('capture one original text-editor batchActions payload params safely', async () => {
        const textId = textNodeOf(initialDetails.main).id;
        const editorNode = nodeLocator(textId).locator('[data-testid="canvas-node-text-content"]');
        await editorNode.dblclick();
        const dialog = page.getByRole('dialog');
        await dialog.waitFor({ state: 'visible' });
        const editor = dialog.locator('[contenteditable="true"]').first();
        const label = 'Params probe ' + Date.now();
        await editor.fill(label);
        await dialog.getByRole('button', { name: '关闭', exact: true }).first().click();
        await dialog.waitFor({ state: 'hidden', timeout: 15000 });
        await delay(100);
        const deadline = Date.now() + 2500;
        while (report.batchActionFailures.length + report.batchActionResponses.length === 0 && Date.now() < deadline) await delay(25);
        const captured = report.batchActionFailures[0] ?? report.batchActionResponses[0];
        assert.ok(captured, 'expected a captured original text update response');
        const patch = captured.request?.actions?.flatMap(action => action.patches || []).find(item => item.id === textId);
        assert.ok(patch, 'captured failure should include the original text node patch');
        return {
          canvasId: captured.request.canvasId,
          nodeId: patch.id,
          changedLabel: label,
          params: patch.params,
          response: captured.response,
          waitAfterCloseMs: 100,
        };
      });
    } else {
    await recordCase('Main renders real image bytes and its own original text node', async () => {
      const detail = initialDetails.main;
      const image = imageNodeOf(detail);
      const text = textNodeOf(detail);
      const imageSelector = '.react-flow__node[data-id="' + image.id + '"] img';
      await page.waitForFunction(selector => {
        const img = document.querySelector(selector);
        return Boolean(img && img.complete && img.naturalWidth > 0);
      }, imageSelector, { timeout: 20000 });
      const imageInfo = await nodeLocator(image.id).locator('img').evaluate(img => ({
        complete: img.complete,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
      }));
      assert.equal(imageInfo.complete, true);
      assert.ok(imageInfo.naturalWidth > 0 && imageInfo.naturalHeight > 0);
      const imageBytes = await readPngSummary(image.data.src);
      assert.equal(imageBytes.status, 200);
      const pixelInfo = await nodeLocator(image.id).locator('img').evaluate(async img => {
        const result = {
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          sampleWidth: Math.min(img.naturalWidth, 128),
          sampleHeight: Math.min(img.naturalHeight, 128),
          nonTransparentPixels: 0,
          distinctNonTransparentColors: 0,
          decodeError: null,
        };
        try {
          await img.decode();
          const canvas = document.createElement('canvas');
          canvas.width = result.sampleWidth;
          canvas.height = result.sampleHeight;
          const context = canvas.getContext('2d', { willReadFrequently: true });
          if (!context) throw new Error('2D canvas context unavailable');
          context.drawImage(img, 0, 0, result.sampleWidth, result.sampleHeight);
          const pixels = context.getImageData(0, 0, result.sampleWidth, result.sampleHeight).data;
          const colors = new Set();
          for (let index = 0; index < pixels.length; index += 4) {
            if (pixels[index + 3] > 0) {
              result.nonTransparentPixels += 1;
              colors.add(pixels[index] + ',' + pixels[index + 1] + ',' + pixels[index + 2] + ',' + pixels[index + 3]);
            }
          }
          result.distinctNonTransparentColors = colors.size;
        } catch (error) {
          result.decodeError = String(error?.message || error).slice(0, 300);
        }
        return result;
      });
      report.imageDiagnostics = { imageBytes, pixelInfo };
      const renderedText = await nodeLocator(text.id).innerText();
      const expectedNeedle = textNeedle(text.data.text);
      assert.ok(expectedNeedle.length > 0 && normalizeMarkdown(renderedText).includes(expectedNeedle), 'rendered text should match the live GET body after Markdown normalization');
      const hitDiagnostics = {};
      for (const id of [image.id, text.id]) {
        const box = await nodeLocator(id).boundingBox();
        assert.ok(box && box.width > 20 && box.height > 20, 'original node should have a visible screen box');
        hitDiagnostics[id] = await page.evaluate(({ x, y, selector }) => {
          const hit = document.elementFromPoint(x, y);
          const target = document.querySelector(selector);
          const ancestors = [];
          for (let element = hit, depth = 0; element && depth < 7; element = element.parentElement, depth += 1) {
            ancestors.push({
              tag: element.tagName,
              className: typeof element.className === 'string' ? element.className.slice(0, 180) : '',
              id: element.id || '',
            });
          }
          return {
            point: { x: Math.round(x), y: Math.round(y) },
            hitTag: hit?.tagName ?? null,
            hitClass: typeof hit?.className === 'string' ? hit.className.slice(0, 180) : '',
            insideTargetNode: Boolean(hit && target && (hit === target || target.contains(hit))),
            ancestors,
          };
        }, { x: box.x + box.width / 2, y: box.y + box.height / 2, selector: '.react-flow__node[data-id="' + id + '"]' });
      }
      await page.screenshot({ path: report.screenshots.main, fullPage: false });
      assert.ok(imageBytes.bytes > 24 && imageBytes.isPng && imageBytes.hasIend);
      assert.equal(imageBytes.inflateError, null, 'PNG IDAT must be valid DEFLATE data: ' + JSON.stringify(imageBytes));
      assert.ok(imageBytes.decompressedBytes > 0);
      assert.equal(pixelInfo.decodeError, null, 'browser must decode the original image data: ' + JSON.stringify(pixelInfo));
      assert.ok(pixelInfo.nonTransparentPixels > 0, 'actual decoded image pixels must include non-transparent content');
      return {
        imageNodeId: image.id,
        imageInfo,
        imageBytes,
        pixelInfo,
        textNodeId: text.id,
        renderedText: renderedText.slice(0, 160),
        hitDiagnostics,
        screenshot: report.screenshots.main,
      };
    });

    async function switchTo(surface) {
      const target = workspaces[surface];
      await dock().getByRole('button', { name: surface[0].toUpperCase() + surface.slice(1), exact: true }).click();
      await page.waitForFunction(expected => {
        const lab = window.__LCOS_NODE_LAB__;
        return location.pathname.includes(expected) && lab?.canvasId === expected && !!lab?.api;
      }, target.canvasId, { timeout: 30000 });
      await page.waitForFunction(() => document.querySelectorAll('.react-flow__node').length === 2, null, { timeout: 20000 });
      await waitForLoadingOverlayHidden();
      const detail = await readCanvas(target.canvasId);
      const state = await pageNodes();
      const expectedIds = detail.nodes.map(node => node.id).sort();
      const visibleIds = state.nodes.map(node => node.id).sort();
      assert.deepEqual(visibleIds, expectedIds);
      const text = textNodeOf(detail);
      const renderedText = await nodeLocator(text.id).innerText();
      assert.ok(renderedText.length > 0);
      const normalizedRenderedText = normalizeMarkdown(renderedText);
      assert.ok(normalizedRenderedText.includes(textNeedle(text.data.text)), 'visible text should match the active canvas GET body after Markdown normalization');
      for (const otherSurface of ['main', 'context', 'workflow'].filter(item => item !== surface)) {
        const otherNeedle = textNeedle(textNodeOf(initialDetails[otherSurface]).data.text);
        if (otherNeedle && otherNeedle !== textNeedle(text.data.text)) {
          assert.ok(!normalizedRenderedText.includes(otherNeedle), 'active canvas must not render another workspace text body');
        }
      }
      assert.equal(await dock().getByRole('button', { name: target.preferredSurface[0].toUpperCase() + target.preferredSurface.slice(1), exact: true }).getAttribute('aria-pressed'), 'true');
      return { path: state.url, canvasId: state.canvasId, preferredSurface: target.preferredSurface, nodeIds: visibleIds, renderedText: renderedText.slice(0, 240) };
    }

    await recordCase('Main → Context uses the real route and shows Context-owned content', async () => {
      const detail = await switchTo('context');
      await page.screenshot({ path: report.screenshots.context, fullPage: false });
      return { ...detail, screenshot: report.screenshots.context };
    });

    await recordCase('Context → Workflow uses the real route and keeps workspace content isolated', async () => {
      const detail = await switchTo('workflow');
      return detail;
    });

    await recordCase('Workflow → Main returns to the original Main route and content', async () => {
      const detail = await switchTo('main');
      return detail;
    });
    const mainTextId = textNodeOf(initialDetails.main).id;
    let savedRichText = '';
    await recordCase('original text double-click editor saves H2 + bold through Core', async () => {
      await nodeLocator(mainTextId).locator('[data-testid="canvas-node-text-content"]').dblclick();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor({ state: 'visible' });
      const editor = dialog.locator('[contenteditable="true"]').first();
      const label = 'Main browser QA rich text ' + Date.now();
      await editor.fill(label);
      await dialog.getByRole('radio', { name: '标题 2', exact: true }).click();
      await editor.click();
      await page.keyboard.press('Control+a');
      await page.keyboard.press('Control+b');
      await dialog.getByRole('button', { name: '关闭', exact: true }).first().click();
      await dialog.waitFor({ state: 'hidden', timeout: 15000 });
      const deadline = Date.now() + 20000;
      let detail;
      do {
        detail = await readCanvas(main.canvasId);
        savedRichText = textNodeOf(detail).data.text;
        if (savedRichText.includes(label) && /##\s+\*\*/.test(savedRichText)) break;
        await delay(300);
      } while (Date.now() < deadline);
      assert.ok(savedRichText.includes(label), 'Core-backed text should contain the edited label');
      assert.match(savedRichText, /##\s+\*\*/, 'saved text should retain H2 and bold Markdown');
      return { textNodeId: mainTextId, savedText: savedRichText, saveOwner: 'Core canvas GET projection' };
    });

    await recordCase('edited Main text does not overwrite Context or Workflow text', async () => {
      const [contextDetail, workflowDetail] = await Promise.all([
        readCanvas(workspaces.context.canvasId),
        readCanvas(workspaces.workflow.canvasId),
      ]);
      assert.notEqual(textNodeOf(contextDetail).data.text, savedRichText);
      assert.notEqual(textNodeOf(workflowDetail).data.text, savedRichText);
      assert.equal(textNodeOf(contextDetail).data.text, textNodeOf(initialDetails.context).data.text);
      assert.equal(textNodeOf(workflowDetail).data.text, textNodeOf(initialDetails.workflow).data.text);
      return { contextUnchanged: true, workflowUnchanged: true };
    });

    let flushedDraft = '';
    await recordCase('native Ke flushes unsaved editor text before Dock navigation', async () => {
      await nodeLocator(mainTextId).locator('[data-testid="canvas-node-text-content"]').dblclick();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor({ state: 'visible' });
      const editor = dialog.locator('[contenteditable="true"]').first();
      flushedDraft = 'Native Ke flush before Context ' + Date.now();
      await editor.fill(flushedDraft);
      await dialog.getByRole('button', { name: '关闭', exact: true }).first().click();
      await dialog.waitFor({ state: 'hidden', timeout: 15000 });
      await dock().getByRole('button', { name: 'Context', exact: true }).click();
      await page.waitForFunction(expected => {
        const lab = window.__LCOS_NODE_LAB__;
        return location.pathname.includes(expected) && lab?.canvasId === expected;
      }, workspaces.context.canvasId, { timeout: 30000 });
      const mainAfterFlush = await readCanvas(main.canvasId);
      const persisted = textNodeOf(mainAfterFlush).data.text;
      assert.ok(persisted.includes(flushedDraft), 'Dock switch should flush the closed editor pending save');
      return { draftPersisted: true, routedTo: workspaces.context.canvasId, savedText: persisted };
    });

    await recordCase('original node drag persists real geometry and survives reload', async () => {
      const closeEditor = page.getByRole('button', { name: '关闭', exact: true });
      if (await closeEditor.count() && await closeEditor.first().isVisible().catch(() => false)) {
        await closeEditor.first().click().catch(() => {});
      }
      await switchTo('main');
      const mainBefore = await readCanvas(main.canvasId);
      const image = imageNodeOf(mainBefore);
      const before = { ...image.position };
      const box = await nodeLocator(image.id).boundingBox();
      assert.ok(box && box.width > 40 && box.height > 40, 'image node needs a visible drag surface');
      const startX = box.x + Math.min(80, box.width / 2);
      const startY = box.y + Math.min(65, box.height / 2);
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(startX + 125, startY + 75, { steps: 16 });
      await page.mouse.up();
      const deadline = Date.now() + 20000;
      let after = before;
      do {
        await delay(300);
        const current = await readCanvas(main.canvasId);
        after = imageNodeOf(current).position;
        if (Math.abs(after.x - before.x) > 20 || Math.abs(after.y - before.y) > 20) break;
      } while (Date.now() < deadline);
      assert.ok(Math.abs(after.x - before.x) > 20 || Math.abs(after.y - before.y) > 20, 'drag should persist changed canvas coordinates');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => !!window.__LCOS_NODE_LAB__?.api, null, { timeout: 45000 });
      await page.waitForFunction(() => document.querySelectorAll('.react-flow__node').length === 2, null, { timeout: 30000 });
      await waitForLoadingOverlayHidden();
      const afterReload = await readCanvas(main.canvasId);
      const restored = imageNodeOf(afterReload).position;
      assert.ok(Math.abs(restored.x - after.x) < 1 && Math.abs(restored.y - after.y) < 1, 'reload should restore persisted geometry');
      const textAfterReload = textNodeOf(afterReload).data.text;
      assert.ok(textAfterReload.includes(flushedDraft) || textAfterReload.includes(savedRichText), 'reload should preserve Core text revision');
      const img = await nodeLocator(image.id).locator('img').evaluate(element => ({
        complete: element.complete,
        naturalWidth: element.naturalWidth,
        naturalHeight: element.naturalHeight,
      }));
      assert.ok(img.complete && img.naturalWidth > 0 && img.naturalHeight > 0);
      return { before, after, restoredAfterReload: restored, imageBytesAfterReload: img };
    });

    await recordCase('mobile viewport keeps all three real Dock routes visible', async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await delay(400);
      const buttons = dock().getByRole('button');
      assert.equal(await buttons.count(), 3);
      const visibility = [];
      for (const label of ['Main', 'Context', 'Workflow']) {
        visibility.push({ label, visible: await dock().getByRole('button', { name: label, exact: true }).isVisible() });
      }
      assert.ok(visibility.every(item => item.visible));
      const box = await dock().boundingBox();
      assert.ok(box && box.width <= 390);
      await page.screenshot({ path: report.screenshots.mobile, fullPage: false });
      return { viewport: { width: 390, height: 844 }, dock: box, buttons: visibility, screenshot: report.screenshots.mobile };
    });
    }
  }
  if (!paramsProbe) {
  async function boundaryProbe(name, route, expectedStatus, options = {}) {
    const response = await fetch(origin + route, options);
    const item = {
      name,
      method: options.method || 'GET',
      path: route,
      expectedStatus,
      status: response.status,
      passed: response.status === expectedStatus,
    };
    report.httpBoundary.probes.push(item);
    assert.equal(response.status, expectedStatus, name + ' expected HTTP ' + expectedStatus + ', got ' + response.status);
    return item;
  }

  async function boundaryProbeForeignHost() {
    const statusCode = await new Promise((resolve, reject) => {
      const request = http.get({
        host: '127.0.0.1',
        port: 17880,
        path: '/health',
        headers: { Host: 'foreign.invalid' },
      }, response => {
        response.resume();
        response.once('end', () => resolve(response.statusCode));
      });
      request.once('error', reject);
    });
    const item = {
      name: 'host header guard',
      method: 'GET',
      path: '/health',
      expectedStatus: 403,
      status: statusCode,
      passed: statusCode === 403,
    };
    report.httpBoundary.probes.push(item);
    assert.equal(statusCode, 403, 'raw Node HTTP Host header guard should reject foreign.invalid');
    return item;
  }

  await recordCase('foreign Origin cannot read the local API', async () => boundaryProbe(
    'cross-origin API origin',
    '/api/surface-core/status',
    403,
    { headers: { Origin: 'https://foreign.invalid', Accept: 'application/json' } },
  ));

  await recordCase('foreign Host cannot access the local server', async () => boundaryProbeForeignHost());

  await recordCase('encoded static path traversal is rejected', async () => boundaryProbe(
    'encoded path traversal',
    '/%2e%2e%2Fpackage.json',
    403,
  ));

  await recordCase('unknown local API returns 501', async () => boundaryProbe(
    'unknown API capability',
    '/api/surface-core/unsupported-browser-probe',
    501,
    { headers: { Accept: 'application/json' } },
  ));

  if (workspaces) {
    await recordCase('unsupported create and delete capabilities fail closed without fake success', async () => {
      const createCanvas = await boundaryProbe(
        'new canvas unsupported',
        '/api/canvas/v1/canvases',
        501,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'browser probe must not create' }) },
      );
      const createNode = await boundaryProbe(
        'node creation unsupported',
        '/api/canvas/v1/canvases/' + encodeURIComponent(workspaces.main.canvasId) + '/nodes:batchActions',
        501,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            canvas_id: workspaces.main.canvasId,
            actions: [{ action: 'create', creates: [{ id: 'unsupported-browser-probe', type: 'text', position: { x: 0, y: 0 }, data: { text: 'must not persist' } }] }],
          }),
        },
      );
      const deleteCanvas = await boundaryProbe(
        'canvas deletion unsupported',
        '/api/canvas/v1/canvases/' + encodeURIComponent(workspaces.main.canvasId),
        501,
        { method: 'DELETE' },
      );
      const stillThere = await readCanvas(workspaces.main.canvasId);
      assert.ok(stillThere.nodes.length === 2 && !stillThere.nodes.some(node => node.id === 'unsupported-browser-probe'));
      return { statuses: [createCanvas.status, createNode.status, deleteCanvas.status], mainStillReadable: true, nodeCount: stillThere.nodes.length };
    });
  }
  }
} catch (error) {
  report.fatalError = cleanText(error?.stack || error);
  report.failures ??= [];
  report.failures.push({ name: 'browser harness', error: report.fatalError });
  console.error(report.fatalError);
} finally {
  await Promise.allSettled(pendingFailureDetails);
  for (const item of report.localFailedResponses) {
    item.classification = isExpectedBackgroundResponse(item)
      ? 'expected_unconnected_background'
      : isExpectedNavigationReadAbort(item) ? 'expected_navigation_read_abort' : 'unexpected';
  }
  report.localFailureAssessment = {
    expectedUnconnectedBackground: report.localFailedResponses.filter(item => item.classification === 'expected_unconnected_background'),
    expectedNavigationReadAborts: report.localFailedResponses.filter(item => item.classification === 'expected_navigation_read_abort'),
    unexpected: report.localFailedResponses.filter(item => item.classification === 'unexpected'),
    allowlist: [
      'GET /api/bff/platform/config → 501 (unconnected platform configuration)',
      'GET /api/billing/v2/wallet/balance → 501 (vendor getWallet is called for display only; its catch path keeps rendering and no billing mutation/checkBalance call is active)',
      'GET /api/v1/canvas/plugins/<one of the three current canvas IDs> → 501 (optional canvas plugin endpoint)',
      'GET /api/surface-core/status → net::ERR_ABORTED (source-verified Dock hook cleanup AbortController cancellation during route change; read-only GET only)',
    ],
  };
  for (const item of report.consoleErrors) item.classification = classifyConsoleError(item);
  const remoteBlockPaths = new Set();
  for (const item of report.consoleErrors) {
    if (!item.text.includes('client-edge.tapnow.media')) continue;
    for (const pathname of ['/v1/initialize', '/v1/rgstr']) {
      if (item.text.includes(pathname)) remoteBlockPaths.add('https://client-edge.tapnow.media' + pathname);
    }
  }
  report.network.preNetworkExternalBlocked = Array.from(remoteBlockPaths).map(url => ({
    url,
    blockedBy: 'original renderer offline fetch shim or same-origin CSP before a network request was issued',
  }));
  report.finishedAt = new Date().toISOString();
  const expectedBlocked = report.consoleErrors.filter(item => item.text.includes('ERR_BLOCKED_BY_CLIENT'));
  const expectedOffline = report.consoleErrors.filter(item => item.classification === 'expected_offline_external_block' || item.classification === 'expected_external_csp_block');
  const unexplained = report.consoleErrors.filter(item => item.classification === 'unexplained');
  report.consoleErrorAssessment = {
    observed: report.consoleErrors.length,
    blockedByBrowser: expectedBlocked.length,
    blockedByOfflineRendererOrCsp: expectedOffline.length,
    unexplained: unexplained.length,
    rawErrorsRetained: true,
  };
  report.diagnosticCaptureSucceeded = paramsProbe && report.batchActionFailures.length + report.batchActionResponses.length > 0
    && report.cases.some(item => item.name === 'capture one original text-editor batchActions payload params safely' && item.passed);
  report.passed = paramsProbe ? null : !report.fatalError
    && report.cases.length >= 10
    && report.cases.every(item => item.passed)
    && report.pageErrors.length === 0
    && report.localFailureAssessment.unexpected.length === 0
    && unexplained.length === 0;
  try {
    await context?.close();
  } catch (error) {
    report.cleanupError = cleanText(error?.message || error);
    report.passed = false;
  }
  try {
    await browser?.close();
  } catch (error) {
    report.cleanupError = cleanText(error?.message || error);
    report.passed = false;
  }
  await writeFile(evidencePath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify({
    passed: report.passed,
    cases: report.cases.length,
    failedCases: report.cases.filter(item => !item.passed).length,
    pageErrors: report.pageErrors.length,
    consoleErrors: report.consoleErrors.length,
    localFailedResponses: report.localFailedResponses.length,
    batchActionResponses: report.batchActionResponses.length,
    batchActionFailures: report.batchActionFailures.length,
    externalHttpBlocked: report.network.externalHttpBlocked.length,
    webSocketsClosed: report.network.webSocketsClosed.length,
    diagnosticOnly: paramsProbe,
    diagnosticCaptureSucceeded: report.diagnosticCaptureSucceeded,
    evidencePath,
    screenshots: report.screenshots,
  }, null, 2));
  if (!paramsProbe && !report.passed) process.exitCode = 1;
  if (paramsProbe && !report.diagnosticCaptureSucceeded) process.exitCode = 1;
}
