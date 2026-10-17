// Wave 5 production-route acceptance.
//
// Prerequisite (explicit and required):
//   powershell -ExecutionPolicy Bypass -File scripts/e2e/r0-e2e-env.ps1 up
//   node scripts/e2e/wave5-assembly-composer.mjs 5273
//
// The stack must be the isolated R0 stack (Core :43131, web :5273) seeded with
// LOCAL_CORE_E2E_FIXTURE=1. This script does not reset data, seed a second
// project, invent a provider receipt, or silently skip a missing prerequisite.

import { mkdirSync } from 'node:fs';

import { chromium } from 'playwright-core';

const args = process.argv.slice(2);

function optionValue(names) {
  for (const name of names) {
    const equals = args.find((arg) => arg.startsWith(`${name}=`));
    if (equals !== undefined) return equals.slice(name.length + 1);
    const index = args.indexOf(name);
    if (index >= 0 && args[index + 1] !== undefined) return args[index + 1];
  }
  return undefined;
}

const positionalPort = args.find((arg) => /^\d{2,5}$/.test(arg));
const webPort = optionValue(['--port', '--web-port'])
  ?? positionalPort
  ?? process.env.LCOS_E2E_WEB_PORT
  ?? process.env.E2E_WEB_PORT
  ?? '5273';
const baseUrl = (optionValue(['--base-url'])
  ?? process.env.LCOS_E2E_WEB_URL
  ?? `http://localhost:${webPort}`).replace(/\/$/, '');
const coreUrl = (optionValue(['--core-url'])
  ?? process.env.LCOS_E2E_CORE_URL
  ?? `http://127.0.0.1:${process.env.LCOS_E2E_CORE_PORT ?? '43131'}`).replace(/\/$/, '');
const projectId = optionValue(['--project']) ?? process.env.LCOS_E2E_PROJECT ?? 'lcos-gen2-dev';
const artifactId = 'artifact-positioning';
const expectedRevisionId = 'revision-positioning-initial';
const expectedFileRecordId = 'file-positioning';
const screenshots = process.env.LCOS_E2E_SCREENSHOTS ?? 'C:/Users/1/AppData/Local/Temp/trae/screenshots';
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  ?? 'C:/Users/1/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';

const result = {
  prerequisites: { baseUrl, coreUrl, projectId, artifactId, expectedRevisionId, webPort },
  assertions: [],
  consoleErrors: [],
  pageErrors: [],
};

function assert(condition, message, details) {
  if (!condition) {
    const suffix = details === undefined ? '' : `\n${JSON.stringify(details, null, 2)}`;
    throw new Error(`[Wave5 assertion failed] ${message}${suffix}`);
  }
  result.assertions.push(message);
}

async function jsonResponse(url, init = {}) {
  const response = await fetch(url, init);
  let body;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }
  return { response, body };
}

async function coreJson(pathname) {
  const { response, body } = await jsonResponse(`${coreUrl}${pathname}`, {
    headers: { Authorization: `Bearer ${process.env.LCOS_E2E_CORE_TOKEN ?? 'dev-token'}` },
  });
  const record = body && typeof body === 'object' ? body : {};
  return {
    ok: response.ok && record.ok === true,
    status: response.status,
    value: record.value,
    error: record.error,
  };
}

async function waitForText(page, selector, expected, timeout = 15_000) {
  await page.waitForFunction(({ selector: target, expected: value }) => {
    const node = document.querySelector(target);
    return node?.textContent?.trim() === value;
  }, { selector, expected }, { timeout });
}

async function requireVisible(locator, label, timeout = 25_000) {
  await locator.first().waitFor({ state: 'visible', timeout });
  const count = await locator.count();
  assert(count === 1, `${label} 必须恰好有一个`, { count });
}

function snapshotPath(name) {
  mkdirSync(screenshots, { recursive: true });
  return `${screenshots}/${name}.png`;
}

console.log(JSON.stringify({
  prerequisites: [
    '请先运行 scripts/e2e/r0-e2e-env.ps1 up；它必须使用隔离 .e2e-data、Core :43131、web :5273。',
    `当前脚本目标：${baseUrl}，Core：${coreUrl}，project：${projectId}。`,
    'fixture 必须包含 artifact-positioning、current revision-positioning-initial、file-positioning 和 warehouse artifact 行。',
  ],
}, null, 2));

// Fail before opening a browser if the requested isolated stack or canonical fixture is absent.
const metadata = await coreJson('/metadata/status');
assert(metadata.ok, '隔离 Core /metadata/status 必须可达', { status: metadata.status, error: metadata.error });
const databasePath = String(metadata.value?.databasePath ?? '').replace(/\\/g, '/').toLowerCase();
assert(databasePath.length > 0, 'Core 必须返回 databasePath');
assert(!databasePath.endsWith('/.data/phase2.sqlite'), '禁止把开发态 phase2.sqlite 当作验收 fixture', { databasePath });

const graphResponse = await coreJson(`/projects/${encodeURIComponent(projectId)}/graph`);
assert(graphResponse.ok, 'fixture project graph 必须可读', { status: graphResponse.status, error: graphResponse.error });
const graph = graphResponse.value ?? {};
const artifact = (graph.artifacts ?? []).find((entry) => String(entry.id) === artifactId);
const revision = (graph.artifactRevisions ?? []).find((entry) => String(entry.id) === expectedRevisionId);
const fileRecord = (graph.fileRecords ?? []).find((entry) => String(entry.id) === expectedFileRecordId);
assert(artifact !== undefined, 'fixture 必须包含目标 Artifact', { artifactId });
assert(String(artifact.currentRevisionId) === expectedRevisionId, 'Artifact 必须绑定预期 current revision', {
  currentRevisionId: artifact.currentRevisionId,
  expectedRevisionId,
});
assert(revision !== undefined, 'fixture 必须包含目标 Artifact Revision', { expectedRevisionId });
assert(String(revision.artifactId) === artifactId, 'Revision 必须绑定同一 Artifact', { revision });
assert(String(revision.fileRecordId) === expectedFileRecordId, 'Revision 必须绑定预期 FileRecord', { revision });
assert(revision.status === 'current', '目标 Revision 必须是 current', { status: revision.status });
assert(fileRecord !== undefined && fileRecord.availability === 'current', '目标 FileRecord 必须可读且 current', { fileRecord });

const warehouseResponse = await coreJson(`/projects/${encodeURIComponent(projectId)}/warehouse?kinds=artifact&limit=200`);
assert(warehouseResponse.ok, 'fixture warehouse 必须可读', { status: warehouseResponse.status, error: warehouseResponse.error });
const warehouseItem = (warehouseResponse.value?.items ?? []).find((entry) => String(entry.entityRef?.id) === artifactId);
assert(warehouseItem !== undefined, 'warehouse 必须投影目标 Artifact，Assembly 才有真实入口', { artifactId });

const contentResponse = await fetch(`${coreUrl}/projects/${encodeURIComponent(projectId)}/file-records/${encodeURIComponent(expectedFileRecordId)}/content`, {
  headers: { Authorization: `Bearer ${process.env.LCOS_E2E_CORE_TOKEN ?? 'dev-token'}` },
});
const canonicalContent = await contentResponse.text();
assert(contentResponse.ok, '目标 FileRecord 正文必须能从 Core 读取', { status: contentResponse.status });
assert(canonicalContent.includes('Local Creative OS Gen2'), 'fixture 正文必须是真实 canonical bytes，不是空 preview 占位');
result.fixture = {
  databasePath,
  artifactId,
  revisionId: String(revision.id),
  fileRecordId: String(fileRecord.id),
  warehouseKind: warehouseItem.kind,
};

const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
page.on('console', (message) => {
  if (message.type() === 'error') result.consoleErrors.push(message.text().slice(0, 500));
});
page.on('pageerror', (error) => result.pageErrors.push(String(error).slice(0, 500)));

try {
  await page.goto(`${baseUrl}/projects/${encodeURIComponent(projectId)}/main`, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  await page.waitForSelector('[data-lcos-project-shell]', { state: 'visible', timeout: 45_000 });
  await page.waitForSelector('.react-flow__viewport', { state: 'attached', timeout: 60_000 });
  await page.waitForTimeout(1_500);
  await page.screenshot({ path: snapshotPath('wave5_step1_shell_1366') });

  const assemblyEntry = page.locator('[data-lcos-assembly-entry]').first();
  await requireVisible(assemblyEntry, 'Assembly 入口');
  await assemblyEntry.click();
  const assembly = page.locator('[data-lcos-assembly]');
  await requireVisible(assembly, 'Assembly window');
  await page.waitForSelector(`[data-lcos-assembly-item="${artifactId}"]`, { state: 'visible', timeout: 30_000 });
  const assemblyItems = page.locator('[data-lcos-assembly-item]');
  const assemblyItemCount = await assemblyItems.count();
  assert(assemblyItemCount > 0, 'Assembly 必须至少呈现一个真实 warehouse item', { assemblyItemCount });
  await page.screenshot({ path: snapshotPath('wave5_step2_assembly_1366') });

  const artifactCard = page.locator(`[data-lcos-assembly-item="${artifactId}"]`);
  await artifactCard.hover();
  const readButton = artifactCard.locator('button[title="阅读"]');
  await requireVisible(readButton, '目标 Artifact 的 Reader 打开动作');
  await readButton.click();

  const readerBody = page.locator('[data-lcos-window-body="reader"]');
  await requireVisible(readerBody, 'Reader window');
  assert(await readerBody.getAttribute('data-lcos-window-target') === artifactId, 'Reader target 必须绑定同一 Artifact');
  const reader = page.locator('[data-lcos-reader]');
  await requireVisible(reader, 'Reader body');
  const content = reader.locator('[data-lcos-reader-content="text"]');
  await requireVisible(content, 'Reader canonical text content');
  assert((await content.textContent() ?? '').includes('Local Creative OS Gen2'), 'Reader 正文必须来自真实 FileRecord');
  const revisionBadge = reader.locator('.lcos-reader-heading > span').first();
  assert((await revisionBadge.textContent() ?? '').includes(expectedRevisionId.slice(0, 8)), 'Reader 必须显示绑定 revision', {
    badge: await revisionBadge.textContent(),
    expectedRevisionId,
  });

  await waitForText(page, '[data-lcos-reader-zoom-value]', '100%');
  await reader.locator('[data-lcos-reader-zoom-in]').click();
  await waitForText(page, '[data-lcos-reader-zoom-value]', '110%');

  const scrollMetrics = await content.evaluate((node) => ({
    scrollHeight: node.scrollHeight,
    clientHeight: node.clientHeight,
  }));
  assert(scrollMetrics.scrollHeight > scrollMetrics.clientHeight, 'Reader fixture 正文必须真实可滚动，才能验收阅读位置 continuity', scrollMetrics);
  await content.hover();
  await page.mouse.wheel(0, 480);
  await page.waitForTimeout(250);
  const scrollBeforeClose = await content.evaluate((node) => node.scrollTop);
  assert(scrollBeforeClose > 0, '真实滚轮操作必须改变 Reader 阅读位置', { scrollBeforeClose });
  await page.waitForFunction(({ artifact: id, project }) => {
    const raw = sessionStorage.getItem(`lcos-reader-continuity-v1:${project}:${id}`);
    if (raw === null) return false;
    const value = JSON.parse(raw);
    return value.revisionId === 'revision-positioning-initial' && value.zoom === 110 && value.scrollTop > 0;
  }, { artifact: artifactId, project: projectId }, { timeout: 5_000 });
  result.reader = { target: artifactId, revision: expectedRevisionId, zoomBeforeClose: '110%', scrollTopBeforeClose: scrollBeforeClose };
  await page.screenshot({ path: snapshotPath('wave5_step3_reader_1366') });

  const readerRegion = readerBody.locator('xpath=ancestor::*[@data-lcos-window-region-id][1]');
  await requireVisible(readerRegion.locator('[aria-label="关闭窗口"]'), 'Reader 关闭动作');
  await readerRegion.locator('[aria-label="关闭窗口"]').click();
  await page.waitForFunction((id) => document.querySelector(`[data-lcos-window-body="reader"][data-lcos-window-target="${id}"]`) === null, artifactId, { timeout: 10_000 });
  assert(await page.locator('[data-lcos-window-body="reader"]').count() === 0, 'Reader 关闭后必须从窗口舞台移除');

  await artifactCard.hover();
  await artifactCard.locator('button[title="阅读"]').click();
  const reopenedReaderBody = page.locator('[data-lcos-window-body="reader"]');
  await requireVisible(reopenedReaderBody, 'Reader 重开窗口');
  assert(await reopenedReaderBody.getAttribute('data-lcos-window-target') === artifactId, 'Reader 重开必须复用同一 Artifact target');
  const reopenedReader = page.locator('[data-lcos-reader]');
  await requireVisible(reopenedReader, 'Reader 重开 body');
  await waitForText(page, '[data-lcos-reader-zoom-value]', '110%');
  const scrollAfterReopen = await reopenedReader.locator('[data-lcos-reader-content="text"]').evaluate((node) => node.scrollTop);
  assert(scrollAfterReopen >= Math.max(1, scrollBeforeClose - 2), 'Reader 重开必须恢复阅读位置', { scrollBeforeClose, scrollAfterReopen });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-lcos-project-shell]', { state: 'visible', timeout: 45_000 });
  await page.waitForSelector('.react-flow__viewport', { state: 'attached', timeout: 60_000 });
  const reloadedReaderBody = page.locator('[data-lcos-window-body="reader"]');
  await requireVisible(reloadedReaderBody, 'reload 后恢复的 Reader window', 30_000);
  assert(await reloadedReaderBody.getAttribute('data-lcos-window-target') === artifactId, 'reload 后 Reader target 必须保持 artifact identity');
  const reloadedReader = page.locator('[data-lcos-reader]');
  await requireVisible(reloadedReader, 'reload 后 Reader body', 30_000);
  await waitForText(page, '[data-lcos-reader-zoom-value]', '110%', 15_000);
  const scrollAfterReload = await reloadedReader.locator('[data-lcos-reader-content="text"]').evaluate((node) => node.scrollTop);
  assert(scrollAfterReload >= Math.max(1, scrollBeforeClose - 2), 'reload 后 Reader 必须恢复阅读位置', { scrollBeforeClose, scrollAfterReload });
  result.reader.reopen = { target: artifactId, zoom: '110%', scrollTop: scrollAfterReopen };
  result.reader.reload = { target: artifactId, zoom: '110%', scrollTop: scrollAfterReload };
  await page.screenshot({ path: snapshotPath('wave5_step4_reader_reload_1366') });

  const reloadedReaderRegion = reloadedReaderBody.locator('xpath=ancestor::*[@data-lcos-window-region-id][1]');
  await reloadedReaderRegion.locator('[aria-label="关闭窗口"]').click();
  await page.waitForFunction(() => document.querySelector('[data-lcos-window-body="reader"]') === null, undefined, { timeout: 10_000 });
  const reloadedAssemblyEntry = page.locator('[data-lcos-assembly-entry]').first();
  await requireVisible(reloadedAssemblyEntry, 'reload 后重新进入 Assembly 的真实入口');
  await reloadedAssemblyEntry.click();
  await requireVisible(assembly, 'Reader 关闭后的 Assembly window');

  // Assembly → reference → one shared Composer. This artifact has no receiver by design;
  // the assertion is the real fail-closed reason. We do not manufacture a provider success.
  await artifactCard.hover();
  await artifactCard.locator('[data-lcos-assembly-more]').click();
  await artifactCard.locator('[data-lcos-assembly-add]').click();
  const allComposers = page.locator('[data-lcos-composer]');
  const assemblyComposer = page.locator('[data-lcos-assembly-composer] [data-lcos-composer]');
  await requireVisible(assemblyComposer, 'Assembly inline Composer');
  assert(await allComposers.count() === 1, 'Assembly 引用后 Composer 必须只有一个真实实例', { count: await allComposers.count() });
  assert(await page.locator('[data-lcos-assembly-composer]').count() === 1, 'Assembly 必须只有一个 Composer host');
  const reference = assemblyComposer.locator(`[data-lcos-composer-ref][data-reference-key="artifact:${artifactId}"]`);
  await requireVisible(reference, 'Composer 中的 canonical artifact 引用');
  const submit = assemblyComposer.locator('[aria-label="提交"]');
  const blockedReason = '尚未选择会话接收者；请从会话窗口打开 Composer 后再提交';
  assert(await submit.isDisabled(), '没有 receiver 时 Composer 提交必须真实 disabled');
  assert(await submit.getAttribute('title') === blockedReason, 'Composer 必须展示真实 receiver blocked reason', {
    title: await submit.getAttribute('title'),
    expected: blockedReason,
  });
  const blocked = assemblyComposer.locator('[data-lcos-composer-receiver-blocked]');
  await requireVisible(blocked, 'Composer receiver blocked feedback');
  assert((await blocked.textContent() ?? '').includes(blockedReason), 'Composer blocked feedback 必须保留真实原因');

  const draftPrompt = 'Wave 5 blocked draft retention check';
  const composerInput = assemblyComposer.locator('[data-lcos-composer-input]');
  await composerInput.fill(draftPrompt);
  assert(await composerInput.inputValue() === draftPrompt, 'Composer 草稿输入必须写入真实 draft owner');
  await assemblyComposer.locator('[aria-label="关闭 Composer"]').click();
  await page.waitForFunction(() => document.querySelector('[data-lcos-composer]') === null, undefined, { timeout: 10_000 });
  assert(await page.locator('[data-lcos-composer]').count() === 0, '关闭 Composer 后不得残留第二个实例');

  await artifactCard.hover();
  await artifactCard.locator('[data-lcos-assembly-more]').click();
  await artifactCard.locator('[data-lcos-assembly-add]').click();
  const reopenedComposer = page.locator('[data-lcos-assembly-composer] [data-lcos-composer]');
  await requireVisible(reopenedComposer, '保留草稿后的 Composer 重开');
  assert(await page.locator('[data-lcos-composer]').count() === 1, 'Composer 重开仍必须只有一个实例');
  assert(await reopenedComposer.locator('[data-lcos-composer-input]').inputValue() === draftPrompt, 'blocked/关闭后 Composer 草稿必须保留');
  assert(await reopenedComposer.locator(`[data-lcos-composer-ref][data-reference-key="artifact:${artifactId}"]`).count() === 1, '重开后 canonical 引用不得重复');
  result.composer = {
    instances: 1,
    referenceKey: `artifact:${artifactId}`,
    submitDisabled: true,
    blockedReason,
    draftRetainedAfterCloseAndReopen: true,
    providerSuccessFabricated: false,
  };
  await page.screenshot({ path: snapshotPath('wave5_step5_composer_blocked_1366') });

  assert(result.consoleErrors.length === 0, '生产 route 不得产生 console error', { errors: result.consoleErrors });
  assert(result.pageErrors.length === 0, '生产 route 不得产生 page error', { errors: result.pageErrors });
} finally {
  await browser.close();
}

console.log(JSON.stringify(result, null, 2));
