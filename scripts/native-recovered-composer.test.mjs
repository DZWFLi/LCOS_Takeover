import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';
const runtime = await fs.mkdtemp(path.resolve('.runtime/isolated-recovered-composer-'));
const { prepareNativeRecoveredComposer, refreshNativeRecoveredComposer } = await import(pathToFileURL(await buildPilotEntry('lab/pilot/native-recovered-composer.ts', path.join(runtime, 'entry.mjs'), 'node')));
const { recoverConversationOperation } = await import(pathToFileURL(await buildPilotEntry('lcos/huabu/apps/web/src/lcos/collaboration/conversationCommands.ts', path.join(runtime, 'commands.mjs'), 'node')));
const expectedTarget = { intent: 'continue', receiverConversationId: 'c', continuationOperationId: 'before', messageId: 'unsent-message', workspaceId: 'w' };
const operation = { projectId: 'p', mode: 'continue_existing', connectedConversationId: 'c', requestConnectedConversationId: 'c',
  operationId: 'recovered', cancel: 'none', steps: { external_create: 'confirmed', core_bind: 'confirmed' }, externalEvidence: { externalSessionId: 'native', runtimeScope: 'p' } };
const projection = { projectId: 'p', conversationId: 'c', capabilities: { canSend: true } }, diagnostics = { conversationId: 'c', operations: [] };
const calls = [], shell = { projectId: 'p', composerOpen: true, composerTarget: expectedTarget, composerPrompt: 'Keep this draft',
  references: [{ ref: { type: 'scope', scopeId: 'whole-scope' } }], conversationSendAttempts: new Map(),
  prepareComposerContinuation: (...args) => calls.push(args) };
const input = { projectId: 'p', conversationId: 'c', operation, projection, diagnostics, expectedTarget, shell };
assert.equal(prepareNativeRecoveredComposer(input), true); assert.deepEqual(calls, [['p', expectedTarget, 'recovered']]);
assert.equal(shell.composerPrompt, 'Keep this draft'); assert.equal(shell.references[0].ref.scopeId, 'whole-scope'); assert.equal(expectedTarget.messageId, 'unsent-message');
calls.length = 0;
for (const variant of [
  { operation: { ...operation, mode: 'blank_new' } }, { operation: { ...operation, connectedConversationId: 'other' } },
  { operation: { ...operation, steps: { external_create: 'confirmed', core_bind: 'failed' } } },
  { projection: { ...projection, capabilities: { canSend: false } } }, { shell: { ...shell, composerTarget: { ...expectedTarget } } },
  { shell: { ...shell, conversationSendAttempts: new Map([[JSON.stringify(['p', 'c']), { phase: 'sending' }]]) } },
  { shell: { ...shell, conversationSendAttempts: new Map([[JSON.stringify(['p', 'c']), { phase: 'unconfirmed' }]]) } },
  { diagnostics: { conversationId: 'c', operations: [{ projectId: 'p', connectedConversationId: 'c', promptReceipts: [{ receipt: { outcome: 'unresolved' } }] }] } },
]) assert.equal(prepareNativeRecoveredComposer({ ...input, ...variant }), false);
assert.equal(calls.length, 0);
// Exercise the original command: its successful callback really is the pre-command row.
const before = { ...operation, revision: 1, allowedActions: [{ action: 'recover_bind' }], steps: { ...operation.steps, core_bind: 'not_started' } };
let current = before, recoverCalls = 0;
const client = { readSession: async () => projection, readDiagnostics: async () => ({ ...diagnostics, operations: [current] }),
  recover: async () => { recoverCalls++; current = operation; return { ok: true, receipt: { command: 'recover', continuationOperationId: operation.operationId } }; } };
const callbackRow = await recoverConversationOperation(client, 'p', before, 'recover_bind', undefined, 'c');
assert.equal(callbackRow.steps.core_bind, 'not_started');
assert.deepEqual(await refreshNativeRecoveredComposer({ projectId: 'p', conversationId: 'c', receiptOperation: callbackRow,
  client, readShell: () => shell, isCurrent: () => true }), { operation, prepared: true });
assert.equal(recoverCalls, 1); assert.deepEqual(calls, [['p', expectedTarget, 'recovered']]); calls.length = 0;
assert.equal(await refreshNativeRecoveredComposer({ projectId: 'p', conversationId: 'c', receiptOperation: callbackRow,
  client, readShell: () => shell, isCurrent: () => false }), undefined);
current = { ...operation, operationId: 'some-other-recovery' };
assert.equal(await refreshNativeRecoveredComposer({ projectId: 'p', conversationId: 'c', receiptOperation: callbackRow,
  client, readShell: () => shell, isCurrent: () => true }), undefined);
assert.equal(calls.length, 0);
const report = { passed: true, checks: ['Fresh same-owner recovery prepares only the existing unsent input through its original Shell method; draft, Scope and message ID are untouched.',
  'The real original recovery command returns its pre-command row; read back that exact operation after the receipt without repeating the mutation. A switched conversation or different recovery cannot replace the input.',
  'Different owner, unfinished bind, disconnected capability, changed input, local sending/unknown tickets and Core unresolved messages cannot replace the input operation.'], modelCalls: 0 };
await fs.mkdir('output/智能体空会话恢复_20261023', { recursive: true }); await fs.writeFile('output/智能体空会话恢复_20261023/原恢复输入接续定向验证.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
