import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { parseOriginalDonorScript } from '../lab/agent-node-transform.mjs';
import { transformNativeLightThemeHtml, transformNativeLightThemeScript, nativeLightClassNames } from '../lab/native-light-theme-transform.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reference = path.join(root, 'reference/tapnow-installed/resources/web');
const outputArg = process.argv.find(value => value.startsWith('--output-root='));
const evidence = outputArg ? path.resolve(outputArg.slice('--output-root='.length)) : path.join(root, 'output/原流程施工_20261017b');
fs.mkdirSync(path.join(evidence, 'screenshots'), { recursive: true });
const css = fs.readFileSync(path.join(root, 'lab/native-light-theme.css'), 'utf8');
const html = fs.readFileSync(path.join(reference, 'index.html'), 'utf8');
assert.equal(transformNativeLightThemeHtml(transformNativeLightThemeHtml(html)), transformNativeLightThemeHtml(html));
assert.doesNotMatch(transformNativeLightThemeHtml(html), /class="dark"/);
assert.doesNotMatch(css, /filter\s*:\s*(invert|brightness)|(?:^|[;\s])(?:animation|transition|transform|display)\s*:/);

const direct = new Map([
  ['rgba(255, 255, 255, 0.3)', 'var(--lcos-canvas-dot)'], ['rgba(0,0,0)', 'var(--background-canvas)'],
  ['#171717', 'var(--card)'], ['hover:!bg-[#242424]', 'lcos-native-light-hover'],
  ['rgba(90,90,99,0.5)', 'var(--lcos-minimap-node)'], ['rgba(255,255,255,0.6)', 'var(--lcos-minimap-node-border)'],
  ['rgba(24,24,27,0.92)', 'var(--popover)'], ['1.5px solid rgba(255, 255, 255, 1)', '1.5px solid var(--lcos-minimap-viewport)'],
  ['rgba(0,0,0,0.1)', 'var(--lcos-minimap-viewport-fill)'], ['0 0 0 9999px rgba(0,0,0,0.22)', '0 0 0 9999px var(--lcos-minimap-outside)'],
  ['radial-gradient(ellipse 165.86% 163.75% at 50% 15%, #1A1A1A 0%, #282828 35.54%, #464847 67.77%, #656766 100%)', 'var(--lcos-native-control-gradient)'],
  ['1px solid var(--Line-Primary, #FFFFFF14)', '1px solid var(--border)'],
  ['rgba(255,255,255,0.22) transparent', 'color-mix(in srgb, var(--foreground) 22%, transparent) transparent'],
]);
const skip = new Set(['start', 'end', 'loc', 'extra', 'comments', 'leadingComments', 'trailingComments', 'innerComments']);
function compare(a, b, stats, key) {
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') { assert.deepEqual(a, b); return; }
  if (Array.isArray(a)) { assert.equal(a.length, b.length); a.forEach((value, index) => compare(value, b[index], stats)); return; }
  const names = Object.keys(a).filter(name => !skip.has(name));
  assert.deepEqual(names, Object.keys(b).filter(name => !skip.has(name)));
  if (a.type === 'StringLiteral' && a.value !== b.value) {
    const white = /^rgba\(255,\s*255,\s*255,\s*([\d.]+)\)$/.exec(a.value);
    const inline = white ? `color-mix(in srgb, var(--foreground) ${Math.max(70, Number(white[1]) * 100)}%, transparent)` : undefined;
    const theme = key === 'theme' && a.value === 'dark' && b.value === 'light';
    assert.ok(nativeLightClassNames(a.value) === b.value || direct.get(a.value) === b.value || inline === b.value || theme,
      `Non-paint literal changed: ${a.value} -> ${b.value}`);
    stats.paintLiterals += 1;
    for (const name of names) if (name !== 'value') compare(a[name], b[name], stats);
    return;
  }
  for (const name of names) compare(a[name], b[name], stats,
    a.type === 'ObjectProperty' && name === 'value' ? a.key?.name ?? a.key?.value : undefined);
}
function declarations(program) {
  return new Map(program.body.flatMap(statement => {
    const node = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
    return node?.type === 'VariableDeclaration' ? node.declarations.map(item => [item.id?.name, item])
      : node?.type === 'FunctionDeclaration' ? [[node.id.name, node]] : [];
  }));
}
function walk(node, visit) {
  if (!node?.type) return;
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (skip.has(key)) continue;
    if (Array.isArray(value)) value.forEach(child => walk(child, visit));
    else if (value?.type) walk(value, visit);
  }
}
const ownerNodes = new Map(), assetStats = [];
for (const name of ['page-Da_DfwiK.js', 'agent-host-provider-uVo_bky5.js', 'course-api-base-url-CifxI1ia.js', 'index-BAQXnPag.js', 'UnlimitedModeToggle-D4wysAbz.js']) {
  const source = fs.readFileSync(path.join(reference, 'assets', name), 'utf8');
  const adapted = transformNativeLightThemeScript(name, source);
  assert.equal(transformNativeLightThemeScript(name, adapted), adapted);
  const before = parseOriginalDonorScript(source, name), after = parseOriginalDonorScript(adapted, name);
  const stats = { asset: name, paintLiterals: 0 };
  compare(before, after, stats); assetStats.push(stats);
  assert.equal(fs.readFileSync(path.join(reference, 'assets', name), 'utf8'), source);
  const originals = declarations(before), updated = declarations(after);
  for (const preserved of ['vT', 'r4', 's4', 'yFe', 'i3', 'Ln', 'Lx', 'd2', 'wa']) {
    if (!originals.has(preserved)) continue;
    const a = originals.get(preserved), b = updated.get(preserved);
    assert.equal(adapted.slice(b.start, b.end), source.slice(a.start, a.end), `${preserved} media/shape/animation/action owner changed`);
  }
  ownerNodes.set(name, updated);
}
const page = ownerNodes.get('page-Da_DfwiK.js'), content = ownerNodes.get('course-api-base-url-CifxI1ia.js'), shared = ownerNodes.get('index-BAQXnPag.js');
const controls = ownerNodes.get('UnlimitedModeToggle-D4wysAbz.js');
const classStrings = node => {
  const values = [];
  walk(node, item => {
    if (item.type !== 'ObjectProperty' || !['className', 'containerClassName', 'overlayClassName'].includes(item.key?.name ?? item.key?.value)) return;
    walk(item.value, value => { if (value.type === 'StringLiteral') values.push(value.value); });
  });
  return values;
};
const classes = (node, part) => classStrings(node).find(value => value.includes(part));
const cva = shared.get('$is').init;
const variant = cva.arguments[1].properties.find(item => item.key.name === 'variants').value.properties.find(item => item.key.name === 'variant').value;
const card = cva.arguments[0].value + ' ' + variant.properties.find(item => item.key.name === 'colorfulCard').value.value;
const fixture = {
  card, history: classes(page.get('l9'), 'fixed left-4'), historyHeading: classes(page.get('rE'), 'text-xl'),
  historyDialog: classes(page.get('r9'), 'h-[min(760px'), search: classes(page.get('$H'), 'appearance-none'),
  viewer: classes(content.get('c2'), 'fixed inset-0'), backdrop: classes(content.get('c2'), 'pointer-events-none fixed inset-0'),
  toolbar: classes(content.get('XO'), 'rounded-[24px]'), facts: classes(content.get('SY'), 'space-y-6'),
  factLabel: classes(content.get('SY'), 'uppercase'), textAction: classes(content.get('UX'), 'size-9'),
  libraryText: classes(controls.get('lC'), 'box-border flex'), libraryTextCopy: classes(controls.get('lC'), 'whitespace-pre-wrap'),
  tabs: classes(controls.get('pO'), 'relative grid'), selectedTab: classes(controls.get('pO'), 'text-foreground/[0.88]'),
  idleTab: classes(controls.get('pO'), 'text-foreground/[0.60]'),
  nodeToolbar: classes(content.get('Vde'), 'node-float-ui-visible'),
  nodeMenu: classes(content.get('Hde'), 'min-w-[220px]'),
  nodeMenuItem: classes(content.get('Hde'), '[&_svg]:!text-foreground/90'),
};
assert.ok(Object.values(fixture).every(value => typeof value === 'string'));
assert.ok(card.includes('bg-popover'));
assert.equal(classes(content.get('uZ'), 'absolute inset-0'), 'absolute inset-0 bg-background');
let themeChoice;
walk(shared.get('dc'), node => { if (node.type === 'ObjectProperty' && node.key?.name === 'theme') themeChoice = node.value.value; });
assert.equal(themeChoice, 'light', 'The actual shared colorfulCard uses its existing light branch');

const require = createRequire('E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/package.json');
const { chromium } = require('playwright-core');
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const context = await browser.newContext({ viewport: { width: 1000, height: 800 }, reducedMotion: 'reduce' });
await context.route('**/*', route => route.abort());
const browserPage = await context.newPage();
const errors = []; browserPage.on('pageerror', error => errors.push(error.message));
const vendorCss = [...fs.readdirSync(path.join(reference, 'assets')).filter(name => /^index-.*\.css$/.test(name)), 'course-api-base-url-qS4rKGhC.css', 'UnlimitedModeToggle-Bb-L28ZM.css']
  .map(name => path.join(reference, 'assets', name)).filter(file => fs.existsSync(file)).map(file => fs.readFileSync(file, 'utf8')).join('\n');
try {
  await browserPage.setContent('<!doctype html><html data-lcos-theme="light" class="light"><head><title>Original owner light paint fixture</title></head><body><button id="open">创建菜单</button><div id="fixture"></div></body></html>');
  await browserPage.addStyleTag({ content: vendorCss + '\n' + css });
  const parsed = await browserPage.evaluate(css => {
    const sheet = new CSSStyleSheet(); sheet.replaceSync(css);
    const dropped = [];
    for (const match of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const single = new CSSStyleSheet(); single.replaceSync(match[0]); if (!single.cssRules.length) dropped.push(match[1].trim());
    }
    const countRules = rules => [...rules].reduce((total, rule) => total + 1 + (rule.cssRules ? countRules(rule.cssRules) : 0), 0);
    return { rules: countRules(sheet.cssRules), dropped };
  }, css);
  assert.ok(parsed.dropped.every(selector => selector.includes('::-moz-range-thumb')),
    `Only the retained Firefox-only slider selector may be unavailable in Chrome: ${parsed.dropped}`);
  assert.equal(parsed.rules + parsed.dropped.length, (css.replace(/\/\*[\s\S]*?\*\//g, '').match(/\{/g) ?? []).length);
  await browserPage.evaluate(fixture => {
    document.querySelector('#open').onclick = () => {
      const element = document.createElement('section'); element.dataset.addNodeMenu = ''; element.className = fixture.card;
      element.style.cssText = 'position:fixed;left:30px;top:80px;width:240px;padding:12px';
      element.innerHTML = '<h2 class="text-foreground">添加节点</h2><button class="text-foreground">文本</button><p class="text-muted-foreground">图片 · 视频 · 收件</p>';
      document.querySelector('#fixture').replaceChildren(element);
    };
  }, fixture);
  await browserPage.locator('#open').click();
  async function colour(selector, kind = 'backgroundColor') {
    return browserPage.locator(selector).evaluate((element, kind) => getComputedStyle(element)[kind], kind);
  }
  async function colourBytes(selector, kind = 'backgroundColor') {
    return browserPage.locator(selector).evaluate((element, kind) => {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d'); context.fillStyle = getComputedStyle(element)[kind]; context.fillRect(0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data];
    }, kind);
  }
  const createPaint = await colour('[data-add-node-menu]');
  assert.equal(createPaint, 'rgb(255, 255, 255)');
  assert.equal(await colour('[data-add-node-menu] h2', 'color'), 'rgb(36, 38, 37)');
  await browserPage.screenshot({ path: path.join(evidence, 'screenshots/theme-fixture-create.png') });
  await browserPage.evaluate(fixture => {
    const element = document.createElement('aside'); element.dataset.historyPanel = ''; element.className = fixture.history;
    element.innerHTML = `<h2 class="${fixture.historyHeading}">历史</h2><input placeholder="Search" class="${fixture.search}"><p class="text-foreground/40">没有历史记录</p>`;
    document.querySelector('#fixture').replaceChildren(element);
  }, fixture);
  const historyPaint = await colour('[data-history-panel]');
  assert.ok((await colourBytes('[data-history-panel]')).slice(0, 3).every(value => value >= 250));
  assert.ok((await colourBytes('[data-history-panel] h2', 'color')).slice(0, 3).every(value => value < 80));
  const placeholder = await browserPage.locator('[data-history-panel] input').evaluate(element => getComputedStyle(element, '::placeholder').color);
  assert.notEqual(placeholder, 'rgba(255, 255, 255, 0.3)');
  await browserPage.screenshot({ path: path.join(evidence, 'screenshots/theme-fixture-history.png') });
  await browserPage.evaluate(fixture => {
    const element = document.createElement('section'); element.dataset.mediaViewer = ''; element.className = fixture.viewer;
    element.innerHTML = `<div class="${fixture.backdrop}"></div><main class="media-viewer__text-panel prose canvas-text-markdown relative mx-auto mt-20"><h2>原文字查看与编辑</h2><p>正文与来源保留，标题和列表继续使用原文字排版。</p><ul><li>同一版本</li><li>原输入与来源</li></ul></main><aside class="${fixture.facts} relative m-8"><dt class="${fixture.factLabel}">阅读版本</dt><dd>当前版本</dd></aside><div class="${fixture.toolbar} fixed bottom-7 left-1/2"><button class="${fixture.textAction}">复制</button></div>`;
    document.querySelector('#fixture').replaceChildren(element);
  }, fixture);
  assert.equal(await colour('[data-media-viewer] > div:first-child'), 'rgb(255, 255, 255)');
  assert.ok((await colourBytes('[data-media-viewer] h2', 'color')).slice(0, 3).every(value => value < 80));
  assert.equal(await colour('[data-media-viewer] > div:last-child'), 'rgb(255, 255, 255)');
  await browserPage.screenshot({ path: path.join(evidence, 'screenshots/theme-fixture-viewer.png') });
  await browserPage.evaluate(fixture => {
    const panel = document.createElement('section'); panel.style.cssText = 'width:320px;margin:28px';
    panel.innerHTML = `<div data-original-library-text class="${fixture.libraryText}" style="height:225px;padding:24px 16px"><p class="${fixture.libraryTextCopy}">真实文字轻预览：保留同一版本正文、原始换行与滚动区域。浅色不应只停在外壳。</p></div><div class="${fixture.tabs}" role="tablist" style="margin-top:16px"><button role="tab" class="${fixture.selectedTab}">图片</button><button role="tab" class="${fixture.idleTab}">文本</button></div>`;
    document.querySelector('#fixture').replaceChildren(panel);
  }, fixture);
  assert.equal(await colour('[data-original-library-text]'), 'rgb(255, 255, 255)');
  assert.ok((await colourBytes('[data-original-library-text] p', 'color')).slice(0, 3).every(value => value < 90));
  for (const state of [1, 2]) assert.ok((await colourBytes(`[role="tab"]:nth-child(${state})`, 'color')).slice(0, 3).every(value => value < 90));
  await browserPage.screenshot({ path: path.join(evidence, 'screenshots/theme-fixture-original-text-tabs.png') });
  await browserPage.evaluate(fixture => {
    const element = document.createElement('section'); element.style.cssText = 'margin:80px 28px;width:300px';
    // Isolate paint from the toolbar's usual canvas anchor. Production
    // geometry remains original and is separately covered by the AST compare.
    element.innerHTML = `<div data-original-node-toolbar class="${fixture.nodeToolbar}" style="position:static;transform:none;translate:none"><span>原 Collection 工具栏</span></div><div data-original-node-menu class="${fixture.nodeMenu}" style="margin-top:16px"><button data-original-node-menu-item class="${fixture.nodeMenuItem}"><svg class="text-white/90" width="18" height="18"><circle cx="9" cy="9" r="5" fill="currentColor" /></svg>原更多菜单</button></div>`;
    document.querySelector('#fixture').replaceChildren(element);
  }, fixture);
  assert.equal(await colour('[data-original-node-menu]'), 'rgb(255, 255, 255)');
  for (const selector of ['[data-original-node-toolbar]', '[data-original-node-menu-item]', '[data-original-node-menu-item] svg'])
    assert.ok((await colourBytes(selector, 'color')).slice(0, 3).every(value => value < 90));
  await browserPage.screenshot({ path: path.join(evidence, 'screenshots/theme-fixture-original-collection-menu.png') });
  assert.deepEqual(errors, []);
  const result = { passed: true, kind: 'source-and-original-owner-css-fixture', assetStats,
    firstPaintLight: true, nonPaintAstUnchanged: true, collectionMediaAndAnimationsUnchanged: true,
    createPaint, historyPaint, parsedRules: parsed.rules, browserSpecificRules: parsed.dropped, placeholder, realBrowser: 'Chrome', viewport: '1000x800', errors,
    limits: 'No full app build/restart; original viewer/editor actions and production instance need root integration QA.' };
  fs.writeFileSync(path.join(evidence, 'theme-source-fixture-result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally { await context.close(); await browser.close(); }
