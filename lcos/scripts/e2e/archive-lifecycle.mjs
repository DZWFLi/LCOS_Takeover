// Artifact Archive fail-fast vertical:
// Assembly → Reader archive → active node/binding removed → Archive/Reader
// read-only → restore → fresh node/binding → reload persistence.
//
// Requires the isolated Gen2 stack and its e2e fixture project:
//   LCOS_E2E_WEB_URL=http://localhost:5276 node scripts/e2e/archive-lifecycle.mjs

import { runScenario } from './_harness.mjs';

const BASE = process.env.LCOS_E2E_WEB_URL ?? 'http://localhost:5276';
const PROJECT = 'lcos-gen2-dev';
const ARTIFACT = 'artifact-positioning';
const TOKEN = process.env.LCOS_E2E_TOKEN ?? 'dev-token';

async function core(path, init = {}) {
  const response = await fetch(`${BASE}/lcos-core${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...init.headers,
    },
  });
  const body = await response.json();
  if (!response.ok || body.ok === false) {
    throw new Error(`Core ${init.method ?? 'GET'} ${path} failed: HTTP ${response.status} ${JSON.stringify(body)}`);
  }
  return body.value;
}

async function binding() {
  const bindings = await core(`/projects/${PROJECT}/spatial/bindings`);
  return bindings.find((item) => item.entityType === 'artifact' && item.entityId === ARTIFACT);
}

async function poll(read, accept, message, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await read();
    if (accept(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(message);
}

await runScenario({
  name: 'artifact-archive-lifecycle',
  baseUrl: BASE,
  body: async (h) => {
    // Normalize the isolated fixture to active. Repeated restore is idempotent.
    await core(`/projects/${PROJECT}/artifacts/${ARTIFACT}/restore`, {
      method: 'POST',
      body: JSON.stringify({ operationId: `e2e-prepare-${Date.now()}` }),
    });
    await h.goto(`/projects/${PROJECT}/main`);
    await h.page.waitForSelector('.react-flow, [data-lcos-worksite-stage-empty="main"]', { timeout: 40_000 });
    if (!await h.has('.react-flow')) {
      const establish = h.page.getByRole('button', { name: '建立主画布' });
      h.requireEqual(await establish.count(), 1, 'fresh fixture 应提供唯一的主画布建立入口');
      await establish.click();
    }
    await h.requireSelector('.react-flow', { timeout: 40_000 });
    await h.requireSelector('.react-flow__node', { timeout: 40_000 });
    const oldBinding = await poll(binding, Boolean, 'active Artifact never received a ProjectionBinding');
    h.requireNonEmpty(oldBinding.spatialId, 'old spatial id');

    await h.page.locator('[data-lcos-assembly-entry]').click();
    await h.requireSelector('[data-lcos-assembly]');
    const activeItem = h.page.locator(`[data-lcos-assembly-item="${ARTIFACT}"]`);
    await activeItem.waitFor({ state: 'visible', timeout: 20_000 });
    await activeItem.locator('[data-lcos-assembly-more]').click();
    await activeItem.getByRole('button', { name: '阅读' }).click();
    await h.requireSelector('[data-lcos-reader]');
    await h.page.locator('[data-lcos-reader-lifecycle="archive"]').click();
    await h.requireSelector('[data-lcos-reader-archived]');

    await poll(binding, (value) => value === undefined, 'archive left the old ProjectionBinding active');
    await poll(
      () => h.page.locator('.react-flow__node').filter({ hasText: '项目定位' }).count(),
      (count) => count === 0,
      'archive left the old Huabu node active',
    );

    await h.page.keyboard.press('Escape');
    await h.page.locator('[data-lcos-assembly-entry]').click();
    await h.requireSelector('[data-lcos-assembly]');
    await h.page.locator('[data-lcos-open-archive]').click();
    await h.requireSelector('[data-lcos-archive-body]');
    const coldItem = h.page.locator(`[data-lcos-archive-item="${ARTIFACT}"]`);
    await coldItem.waitFor({ state: 'visible', timeout: 20_000 });
    await coldItem.getByRole('button', { name: '查看' }).click();
    await h.requireSelector('[data-lcos-reader-archived]');
    await h.page.locator('[data-lcos-reader-lifecycle="restore"]').click();
    await h.page.locator('[data-lcos-reader-archived]').waitFor({ state: 'detached', timeout: 20_000 });

    const freshBinding = await poll(binding, Boolean, 'restore did not create a fresh ProjectionBinding');
    h.requireTrue(freshBinding.spatialId !== oldBinding.spatialId, 'restore reused the archived node id');
    await h.page.keyboard.press('Escape');
    await poll(
      () => h.page.locator('.react-flow__node').filter({ hasText: '项目定位' }).count(),
      (count) => count === 1,
      'restored Artifact never appeared on the active canvas',
    );

    await h.page.reload({ waitUntil: 'domcontentloaded' });
    await h.requireSelector('.react-flow', { timeout: 40_000 });
    const afterReload = await poll(binding, Boolean, 'fresh ProjectionBinding disappeared after reload');
    h.requireEqual(afterReload.spatialId, freshBinding.spatialId, 'reload changed the fresh ProjectionBinding');
    const screenshot = `${process.env.TEMP ?? '.'}/archive-lifecycle-pass.png`;
    await h.screenshot(screenshot);
    console.log(JSON.stringify({
      archiveLifecycleEvidence: {
        oldSpatialId: oldBinding.spatialId,
        freshSpatialId: freshBinding.spatialId,
        afterReloadSpatialId: afterReload.spatialId,
        screenshot,
      },
    }));
  },
});
