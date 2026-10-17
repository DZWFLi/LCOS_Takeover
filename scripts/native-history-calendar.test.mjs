import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { installedRoot } from '../lab/pilot/build-pilot.mjs';
import { parseOriginalDonorScript as parse } from '../lab/agent-node-transform.mjs';
import { transformNativeHistoryScript } from '../lab/native-history-transform.mjs';
import { nativeHistoryLocalDateKey } from '../lab/native-history-date.mjs';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'output/原生文本整合_20261017e');
await fs.mkdir(output, { recursive: true });
const assets = path.join(root, 'reference/tapnow-installed/resources/web/assets');
const read = async name => {
  const original = await fs.readFile(path.join(assets, name), 'utf8');
  const source = transformNativeHistoryScript(name, original);
  assert.equal(transformNativeHistoryScript(name, source), source);
  return { original, source, ast: parse(source, name) };
};
function binding(parsed, name) {
  const values = parsed.ast.body.flatMap(n => n.type === 'FunctionDeclaration' ? [n]
    : n.type === 'VariableDeclaration' ? n.declarations : []).filter(n => n.id?.name === name);
  assert.equal(values.length, 1, name); return values[0];
}
function walk(node, visit) { if (!node?.type) return; visit(node); for (const v of Object.values(node))
  if (Array.isArray(v)) v.forEach(child => walk(child, visit)); else if (v?.type) walk(v, visit); }
const hook = await read('useHistoryAssetList-DmiPqiyV.js'), page = await read('page-Da_DfwiK.js');
const group = binding(hook, 'B'), scope = binding(page, 'WH'), expanded = binding(page, 'r9');
const dateExpressions = [];
walk(expanded, n => { if (n.type === 'CallExpression' && n.callee?.name === 'nativeHistoryLocalDateKey') dateExpressions.push(n); });
assert.equal(dateExpressions.length, 1);
const expression = dateExpressions[0], valueName = expression.arguments[0].name;
const r = { jsx: (type, props) => ({ type, ...props }), jsxs: (type, props) => ({ type, ...props }) };
const factory = new Function('r', 'he', 'ie', 'const ' + page.source.slice(scope.start, scope.end) + ';return WH;');
const scopeView = factory(r, () => ({ t: (_key, fallback) => fallback }), (...args) => args.filter(Boolean).join(' '));
const clicked = [], tree = scopeView({ value: 'all', onChange: value => clicked.push(value), currentCanvasAvailable: true });
assert.equal(tree['aria-label'], '历史范围');
assert.deepEqual(tree.children.map(n => n.children), ['整个项目', '当前现场']);
tree.children.forEach(n => n.onClick()); assert.deepEqual(clicked, ['all', 'current']);
assert.equal(scopeView({ value: 'current', onChange() {}, currentCanvasAvailable: false }).children[1].disabled, true);

const { chromium } = createRequire(path.join(installedRoot, 'package.json'))('playwright-core');
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--disable-background-networking', '--disable-sync', '--no-first-run'] });
const report = { passed: false, scope: 'actual original sidebar B and expanded date expression in Chrome user timezones; original WH controls execute; not candidate full GUI', timezones: [], blocked: [], candidateWrites: 0 };
try {
  for (const [timezoneId, expected] of [
    ['Asia/Shanghai', ['2026-10-17', '2026-10-17', '2026-10-18']],
    ['America/Los_Angeles', ['2026-10-16', '2026-10-16', '2026-10-17']],
    ['Pacific/Kiritimati', ['2026-10-17', '2026-10-17', '2026-10-18']],
    ['UTC', ['2026-10-16', '2026-10-17', '2026-10-17']],
  ]) {
    const context = await browser.newContext({ timezoneId });
    try {
      await context.route('**/*', route => { report.blocked.push(route.request().url()); return route.abort(); });
      await context.routeWebSocket('**/*', socket => socket.close());
      const tab = await context.newPage();
      const result = await tab.evaluate(({ helper, originalGroup, originalExpression, valueName }) => {
        const dates = ['2026-10-16T23:30:00Z', '2026-10-17T00:30:00Z', '2026-10-17T16:30:00Z'];
        const group = new Function(helper + ';const T=4,C=value=>value;' + originalGroup + ';return B;')();
        const key = new Function(helper + ';return nativeHistoryLocalDateKey;')();
        const expanded = new Function(valueName, helper + ';return ' + originalExpression + ';');
        const items = dates.map((created_at, i) => ({ id: String(i), created_at }));
        const grouped = group(items);
        return { keys: dates.map(key), expandedKeys: dates.map(expanded),
          assets: grouped.filter(n => n.kind === 'asset'), headers: grouped.filter(n => n.kind === 'header'),
          invalid: ['', 'invalid', '2026-02-30'].map(key), dateOnly: key('2026-10-17') };
      }, { helper: nativeHistoryLocalDateKey.toString(), originalGroup: hook.source.slice(group.start, group.end),
        originalExpression: page.source.slice(expression.start, expression.end), valueName });
      assert.deepEqual(result.keys, expected, timezoneId);
      assert.deepEqual(result.expandedKeys, expected, timezoneId + ' expanded agrees');
      assert.deepEqual(result.assets.map(n => n.dateKey), expected);
      assert.deepEqual(result.headers.filter((_, i) => i % 4 === 0).map(n => n.dateKey), [...new Set(expected)]);
      assert.deepEqual(result.invalid, ['', '', '']); assert.equal(result.dateOnly, '2026-10-17');
      assert.deepEqual(result.assets.map(n => n.data.id), ['0', '1', '2']);
      report.timezones.push({ timezoneId, ...result });
    } finally { await context.close(); }
  }
  report.scopeLabels = tree.children.map(n => n.children); report.originalScopeValues = clicked;
  report.passed = true;
} catch (error) { report.failure = { message: error.message, stack: error.stack }; process.exitCode = 1; }
finally { await browser.close(); await fs.writeFile(path.join(output, '原History日期与范围测试.json'), JSON.stringify(report, null, 2)); }
console.log(JSON.stringify({ passed: report.passed, timezones: report.timezones.map(n => n.timezoneId), failure: report.failure?.message }));
