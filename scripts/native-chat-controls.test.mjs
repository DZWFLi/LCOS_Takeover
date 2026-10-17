import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { parseOriginalDonorScript } from '../lab/agent-node-transform.mjs';
import { transformNativeChatFrameScript } from '../lab/native-chat-frame-transform.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const filename = 'agent-host-provider-uVo_bky5.js';
const source = await fs.readFile(path.join(root, 'reference/tapnow-installed/resources/web/assets', filename), 'utf8');
const transformed = transformNativeChatFrameScript(filename, source);
assert.equal(transformNativeChatFrameScript(filename, transformed), transformed);
assert.equal(transformNativeChatFrameScript('unrelated.js', source), source);
const walk = (node, visit) => {
  if (!node || typeof node.type !== 'string') return;
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'tokens', 'comments'].includes(key)) continue;
    if (Array.isArray(value)) value.forEach(child => walk(child, visit)); else if (value?.type) walk(value, visit);
  }
};
const declaration = (ast, name) => {
  const rows = []; walk(ast, node => { if (['VariableDeclarator', 'FunctionDeclaration'].includes(node.type) && node.id?.name === name) rows.push(node); });
  assert.equal(rows.length, 1, name); return rows[0];
};
const before = parseOriginalDonorScript(source, filename), after = parseOriginalDonorScript(transformed, filename);
for (const name of ['hD', 'wM', 'xM', 'Rp', 'Ep', 'UT']) {
  const a = declaration(before, name), b = declaration(after, name);
  assert.equal(transformed.slice(b.start, b.end), source.slice(a.start, a.end), 'Original owner remains byte-for-byte: ' + name);
}
const names = ['LCOSNativePanelButton', 'LCOSNativeChatHistory', 'LCOSNativeChatHeader', 'LCOSNativeActionsMenu', 'LCOSNativeTaskRows', 'LCOSNativeTaskList'];
const extracted = names.map(name => {
  const item = declaration(after, name);
  const text = transformed.slice(item.start, item.end);
  assert.doesNotMatch(text, /\b(?:El|nS|sS|R|ko|wt|fetch)\s*(?:\.|\()/, 'Controlled view cannot call original cloud/session owner: ' + name);
  if (name === 'LCOSNativeTaskRows') walk(item, node => {
    if (node.type === 'TemplateElement') assert.doesNotMatch(node.value.raw, /text-white\/45/, 'Native task heading template paint uses the existing light semantic token.');
  });
  return item.type === 'VariableDeclarator' ? 'const ' + text + ';' : text;
}).join('\n');
const jsx = (type, props, key) => ({ type, props: props ?? {}, key });
const state = initial => [typeof initial === 'function' ? initial() : initial, () => {}];
const called = [], timeInputs = [];
const sandbox = { console, a: { useState: state, useRef: value => ({ current: value }), useEffect() {}, useLayoutEffect() {},
  useCallback: fn => fn, useMemo: fn => fn() }, o: { jsx, jsxs: jsx, Fragment: 'fragment' },
  Ce: () => ({ t: (key, fallback) => fallback ?? key }), In: () => false, M: (...parts) => parts.filter(Boolean).join(' '),
  yl: time => { timeInputs.push(time); return { isJustNow: false, text: time }; },
  mh: 'native-header-layout', fh: 'native-title-layout', ph: 'native-actions-layout', pf: 'native-list-header-space', mf: 150,
};
for (const name of ['en', 'Co', 'No', 'Io', 'ln', 'Zm', 'FN', 'ar', 'j_', 'dg', 'nf', 'sg', 'mg', 'Xm', 'so', 'A_', '__']) sandbox[name] = name;
vm.runInNewContext(extracted + '\nglobalThis.controls={' + names.join(',') + '};', sandbox);
const expand = value => {
  if (Array.isArray(value)) return value.flatMap(expand);
  if (value === null || value === undefined || typeof value !== 'object') return value;
  if (typeof value.type === 'function') return expand(value.type(value.props));
  return { ...value, props: { ...value.props, children: expand(value.props.children) } };
};
const flat = value => Array.isArray(value) ? value.flatMap(flat) : value && typeof value === 'object'
  ? [value, ...flat(value.props?.children)] : [];
const text = value => Array.isArray(value) ? value.map(text).join('') : value && typeof value === 'object' ? text(value.props?.children) : String(value ?? '');

const tree = expand(sandbox.controls.LCOSNativeChatHeader({ title: '真实会话', activeSessionId: 'real-core-conversation',
  entries: [{ id: 'real-core-conversation', title: '真实会话', updatedAt: '2026-10-17T00:00:00.000Z' }],
  historyState: 'ready', panelLabel: '查看任务', onToggleArtifactPanel: () => called.push(['tasks']),
  onSelectConversation: id => called.push(['conversation', id]), onNewConversation: () => called.push(['new-options']),
  onCanvasAssistant: () => called.push(['canvas-input']), onClose: () => called.push(['close']),
  actions: [{ id: 'refresh', label: '重新读取对话', onSelect: () => called.push(['refresh']) }] }));
assert.ok(flat(tree).some(row => row.props['data-lcos-native-chat-header']));
const history = flat(tree).filter(row => row.props['data-lcos-native-chat-history']); assert.equal(history.length, 2, 'Original title and history triggers retain separate native menu owners');
assert.ok(timeInputs.every(value => value === '2026-10-17T00:00:00.000Z'));
const rows = flat(history[0]).filter(row => row.type === 'ln');
rows.find(row => text(row) === '真实会话2026-10-17T00:00:00.000Z').props.onClick();
rows.find(row => text(row) === '新建对话…').props.onClick();
rows.find(row => text(row) === '画布助手').props.onClick();
rows.find(row => text(row) === '重新读取对话').props.onClick();
flat(tree).find(row => row.props['aria-label'] === '查看任务').props.onClick();
assert.deepEqual(called, [['conversation', 'real-core-conversation'], ['new-options'], ['canvas-input'], ['refresh'], ['tasks']]);
assert.equal(flat(tree).filter(row => ['rename conversation', 'delete conversation'].includes(row.props['aria-label'])).length, 0, 'Unconnected original cloud mutations cannot appear as fake usable actions');
const error = expand(sandbox.controls.LCOSNativeChatHistory({ entries: [], state: 'error', open: true, onOpenChange() {}, trigger: 'trigger' }));
assert.ok(text(error).includes('暂时无法读取对话，请重新读取。'));

const tasks = expand(sandbox.controls.LCOSNativeTaskList({ title: '任务', state: 'ready', items: [
  { id: 'actual-run-address', title: '整理三条意见', secondary: '已创建 · 尚未执行', runStatus: 'created', dispatchStatus: 'planned' },
], onSelect: id => called.push(['run', id]), actions: [{ id: 'refresh-runs', label: '重新读取任务', onSelect: () => called.push(['refresh-runs']) }] }));
const taskRow = flat(tasks).find(row => row.props['data-lcos-native-run-list-item'] === 'actual-run-address');
assert.ok(taskRow); const button = flat(taskRow).find(row => row.type === 'button');
assert.equal(button.props['aria-label'], '打开任务 整理三条意见'); button.props.onClick();
assert.deepEqual(called.at(-1), ['run', 'actual-run-address']);
assert.ok(text(tasks).includes('已创建 · 尚未执行'));
assert.ok(!text(tasks).includes('actual-run-address'), 'Actual identity remains in callbacks/data, not visible or accessible text');
assert.ok(!text(tasks).includes('Outputs') && !text(tasks).includes('artifacts/'), 'Runs are never fabricated as donor files');
const action = flat(tasks).find(row => row.type === 'ln' && text(row) === '重新读取任务'); action.props.onSelect();
assert.deepEqual(called.at(-1), ['refresh-runs']);
const waiting = expand(sandbox.controls.LCOSNativeTaskList({ title: '任务', state: 'loading', items: [], onSelect() {}, actions: [] }));
assert.ok(text(waiting).includes('正在读取任务…'));
const report = { passed: true, coverage: ['original owners unchanged', 'controlled wM/Rp/xM/Ep/UT extraction', 'no original cloud hooks',
  'exact Core conversation/task callbacks', 'native title/history/menu/list structure', 'honest new-session options navigation', 'no fake file or transport-id label'],
  componentBrowser: false, productGui: false };
const output = path.join(root, 'output/原流程融合_20261017c'); await fs.mkdir(output, { recursive: true });
await fs.writeFile(path.join(output, '会话任务控件测试.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
