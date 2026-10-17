import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { currentGen2Root } from '../lab/current-gen2-resources.mjs';

const arg = name => process.argv.find(value => value.startsWith('--' + name + '='))?.slice(name.length + 3);
assert.ok(arg('base-url') && process.argv.includes('--commit'), 'Explicit coordinated isolated runtime and synthetic Pin writes required.');
const address = new URL(arg('base-url'));
assert.equal(address.protocol, 'http:'); assert.equal(address.hostname, '127.0.0.1'); assert.equal(address.pathname, '/');
const origin = address.origin, canvasId = 'surface-core-main', projectId = 'disposable-surface-core-facade';
const resumeExisting = process.argv.includes('--resume-existing');
const checkMinimap = process.argv.includes('--check-minimap');
const prefix = '/api/lcos/core/projects/' + projectId, pinPath = prefix + '/color-pins';
const output = path.resolve(import.meta.dirname, '../output/原生ColorPin整合_20261017h/原色点整页', new Date().toISOString().replace(/[:.]/g, '-'));
await fs.mkdir(output, { recursive: true });
const get = async pathname => {
  const response = await fetch(origin + pathname, { redirect: 'error', cache: 'no-store' }), body = await response.json();
  assert.equal(response.status, 200, JSON.stringify({ pathname, body }));
  if ('ok' in body) { assert.equal(body.ok, true); return body.value; }
  assert.equal(body.code, 0); return body.data;
};
const health = await (await fetch(origin + '/health')).json();
assert.ok(health.realCoreConnected && health.nativeRailPilot && health.runtimeLabel?.startsWith('isolated-'));
const facts = async () => ({ graph: await get(prefix + '/graph'), runs: await get(prefix + '/runs'),
  presentations: await get(prefix + '/presentations'), bindings: await get(prefix + '/spatial/bindings'),
  canvases: Object.fromEntries(await Promise.all(['main', 'context', 'workflow'].map(async name => {
    const id = 'surface-core-' + name; return [id, await get('/api/canvas/v1/canvases/' + id)];
  }))) });
const before = await facts(), pinsBefore = await get(pinPath);
const renameLabel = pinsBefore.definitions.some(row => row.label === '原色点整页验证') ? '原色点整页复验' : '原色点整页验证';
const pileMembers = before.canvases[canvasId].nodes.flatMap(node => node.type === 'pile' ? node.data.memberIds ?? [] : []);
const target = before.canvases[canvasId].nodes.find(node => ['image', 'text'].includes(node.type)
  && node.data?.lcos_ref?.artifactViewId && !pileMembers.includes(node.id));
assert.ok(target, 'Use an existing exposed synthetic material View; never create or ungroup a node fixture.');
const targetRef = { projectId, kind: 'view', id: target.data.lcos_ref.artifactViewId };
assert.equal(pinsBefore.memberships.length, resumeExisting ? 1 : 0, 'Use the declared empty/resume Pin state; never silently delete earlier test state.');
const report = { at: new Date().toISOString(), output, health, resumeExisting, checkMinimap, target: { nodeId: target.id, targetRef }, passed: false,
  scope: 'Full original App mouse/keyboard: original node Pin Popover → exact Core View; original group menu/rename/download/locate/clear. No hidden store setter or old HUD.',
  writes: [], startupWrites: [], blockedWrites: [], remoteBlocked: [], routeErrors: [], pageErrors: [], screenshots: [], checks: [], models: 0 };
let browser, page, assigned, withheld = false;
if (resumeExisting) {
  const membership = pinsBefore.memberships[0]; assert.deepEqual(membership.targetRef, targetRef);
  assigned = { membership, definition: pinsBefore.definitions.find(row => row.id === membership.colorPinId) };
  assert.ok(assigned.definition); assert.match(assigned.definition.label, /^原色点整页(?:验证|复验)$/);
}
const shot = async name => { const file = path.join(output, name + '.png'); await page.screenshot({ path: file, fullPage: true }); report.screenshots.push(file); };
try {
  await fs.writeFile(path.join(output, 'before-facts.json'), JSON.stringify({ before, pinsBefore }, null, 2));
  const { chromium } = createRequire(path.join(currentGen2Root, 'package.json'))('playwright-core');
  browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
    args: ['--disable-background-networking', '--disable-sync', '--no-first-run'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', serviceWorkers: 'block', acceptDownloads: true });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    try {
      if (['http:', 'https:'].includes(url.protocol) && url.origin !== origin) { report.remoteBlocked.push(url.href); return route.abort(); }
      if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
        const entry = { method, path: url.pathname, body: request.postData() };
        if (method === 'POST' && (url.pathname === '/api/events' || url.pathname === `/api/lcos/canvases/${canvasId}/execution:reconcile` && entry.body === '{}')) {
          const response = await route.fetch({ maxRedirects: 0 }); report.startupWrites.push({ ...entry, status: response.status() }); return route.fulfill({ response });
        }
        let allowed = false;
        if (method === 'POST' && url.pathname === pinPath + '/memberships') {
          assert.deepEqual(request.postDataJSON().targetRef, targetRef); allowed = !assigned;
        } else if (method === 'PATCH' && assigned && url.pathname === pinPath + '/definitions/' + encodeURIComponent(assigned.definition.id)) {
          assert.equal(request.postDataJSON().label, renameLabel); allowed = true;
        } else if (method === 'DELETE' && assigned && url.pathname === pinPath + '/memberships/' + encodeURIComponent(assigned.membership.id)) allowed = true;
        if (!allowed) { report.blockedWrites.push(entry); return route.abort('blockedbyclient'); }
        const response = await route.fetch({ maxRedirects: 0 }); entry.status = response.status(); entry.response = await response.json(); report.writes.push(entry);
        if (method === 'POST' && response.ok()) {
          assigned = entry.response.value; assert.ok(assigned?.definition?.id && assigned?.membership?.id);
          if (!withheld) { withheld = true; return route.abort('failed'); }
        }
        return route.fulfill({ response });
      }
      return route.continue();
    } catch (error) { report.routeErrors.push(String(error.stack ?? error)); try { await route.abort('failed'); } catch {} }
  });
  await context.routeWebSocket('**/*', socket => { report.remoteBlocked.push(socket.url()); socket.close(); });
  page = await context.newPage(); page.setDefaultTimeout(25000); page.on('pageerror', error => report.pageErrors.push(error.message));
  await page.goto(origin + '/canvas/' + canvasId, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(id => window.__LCOS_NODE_LAB__?.api?.getNode(id), target.id, { timeout: 60000 });
  await page.getByTestId('common-loading-overlay').waitFor({ state: 'hidden', timeout: 60000 });
  const node = page.locator('.react-flow__node[data-id="' + target.id + '"]');
  await node.click({ position: { x: 70, y: 70 } });
  const trigger = page.getByRole('button', { name: /^Pin$|^已 Pin：|^Pinned:/ });
  await trigger.click();
  const popover = page.locator('[data-native-colorpin-popover]'); await popover.waitFor();
  const dots = popover.locator('button[aria-pressed]'); assert.equal(await dots.count(), 6);
  report.originalDots = await dots.evaluateAll(elements => elements.map(element => ({ label: element.getAttribute('aria-label'), pressed: element.getAttribute('aria-pressed') })));
  await shot('01-original-node-pin-popover');
  if (!resumeExisting) {
  await dots.first().click();
  const verify = popover.getByRole('button', { name: '核对标记结果', exact: true }); await verify.waitFor();
  assert.equal(report.writes.filter(row => row.method === 'POST').length, 1);
  await page.keyboard.press('Escape'); await popover.waitFor({ state: 'hidden' });
  await trigger.click(); await verify.waitFor();
  assert.equal(await dots.first().isDisabled(), true, 'Unknown result retains original Popover but blocks another toggle.');
  await shot('02-original-pin-unknown-reopened'); await verify.click();
  await page.waitForFunction(() => document.querySelector('[data-native-colorpin-popover] button[aria-pressed="true"]'));
  assert.equal(report.writes.filter(row => row.method === 'POST').length, 1, 'Explicit unknown recovery must only GET.');
  } else assert.equal(await dots.first().getAttribute('aria-pressed'), 'true', 'Reopening the full original App reads the existing exact membership.');
  const snapshot = await get(pinPath); assert.equal(snapshot.memberships.length, 1); assert.deepEqual(snapshot.memberships[0].targetRef, targetRef);
  await page.keyboard.press('Escape');
  if (checkMinimap) {
    await page.keyboard.press('Escape');
    const controls = page.locator('[data-pile-gallery-chrome="bottom-left"] button').filter({
      has: page.locator('span[aria-hidden="true"][class*="-inset-0.5"][class*="group-data-[active]"]') });
    report.originalMapControls = await controls.evaluateAll(elements => elements.map(element => element.outerHTML));
    let mapControl = -1;
    for (let index = 0; index < await controls.count(); index++) {
      await controls.nth(index).hover();
      const tooltip = page.getByRole('tooltip').filter({ hasText: /打开小地图|Open [Mm]inimap/ });
      if (await tooltip.waitFor({ timeout: 900 }).then(() => true, () => false)) { mapControl = index; break; }
    }
    assert.ok(mapControl >= 0, 'Identify the original UVe minimap control through its actual tooltip.');
    await controls.nth(mapControl).click(); await page.getByTestId('rf__minimap').waitFor();
  }
  const groups = page.locator('button.group.h-5.w-7'); await groups.first().waitFor(); assert.equal(await groups.count(), 1);
  await groups.first().click();
  if (checkMinimap) {
    const map = page.getByTestId('rf__minimap');
    const rgb = assigned.definition.color.slice(1).match(/../g).map(hex => parseInt(hex, 16));
    // Preserve the original .3s fill/stroke transition; measure its actual
    // settled paint rather than calling the first animation frame a failure.
    await page.waitForFunction(({ x, y, color }) => [...document.querySelectorAll('[data-testid="rf__minimap"] rect.react-flow__minimap-node')]
      .some(element => Math.abs(Number(element.getAttribute('x')) - x) < .01 && Math.abs(Number(element.getAttribute('y')) - y) < .01
        && getComputedStyle(element).fill.replace(/\s/g, '') === color),
    { x: target.position.x, y: target.position.y, color: `rgb(${rgb.join(',')})` }, { timeout: 5000 });
    report.minimap = await map.locator('rect.react-flow__minimap-node').evaluateAll(elements => elements.map(element => ({
      x: Number(element.getAttribute('x')), y: Number(element.getAttribute('y')), width: Number(element.getAttribute('width')),
      height: Number(element.getAttribute('height')), fill: element.style.fill, computedFill: getComputedStyle(element).fill,
      stroke: element.style.stroke, computedStroke: getComputedStyle(element).stroke })));
    const rect = report.minimap.find(rect => Math.abs(rect.x - target.position.x) < .01 && Math.abs(rect.y - target.position.y) < .01);
    assert.ok(rect, 'The map must contain the actual target node rectangle at its current original coordinates.');
    assert.equal(rect.computedFill.replace(/\s/g, ''), `rgb(${rgb.join(',')})`, 'Actual original minimap paints the Core group color.');
    assert.equal(rect.computedStroke.replace(/\s/g, ''), `rgb(${rgb.join(',')})`);
    await shot('02b-original-minimap-real-core-pin-color');
  }
  if (!resumeExisting) {
  await page.getByRole('menuitem', { name: /重命名|Rename/ }).click();
  const input = page.getByRole('textbox', { name: '颜色组名称（本项目）', exact: true }); await input.fill(renameLabel); await input.press('Enter');
  await page.getByText(renameLabel, { exact: true }).waitFor();
  report.renamed = await get(pinPath); assert.equal(report.renamed.definitions[0].label, renameLabel);
  assert.equal(report.writes.filter(row => row.method === 'PATCH').length, 1); await shot('03-original-group-rename');
  }
  const downloadEvent = page.waitForEvent('download'); await page.getByRole('menuitem', { name: /下载|Download/ }).click();
  const download = await downloadEvent; assert.equal(await download.failure(), null); report.downloadName = download.suggestedFilename();
  const downloadFile = path.join(output, 'original-group-download-' + report.downloadName.replace(/[\\/:*?"<>|]/g, '_'));
  await download.saveAs(downloadFile); report.downloadFile = downloadFile;
  const graph = before.graph, revision = graph.artifactRevisions.find(row => row.id === target.data.lcos_ref.revisionId);
  assert.ok(revision); const content = await fetch(origin + '/api/surface-core/file-records/' + encodeURIComponent(revision.fileRecordId) + '/content');
  assert.equal(content.status, 200); assert.deepEqual(await fs.readFile(downloadFile), Buffer.from(await content.arrayBuffer()));
  // Download deliberately keeps the original menu open for its own status.
  const member = page.getByRole('menuitem', { name: target.data.title, exact: true }); await member.click();
  await page.keyboard.press('Escape'); await groups.first().click();
  await page.getByRole('menuitem', { name: '移除此画布标记', exact: true }).click();
  await page.getByRole('button', { name: '移除标记', exact: true }).waitFor(); await shot('04-original-clear-confirmation');
  await page.getByRole('button', { name: '移除标记', exact: true }).click();
  for (let tries = 0; (await get(pinPath)).memberships.length && tries < 100; tries++) await page.waitForTimeout(50);
  report.finalPins = await get(pinPath); assert.equal(report.finalPins.memberships.length, 0);
  assert.equal(report.finalPins.definitions[0].id, assigned.definition.id); assert.equal(report.finalPins.definitions[0].label, resumeExisting ? assigned.definition.label : renameLabel);
  assert.equal(report.writes.filter(row => row.method === 'DELETE').length, 1);
  const after = await facts(); assert.deepEqual(after, before, 'Pin UI must not rewrite any Canvas, geometry, Presentation, material, Revision, binding or Run.');
  await fs.writeFile(path.join(output, 'after-facts.json'), JSON.stringify({ after, finalPins: report.finalPins }, null, 2));
  assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.routeErrors, []); assert.deepEqual(report.blockedWrites, []);
  await shot('05-original-canvas-after-relationship-clear');
  report.checks.push(resumeExisting ? 'Explicitly resumed pre-existing exact Pin; original App reopens and reads it without another assign or rename.'
    : 'Original node toolbar/Popover/multi-color dots; real assign successful response discarded; close/reopen unknown blocks toggles; explicit recovery GET-only (one POST), original project-scope inline rename.',
    'Original bar/menu, exact native group member locate and byte-exact historical file download.',
    'Original confirmation deletes one exact membership; retains definition and every original node, all seven domain/spatial responses unchanged.');
  report.passed = true;
} catch (error) {
  report.error = String(error.stack ?? error); process.exitCode = 1;
  if (page) { await shot('failure').catch(() => {}); await fs.writeFile(path.join(output, 'failure.aria.txt'), await page.locator('body').ariaSnapshot()).catch(() => {}); }
} finally {
  if (browser) await browser.close();
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, writes: report.writes.map(({ method, status }) => ({ method, status })), output, error: report.error }, null, 2));
}
