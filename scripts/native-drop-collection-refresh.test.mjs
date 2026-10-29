import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { buildPilotEntry, installedRoot } from '../lab/pilot/build-pilot.mjs';
import { readCurrentGen2Resource } from '../lab/current-gen2-resources.mjs';
import { createNativeUiSourceTransforms } from '../lab/native-ui-source-transforms.mjs';
import { nativeDropCollectionRefreshSource, transformNativeDropCollectionRefreshOverlay } from '../lab/native-drop-collection-refresh-transform.mjs';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(path.join(installedRoot, 'package.json')), ts = require('typescript');
const temp = await fs.mkdtemp(path.join(root, '.runtime/native-drop-collection-refresh-'));
const prior = { window: globalThis.window, fetch: globalThis.fetch };
try {
  const sourcePath = path.join(root, nativeDropCollectionRefreshSource);
  const source = readCurrentGen2Resource(sourcePath).contents;
  const adapted = transformNativeDropCollectionRefreshOverlay(source, { sourcePath });
  assert.equal(transformNativeDropCollectionRefreshOverlay(adapted, { sourcePath }), adapted);
  assert.throws(() => transformNativeDropCollectionRefreshOverlay(source, { sourcePath: sourcePath + '.wrong' }));
  const whole = createNativeUiSourceTransforms()[nativeDropCollectionRefreshSource](source, { sourcePath });
  const composed = transformNativeDropCollectionRefreshOverlay(whole, { sourcePath });
  const ast = ts.createSourceFile(sourcePath, composed, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assert.deepEqual(ast.parseDiagnostics, []);
  assert.ok(!composed.includes('currentCanvas.moveNodeIntoFrame('));
  assert.ok(!composed.includes('currentCanvas.setNodeGeometry('));
  assert.ok(composed.includes('await nativeCollectionRefresh(membershipIntent, receipt)'));

  const entry = path.join(temp, 'entry.ts'), bundle = path.join(temp, 'test.mjs');
  await fs.writeFile(entry, `export {createNativeDropCollectionRefresh} from ${JSON.stringify(path.join(root, 'lab/pilot/native-drop-collection-refresh.ts'))};
export {DropCommitRouter} from ${JSON.stringify(path.join(root, 'lcos/huabu/apps/web/src/lcos/drop/dropCommitRouter.ts'))};`);
  await buildPilotEntry(path.relative(root, entry), bundle);
  const { createNativeDropCollectionRefresh, DropCommitRouter } = await import(pathToFileURL(bundle).href);
  const scope = { projectId: 'p', canvasId: 'c', workspaceId: 'w', collectionId: 'col' };
  const pile = { id: 'pile', type: 'pile', position: { x: 32, y: 48 }, selected: true,
    data: { id: 'pile', lcos_native_collection: true, lcos_collection_ref: scope, memberIds: [] } };
  const nodes = [pile], members = new Set(), requests = [], notifications = [];
  const geometry = JSON.stringify({ position: pile.position, selected: pile.selected });
  let current = true, synchronized = 0, failSync = false, rejectMember = false;
  const api = { getNodes: () => nodes, getEdges: () => [],
    synchronizeCollectionCarrier: async (input, options) => {
      assert.equal(options.isCurrent(), true);
      if (failSync) return { ok: false, reason: 'original history is busy' };
      synchronized++;
      pile.data = { ...pile.data, memberIds: input.node.data.memberIds };
      return { ok: true };
    },
    setNodeGeometry() { throw new Error('No geometry writer allowed'); },
    addNodes() { throw new Error('No node factory allowed'); },
  };
  const events = new EventTarget();
  globalThis.window = events;
  events.addEventListener('lcos:native-collection-updated', event => notifications.push(event.detail));
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url, method: options.method || 'GET' });
    assert.equal(options.method || 'GET', 'GET');
    assert.equal(url, '/api/lcos/canvases/c/collections/col/projection');
    return { ok: true, json: async () => ({ code: 0, data: {
      state: 'present', presentation_received: true, project_id: 'p', canvas_id: 'c', workspace_id: 'w',
      collection_id: 'col', provider_execution_started: false,
      binding: { projectId: 'p', canvasId: 'c', spatialKind: 'node', spatialId: 'pile', entityType: 'collection', entityId: 'col' },
      node: { ...pile, data: { ...pile.data, memberIds: [...members] } },
    } }) };
  };
  const refresh = createNativeDropCollectionRefresh({ ...scope, api, isCurrent: () => current });
  const intent = { kind: 'collection-membership', targetId: 'collection-target', collectionId: 'col', memberRef: { type: 'artifact', id: 'a' } };
  const receipt = status => ({ collectionId: 'col', memberRef: intent.memberRef, status });
  const router = new DropCommitRouter(), owners = {
    projectId: 'p', applyAssembly: async () => { throw new Error('wrong owner'); }, addComposerReference() {},
    addCollectionMember: async () => {
      if (rejectMember) return receipt('not-member');
      const status = members.has('a') ? 'already-member' : 'applied';
      members.add('a');
      return receipt(status);
    }, onCollectionApplied: refresh,
  };
  assert.equal((await router.commit(intent, 'success', owners)).status, 'success');
  assert.equal(requests.length, 1); assert.equal(synchronized, 1); assert.equal(notifications.length, 1);
  assert.deepEqual(pile.data.memberIds, ['a']);
  assert.equal((await router.commit(intent, 'success', owners)).status, 'success');
  assert.equal(synchronized, 1, 'same transaction refreshes once');
  assert.equal((await router.commit(intent, 'already', owners)).status, 'success');
  assert.equal(members.size, 1); assert.equal(nodes.length, 1); assert.deepEqual(pile.data.memberIds, ['a']);
  assert.equal(synchronized, 2, 'already-member reads the original carrier, without a copy');
  rejectMember = true;
  assert.equal((await router.commit(intent, 'rejected', owners)).status, 'failed');
  assert.equal(synchronized, 2); assert.equal(requests.length, 2); assert.equal(notifications.length, 2);
  rejectMember = false; failSync = true;
  assert.equal((await router.commit(intent, 'display-failure', owners)).status, 'partial');
  assert.equal(synchronized, 2); assert.equal(notifications.length, 2, 'failed native synchronization cannot announce success');
  failSync = false; current = false;
  assert.equal((await router.commit(intent, 'departed', owners)).status, 'partial');
  assert.equal(requests.length, 3, 'departed scene cannot read or synchronize another carrier');
  current = true;
  await assert.rejects(refresh(intent, { ...receipt('applied'), collectionId: 'other' }));
  assert.equal(requests.length, 3);
  assert.equal(JSON.stringify({ position: pile.position, selected: pile.selected }), geometry);
  console.log(JSON.stringify({ passed: true, scope: 'selected real DropCommitRouter + production refresh helper; synthetic Core/API transport, no live project writes',
    cases: ['positive receipt refreshes once', 'same transaction dedupes', 'already-member creates no duplicate',
      'negative receipt never refreshes', 'sync failure remains partial', 'stale scene cannot synchronize',
      'wrong receipt cannot synchronize', 'source geometry and selection preserved', 'composed source transform parses'] }));
} finally {
  globalThis.fetch = prior.fetch;
  if (prior.window === undefined) delete globalThis.window; else globalThis.window = prior.window;
  assert.ok(path.resolve(temp).startsWith(path.join(root, '.runtime') + path.sep)
    && path.basename(temp).startsWith('native-drop-collection-refresh-'));
  await fs.rm(temp, { recursive: true, force: true });
}
