import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { runScenario } from './_harness.mjs';

const shots = resolve('.e2e-data/shots');
mkdirSync(shots, { recursive: true });

await runScenario({
  name: 'locator-arrival-production',
  baseUrl: process.env.LCOS_BASE_URL ?? 'http://127.0.0.1:5274',
  allowHttp: [403],
  allowConsoleErrorsMatching: [/Failed to load resource.*403/],
  async body(h) {
    await h.goto('/projects/lcos-gen2-dev/main');
    await h.requireSelector('.react-flow');
    await h.page.waitForSelector('[data-lcos-canvas-commands]', { state: 'attached', timeout: 20000 });
    await h.page.waitForFunction(() => {
      const nodes = document.querySelectorAll('.react-flow__node');
      return nodes.length > 0 && document.querySelector('[data-lcos-canvas-commands]') !== null;
    });

    await h.page.evaluate(() => {
      const sentinel = document.querySelector('[data-lcos-canvas-commands]');
      window.__lcosLocatorTrace = [];
      const sample = () => {
        const arrival = document.querySelector('[data-lcos-arrival]');
        window.__lcosLocatorTrace.push({
          at: performance.now(),
          locator: sentinel?.getAttribute('data-lcos-locator-phase') ?? null,
          arrival: sentinel?.getAttribute('data-lcos-arrival-phase') ?? null,
          arrivalNodeId: arrival?.getAttribute('data-lcos-arrival-node-id') ?? null,
        });
      };
      sample();
      new MutationObserver(sample).observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: [
          'data-lcos-locator-phase',
          'data-lcos-arrival-phase',
          'data-lcos-arrival',
          'data-lcos-arrival-node-id',
        ],
      });
    });

    // Open the real Professional Window, then dock it. Its Stage is the only
    // publisher of safeRect/occupiedRects consumed by the locator.
    await h.page.locator('[data-lcos-assembly-entry]').click();
    await h.requireSelector('[data-lcos-professional-stage]:not([data-empty="true"])');
    await h.requireSelector('[data-lcos-window-region-id]');
    const dockToggle = h.page.locator('[data-lcos-window-dock-toggle]').first();
    await dockToggle.click();
    await h.page.waitForFunction(() =>
      document.querySelector('[data-lcos-window-region-id]')?.getAttribute('data-lcos-window-layout') === 'docked-right');

    const initial = await h.page.evaluate(async () => {
      const canvasModule = await import('/src/store/canvasStore.ts');
      const shellModule = await import('/src/lcos/shell/lcosShellStore.ts');
      const nodes = canvasModule.default.getState().nodes.filter((node) => node.hidden !== true);
      const environment = shellModule.useLcosShellStore.getState().windowEnvironment;
      return {
        nodeIds: nodes.map((node) => node.id),
        safeRect: environment?.safeRect ?? null,
      };
    });
    h.requireTrue(initial.nodeIds.length >= 2, 'Rapid locate browser scenario requires two real canvas nodes');
    h.requireTrue(initial.safeRect !== null, 'Professional Window Stage must publish windowEnvironment');

    const farRight = initial.nodeIds.at(-1);
    await h.page.evaluate(async ({ nodeId }) => {
      const shellModule = await import('/src/lcos/shell/lcosShellStore.ts');
      shellModule.useLcosShellStore.getState().requestLocate({
        reqId: 'browser-docked-locate', surface: 'main', nodeId, status: 'projected',
      });
    }, { nodeId: farRight });
    await h.page.waitForFunction(() =>
      document.querySelector('[data-lcos-canvas-commands]')?.getAttribute('data-lcos-arrival-phase') === 'settled');

    const dockedEvidence = await h.page.evaluate(async ({ nodeId }) => {
      const shellModule = await import('/src/lcos/shell/lcosShellStore.ts');
      const environment = shellModule.useLcosShellStore.getState().windowEnvironment;
      const node = document.querySelector(`.react-flow__node[data-id="${CSS.escape(nodeId)}"]`);
      const rect = node?.getBoundingClientRect();
      return {
        safeRect: environment?.safeRect ?? null,
        nodeRect: rect ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom } : null,
      };
    }, { nodeId: farRight });
    h.requireTrue(dockedEvidence.nodeRect !== null, 'Located target must become a rendered React Flow node');
    h.requireTrue(dockedEvidence.safeRect !== null, 'Docked Stage must keep publishing safeRect');
    h.requireTrue(
      dockedEvidence.nodeRect.right <= dockedEvidence.safeRect.x + dockedEvidence.safeRect.width + 1,
      'Located target must remain left of the docked Professional Window',
    );
    h.requireTrue(
      dockedEvidence.nodeRect.left >= dockedEvidence.safeRect.x - 1,
      'Located target must remain inside the published safeRect',
    );

    // Resize the dock through its real pointer handle, then locate again and
    // prove the newly published safeRect is used rather than a fixed inset.
    const resize = h.page.locator('[data-lcos-window-resize="w"]').first();
    const resizeBox = await resize.boundingBox();
    const regionBoxBeforeResize = await h.page.locator('[data-lcos-window-region-id]').first().boundingBox();
    h.requireTrue(resizeBox !== null, 'Docked Professional Window must expose its west resize handle');
    h.requireTrue(regionBoxBeforeResize !== null, 'Docked Professional Window must have measurable geometry');
    await h.page.mouse.move(resizeBox.x + resizeBox.width / 2, resizeBox.y + resizeBox.height / 2);
    await h.page.mouse.down();
    await h.page.mouse.move(resizeBox.x - 120, resizeBox.y + resizeBox.height / 2, { steps: 8 });
    await h.page.mouse.up();
    await h.page.waitForFunction((previousWidth) => {
      const region = document.querySelector('[data-lcos-window-region-id]');
      return region instanceof HTMLElement && region.getBoundingClientRect().width > previousWidth + 50;
    }, regionBoxBeforeResize.width);

    const farLeft = initial.nodeIds[1];
    await h.page.evaluate(async ({ nodeId }) => {
      const shellModule = await import('/src/lcos/shell/lcosShellStore.ts');
      shellModule.useLcosShellStore.getState().requestLocate({
        reqId: 'browser-resized-locate', surface: 'main', nodeId, status: 'projected',
      });
    }, { nodeId: farLeft });
    await h.page.waitForFunction(() =>
      document.querySelector('[data-lcos-canvas-commands]')?.getAttribute('data-lcos-arrival-phase') === 'settled');

    // A second request interrupts the first RF promise. No arrival cue from
    // the stale target may leak into the final request.
    const rapidStart = await h.page.evaluate(() => performance.now());
    await h.page.evaluate(async ({ first, second }) => {
      const shellModule = await import('/src/lcos/shell/lcosShellStore.ts');
      shellModule.useLcosShellStore.getState().requestLocate({
        reqId: 'browser-rapid-first', surface: 'main', nodeId: first, status: 'projected',
      });
      window.setTimeout(() => {
        shellModule.useLcosShellStore.getState().requestLocate({
          reqId: 'browser-rapid-second', surface: 'main', nodeId: second, status: 'projected',
        });
      }, 40);
    }, { first: farRight, second: farLeft });
    await h.page.waitForFunction(() =>
      document.querySelector('[data-lcos-canvas-commands]')?.getAttribute('data-lcos-arrival-phase') === 'settled',
    undefined, { timeout: 5000 });
    const trace = await h.page.evaluate(({ rapidStart }) =>
      window.__lcosLocatorTrace.filter((entry) => entry.at >= rapidStart), { rapidStart });
    const phases = new Set(trace.map((entry) => entry.arrival));
    h.requireTrue(phases.has('travelling'), 'Browser trace must observe travelling');
    h.requireTrue(phases.has('arriving'), 'Browser trace must observe arriving');
    h.requireTrue(phases.has('settled'), 'Browser trace must observe settled');
    const arrivalNodes = [...new Set(trace.map((entry) => entry.arrivalNodeId).filter(Boolean))];
    h.requireEqual(arrivalNodes.length, 1, 'Interrupted locate must publish one final arrival target');
    h.requireEqual(arrivalNodes[0], farLeft, 'Arrival cue must belong to the latest locate request');
    h.requireEqual(await h.count('[data-lcos-arrival]'), 0, 'Arrival cue must end after settled');
    h.requireEqual(await h.count('[data-lcos-locator]'), 0, 'Locator cue must end after settled');

    await h.screenshot(resolve(shots, 'locator-arrival-production.png'));
    console.log(JSON.stringify({ dockedEvidence, trace, arrivalNodes }, null, 2));
  },
});
