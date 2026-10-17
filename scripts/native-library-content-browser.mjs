import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { parseOriginalDonorScript } from '../lab/agent-node-transform.mjs';
import { transformSurfaceDockScript } from '../lab/surface-dock-transform.mjs';
import { transformNativeAssemblyLibraryScript } from '../lab/native-assembly-library-transform.mjs';
import { transformNativeMaterialRailScript } from '../lab/native-material-rail-transform.mjs';
import { transformNativeLibraryContextsScript } from '../lab/native-library-contexts-transform.mjs';
import { currentGen2Root } from '../lab/current-gen2-resources.mjs';

// This checks the actual transformed TS DOM/CSS in Chromium without building,
// starting, restarting or writing to the main product runtime.
const root = fileURLToPath(new URL('../', import.meta.url));
const filename = 'page-Da_DfwiK.js';
const original = await readFile(path.join(root, 'reference/tapnow-installed/resources/web/assets', filename), 'utf8');
const source = transformNativeLibraryContextsScript(filename, transformNativeMaterialRailScript(filename,
  transformNativeAssemblyLibraryScript(filename, transformSurfaceDockScript(filename, original))));
const pending = [parseOriginalDonorScript(source, filename)];
let preview;
while (pending.length) {
  const node = pending.pop();
  if (node?.type === 'VariableDeclarator' && node.id?.name === 'TS') preview = source.slice(node.init.start, node.init.end);
  for (const value of Object.values(node ?? {})) {
    if (Array.isArray(value)) { for (const child of value) if (child?.type) pending.push(child); }
    else if (value?.type) pending.push(value);
  }
}
assert.ok(preview);
const jsx = (type, props, key) => ({ type, props, key });
const env = { r: { jsx, jsxs: jsx }, he: () => ({ t: key => key }), sU: detail => ({ asset: detail.asset, textContent: detail.asset.content }),
  Br: value => value, dt: { ASSET_TYPE_WORLD: 5 }, xk: () => false, yk: 'div', D1: 'span', bk: 'span', vk: value => value,
  LCOSIsPinnedAssemblyDetail: () => false };
const TS = new Function(...Object.keys(env), `return (${preview});`)(...Object.values(env));
const css = (await Promise.all(['index-C0AQWjts.css', 'page-Bjm5jB5I.css', 'course-api-base-url-qS4rKGhC.css']
  .map(name => readFile(path.join(root, 'reference/tapnow-installed/resources/web/assets', name), 'utf8')))).join('\n')
  + '\n' + await readFile(path.join(root, 'lab/pilot/native-assembly.css'), 'utf8');
const outputArg = process.argv.find(value => value.startsWith('--output='));
const output = outputArg ? path.resolve(outputArg.slice('--output='.length))
  : 'E:/TRAE项目/LCOS0.1收口/output/夺舍全工作区复核_20261017/Library正文约束实测';
await mkdir(output, { recursive: true });
const { chromium } = createRequire(path.join(currentGen2Root, 'package.json'))('playwright-core');
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  args: ['--disable-background-networking', '--disable-sync', '--no-first-run'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
await context.route('**/*', route => route.abort());
await context.routeWebSocket('**/*', socket => socket.close());
const page = await context.newPage();
const report = { at: new Date().toISOString(), output, browser: 'Browser plugin not available; existing Playwright Core + Chrome',
  kind: 'Original transformed TS + original compiled CSS + current adapter CSS DOM fixture; not a full application run',
  mainRuntimeAccessed: false, runtimeStartedOrRestarted: false, productBuildRun: false, modelRun: false, checks: [], pageErrors: [], screenshots: [], passed: false };
page.on('pageerror', error => report.pageErrors.push(error.message));
const asset = { id: 'fixture-context', name: '方法与上下文', asset_type: 4, content: '', created_at: '2026-10-17T00:00:00Z' };
const action = (name, index) => jsx('button', { type: 'button', 'data-fixture-action': index,
  className: 'flex h-9 w-full items-center justify-center rounded-lg border px-3 text-sm', children: name });
const tree = (body, count = 2) => TS({ detail: { asset }, contentVariant: 'content', bodySlot: jsx('div', {
  className: 'w-full whitespace-pre-wrap p-3 text-sm leading-6', 'data-fixture-body': true, children: body }),
  metaSlot: jsx('div', { className: 'flex flex-col gap-0.5', children: [jsx('div', { className: 'truncate text-sm font-medium leading-5', children: '核对内容与版本' }),
    jsx('div', { className: 'text-xs', children: '已保存方法' })] }),
  actionsSlot: jsx('div', { className: 'flex flex-col gap-1.5', children: Array.from({ length: count }, (_, index) => action(index ? '进入现场' : '使用方法', index)) }) });
async function render(value, availableHeight) {
  await page.setContent('<!doctype html><html><head><title>原 TS 正文约束测试夹具</title></head><body><main id="fixture"></main></body></html>');
  await page.addStyleTag({ content: css + '\nbody{margin:24px;background:#f4f4f4;color:#222}#fixture{--popover:#fff;--foreground:#222;--border:#ddd}.native-library-content-preview{background:#fff;color:#222}' });
  await page.evaluate(({ value, availableHeight }) => {
    function element(node) {
      if (node === null || node === undefined || typeof node === 'boolean') return document.createTextNode('');
      if (Array.isArray(node)) { const fragment = document.createDocumentFragment(); node.forEach(child => fragment.append(element(child))); return fragment; }
      if (typeof node !== 'object') return document.createTextNode(String(node));
      const result = document.createElement(typeof node.type === 'string' ? node.type : 'span');
      for (const [key, prop] of Object.entries(node.props ?? {})) {
        if (key === 'children' || prop === undefined || key.startsWith('on') || typeof prop === 'object' || typeof prop === 'function') continue;
        result.setAttribute(key === 'className' ? 'class' : key, prop === true ? '' : String(prop));
      }
      result.append(element(node.props?.children)); return result;
    }
    document.getElementById('fixture').style.setProperty('--radix-popover-content-available-height', `${availableHeight}px`);
    document.getElementById('fixture').append(element(value));
  }, { value, availableHeight });
}
try {
  for (const variant of [{ name: 'desktop', viewport: { width: 1440, height: 900 }, available: 480 },
    { name: 'narrow', viewport: { width: 360, height: 620 }, available: 300 }]) {
    await page.setViewportSize(variant.viewport);
    await render(tree('两份材料\n脚本、参考图'), variant.available);
    const short = await page.locator('.native-library-content-preview').evaluate(root => ({
      rootHeight: root.getBoundingClientRect().height, bodyHeight: root.firstElementChild.getBoundingClientRect().height,
      bodyScroll: root.firstElementChild.scrollHeight, bodyClient: root.firstElementChild.clientHeight,
      width: root.getBoundingClientRect().width,
    }));
    assert.ok(short.bodyHeight < 120 && short.rootHeight < 240, `${variant.name}: short Context must not reserve a 225px cover.`);
    assert.ok(short.bodyScroll <= short.bodyClient + 1 && short.width <= variant.viewport.width - 32);
    const shortShot = path.join(output, `${variant.name}-short-context.png`);
    await page.screenshot({ path: shortShot }); report.screenshots.push(shortShot);
    await render(tree(Array.from({ length: 64 }, (_, index) => `步骤 ${index + 1}：保留完整正文和末尾，不裁掉内容。`).join('\n') + '\n正文尾部_雪_END'), variant.available);
    const long = await page.locator('.native-library-content-preview').evaluate(root => ({ rootHeight: root.getBoundingClientRect().height,
      bodyHeight: root.firstElementChild.clientHeight, bodyScroll: root.firstElementChild.scrollHeight,
      footerBottom: root.lastElementChild.getBoundingClientRect().bottom, rootBottom: root.getBoundingClientRect().bottom,
      horizontalOverflow: root.scrollWidth > root.clientWidth + 1 }));
    assert.ok(long.rootHeight <= variant.available + 1 && long.bodyHeight > 40 && long.bodyScroll > long.bodyHeight);
    assert.ok(long.footerBottom <= long.rootBottom + 1 && !long.horizontalOverflow, 'Native title and actions stay inside the original Popover.');
    await page.locator('.native-library-content-body').evaluate(body => { body.scrollTop = body.scrollHeight; });
    assert.ok(await page.locator('.native-library-content-body').evaluate(body => body.scrollTop + body.clientHeight >= body.scrollHeight - 1));
    const longShot = path.join(output, `${variant.name}-long-method-tail.png`);
    await page.screenshot({ path: longShot }); report.screenshots.push(longShot);
    await render(tree('小高度下也能读正文', 8), 210);
    const constrained = await page.locator('.native-library-content-preview').evaluate(root => ({
      height: root.getBoundingClientRect().height, body: root.firstElementChild.clientHeight,
      footer: root.lastElementChild.clientHeight, footerScroll: root.lastElementChild.scrollHeight,
    }));
    assert.ok(constrained.height <= 211 && constrained.body > 20 && constrained.footerScroll > constrained.footer);
    report.checks.push({ viewport: variant.viewport, available: variant.available, short, long, constrained, passed: true });
  }
  assert.deepEqual(report.pageErrors, []);
  report.passed = true;
} finally {
  await browser.close();
  await import('node:fs/promises').then(fs => fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2)));
}
console.log(JSON.stringify(report, null, 2));
