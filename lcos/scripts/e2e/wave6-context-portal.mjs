// Wave 6 Context/Portal real vertical slice.
//
// This fixture intentionally uses the same two production write seams as the
// first visit UI: Huabu POST /api/canvas/ followed by Core workspace canvasId
// binding. It does not add a fixture-only object model or seed a second graph.
//
// Run after the isolated stack is up:
//   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/e2e/r0-e2e-env.ps1 reset
//   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/e2e/r0-e2e-env.ps1 up
//   node scripts/e2e/wave6-context-portal.mjs
import { chromium } from 'playwright-core';

const BASE = process.env.LCOS_E2E_BASE ?? 'http://localhost:5273';
const CORE = process.env.LCOS_E2E_CORE ?? 'http://127.0.0.1:43131';
const HUABU = process.env.LCOS_E2E_HUABU ?? 'http://127.0.0.1:3011';
const CORE_TOKEN = process.env.LCOS_E2E_CORE_TOKEN ?? 'dev-token';
const PROJECT_ID = process.env.LCOS_E2E_PROJECT ?? 'lcos-gen2-dev';
const SHOTS = process.env.LCOS_E2E_SHOTS ?? 'C:/Users/1/AppData/Local/Temp/trae/screenshots';
const EXE = process.env.LCOS_E2E_CHROMIUM ??
  'C:/Users/1/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const SOURCE_WORKSPACE = 'workspace-real-context';
const TARGET_WORKSPACE = 'workspace-real-main';
const SOURCE_LABEL = 'Wave6 Context Portal source fixture';

const authHeaders = { Authorization: `Bearer ${CORE_TOKEN}` };
const jsonHeaders = { ...authHeaders, 'Content-Type': 'application/json' };

async function readJson(url, init = {}) {
  const response = await fetch(url, init);
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${url} -> ${response.status}: ${text.slice(0, 300)}`);
  return body;
}

async function core(path, init = {}) {
  return readJson(`${CORE}${path}`, { ...init, headers: { ...authHeaders, ...(init.headers ?? {}) } });
}

async function huabu(path, init = {}) {
  return readJson(`${HUABU}${path}`, { ...init, headers: { ...authHeaders, ...(init.headers ?? {}) } });
}

function unwrap(value) {
  return value && typeof value === 'object' && 'value' in value ? value.value : value;
}

function canvasNodes(payload) {
  const record = unwrap(payload);
  if (!record || typeof record !== 'object') return [];
  if (Array.isArray(record.nodes)) return record.nodes;
  if (record.state && typeof record.state === 'object' && Array.isArray(record.state.nodes)) return record.state.nodes;
  return [];
}

async function createCanvas(title) {
  const result = await huabu('/api/canvas/', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ title }),
  });
  const record = unwrap(result);
  if (!record?.canvasId) throw new Error(`Huabu create canvas returned no canvasId: ${JSON.stringify(result).slice(0, 300)}`);
  return String(record.canvasId);
}

async function ensureWorkspaceCanvas(workspaces, workspaceId, title) {
  const workspace = workspaces.find((item) => item.id === workspaceId);
  if (!workspace) throw new Error(`fixture workspace missing: ${workspaceId}`);
  let canvasId = workspace.canvasId;
  if (canvasId) {
    try {
      await huabu(`/api/canvas/${encodeURIComponent(canvasId)}`);
    } catch {
      canvasId = undefined;
    }
  }
  if (!canvasId) {
    canvasId = await createCanvas(title);
    await core(`/projects/${encodeURIComponent(PROJECT_ID)}/workspaces/${encodeURIComponent(workspaceId)}`, {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({ canvasId }),
    });
  }
  return canvasId;
}

async function ensureSourceNode(canvasId) {
  const existing = canvasNodes(await huabu(`/api/canvas/${encodeURIComponent(canvasId)}`));
  const found = existing.find((node) => node?.data?.label === SOURCE_LABEL);
  if (found?.id) return String(found.id);
  const result = await huabu(`/api/canvas/${encodeURIComponent(canvasId)}/execute`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({
      commands: [{
        type: 'CREATE_NODES',
        nodes: [{
          nodeType: 'note',
          data: { label: SOURCE_LABEL, content: 'Fixture source for Context → child worksite → return.' },
          position: { x: 140, y: 120 },
          size: { width: 360, height: 180 },
        }],
      }],
      originator: { source: 'agent', threadId: 'wave6-context-portal-fixture' },
    }),
  });
  const inserted = unwrap(result)?.results?.[0]?.nodes?.[0]?.nodeId;
  if (!inserted) throw new Error(`fixture source node was not created: ${JSON.stringify(result).slice(0, 400)}`);
  return String(inserted);
}

const browser = await chromium.launch({ executablePath: EXE, headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const failures = [];
const evidence = {};
const consoleErrors = [];
const httpErrors = [];
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 300));
});
page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${String(error.message).slice(0, 300)}`));
page.on('response', (response) => {
  if (response.status() >= 400) httpErrors.push(`${response.status()} ${response.url()}`);
});
const check = (condition, message) => { if (!condition) failures.push(message); };
const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}` });
const cameraTransition = () => page.evaluate(async () => {
  const module = await import('/src/lcos/shell/lcosShellStore.ts');
  return module.useLcosShellStore.getState().worksiteCameraTransition;
});
const startCameraSamples = () => page.evaluate(() => {
  const target = window;
  target.__lcosCameraSamples = [];
  const startedAt = performance.now();
  target.__lcosCameraSampleTimer = window.setInterval(() => {
    target.__lcosCameraSamples.push({
      ms: Math.round(performance.now() - startedAt),
      url: window.location.href,
      style: document.querySelector('.react-flow__viewport')?.getAttribute('style') ?? null,
    });
  }, 16);
});
const stopCameraSamples = () => page.evaluate(() => {
  const target = window;
  window.clearInterval(target.__lcosCameraSampleTimer);
  return target.__lcosCameraSamples;
});

try {
  const projects = unwrap(await core('/projects'));
  check(Array.isArray(projects) && projects.some((project) => project.id === PROJECT_ID), `Core project missing: ${PROJECT_ID}`);
  const workspaces = unwrap(await core(`/projects/${encodeURIComponent(PROJECT_ID)}/workspaces`));
  if (!Array.isArray(workspaces)) throw new Error('Core workspace response is not an array');

  // Reproducible source and target canvas setup. No production-only fixture
  // endpoint: this is exactly createCanvas + updateWorkspaceCanvasId.
  const sourceCanvasId = await ensureWorkspaceCanvas(workspaces, SOURCE_WORKSPACE, 'Wave6 Context Portal source');
  // Every run binds a fresh target. This proves the existing no-saved-viewport
  // first-fit branch instead of inheriting state from an earlier test run.
  const targetCanvasId = await createCanvas('Wave6 Context Portal fresh target');
  await core(`/projects/${encodeURIComponent(PROJECT_ID)}/workspaces/${encodeURIComponent(TARGET_WORKSPACE)}`, {
    method: 'PUT',
    headers: jsonHeaders,
    body: JSON.stringify({ canvasId: targetCanvasId }),
  });
  const sourceNodeId = await ensureSourceNode(sourceCanvasId);
  evidence.fixture = { sourceWorkspaceId: SOURCE_WORKSPACE, sourceCanvasId, sourceNodeId, targetWorkspaceId: TARGET_WORKSPACE, targetCanvasId };

  await page.goto(`${BASE}/projects/${encodeURIComponent(PROJECT_ID)}/context`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('[data-lcos-project-shell]', { timeout: 30000 });
  await page.waitForSelector(`[data-id="${sourceNodeId}"]`, { timeout: 30000 });
  await page.waitForTimeout(1200);
  const sourceStageCanvas = await page.locator('[data-lcos-worksite-stage]').getAttribute('data-lcos-canvas-id');
  check(sourceStageCanvas === sourceCanvasId, `Context source canvas mismatch: ${sourceStageCanvas} !== ${sourceCanvasId}`);

  const sourceNode = page.locator(`[data-id="${sourceNodeId}"]`);
  const sourceBox = await sourceNode.boundingBox();
  if (!sourceBox) throw new Error('source fixture node has no browser box');
  await page.mouse.click(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.waitForTimeout(250);
  // Capture the exact currently rendered source framing. The following
  // approach visibly moves away from it, and return must restore this value;
  // the test does not depend on a particular zoom increment or fit timing.
  const sourceViewport = await page.locator('.react-flow__viewport').getAttribute('style');
  const selectedBefore = await page.locator(`[data-id="${sourceNodeId}"].selected`).count();
  check(selectedBefore === 1, 'Context source node was not selected before entering Atlas');
  check(!!sourceViewport, 'Context source viewport was not readable before entering Atlas');
  evidence.source = { canvasId: sourceStageCanvas, selectedNodeId: sourceNodeId, selectedBefore, viewport: sourceViewport };
  await shot('wave6_context_portal_source.png');

  await page.locator('[data-lcos-context-instrument="atlas"]').click();
  await page.waitForTimeout(350);
  const enterTarget = page.locator('button[aria-label="进入集合 · 施工主线"]:not([disabled])').last();
  check(await enterTarget.count() === 1, 'enabled Atlas target “施工主线” not found');
  await startCameraSamples();
  await enterTarget.click();
  await page.waitForURL(/\/projects\/[^/]+\/main\?workspaceId=workspace-real-main$/, { timeout: 30000 });
  await page.waitForSelector('[data-lcos-child-return]', { timeout: 30000 });
  const approachSamples = await stopCameraSamples();
  const visibleApproachSamples = approachSamples.filter((sample) =>
    sample.url.endsWith('/context') && sample.style !== null && sample.style !== sourceViewport);
  check(visibleApproachSamples.length > 0, 'source approach produced no visible camera samples before routing');
  evidence.approach = {
    sampleCount: visibleApproachSamples.length,
    first: visibleApproachSamples[0],
    last: visibleApproachSamples.at(-1),
  };
  const childTransition = await cameraTransition();
  const childViewport = await page.locator('.react-flow__viewport').getAttribute('style');
  evidence.child = {
    url: page.url(),
    canvasId: await page.locator('[data-lcos-worksite-stage]').getAttribute('data-lcos-canvas-id'),
    viewport: childViewport,
    transition: childTransition,
  };
  check(page.url().includes(`workspaceId=${TARGET_WORKSPACE}`), `child route did not identify target workspace: ${page.url()}`);
  check(evidence.child.canvasId === targetCanvasId, `child canvas mismatch: ${evidence.child.canvasId} !== ${targetCanvasId}`);
  check(childTransition === null, `fresh target should consume transition and keep existing first-fit: ${JSON.stringify(childTransition)}`);
  await shot('wave6_context_portal_child.png');

  // Give the target a real persisted viewport through the existing camera
  // control, then return once. The second entry below now has a settle pose
  // that can be interrupted by an immediate return.
  await page.getByRole('button', { name: '放大' }).click();
  await page.waitForTimeout(500);
  await page.locator('[data-lcos-child-return]').click();
  await page.waitForURL(new RegExp(`/projects/[^/]+/context$`), { timeout: 30000 });
  await page.waitForSelector(`[data-id="${sourceNodeId}"]`, { timeout: 30000 });
  await page.waitForTimeout(650);

  // The second entry is an independent user action: make the exact source
  // selection explicit again before testing an interrupted target settle.
  const sourceNodeAgain = page.locator(`[data-id="${sourceNodeId}"]`);
  const sourceBoxAgain = await sourceNodeAgain.boundingBox();
  if (!sourceBoxAgain) throw new Error('returned source node has no browser box');
  await page.mouse.click(
    sourceBoxAgain.x + sourceBoxAgain.width / 2,
    sourceBoxAgain.y + sourceBoxAgain.height / 2,
  );
  await page.waitForTimeout(150);

  await page.locator('[data-lcos-context-instrument="atlas"]').click();
  await page.waitForTimeout(250);
  await page.locator('button[aria-label="进入集合 · 施工主线"]:not([disabled])').last().click();
  await page.waitForURL(/\/projects\/[^/]+\/main\?workspaceId=workspace-real-main$/, { timeout: 30000 });
  await page.waitForSelector('[data-lcos-child-return]', { timeout: 30000 });
  const interruptedTargetTransition = await cameraTransition();
  check(
    interruptedTargetTransition === null || interruptedTargetTransition.kind === 'enter-settle',
    `second entry exposed an unexpected transition: ${JSON.stringify(interruptedTargetTransition)}`,
  );
  await page.locator('[data-lcos-child-return]').click();
  await page.waitForURL(new RegExp(`/projects/[^/]+/context$`), { timeout: 30000 });
  await page.waitForSelector(`[data-id="${sourceNodeId}"]`, { timeout: 30000 });
  await page.waitForTimeout(650);
  const returnedCanvasId = await page.locator('[data-lcos-worksite-stage]').getAttribute('data-lcos-canvas-id');
  const returnedViewport = await page.locator('.react-flow__viewport').getAttribute('style');
  const selectedAfter = await page.locator(`[data-id="${sourceNodeId}"].selected`).count();
  const transitionAfterReturn = await cameraTransition();
  const returnedUrl = new URL(page.url());
  evidence.returned = { url: page.url(), canvasId: returnedCanvasId, viewport: returnedViewport, selectedNodeId: sourceNodeId, selectedAfter };
  check(returnedUrl.searchParams.get('workspaceId') === null, `return route retained child workspace query: ${page.url()}`);
  check(returnedCanvasId === sourceCanvasId, `return source canvas mismatch: ${returnedCanvasId} !== ${sourceCanvasId}`);
  check(returnedViewport === sourceViewport, `return viewport mismatch: ${returnedViewport} !== ${sourceViewport}`);
  check(selectedAfter === 1, 'source selection was not restored after returning from child worksite');
  check(transitionAfterReturn === null, `quick return left a worksite camera transition behind: ${JSON.stringify(transitionAfterReturn)}`);
  check(consoleErrors.length === 0, `browser console errors: ${consoleErrors.join(' | ')}`);
  await shot('wave6_context_portal_return.png');
} catch (error) {
  failures.push(String(error));
  await shot('wave6_context_portal_failure.png').catch(() => undefined);
} finally {
  await browser.close();
}

console.log(JSON.stringify({
  status: failures.length === 0 ? 'PASS' : 'FAIL',
  failures,
  evidence,
  consoleErrors,
  httpErrors,
}, null, 2));
if (failures.length > 0) process.exitCode = 1;
