import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { projectNativeChatMessages } from '../lab/pilot/native-chat-messages.ts';
import { parseOriginalDonorScript } from '../lab/agent-node-transform.mjs';

const at = '2026-10-17T03:04:05.006Z';
const item = (itemId, kind, extra = {}) => ({ schemaVersion: 1, itemId, kind, occurredAt: at, title: '摘要', ...extra });
const userBody = `  第一行：保留空格\n\n# Markdown\n${'全文不能截断 '.repeat(700)}\n末尾  `;
const assistantBody = '答复\n```js\nconst literal = "<p>&</p>";\n```\n![原图](/original-image.png)';
const timeline = [
  item('message:user-core-id', 'user_message', { body: userBody, refs: { messageId: 'user-core-id' } }),
  item('run:run-core-id:started', 'work_started', { refs: { runId: 'run-core-id' } }),
  item('message:assistant-core-id', 'agent_message', { body: assistantBody, refs: { messageId: 'assistant-core-id', runId: 'run-core-id' } }),
  ...['progress', 'input_required', 'approval_required', 'result_returned', 'result_adopted', 'error', 'recovered', 'system_note']
    .map((kind, index) => item(`event:${kind}`, kind, { body: `事件正文 ${index}`, refs: { runId: 'run-core-id', returnId: `return-${index}` } })),
];
for (const value of timeline) { if (value.refs) Object.freeze(value.refs); Object.freeze(value); }
Object.freeze(timeline);
const mapped = projectNativeChatMessages(timeline);
assert.equal(mapped.ok, true);
assert.deepEqual(mapped.messages.map(message => [message.id, message.role]), [
  ['user-core-id', 'user'], ['assistant-core-id', 'assistant'],
]);
assert.equal(mapped.messages[0].contents[0].content, userBody, 'Do not trim, truncate, escape or replace actual body with title.');
assert.equal(mapped.messages[1].contents[0].content, assistantBody);
assert.equal(mapped.messages[0].sentAt, Date.parse(at));
assert.equal(mapped.messages[1].runId, 'run-core-id');
assert.equal('responseStartedAt' in mapped.messages[1], false, 'The timeline has no measured response duration.');
assert.equal(mapped.activities.length, 9);
assert.equal(mapped.activities[0], timeline[1], 'Events keep their real kind, exact refs and canonical item identity.');
assert.deepEqual(mapped.order.map(entry => entry.kind === 'message'
  ? mapped.messages[entry.messageIndex].id : mapped.activities[entry.activityIndex].itemId),
timeline.map(value => value.refs?.messageId ?? value.itemId), 'Core order, including tied timestamps and event interleaving, survives projection.');
assert.deepEqual(projectNativeChatMessages(timeline), mapped, 'The projection is reproducible and creates no new identity.');

const reversed = projectNativeChatMessages([...timeline].reverse());
assert.equal(reversed.ok, true);
assert.deepEqual(reversed.order.map(entry => entry.itemId), timeline.map(value => value.itemId).reverse(),
  'Do not reorder server projection based on role or inferred time.');
const fallback = projectNativeChatMessages([item('projection-message-id', 'user_message', { body: '' })]);
assert.equal(fallback.ok, true);
assert.equal(fallback.messages[0].id, 'projection-message-id', 'A real projection id remains usable when messageId is absent.');
assert.equal(fallback.messages[0].contents[0].content, '', 'An explicit empty body is distinct from a missing body.');
assert.deepEqual(projectNativeChatMessages([]), { ok: true, messages: [], activities: [], order: [] });

for (const value of [null, {}, '', { ok: true, value: [] }]) assert.equal(projectNativeChatMessages(value).error.code, 'invalid_timeline');
for (const broken of [
  null, [], item('', 'user_message', { body: 'x' }), item('x', 'user_message', { schemaVersion: 2, body: 'x' }),
  item('x', 'user_message', { occurredAt: 'not-a-date', body: 'x' }),
  item('x', 'user_message', { occurredAt: '1', body: 'x' }),
  item('x', 'user_message', { body: {}, refs: { messageId: 'x' } }),
  item('x', 'user_message', { body: 'x', refs: [] }),
  item('x', 'user_message', { body: 'x', refs: { messageId: '' } }),
]) {
  const result = projectNativeChatMessages([broken]);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'invalid_item');
  assert.equal('messages' in result, false, 'A malformed read must not masquerade as a successful empty conversation.');
}
assert.equal(projectNativeChatMessages([item('x', 'agent_message')]).error.code, 'missing_message_body');
assert.equal(projectNativeChatMessages([item('x', 'unknown-event')]).error.code, 'unsupported_kind');
assert.equal(projectNativeChatMessages([timeline[0], timeline[0]]).error.code, 'duplicate_identity');
assert.equal(projectNativeChatMessages([
  item('source-a', 'user_message', { body: 'a', refs: { messageId: 'shared-id' } }),
  item('source-b', 'agent_message', { body: 'b', refs: { messageId: 'shared-id' } }),
]).error.code, 'duplicate_identity', 'Distinct projection items cannot silently collapse onto the same native message identity.');

// Confirm the chosen output shape against the actual shipped consumer. This is
// only a consumer compatibility check, not a substitute for rendered GUI QA.
const donorPath = fileURLToPath(new URL('../reference/tapnow-installed/resources/web/assets/agent-host-provider-uVo_bky5.js', import.meta.url));
const source = await readFile(donorPath, 'utf8');
const ast = parseOriginalDonorScript(source, donorPath);
const declarations = new Map();
const pending = [ast];
while (pending.length) {
  const node = pending.pop();
  if (!node?.type) continue;
  if (node.type === 'VariableDeclarator' && ['U5', 'uv', 'iI'].includes(node.id?.name)) declarations.set(node.id.name, source.slice(node.start, node.end));
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) { for (const child of value) if (child?.type) pending.push(child); }
    else if (value?.type) pending.push(value);
  }
}
assert.match(declarations.get('U5'), /messages:t/);
assert.match(declarations.get('U5'), /data-chat-message-id/);
assert.match(declarations.get('U5'), /message:q,isStreaming:q\.id===L/);
assert.match(declarations.get('uv'), /e\.contents\|\|\[\]/);
assert.match(declarations.get('uv'), /e\.role===\"user\"/);
assert.match(declarations.get('iI'), /id:e\.id/);
assert.match(declarations.get('iI'), /sentAt:s/);
assert.match(declarations.get('iI'), /contents:x/);
console.log(JSON.stringify({ passed: true, cases: [
  'exact full text and real message identity', 'all actual activity kinds retained without fake agent replies',
  'original interleaved/tied-time order and reproducibility', 'empty versus missing body',
  'malformed and duplicate identity rejection', 'shipped U5/uv message shape compatibility',
], modelOrProviderExecution: false, browserVerified: false }, null, 2));
