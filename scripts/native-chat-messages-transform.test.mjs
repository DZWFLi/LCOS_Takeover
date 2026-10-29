import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseOriginalDonorScript } from '../lab/agent-node-transform.mjs';
import { transformNativeChatMessagesScript } from '../lab/native-chat-messages-transform.mjs';

const filename = 'agent-host-provider-uVo_bky5.js';
const file = fileURLToPath(new URL(`../reference/tapnow-installed/resources/web/assets/${filename}`, import.meta.url));
const original = await readFile(file, 'utf8');
const transformed = transformNativeChatMessagesScript(filename, original);
assert.equal(transformNativeChatMessagesScript(filename, transformed), transformed);
assert.equal(transformNativeChatMessagesScript('unrelated.js', 'not even JavaScript'), 'not even JavaScript');
assert.equal(transformNativeChatMessagesScript(`assets/${filename}`, original), transformed);
assert.equal(await readFile(file, 'utf8'), original, 'Installed reference bytes remain untouched.');
const restored = transformed
  .replace(',renderBeforeMessage:LCOSRenderBeforeMessage,renderAfterMessages:LCOSRenderAfterMessages', '')
  .replace('LCOSRenderBeforeMessage?.(q.id),', '')
  .replace('LCOSRenderAfterMessages?.(),', '');
assert.equal(restored, original, 'Only the three identified U5 insertion sites change; hD and every other byte stay original.');

function declaration(source, name) {
  const pending = [parseOriginalDonorScript(source, filename)];
  const found = [];
  while (pending.length) {
    const node = pending.pop();
    if (!node?.type) continue;
    if (node.type === 'VariableDeclarator' && node.id?.name === name) found.push(node);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) { for (const child of value) if (child?.type) pending.push(child); }
      else if (value?.type) pending.push(value);
    }
  }
  assert.equal(found.length, 1);
  return source.slice(found[0].init.start, found[0].init.end);
}

assert.equal(declaration(transformed, 'hD'), declaration(original, 'hD'));
const environment = {
  a: { useMemo: callback => callback(), useRef: current => ({ current }),
    useState: initial => [initial, () => {}], useCallback: callback => callback, useEffect: () => {} },
  o: { jsx: (type, props, key) => ({ type, props, key }), jsxs: (type, props, key) => ({ type, props, key }) },
  Ce: () => ({ t: (_key, fallback) => fallback }),
  M: (...values) => values.filter(Boolean).join(' '), FS: 'original-font',
  LS: messages => messages, bj: messages => messages, nh: contents => contents.map(item => item.content).join(''),
  OS: () => null, DS: () => null, P5: () => [], th: message => message.id, sh: () => false,
  zN: 'OriginalScrollRoot', $N: 'OriginalScrollContent', yE: 'OriginalContextA', gE: 'OriginalContextB', Db: 'OriginalContextC',
  q5: 'OriginalErrorBoundary', uv: 'OriginalMessage', yh: 'OriginalContainerAnchor', t5: 'OriginalAutoScroll',
  e5: 'OriginalPagination', qN: 'OriginalScrollButton', F5: 'OriginalMessageAnchors', B5: 'original-scroll-button',
  Hl: 'data-original-user-message',
};
const build = source => new Function(...Object.keys(environment), `return (${declaration(source, 'U5')});`)(...Object.values(environment));
const originalU5 = build(original);
const slottedU5 = build(transformed);
const message = (id, role, content) => ({ id, role, sentAt: 1, contents: [{ type: 'text', content }] });
const messages = [message('core-user', 'user', '用户完整正文'), message('core-agent', 'assistant', '助手完整正文')];
const args = { canvasId: 'actual-canvas', messages, sessionId: 'actual-conversation' };
const clean = value => {
  if (typeof value === 'function') return '[original callback]';
  if (Array.isArray(value)) return value.filter(item => item !== undefined && item !== null).map(clean);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([, item]) => item !== undefined).map(([key, item]) => [key, clean(item)]));
  return value;
};
assert.deepEqual(clean(slottedU5(args)), clean(originalU5(args)), 'Omitting slots preserves the complete original virtual tree and every passed message.');
const events = { 'core-user': ['leading-progress'], 'core-agent': ['between-input-required', 'between-approval-required'] };
const calls = [];
const activity = id => ({ type: 'CoreActivity', props: { 'data-core-activity': id } });
const tree = slottedU5({ ...args,
  renderBeforeMessage: id => { calls.push(id); return events[id].map(activity); },
  renderAfterMessages: () => { calls.push('after'); return [activity('trailing-result-returned')]; },
});
const ordered = [];
const owners = [];
const actualMessages = [];
function inspect(node) {
  if (Array.isArray(node)) { node.forEach(inspect); return; }
  if (!node || typeof node !== 'object') return;
  owners.push(node.type);
  if (node.type === 'CoreActivity') ordered.push(node.props['data-core-activity']);
  if (node.type === 'OriginalMessage') { ordered.push(node.props.message.id); actualMessages.push(node.props.message); }
  inspect(node.props?.children);
}
inspect(tree);
assert.deepEqual(ordered, ['leading-progress', 'core-user', 'between-input-required', 'between-approval-required', 'core-agent', 'trailing-result-returned']);
assert.deepEqual(calls, ['core-user', 'core-agent', 'after']);
assert.deepEqual(actualMessages, messages, 'The original per-message renderer receives the untouched canonical message projection.');
for (const type of ['OriginalScrollRoot', 'OriginalScrollContent', 'OriginalAutoScroll', 'OriginalContainerAnchor', 'OriginalPagination', 'OriginalMessageAnchors']) {
  assert.equal(owners.filter(owner => owner === type).length, 1, `${type} remains a single original owner.`);
}
assert.equal(owners.filter(owner => owner === 'OriginalErrorBoundary').length, 2);
let emptyAfter = 0;
slottedU5({ messages: [], renderBeforeMessage: () => assert.fail('No invented message should be rendered.'),
  renderAfterMessages: () => { emptyAfter += 1; return activity('event-only-timeline'); } });
assert.equal(emptyAfter, 1, 'An event-only timeline still has one real activity outlet.');

for (const partial of [
  transformed.replace('renderAfterMessages:LCOSRenderAfterMessages', 'unusedAfter:LCOSRenderAfterMessages'),
  transformed.replace('LCOSRenderBeforeMessage?.(q.id)', 'LCOSRenderBeforeMessage?.("wrong-id")'),
  transformed.replace('LCOSRenderAfterMessages?.(),', ''),
  transformed.replace('LCOSRenderBeforeMessage?.(q.id),', ''),
]) assert.throws(() => transformNativeChatMessagesScript(filename, partial), /partial or changed/);
assert.throws(() => transformNativeChatMessagesScript(filename, original.replace('"data-chat-message-id":q.id', '"data-other-message-id":q.id')), /original message wrapper/);
console.log(JSON.stringify({ passed: true, cases: [
  'only three U5 insertions; exact hD and vendor bytes retained', 'optional-slot behavior unchanged when omitted',
  'leading/interleaved/trailing real activities in canonical message order', 'single original scroll/context/anchor/pagination owners',
  'event-only timeline outlet', 'partial installation and wrong identity rejected',
], realBrowserVerified: false, providerOrModelExecution: false }, null, 2));
