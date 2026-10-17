import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const origin = 'http://127.0.0.1:17880';
const calls = [];
let revision = 'revision-1';
let rejectNext = false;
let holdRead = false, releaseRead;
const upstream = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : input, origin);
  const method = init?.method || (input instanceof Request ? input.method : 'GET');
  if (method === 'POST') {
    const body = JSON.parse(init?.body ?? await input.clone().text());
    calls.push({ path: url.pathname, body });
    if (rejectNext) { rejectNext = false; return Response.json({ code: 40900 }, { status: 409 }); }
    assert.equal(body.lcos_expected_revisions['text-1'], revision);
    revision = 'revision-' + (Number(revision.split('-').pop()) + 1);
    return Response.json({ code: 0, data: { lcos_expected_revisions: { 'text-1': revision } } });
  }
  const readResult = { code: 0, data: { nodes: [{ id: 'text-1', lcos_revision_id: revision }] } };
  if (holdRead) return new Promise(resolve => { releaseRead = () => resolve(Response.json(readResult)); });
  return Response.json(readResult);
};
const sandbox = { window: { fetch: upstream }, location: { href: origin + '/canvas/main', origin }, Request, Response, URL, Map, Promise };
vm.runInNewContext(fs.readFileSync(new URL('../lab/startup-surface-core.js', import.meta.url), 'utf8'), sandbox);
const request = sandbox.window.fetch;
await request('/api/canvas/v1/canvases/main');
const options = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ canvas_id: 'main', actions: [] }) };
await Promise.all([request('/api/canvas/v1/canvases/main/nodes:batchActions', options), request('/api/canvas/v1/canvases/main/nodes:batchActions', options)]);
assert.equal(calls[0].body.lcos_expected_revisions['text-1'], 'revision-1');
assert.equal(calls[1].body.lcos_expected_revisions['text-1'], 'revision-2');
rejectNext = true;
assert.equal((await request('/api/canvas/v1/canvases/main/nodes:batchActions', options)).status, 409);
await request(new Request(origin + '/api/canvas/v1/canvases/main/nodes:batchActions', options));
assert.equal(calls.at(-1).body.lcos_expected_revisions['text-1'], 'revision-3');
holdRead = true;
const lateRead = request('/api/canvas/v1/canvases/main');
holdRead = false;
await request('/api/canvas/v1/canvases/main/nodes:batchActions', options);
releaseRead();
await lateRead;
await request('/api/canvas/v1/canvases/main/nodes:batchActions', options);
assert.equal(calls.at(-1).body.lcos_expected_revisions['text-1'], 'revision-5');
// A new canvas has no inherited revision from another canvas; missing revisions
// are sent as missing and the real facade must reject any unobserved text write.
rejectNext = true;
await request('/api/canvas/v1/canvases/other/nodes:batchActions', { ...options, body: JSON.stringify({ canvas_id: 'other', actions: [] }) });
assert.deepEqual(calls.at(-1).body.lcos_expected_revisions, {});
// Receipt metadata must use the exact native history port, never another edit.
const receiptCalls = [], receiptErrors = [];
const operation = { version: 1, operationId: 'original-copy-operation', kind: 'duplicate-view', phase: 'apply' };
const ref = { version: 1, entityType: 'view', entityId: 'confirmed-view', artifactId: 'material', artifactViewId: 'confirmed-view', revisionId: 'confirmed-revision' };
const receiptSandbox = { window: {
  fetch: async () => Response.json({ code: 0, data: { lifecycle_results: [{ operation, lcos_refs: { duplicate: ref },
    nodes: [{ nodeId: 'duplicate', lcos_ref: ref, data: { src: '/canonical-file' } }] }] } }),
  __LCOS_NODE_LAB__: { canvasId: 'main', api: { getNode: () => ({ id: 'duplicate' }),
    updateNodeData() { throw new Error('Receipt must not create another user-edit history snapshot.'); },
    backfillNodeReceipt(value) { receiptCalls.push(value); return { ok: true }; } } },
}, console: { error: (...args) => receiptErrors.push(args) }, location: { href: origin + '/canvas/main', origin }, Request, Response, URL, Map, Promise };
vm.runInNewContext(fs.readFileSync(new URL('../lab/startup-surface-core.js', import.meta.url), 'utf8'), receiptSandbox);
await receiptSandbox.window.fetch('/api/canvas/v1/canvases/main/nodes:batchActions', options);
assert.equal(receiptCalls.length, 1);
assert.deepEqual(JSON.parse(JSON.stringify(receiptCalls[0])), { canvasId: 'main', nodeId: 'duplicate', ref, operation,
  data: { src: '/canonical-file', id: 'duplicate', lcos_ref: ref } });
assert.deepEqual(receiptErrors, []);

// Plain body updates have no lifecycle operation. Their canonical metadata
// receipt must still reach the same original history owner, without an echo.
const primaryRef = { version: 1, entityType: 'artifact', entityId: 'material', artifactId: 'material',
  artifactViewId: 'primary-view', revisionId: 'body-revision-2' };
const textCalls = [], textErrors = [];
const nativeNode = { id: 'text-1', type: 'text', data: { text: '# New exact body', lcos_ref: { ...primaryRef, revisionId: 'body-revision-1' } } };
let textPayload = { code: 0, data: { core_saved: true, spatial_saved: true,
  lcos_expected_revisions: { 'text-1': primaryRef.revisionId },
  lcos_text_receipts: [{ projectId: 'project', canvasId: 'main', nodeId: 'text-1', ref: primaryRef, body: nativeNode.data.text }] } };
const textSandbox = { window: {
  fetch: async () => Response.json(textPayload),
  __LCOS_NODE_LAB__: { projectId: 'project', canvasId: 'main', currentCanvasId: 'main', api: {
    getNode: id => id === nativeNode.id ? nativeNode : undefined,
    updateNodeData() { throw new Error('A revision receipt cannot enqueue another edit.'); },
    backfillNodeReceipt(value) { textCalls.push(value); return { ok: true }; },
  } },
}, console: { error: (...args) => textErrors.push(args) }, location: { href: origin + '/canvas/main', origin }, Request, Response, URL, Map, Promise };
vm.runInNewContext(fs.readFileSync(new URL('../lab/startup-surface-core.js', import.meta.url), 'utf8'), textSandbox);
const sendText = () => textSandbox.window.fetch('/api/canvas/v1/canvases/main/nodes:batchActions', options);
await sendText();
assert.equal(textCalls.length, 1);
assert.deepEqual(JSON.parse(JSON.stringify(textCalls[0])), { receiptKind: 'text-revision', canvasId: 'main',
  nodeId: 'text-1', ref: primaryRef, body: nativeNode.data.text });
assert.deepEqual(textErrors, []);
const validTextPayload = structuredClone(textPayload);
for (const mutate of [
  value => { value.data.core_saved = false; },
  value => { value.data.spatial_saved = false; },
  value => { value.data.lcos_text_receipts[0].canvasId = 'foreign'; },
  value => { value.data.lcos_text_receipts[0].ref.revisionId = 'unconfirmed'; },
  value => { value.data.lcos_text_receipts[0].ref.entityType = 'view'; },
]) {
  textPayload = structuredClone(validTextPayload); mutate(textPayload);
  await sendText();
  assert.equal(textCalls.length, 1, 'unconfirmed or non-primary receipts never reach history');
}
textPayload = structuredClone(validTextPayload);
textPayload.data.lcos_text_receipts[0].projectId = 'foreign';
await sendText();
textSandbox.window.__LCOS_NODE_LAB__.canvasId = 'other';
textPayload = structuredClone(validTextPayload);
await sendText();
assert.equal(textCalls.length, 1, 'late responses cannot backfill another project or Canvas');
console.log('PASS: observed revisions, ordered native saves, failed receipt unchanged, late GET isolation, Request input, and per-canvas isolation.');
console.log('PASS: lifecycle receipt backfills exact original history port without updateNodeData echo or another persistence call.');
console.log('PASS: primary text revision receipts use the original port; malformed, unconfirmed and foreign-context receipts are rejected.');
