import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';
import { transformNativeGlythCreationScript } from '../lab/native-glyth-creation-transform.mjs';
const temp = await fs.mkdtemp(path.resolve('.runtime/isolated-glyth-client-'));
const output = path.resolve('output/原加号智能体创建_20261023/原创建接续', new Date().toISOString().replaceAll(':', '-'));
await fs.mkdir(output, { recursive: true });
const report = { passed: false, checks: [], transport: 'Explicit controlled client; real original continuation helper, no provider or model request.' };
const entry = await buildPilotEntry('lab/pilot/native-glyth-create.ts', path.join(temp, 'create.mjs'), 'node');
const { advanceNativeGlythCreation } = await import(pathToFileURL(entry));
function fixture() {
  const ticket = { projectId: 'p', canvasId: 'c', workspaceId: 'w', provider: 'codex', operationId: 'existing-operation',
    position: { x: 50, y: 60 }, appearance: { shape: 'blob', color: 'cyan', motion: 'curious' } };
  let row, node, current = true; const calls = [];
  const client = {
    get: async () => row && structuredClone(row),
    submit: async (project, input) => { calls.push('submit'); assert.equal(project, 'p');
      assert.deepEqual(input, { operationId: ticket.operationId, mode: 'blank_new', contextInheritance: 'none', checkout: 'shared', provider: 'codex' });
      row = { ...input, projectId: project, requestConnectedConversationId: null, connectedConversationId: null,
        cancel: 'none', steps: { external_create: 'not_started', core_bind: 'not_started' }, allowedActions: [{ action: 'recover_external' }], revision: 0 }; return structuredClone(row); },
    executeRecoveryAction: async (project, operation, action, revision) => {
      assert.equal(project, 'p'); assert.equal(operation, ticket.operationId); assert.equal(revision, row.revision); calls.push(action); row.revision++;
      if (action === 'recover_external') { row.steps.external_create = 'confirmed'; row.externalEvidence = { externalSessionId: 'same-native' }; row.allowedActions = [{ action: 'recover_bind' }]; }
      else { assert.equal(action, 'recover_bind'); row.steps.core_bind = 'confirmed'; row.connectedConversationId = 'same-conversation'; row.allowedActions = []; }
      return structuredClone(row);
    },
  };
  const ports = { client, isCurrent: () => current, changed: () => {}, inspect: async () => node,
    place: async id => { calls.push('place'); assert.equal(id, 'same-conversation'); node = { id: 'original-node' }; } };
  return { ticket, ports, calls, setCurrent: value => { current = value; } };
}
try {
  const a = fixture(); const first = await advanceNativeGlythCreation(a.ticket, a.ports);
  assert.deepEqual(first, { status: 'placed', conversationId: 'same-conversation', nodeId: 'original-node' });
  assert.deepEqual(a.calls, ['submit', 'recover_external', 'recover_bind', 'place']);
  assert.deepEqual(await advanceNativeGlythCreation(a.ticket, a.ports, { verifyOnly: true }), first); assert.equal(a.calls.length, 4);
  report.checks.push('Source-free blank_new uses the original submit and original create/bind actions; confirmed readback cannot recreate the native session or node.');
  const b = fixture(), submit = b.ports.client.submit;
  b.ports.client.submit = async (...args) => { await submit(...args); throw new Error('Lost receipt after Core committed.'); };
  assert.equal((await advanceNativeGlythCreation(b.ticket, b.ports)).status, 'unconfirmed');
  assert.equal((await advanceNativeGlythCreation(b.ticket, b.ports, { verifyOnly: true })).status, 'recoverable');
  assert.deepEqual(b.calls, ['submit']);
  assert.equal((await advanceNativeGlythCreation(b.ticket, b.ports)).status, 'placed'); assert.equal(b.calls.filter(call => call === 'submit').length, 1);
  report.checks.push('A lost original submit response is read back; only explicit continuation advances the same operation, with no duplicate submit.');
  const c = fixture(), place = c.ports.place;
  c.ports.place = async id => { await place(id); throw new Error('Lost original projection receipt.'); };
  assert.equal((await advanceNativeGlythCreation(c.ticket, c.ports)).status, 'unconfirmed');
  assert.equal((await advanceNativeGlythCreation(c.ticket, c.ports, { verifyOnly: true })).status, 'placed'); assert.equal(c.calls.filter(call => call === 'place').length, 1);
  report.checks.push('Unknown placement reads the original node and settles without a second placement mutation.');
  const d = fixture(), recover = d.ports.client.executeRecoveryAction;
  d.ports.client.executeRecoveryAction = async (...args) => { const row = await recover(...args); d.setCurrent(false); return row; };
  await assert.rejects(advanceNativeGlythCreation(d.ticket, d.ports), { name: 'AbortError' });
  assert.deepEqual(d.calls, ['submit', 'recover_external']);
  report.checks.push('Leaving the captured scene stops further bind/placement actions while retaining the original operation for recovery.');
  const filename = 'reference/tapnow-installed/resources/web/assets/page-Da_DfwiK.js', source = await fs.readFile(filename, 'utf8');
  const transformed = transformNativeGlythCreationScript(filename, source);
  assert.equal(transformed.split('r.jsx(LCOSNativeGlythCreationSlot,').length, 2);
  assert.equal(transformed.split('data-add-node-menu').length, source.split('data-add-node-menu').length);
  assert.equal(transformNativeGlythCreationScript(filename, transformed), transformed);
  assert.ok(transformed.includes('NativeGroup:ms')); assert.ok(transformed.includes('onClose:()=>x(!1)'));
  report.checks.push('Original TapNow Add menu retains its existing container/group/state; one candidate slot is inserted without another window or menu.');
  report.passed = true;
} catch (error) { report.error = error.message; process.exitCode = 1; }
await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ passed: report.passed, checks: report.checks, output, error: report.error }, null, 2));
