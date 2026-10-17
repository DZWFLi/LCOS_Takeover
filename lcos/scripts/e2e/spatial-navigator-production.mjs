import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { runScenario } from './_harness.mjs';

const shots = resolve('.e2e-data/shots');
mkdirSync(shots, { recursive: true });

const viewportTransform = (page) => page.locator('.react-flow__viewport').getAttribute('style');

async function ensureCanvas(page, surface, createLabel, previousCanvasId) {
  await page.locator(`[data-lcos-surface="${surface}"]`).click();
  await page.waitForFunction((nextSurface) =>
    document.querySelector(`[data-lcos-surface="${nextSurface}"]`)?.getAttribute('data-lcos-surface-active') === 'true'
      && location.pathname.endsWith(`/${nextSurface}`),
  surface);
  const create = page.getByRole('button', { name: createLabel });
  await create.waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined);
  if (await create.isVisible().catch(() => false)) await create.click();
  await page.waitForSelector('.react-flow', { timeout: 30000 });
  await page.waitForSelector('[data-lcos-spatial-navigator]', { timeout: 30000 });
  if (previousCanvasId !== undefined) {
    await page.waitForFunction(async (prior) => {
      const canvasModule = await import('/src/store/canvasStore.ts');
      return canvasModule.default.getState().canvasId !== prior;
    }, previousCanvasId);
  }
}

await runScenario({
  name: 'spatial-navigator-production',
  baseUrl: process.env.LCOS_BASE_URL ?? 'http://localhost:5273',
  async body(h) {
    await h.page.addInitScript(() => {
      if (sessionStorage.getItem('lcos.spatialNavigator.e2eInitialized') !== 'true') {
        localStorage.setItem('huabu.gridEnabled', 'true');
        localStorage.setItem('huabu.minimapEnabled', 'true');
        sessionStorage.setItem('lcos.spatialNavigator.e2eInitialized', 'true');
      }
    });
    await h.goto('/projects/lcos-gen2-dev/main');
    const createMain = h.page.getByRole('button', { name: '建立主画布' });
    if (await createMain.count()) await createMain.click();
    await h.requireSelector('.react-flow', { timeout: 30000 });
    await h.requireSelector('.react-flow__node', { timeout: 30000 });
    await h.requireSelector('[data-lcos-spatial-navigator]');

    h.requireEqual(await h.count('[data-lcos-spatial-navigator]'), 1, 'Spatial Navigator must mount once');
    h.requireEqual(await h.count('[data-lcos-family="camera-controls"]'), 0, 'legacy LcosCameraControls must be retired');
    h.requireEqual(await h.count('.react-flow__controls'), 0, 'stock Huabu Controls must remain retired in LCOS');
    const collapsed = await h.page.locator('[data-lcos-spatial-navigator]').boundingBox();
    h.requireTrue(collapsed !== null, 'collapsed navigator must be measurable');
    h.requireEqual(Math.round(collapsed.width), 52, 'Figma collapsed navigator width');
    h.requireEqual(Math.round(collapsed.height), 48, 'Figma collapsed navigator height');

    await h.page.getByRole('button', { name: '打开空间导航' }).click();
    await h.requireSelector('[data-lcos-expanded="true"]');
    await h.requireSelector('.react-flow__minimap');
    h.requireEqual(await h.count('.react-flow__minimap'), 1, 'current canvas must own one MiniMap');

    const zoomText = h.page.locator('[data-lcos-spatial-navigator-zoom]');
    const initialZoom = await zoomText.textContent();
    await h.page.getByRole('button', { name: '缩小' }).click();
    await h.page.waitForFunction((before) =>
      document.querySelector('[data-lcos-spatial-navigator-zoom]')?.textContent !== before,
    initialZoom);
    const zoomedOut = await zoomText.textContent();
    h.requireTrue(zoomedOut !== initialZoom, 'zoom-out must update the owner viewport readout');

    await h.page.getByRole('button', { name: '放大' }).click();
    await h.page.waitForFunction((before) =>
      document.querySelector('[data-lcos-spatial-navigator-zoom]')?.textContent !== before,
    zoomedOut);

    await h.page.getByRole('button', { name: /恢复 100%/ }).click();
    await h.page.waitForFunction(() =>
      document.querySelector('[data-lcos-spatial-navigator-zoom]')?.textContent === '100%');
    const resetTransform = await viewportTransform(h.page);
    await h.page.getByRole('button', { name: '适合画面' }).click();
    await h.page.waitForFunction((before) =>
      document.querySelector('.react-flow__viewport')?.getAttribute('style') !== before,
    resetTransform);
    const fitTransform = await viewportTransform(h.page);
    h.requireTrue(fitTransform !== resetTransform, 'fit must reframe through LcosCanvasCommands');

    const firstNode = h.page.locator('.react-flow__node').first();
    const firstNodeId = await firstNode.getAttribute('data-id');
    h.requireNonEmpty(firstNodeId, 'lock scenario needs a real node id');
    const nodePosition = () => h.page.evaluate(async (nodeId) => {
      const canvasModule = await import('/src/store/canvasStore.ts');
      const node = canvasModule.default.getState().nodes.find((candidate) => candidate.id === nodeId);
      return node ? { x: node.position.x, y: node.position.y } : null;
    }, firstNodeId);
    const beforeLockedDrag = await nodePosition();
    const nodeBox = await firstNode.boundingBox();
    h.requireTrue(nodeBox !== null, 'locked node must be measurable');
    await h.page.getByRole('button', { name: '锁定画布' }).click();
    await h.page.getByRole('button', { name: '解锁画布' }).waitFor();
    await h.page.mouse.move(nodeBox.x + nodeBox.width / 2, nodeBox.y + nodeBox.height / 2);
    await h.page.mouse.down();
    await h.page.mouse.move(nodeBox.x + nodeBox.width / 2 + 120, nodeBox.y + nodeBox.height / 2 + 80, { steps: 8 });
    await h.page.mouse.up();
    const afterLockedDrag = await nodePosition();
    h.requireEqual(JSON.stringify(afterLockedDrag), JSON.stringify(beforeLockedDrag), 'lock must block node drag');
    await h.page.getByRole('button', { name: '解锁画布' }).click();

    await h.page.getByRole('button', { name: '隐藏网格' }).click();
    await h.page.getByRole('button', { name: '隐藏小地图' }).click();
    h.requireEqual(await h.count('.react-flow__background'), 0, 'grid toggle must remove Background');
    h.requireEqual(await h.count('.react-flow__minimap'), 0, 'MiniMap toggle must remove current map');
    await h.page.reload({ waitUntil: 'domcontentloaded' });
    await h.requireSelector('[data-lcos-spatial-navigator]');
    h.requireEqual(await h.count('.react-flow__background'), 0, 'grid preference must survive reload');
    await h.page.getByRole('button', { name: '打开空间导航' }).click();
    await h.requireSelector('[data-lcos-spatial-navigator-empty-map]');
    h.requireEqual(await h.count('.react-flow__minimap'), 0, 'MiniMap preference must survive reload');
    await h.page.getByRole('button', { name: '显示网格' }).click();
    await h.page.getByRole('button', { name: '显示小地图' }).click();
    await h.requireSelector('.react-flow__background');
    await h.requireSelector('.react-flow__minimap');

    const beforeMiniMapPan = await viewportTransform(h.page);
    const miniMap = h.page.locator('.react-flow__minimap');
    const miniMapBox = await miniMap.boundingBox();
    h.requireTrue(miniMapBox !== null, 'MiniMap must be measurable for pan');
    await h.page.mouse.move(miniMapBox.x + miniMapBox.width / 2, miniMapBox.y + miniMapBox.height / 2);
    await h.page.mouse.down();
    await h.page.mouse.move(miniMapBox.x + miniMapBox.width / 2 + 36, miniMapBox.y + miniMapBox.height / 2 + 18, { steps: 6 });
    await h.page.mouse.up();
    await h.page.waitForFunction((before) =>
      document.querySelector('.react-flow__viewport')?.getAttribute('style') !== before,
    beforeMiniMapPan);
    const afterMiniMapPan = await viewportTransform(h.page);

    const mainCanvasId = await h.page.evaluate(async () => {
      const canvasModule = await import('/src/store/canvasStore.ts');
      return canvasModule.default.getState().canvasId;
    });
    await ensureCanvas(h.page, 'context', '建立语境画布', mainCanvasId);
    const contextCanvasId = await h.page.evaluate(async () => {
      const canvasModule = await import('/src/store/canvasStore.ts');
      return canvasModule.default.getState().canvasId;
    });
    h.requireTrue(contextCanvasId !== mainCanvasId, 'surface switch must bind a different current canvas');
    h.requireEqual(await h.count('[data-lcos-spatial-navigator]'), 1, 'surface switch must keep one navigator');
    h.requireEqual(await h.count('.react-flow__controls'), 0, 'surface switch must not restore stock Controls');
    await h.page.getByRole('button', { name: '打开空间导航' }).click();
    await h.requireSelector('.react-flow__minimap');
    h.requireEqual(await h.count('.react-flow__minimap'), 1, 'context canvas must own one MiniMap');
    await ensureCanvas(h.page, 'main', '建立主画布', contextCanvasId);
    const returnedCanvasId = await h.page.evaluate(async () => {
      const canvasModule = await import('/src/store/canvasStore.ts');
      return canvasModule.default.getState().canvasId;
    });
    h.requireEqual(returnedCanvasId, mainCanvasId, 'returning to Main must restore its canvas owner');
    h.requireEqual(await h.count('[data-lcos-spatial-navigator]'), 1, 'Main return must keep one navigator');

    await h.page.getByRole('button', { name: '打开空间导航' }).click();
    await h.screenshot(resolve(shots, 'spatial-navigator-production.png'));
    console.log(JSON.stringify({
      initialZoom,
      zoomedOut,
      resetTransform,
      fitTransform,
      beforeLockedDrag,
      afterLockedDrag,
      beforeMiniMapPan,
      afterMiniMapPan,
      mainCanvasId,
      contextCanvasId,
      returnedCanvasId,
    }, null, 2));
  },
});
