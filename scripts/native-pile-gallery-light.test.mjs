import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { parseOriginalDonorScript as parse } from '../lab/agent-node-transform.mjs';
import { transformNativePileGalleryPaintScript as paint, transformNativePileCollectionScript } from '../lab/native-pile-collection-transform.mjs';
import { nativeLightClassNames, transformNativeLightThemeScript } from '../lab/native-light-theme-transform.mjs';
import { installedRoot } from '../lab/pilot/build-pilot.mjs';

const root = path.resolve(import.meta.dirname, '..'), reference = path.join(root, 'reference/tapnow-installed/resources/web');
const output = path.join(root, 'output/原生库集合整合_20261017g/Gallery浅色原槽');
await fs.mkdir(output, { recursive: true });
const report = { passed: false, scope: 'actual donor Gallery/marked chrome class paint; whole AST non-paint equivalence and original CSS Chrome fixture, not full App',
  candidateWrites: 0, coreWrites: 0, models: 0, assets: [], checks: [] };
const skip = new Set(['start', 'end', 'loc', 'extra', 'comments', 'leadingComments', 'trailingComments', 'innerComments']);
const walk = (node, visit) => { if (!node?.type) return; visit(node); for (const [key, value] of Object.entries(node)) {
  if (skip.has(key)) continue; if (Array.isArray(value)) value.forEach(child => walk(child, visit)); else if (value?.type) walk(value, visit);
} };
const decls = program => new Map(program.body.flatMap(node => node.type === 'FunctionDeclaration' ? [[node.id.name, node]]
  : node.type === 'VariableDeclaration' ? node.declarations.map(value => [value.id?.name, value]) : []));
function compare(a, b, stats) {
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return assert.deepEqual(a, b);
  if (Array.isArray(a)) { assert.equal(a.length, b.length); a.forEach((value, index) => compare(value, b[index], stats)); return; }
  const keys = Object.keys(a).filter(key => !skip.has(key)); assert.deepEqual(keys, Object.keys(b).filter(key => !skip.has(key)));
  if (a.type === 'StringLiteral' && a.value !== b.value) {
    assert.equal(nativeLightClassNames(a.value), b.value, 'Only original semantic paint utilities may change');
    stats.paintLiterals++; for (const key of keys) if (key !== 'value') compare(a[key], b[key], stats); return;
  }
  for (const key of keys) compare(a[key], b[key], stats);
}
function classes(node) { const values = []; walk(node, child => { if (child.type === 'ObjectProperty'
  && (child.key?.name ?? child.key?.value) === 'className') walk(child.value, value => { if (value.type === 'StringLiteral') values.push(value.value); }); }); return values; }
let fixture;
for (const asset of ['course-api-base-url-CifxI1ia.js', 'page-Da_DfwiK.js']) {
  const original = await fs.readFile(path.join(reference, 'assets', asset), 'utf8'), adapted = paint(asset, original);
  assert.equal(paint(asset, adapted), adapted); assert.equal(paint('unrelated.js', original), original);
  const before = parse(original, asset), after = parse(adapted, asset), stats = { asset, paintLiterals: 0 };
  compare(before, after, stats);
  const old = decls(before), next = decls(after), allowed = new Set(['tFe', 'bDe', 'aDe', 'MF', 'H7', 'bW']);
  for (const [name, node] of old) if (!allowed.has(name)) assert.equal(adapted.slice(next.get(name).start, next.get(name).end), original.slice(node.start, node.end), name + ' stays byte-identical');
  assert.equal(await fs.readFile(path.join(reference, 'assets', asset), 'utf8'), original);
  const composed = transformNativePileCollectionScript(asset, original);
  assert.equal(paint(asset, composed), composed); assert.equal(transformNativePileCollectionScript(asset, composed), composed);
  assert.equal(paint(asset, transformNativeLightThemeScript(asset, composed)), transformNativeLightThemeScript(asset, composed));
  if (asset.startsWith('course')) {
    const oldBackdrop = classes(old.get('tFe')).find(value => value === 'pointer-events-none absolute inset-0 bg-black');
    const backdrop = classes(next.get('tFe')).find(value => value === 'pointer-events-none absolute inset-0 bg-background');
    assert.ok(oldBackdrop && backdrop);
    fixture = { oldBackdrop, backdrop, label: classes(next.get('aDe'))[0] };
    const start = original.indexOf(oldBackdrop, old.get('tFe').start);
    assert.ok(start >= old.get('tFe').start && start < old.get('tFe').end);
    assert.throws(() => paint(asset, original.slice(0, start) + 'pointer-events-none absolute inset-0 bg-unexpected'
      + original.slice(start + oldBackdrop.length)), /backdrop paint/);
  } else {
    const originalChrome = classes(old.get('MF')), chrome = classes(next.get('MF'));
    fixture.oldChrome = originalChrome.find(value => value.includes('max-w-[min(387px'));
    fixture.chrome = chrome.find(value => value.includes('max-w-[min(387px'));
    fixture.oldButton = originalChrome.find(value => value.includes('w-full cursor-pointer'));
    fixture.button = chrome.find(value => value.includes('w-full cursor-pointer'));
    fixture.oldClose = originalChrome.find(value => value.includes('size-6 shrink-0'));
    fixture.close = chrome.find(value => value.includes('size-6 shrink-0'));
  }
  report.assets.push(stats);
}
report.checks.push('whole AST changes only paint literals; yFe/i3, gesture/scroll/motion/portal/close/navigation owners and all other declarations byte-identical');
const css = (await Promise.all((await fs.readdir(path.join(reference, 'assets'))).filter(name => /^index-.*\.css$/.test(name)
  || name === 'course-api-base-url-qS4rKGhC.css').map(name => fs.readFile(path.join(reference, 'assets', name), 'utf8')))).join('\n')
  + '\n' + await fs.readFile(path.join(root, 'lab/native-light-theme.css'), 'utf8');
const { chromium } = createRequire(path.join(installedRoot, 'package.json'))('playwright-core');
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1000, height: 760 }, reducedMotion: 'reduce' });
  await context.route('**/*', route => route.abort());
  const page = await context.newPage();
  await page.setContent('<!doctype html><html class="light" data-lcos-theme="light"><head></head><body><section id="gallery" role="dialog" aria-label="原Gallery材质夹具" style="position:fixed;inset:0;isolation:isolate;overflow:hidden"><div id="backdrop"></div><main id="world" style="position:absolute;left:120px;top:260px;display:flex;gap:32px"><article><div id="label"></div><img id="member" width="248" height="146" alt="原成员图像保持"/></article></main><aside id="chrome" style="position:absolute;bottom:24px;right:24px"><button id="open">打开画布助手</button><button id="close" aria-label="关闭">×</button></aside></section></body></html>');
  await page.addStyleTag({ content: css });
  const apply = async changed => page.evaluate(({ fixture, changed }) => {
    document.querySelector('#backdrop').className = changed ? fixture.backdrop : fixture.oldBackdrop;
    document.querySelector('#label').className = fixture.label; document.querySelector('#label').textContent = '原 Gallery 成员名称';
    document.querySelector('#chrome').className = changed ? fixture.chrome : fixture.oldChrome;
    document.querySelector('#open').className = changed ? fixture.button : fixture.oldButton;
    document.querySelector('#close').className = changed ? fixture.close : fixture.oldClose;
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="248" height="146"><rect width="248" height="146" fill="#19334f"/><circle cx="178" cy="42" r="22" fill="#ffa868"/><path d="M0 146L70 48L142 146Z" fill="#70cecf"/></svg>';
    document.querySelector('#member').src = 'data:image/svg+xml,' + encodeURIComponent(svg);
  }, { fixture, changed });
  const measure = () => page.evaluate(() => Object.fromEntries(['gallery', 'backdrop', 'world', 'member', 'chrome', 'open', 'close'].map(id => {
    const element = document.getElementById(id), computed = getComputedStyle(element), r = element.getBoundingClientRect();
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1; const ctx = canvas.getContext('2d');
    const rgba = prop => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = computed[prop]; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data]; };
    return [id, { rect: { x: r.x, y: r.y, width: r.width, height: r.height }, background: rgba('backgroundColor'), text: rgba('color'),
      overflow: computed.overflow, transform: computed.transform, transition: computed.transition, animation: computed.animation }];
  })));
  await apply(false); await page.locator('#member').evaluate(element => element.decode());
  const before = await measure(), mediaBefore = await page.locator('#member').screenshot();
  await page.screenshot({ path: path.join(output, '01-before-original-black.png') });
  await apply(true); const after = await measure(), mediaAfter = await page.locator('#member').screenshot();
  assert.deepEqual(before.backdrop.background, [0, 0, 0, 255]); assert.deepEqual(after.backdrop.background, [255, 255, 255, 255]);
  assert.ok(after.chrome.background.slice(0, 3).every(value => value >= 250));
  assert.ok(after.open.text.slice(0, 3).every(value => value < 90));
  for (const id of Object.keys(before)) for (const key of ['rect', 'overflow', 'transform', 'transition', 'animation']) assert.deepEqual(after[id][key], before[id][key], id + '/' + key + ' preserved');
  assert.deepEqual(mediaAfter, mediaBefore, 'member image pixels stay exactly the same');
  await page.screenshot({ path: path.join(output, '02-after-original-light.png') });
  report.fixture = { before, after, sameMemberPixels: true };
  report.checks.push('real Chrome original-class fixture: black255→background-white255, light original chrome/dark text; identical rect/scroll/animation/transition and member pixels');
  report.passed = true;
} finally {
  await browser.close(); await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify({ passed: report.passed, assets: report.assets, checks: report.checks, report: path.join(output, 'report.json') }));
