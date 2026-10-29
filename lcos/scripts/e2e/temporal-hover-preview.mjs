// Context Temporal Rail: hover is an ephemeral multi-target preview; click
// remains the existing committed selection + camera path.
import { runScenario } from './_harness.mjs';

const BASE = process.env.LCOS_E2E_BASE ?? 'http://127.0.0.1:5273';
const SHOT = process.env.LCOS_E2E_SHOT
  ?? 'C:/Users/1/AppData/Local/Temp/LCOS_GEN2_temporal_hover_preview_20260920.png';

await runScenario({
  name: 'temporal-hover-preview',
  baseUrl: BASE,
  // The isolated fixture intentionally retains one stale Main canvas binding;
  // the final route switch exercises rail cleanup while that known canvas GET
  // returns 404. No temporal request is allowed to fail.
  allowHttp: [404],
  allowConsoleErrorsMatching: [/Failed to load resource: the server responded with a status of 404/],
  body: async (h) => {
    const writes = [];
    h.page.on('request', (request) => {
      if (request.url().includes('/lcos-core/') && request.method() !== 'GET') {
        writes.push(`${request.method()} ${request.url()}`);
      }
    });

    await h.goto('/projects/lcos-gen2-dev/context');
    await h.requireSelector('[data-lcos-context-worksite]');
    await h.requireSelector('[data-temporal-item]:not([disabled])');
    await h.requireSelector('.react-flow__node');
    await h.wait(1200);

    const item = h.page.locator('[data-temporal-item]:not([disabled])').first();
    const label = await item.getAttribute('aria-label');
    const projected = Number(/可定位\s+(\d+)\//.exec(label ?? '')?.[1] ?? 0);
    h.requireTrue(projected > 1, `fixture 必须提供多目标 Episode：${label}`);
    const viewportBefore = await h.page.locator('.react-flow__viewport').getAttribute('style');
    const selectedBefore = await h.count('.react-flow__node.selected');

    await item.hover();
    await h.wait(220);
    h.requireEqual(
      await h.count('[data-lcos-temporal-preview-outline]'),
      projected,
      'hover 应高亮 Episode 的全部已投影节点',
    );
    h.requireEqual(
      await h.count('.react-flow__node.selected'),
      selectedBefore,
      'hover 不得写 committed selection',
    );
    h.requireEqual(
      await h.page.locator('.react-flow__viewport').getAttribute('style'),
      viewportBefore,
      'hover 不得移动 camera',
    );
    const focusColor = await item.locator(':scope > i').evaluate((node) => getComputedStyle(node).backgroundColor);
    h.requireTrue(focusColor === 'rgb(0, 0, 0)' || focusColor === 'rgba(0, 0, 0, 1)', `hover Episode 应临时变黑：${focusColor}`);
    h.requireEqual(writes.length, 0, 'hover 不得写 Core');
    await h.screenshot(SHOT);

    await h.page.mouse.move(640, 420);
    await h.wait(100);
    h.requireEqual(await h.count('[data-lcos-temporal-preview-outline]'), 0, 'pointer leave 应清理临时轮廓');

    await item.hover();
    await h.page.keyboard.press('Escape');
    await h.wait(80);
    h.requireEqual(await h.count('[data-lcos-temporal-preview-outline]'), 0, 'Esc 应清理临时轮廓');

    await item.hover();
    await item.click();
    await h.wait(500);
    h.requireEqual(await h.count('[data-lcos-temporal-preview-outline]'), 0, 'click 前应移除临时轮廓');
    h.requireEqual(
      await h.count('.react-flow__node.selected'),
      projected,
      'click 应继续走既有 committed multi-selection',
    );

    await h.page.mouse.move(640, 420);
    await item.hover();
    h.requireEqual(await h.count('[data-lcos-temporal-preview-outline]'), projected, '离开现场前应存在临时轮廓');
    await h.page.goto(`${BASE}/projects/lcos-gen2-dev/main`, { waitUntil: 'domcontentloaded' });
    await h.requireSelector('[data-lcos-main-worksite]');
    h.requireEqual(await h.count('[data-lcos-temporal-preview-outline]'), 0, 'rail unmount/worksite switch 应清理临时轮廓');
  },
});
