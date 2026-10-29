import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { parseOriginalDonorScript } from '../lab/agent-node-transform.mjs';
import { transformNativeShellControlsScript } from '../lab/native-shell-controls-transform.mjs';
function walk(node, visit) {
  if (!node?.type) return; visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'comments', 'tokens'].includes(key)) continue;
    if (Array.isArray(value)) value.forEach(child => walk(child, visit)); else if (value?.type) walk(value, visit);
  }
}
function one(root, predicate) { const rows = []; walk(root, n => { if (predicate(n)) rows.push(n); }); assert.equal(rows.length, 1); return rows[0]; }
const property = (object, name) => object?.properties?.find(p => (p.key?.name ?? p.key?.value) === name);
const sources = new Map();
for (const filename of ['page-Da_DfwiK.js', 'UnlimitedModeToggle-D4wysAbz.js']) {
  const source = fs.readFileSync(new URL('../reference/tapnow-installed/resources/web/assets/' + filename, import.meta.url), 'utf8');
  const adapted = transformNativeShellControlsScript(filename, source);
  assert.equal(transformNativeShellControlsScript(filename, adapted), adapted);
  assert.equal(transformNativeShellControlsScript('other.js', source), source);
  sources.set(filename, { source, adapted, before: parseOriginalDonorScript(source, filename), after: parseOriginalDonorScript(adapted, filename) });
}
const storeSource = sources.get('UnlimitedModeToggle-D4wysAbz.js');
const store = one(storeSource.after, n => n.type === 'VariableDeclarator' && n.id?.name === 'Le');
for (const narrow of [false, true]) for (const preference of [false, true]) {
  const writes = [], sandbox = { window: { matchMedia: () => ({ matches: narrow }) },
    localStorage: { setItem: (...args) => writes.push(args) }, fy: 'canvas-chat-open',
    $C: () => preference, py: () => 0, HC() {}, hy: 5, Io: () => true, tn: factory => factory() };
  vm.runInNewContext('const ' + storeSource.adapted.slice(store.start, store.end) + ';globalThis.chat=Le;Le.setState=value=>Object.assign(Le,value);', sandbox);
  assert.equal(sandbox.chat.isOpen, !narrow && preference, 'Narrow first paint keeps canvas; desktop preference remains original');
  sandbox.chat.incrementCanvasOpenCount(); assert.equal(sandbox.chat.isOpen, !narrow);
  assert.equal(writes.length, 0, 'Responsive default never overwrites the user preference');
  sandbox.chat.setIsOpen(true); assert.equal(sandbox.chat.isOpen, true, 'Explicit original opening remains available');
  sandbox.chat.setIsOpen(false); assert.equal(sandbox.chat.isOpen, false);
  assert.deepEqual(writes, [['canvas-chat-open', 'true'], ['canvas-chat-open', 'false']]);
}
const page = sources.get('page-Da_DfwiK.js');
const toolbar = one(page.after, n => n.type === 'CallExpression' && property(n.arguments?.[1], 'data-pile-gallery-chrome')?.value?.value === 'top-right');
const toolbarText = page.adapted.slice(toolbar.start, toolbar.end);
assert.doesNotMatch(toolbarText, /trackCheckTapiesButtonClicked|Te\("community"\)|jsx\(k7,/);
assert.match(toolbarText, /jsx\(JB,/); assert.match(toolbarText, /jsx\(W9,/); // Local JSON and existing agent entry retained.
for (const name of ['HG', 'LF', 'JB', 'k7']) {
  const a = one(page.before, n => ['VariableDeclarator', 'FunctionDeclaration'].includes(n.type) && n.id?.name === name);
  const b = one(page.after, n => ['VariableDeclarator', 'FunctionDeclaration'].includes(n.type) && n.id?.name === name);
  assert.equal(page.source.slice(a.start, a.end), page.adapted.slice(b.start, b.end), name + ' original owner stays untouched');
}
const beforeRail = one(page.before, n => n.type === 'VariableDeclarator' && n.id?.name === 'fH');
const afterRail = one(page.after, n => n.type === 'VariableDeclarator' && n.id?.name === 'fH');
const originalRows = [], retainedRows = [];
walk(beforeRail, n => { if (n.type === 'CallExpression' && n.arguments?.[0]?.name === 'ss') originalRows.push(n); });
walk(afterRail, n => { if (n.type === 'CallExpression' && n.arguments?.[0]?.name === 'ss') retainedRows.push(n); });
assert.equal(originalRows.length - retainedRows.length, 7, 'Only seven disconnected plus-menu rows are removed');
const rowLabel = n => property(n.arguments[1], 'label')?.value?.arguments?.[0]?.value;
assert.deepEqual(retainedRows.map(rowLabel), ['nodes.textNode', 'dock.upload', 'nodes.imageEditorNode', 'drawTo.drawToPosture', 'drawTo.drawToVideo', 'drawTo.drawToImage'],
  'Text/upload plus rows and every independent editor-rail row remain');
for (const row of retainedRows) {
  const text = page.adapted.slice(row.start, row.end);
  assert.ok(originalRows.some(original => page.source.slice(original.start, original.end) === text), 'Every retained row keeps its exact original handlers');
}
const adaptedRailText = page.adapted.slice(afterRail.start, afterRail.end);
assert.doesNotMatch(adaptedRailText, /u\("dock\.utilities"\)/, 'The empty utilities section does not leave a heading');
assert.match(adaptedRailText, /u\("nodes\.addBlock"\)/); assert.match(adaptedRailText, /u\("dock\.addSource"\)/);
assert.doesNotMatch(adaptedRailText, /u\("video\.modelRestricted"\)/, 'Removed media rows do not leave a restriction badge');
assert.match(adaptedRailText, /Me\.CANVAS\.DOCKBAR\.ADD_NODE_BTN/);
assert.match(adaptedRailText, /Me\.CANVAS\.DOCKBAR\.IMAGE_EDITOR_BTN/);
for (const name of ['Ze', 'He', 'Ue', 'Ae', 'Qe', 'Dt']) {
  const before = one(beforeRail, n => n.type === 'VariableDeclarator' && n.id?.name === name);
  const after = one(afterRail, n => n.type === 'VariableDeclarator' && n.id?.name === name);
  assert.equal(page.source.slice(before.start, before.end), page.adapted.slice(after.start, after.end), name + ' factory binding remains original');
}
for (const key of ['ADD_NODE_BTN', 'ASSETS_BTN', 'WORKFLOW_BTN', 'COMMENT_MODE_BTN', 'HISTORY_BTN', 'IMAGE_EDITOR_BTN', 'USER_SETTINGS_BTN']) {
  const match = n => n.type === 'CallExpression' && property(n.arguments?.[1], 'data-testid')?.value?.property?.name === key;
  const before = one(beforeRail, match), after = one(afterRail, match);
  assert.equal(page.source.slice(before.start, before.end), page.adapted.slice(after.start, after.end), key + ' original rail control remains untouched');
}
const suggestions = one(page.after, n => n.type === 'VariableDeclarator' && n.id?.name === 'MF');
const call = one(suggestions, n => n.type === 'CallExpression' && n.callee?.name === 'RF');
assert.equal(page.adapted.slice(call.arguments[1].start, call.arguments[1].end), '!1');
console.log(JSON.stringify({ passed: true, checks: ['narrow and desktop defaults', 'explicit open/close and preferences', 'commercial slots removed', 'seven disconnected plus rows removed', 'text/upload and independent editor rail handlers retained', 'media factory bindings retained', 'original toolbar, history, local export and gestures retained', 'disconnected suggestions disabled'] }));
