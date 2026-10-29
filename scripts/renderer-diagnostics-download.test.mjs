import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { currentGen2Root } from '../lab/current-gen2-resources.mjs';

const root = path.resolve(import.meta.dirname, '..');
const source = await fs.readFile(path.join(root, 'lab/renderer-diagnostics.js'), 'utf8');
const output = path.join(root, 'output/原生ColorPin整合_20261017h/诊断下载边界验证', new Date().toISOString().replace(/[:.]/g, '-'));
const report = { passed: false, source: 'lab/renderer-diagnostics.js', browser: 'fresh Chrome via playwright-core',
  scope: 'actual diagnostics script, real DOM clicks and browser download; independent loopback fixtures only',
  candidateRequests: 0, coreWrites: 0, models: 0, cases: [], events: [], remoteRequests: [], pageErrors: [] };
const expectedBytes = Buffer.from(JSON.stringify({ name: '色点离线下载', entries: [{ label: '青色 · 原始字节', color: '#53c8be' }], newline: '\n' }, null, 2) + '\n');
const downloads = [];
let browser, context, page;
const servers = [];
const until = async condition => {
  const deadline = Date.now() + 5000;
  while (!condition() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
  assert.ok(condition(), 'Expected actual fixture telemetry was not received.');
};
const start = async () => {
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (request.method === 'POST' && url.pathname === '/api/events') {
      let body = ''; for await (const chunk of request) body += chunk;
      report.events.push(JSON.parse(body)); response.writeHead(204); response.end(); return;
    }
    if (request.method !== 'GET') { response.writeHead(405); response.end(); return; }
    if (url.pathname === '/renderer-diagnostics.js') {
      response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' }); response.end(source); return;
    }
    if (url.pathname === '/ping') { response.writeHead(200, { 'content-type': 'text/plain' }); response.end('fixture-pong'); return; }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><html lang="zh"><meta charset="utf-8"><title>diagnostics boundary fixture</title><body>'
      + '<h1>独立 loopback 下载边界</h1><main id="actions"></main><script src="/renderer-diagnostics.js"></script></body></html>');
  });
  servers.push(server); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}`;
};
try {
  await fs.mkdir(output, { recursive: true });
  const origin = await start(), foreignOrigin = await start(); report.origins = { origin, foreignOrigin };
  const { chromium } = createRequire(path.join(currentGen2Root, 'package.json'))('playwright-core');
  browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  context = await browser.newContext({ acceptDownloads: true, serviceWorkers: 'block', viewport: { width: 1100, height: 800 } });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.protocol === 'http:' && [origin, foreignOrigin].includes(url.origin)) return route.continue();
    if (url.protocol === 'data:' || url.protocol === 'blob:') return route.continue();
    report.remoteRequests.push({ url: url.origin + url.pathname, method: route.request().method() });
    return route.abort('blockedbyclient');
  });
  page = await context.newPage(); page.on('pageerror', error => report.pageErrors.push(String(error.message)));
  page.on('download', download => downloads.push(download));
  await page.goto(origin, { waitUntil: 'load' });
  await until(() => report.events.some(event => event.kind === 'diagnostics-installed'));
  const foreignPage = await context.newPage(); await foreignPage.goto(foreignOrigin, { waitUntil: 'load' });
  const foreignBlob = await foreignPage.evaluate(() => URL.createObjectURL(new Blob(['foreign actual Blob'], { type: 'text/plain' })));
  const blob = await page.evaluate(bytes => URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/json' })), [...expectedBytes]);
  await page.evaluate(({ blob, foreignBlob, origin }) => {
    const entries = [
      ['valid-file', blob, '色点集合_真实下载.json'], ['blob-no-download', blob, null],
      ['blob-empty-download', blob, ''], ['blob-whitespace-download', blob, '   '],
      ['foreign-blob', foreignBlob, 'foreign.json'],
      ['remote-http', 'http://diagnostics-fixture.invalid/a?private=omitted', 'remote.json'],
      ['remote-https', 'https://diagnostics-fixture.invalid/a?private=omitted', 'remote.json'],
      ['data-url', 'data:text/plain;base64,bm90LWFsbG93ZWQ=', 'data.txt'],
      ['javascript-url', 'javascript:window.__unexpectedProtocolExecuted=true', 'js.txt'],
      ['unknown-protocol', 'lcos-diagnostics-fixture-blocked://download/file', 'protocol.txt'],
      ['file-url', 'file:///diagnostics-fixture-does-not-exist.txt', 'file.txt'],
    ];
    for (const [id, href, download] of entries) {
      const anchor = document.createElement('a'); anchor.id = id; anchor.href = href;
      if (download !== null) anchor.setAttribute('download', download);
      const child = document.createElement('span'); child.textContent = id; anchor.append(child);
      document.querySelector('#actions').append(anchor, document.createElement('br'));
    }
    for (const [id, target] of [['open-remote', 'https://diagnostics-fixture.invalid/open'], ['open-blob', blob],
      ['open-foreign-blob', foreignBlob], ['open-data', 'data:text/plain,no'],
      ['open-javascript', 'javascript:window.__unexpectedProtocolExecuted=true'],
      ['open-protocol', 'lcos-diagnostics-fixture-blocked://open/file']]) {
      const button = document.createElement('button'); button.id = id; button.textContent = id;
      button.addEventListener('click', () => { button.dataset.returnedNull = String(window.open(target) === null); });
      document.querySelector('#actions').append(button);
    }
    const allowed = document.createElement('button'); allowed.id = 'open-local'; allowed.textContent = 'open-local';
    allowed.addEventListener('click', () => window.open(origin + '/ordinary-page'));
    document.querySelector('#actions').append(allowed);
    const remoteFetch = document.createElement('button'); remoteFetch.id = 'fetch-remote'; remoteFetch.textContent = 'fetch-remote';
    remoteFetch.addEventListener('click', async () => { try { await fetch('https://diagnostics-fixture.invalid/api'); remoteFetch.dataset.result = 'unexpected-success'; }
      catch { remoteFetch.dataset.result = 'blocked'; } }); document.querySelector('#actions').append(remoteFetch);
  }, { blob, foreignBlob, origin });
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#valid-file span').click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), '色点集合_真实下载.json'); assert.equal(await download.failure(), null);
  const downloadPath = path.join(output, download.suggestedFilename()); await download.saveAs(downloadPath);
  const actualBytes = await fs.readFile(downloadPath); assert.deepEqual(actualBytes, expectedBytes);
  report.download = { file: downloadPath, suggestedFilename: download.suggestedFilename(), bytes: actualBytes.length,
    exactByteEquality: true, browserFailure: await download.failure(), downloadEventCount: downloads.length };
  report.cases.push('same-origin Blob + explicit nonempty download: real span click produces real browser download with exact UTF-8 bytes');
  for (const id of ['blob-no-download', 'blob-empty-download', 'blob-whitespace-download', 'foreign-blob', 'remote-http',
    'remote-https', 'data-url', 'javascript-url', 'unknown-protocol', 'file-url']) {
    const before = report.events.filter(event => event.kind === 'navigation-blocked').length;
    await page.locator(`#${id} span`).click();
    await until(() => report.events.filter(event => event.kind === 'navigation-blocked').length === before + 1);
    assert.equal(page.url(), origin + '/'); assert.equal(downloads.length, 1);
    report.cases.push({ id, blocked: true, evidence: report.events.filter(event => event.kind === 'navigation-blocked').at(-1), downloadEventCount: downloads.length });
  }
  for (const id of ['open-remote', 'open-blob', 'open-foreign-blob', 'open-data', 'open-javascript', 'open-protocol']) {
    const before = report.events.filter(event => event.kind === 'navigation-blocked').length;
    await page.locator(`#${id}`).click();
    await until(() => report.events.filter(event => event.kind === 'navigation-blocked').length === before + 1);
    assert.equal(await page.locator(`#${id}`).getAttribute('data-returned-null'), 'true');
    assert.equal(context.pages().length, 2); assert.equal(downloads.length, 1);
    report.cases.push({ id, blocked: true, returnedNull: true });
  }
  const popupPromise = page.waitForEvent('popup'); await page.locator('#open-local').click();
  const popup = await popupPromise; await popup.waitForLoadState('load'); assert.equal(popup.url(), origin + '/ordinary-page'); await popup.close();
  report.cases.push('existing same-origin HTTP window.open remains allowed; actual popup loaded and closed');
  await page.locator('#fetch-remote').click();
  await until(() => report.events.some(event => event.kind === 'remote-fetch-blocked'));
  await page.waitForFunction(() => document.querySelector('#fetch-remote').dataset.result === 'blocked');
  assert.equal(await page.evaluate(async () => (await fetch('/ping')).text()), 'fixture-pong');
  report.cases.push('existing remote fetch rejection preserved; same-origin fetch still succeeds');
  assert.equal(await page.evaluate(() => window.__unexpectedProtocolExecuted ?? false), false);
  assert.equal(report.remoteRequests.length, 0, 'Guards must block before any remote browser request, not rely on route abort.');
  assert.equal(report.pageErrors.length, 0); assert.equal(downloads.length, 1);
  assert.ok(report.events.every(event => !JSON.stringify(event).includes('private=omitted')), 'Diagnostic URL telemetry strips queries.');
  await page.screenshot({ path: path.join(output, 'fixture-final.png'), fullPage: true });
  report.passed = true;
} catch (error) {
  report.error = String(error.stack ?? error); process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  for (const server of servers) await new Promise(resolve => server.close(resolve));
  report.closed = { browser: !browser?.isConnected(), fixtureServers: servers.every(server => !server.listening) };
  await fs.mkdir(output, { recursive: true }); await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, cases: report.cases.length, report: path.join(output, 'report.json'), error: report.error }));
}
