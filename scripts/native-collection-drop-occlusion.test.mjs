import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const collectionUiPath = path.join(workspaceRoot, 'lab/pilot/native-collection-ui.tsx');
const parserStore = 'E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/huabu/node_modules/.pnpm';
const runtimeParent = path.join(workspaceRoot, '.runtime');
await fs.mkdir(runtimeParent, { recursive: true });
const runtimeRoot = await fs.mkdtemp(path.join(runtimeParent, 'native-collection-drop-occlusion-'));
const runtimeRootResolved = path.resolve(runtimeRoot);

function loadBabelParser() {
  const require = createRequire(import.meta.url);
  try {
    return require('@babel/parser');
  } catch {
    const packageName = fsSync.existsSync(parserStore)
      ? fsSync.readdirSync(parserStore).find((name) => name.startsWith('@babel+parser@')) : undefined;
    assert.ok(packageName, 'installed Babel parser is available locally; no download is attempted');
    return require(path.join(parserStore, packageName, 'node_modules/@babel/parser/lib/index.js'));
  }
}

const fsSync = await import('node:fs');
const babel = loadBabelParser();

function findVariableInitializer(ast, name) {
  const matches = [];
  const pending = [ast];
  while (pending.length) {
    const node = pending.pop();
    if (!node || typeof node.type !== 'string') continue;
    if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier' && node.id.name === name) {
      matches.push(node.init);
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (const child of value) if (child?.type) pending.push(child);
      } else if (value?.type) pending.push(value);
    }
  }
  assert.equal(matches.length, 1, `production NativeCollection source must have one ${name} initializer`);
  return matches[0];
}

function compileExpression(expression, args) {
  return new Function(...args, `return (${expression});`);
}

function compileBlockArrow(source, initializer, args) {
  assert.equal(initializer?.body?.type, 'BlockStatement');
  return new Function(...args, `return () => ${source.slice(initializer.body.start, initializer.body.end)};`);
}

const source = await fs.readFile(collectionUiPath, 'utf8');
const ast = babel.parse(source, { sourceType: 'module', sourceFilename: collectionUiPath, plugins: ['typescript', 'jsx'] });
const targetInitializer = findVariableInitializer(ast, 'target');
const readRectInitializer = findVariableInitializer(ast, 'readRect');
assert.equal(targetInitializer?.type, 'ObjectExpression', 'the real Collection target remains a literal registration');
assert.equal(readRectInitializer?.type, 'ArrowFunctionExpression', 'the real live rectangle callback remains an arrow function');

// Execute the exact production expressions. Only the surrounding Canvas owner,
// DOM, stores, and live-owner reader are controlled by this test fixture.
const makeTarget = compileExpression(source.slice(targetInitializer.start, targetInitializer.end), [
  'id', 'parsed', 'capturedApi', 'element', 'membership', 'semantic', 'rect', 'readRect',
  'readCurrentCollectionOwner', 'useLcosReferenceStore', 'isDropPointExposed',
]);
const makeReadRect = compileBlockArrow(source, readRectInitializer, [
  'elementRef', 'readCurrentCollectionOwner', 'id', 'parsed', 'capturedApi', 'rectFromDomRect', 'validDropRect',
]);

try {
  const ownersEntry = path.join(runtimeRoot, 'owners.ts');
  await fs.writeFile(ownersEntry, [
    "export { DropTargetRegistry, rectFromDomRect } from '../../lcos/huabu/apps/web/src/lcos/drop/dropTargetRegistry.ts';",
    "export { resolveDropIntent } from '../../lcos/huabu/apps/web/src/lcos/drop/dropIntentResolver.ts';",
    "export { nodeMembershipDropSemantic } from '../../lcos/huabu/apps/web/src/lcos/nodes/nodeMembershipDropTarget.ts';",
  ].join('\n'));
  const ownersBundle = await buildPilotEntry(
    path.relative(workspaceRoot, ownersEntry).split(path.sep).join('/'),
    path.join(runtimeRoot, 'native-collection-drop-owners.mjs'),
    'browser',
  );
  const provenance = JSON.parse(await fs.readFile(`${ownersBundle}.sources.json`, 'utf8'));
  const selectedResourcePaths = provenance.resources.map((resource) => resource.resourcePath);
  assert.ok(selectedResourcePaths.some((resource) => resource.endsWith('drop/dropIntentResolver.ts')),
    'the test executes the adopted/original DropIntentResolver owner');
  const { DropTargetRegistry, rectFromDomRect, resolveDropIntent, nodeMembershipDropSemantic } =
    await import(pathToFileURL(ownersBundle).href);

  const point = { x: 40, y: 35 };
  const rect = { left: 0, top: 0, width: 220, height: 140 };
  const payload = { kind: 'object', entityType: 'artifact', entityId: 'artifact-member-1', artifactViewId: 'view-member-1' };
  const canvasTarget = {
    targetId: 'active-canvas-main', kind: 'canvas', label: 'Main Canvas',
    rect, priority: 10, enabled: true,
    semantic: { kind: 'canvas', targetRef: { kind: 'main' } },
  };

  function collectionFixture({ sceneReady = true, referenceReady = true, locked = false, dragging = false } = {}) {
    const capturedApi = { identity: 'captured-flow-api' };
    const liveOwner = {
      sceneReady,
      ready: sceneReady && referenceReady,
      locked,
      dragging,
      canvas: { status: 'ready', canvasId: 'canvas-context', rfInstance: capturedApi },
    };
    const element = {
      isConnected: true,
      getBoundingClientRect: () => rect,
    };
    const elementRef = { current: element };
    const id = 'collection-node-1';
    const parsed = { title: 'Collection fixture', reference: { collectionId: 'collection-1', canvasId: 'canvas-context' } };
    const readCurrentCollectionOwner = () => liveOwner;
    const readRect = makeReadRect(
      elementRef,
      readCurrentCollectionOwner,
      id,
      parsed,
      capturedApi,
      rectFromDomRect,
      (candidate) => Number.isFinite(candidate.left) && Number.isFinite(candidate.top)
        && Number.isFinite(candidate.width) && Number.isFinite(candidate.height)
        && candidate.width > 0 && candidate.height > 0,
    );
    const membership = referenceReady
      ? nodeMembershipDropSemantic({ entityType: 'collection', entityId: 'collection-1' })
      : undefined;
    const semantic = membership ?? { kind: 'drop-exclusion', reason: '集合身份尚未确认，暂不能接收材料。' };
    const target = makeTarget(
      id,
      parsed,
      capturedApi,
      element,
      membership,
      semantic,
      readRect(),
      readRect,
      readCurrentCollectionOwner,
      { getState: () => ({ nodeEntityRefs: new Map() }) },
      () => true,
    );
    return { liveOwner, element, target };
  }

  function route({ ownerOverrides = {}, referenceReady = true } = {}) {
    const fixture = collectionFixture({ ...ownerOverrides, referenceReady });
    const registry = new DropTargetRegistry();
    registry.register(canvasTarget);
    registry.register(fixture.target);
    const hit = registry.hitTest(point);
    return { ...fixture, hit, resolution: hit ? resolveDropIntent(payload, hit) : undefined };
  }

  const cases = [];
  for (const [name, ownerOverrides, referenceReady, expectedReason] of [
    ['locked', { locked: true }, true, '该集合节点已锁定，不能接收材料。'],
    ['dragging', { dragging: true }, true, '该集合节点正在移动，暂不能接收材料。'],
    ['reference-not-ready', {}, false, '当前 TapNow Canvas/API、Core 项目、Workspace 或集合引用尚未就绪。'],
  ]) {
    const result = route({ ownerOverrides, referenceReady });
    assert.equal(result.hit?.targetId, 'node-membership:collection-node-1', `${name}: Collection remains the priority-30 hit`);
    assert.equal(result.resolution?.status, 'ineligible', `${name}: original resolver rejects rather than falling through`);
    assert.equal(result.resolution?.reason, expectedReason, `${name}: rejection is sourced from the dynamic owner getter`);
    cases.push({ name, hitTargetId: result.hit.targetId, status: result.resolution.status, reason: result.resolution.reason });
  }

  const dynamicLocked = collectionFixture();
  const dynamicLockedRegistry = new DropTargetRegistry();
  dynamicLockedRegistry.register(canvasTarget);
  dynamicLockedRegistry.register(dynamicLocked.target);
  dynamicLocked.liveOwner.locked = true;
  const lockedAfterReadyHit = dynamicLockedRegistry.hitTest(point);
  const lockedAfterReadyResolution = resolveDropIntent(payload, lockedAfterReadyHit);
  assert.equal(lockedAfterReadyHit?.targetId, 'node-membership:collection-node-1',
    'a lock applied after target registration keeps the visible Collection receiver opaque');
  assert.equal(lockedAfterReadyResolution.status, 'ineligible',
    'the original resolver reads the current locked getter after ready-to-locked transition');
  assert.equal(lockedAfterReadyResolution.reason, '该集合节点已锁定，不能接收材料。');
  cases.push({ name: 'ready-to-locked', hitTargetId: lockedAfterReadyHit.targetId,
    status: lockedAfterReadyResolution.status, reason: lockedAfterReadyResolution.reason });

  const dynamicOwnerShift = collectionFixture();
  const dynamicOwnerShiftRegistry = new DropTargetRegistry();
  dynamicOwnerShiftRegistry.register(canvasTarget);
  dynamicOwnerShiftRegistry.register(dynamicOwnerShift.target);
  dynamicOwnerShift.liveOwner.sceneReady = false;
  dynamicOwnerShift.liveOwner.ready = false;
  dynamicOwnerShift.liveOwner.canvas.rfInstance = { identity: 'replacement-flow-api' };
  const ownerShiftHit = dynamicOwnerShiftRegistry.hitTest(point);
  const ownerShiftResolution = resolveDropIntent(payload, ownerShiftHit);
  assert.equal(ownerShiftHit?.targetId, 'node-membership:collection-node-1',
    'a connected receiver keeps its priority-30 occlusion when the Canvas/API owner changes');
  assert.equal(ownerShiftResolution.status, 'ineligible',
    'the current owner getter rejects before the lower-priority Canvas can resolve a write');
  cases.push({ name: 'ready-to-owner-api-mismatch', hitTargetId: ownerShiftHit.targetId,
    status: ownerShiftResolution.status, reason: ownerShiftResolution.reason });

  const apiChange = {
    hitTargetId: ownerShiftHit?.targetId ?? null,
    status: ownerShiftResolution.status,
    intentKind: ownerShiftResolution.status === 'ready' ? ownerShiftResolution.intent.kind : null,
    visibleCollectionRect: dynamicOwnerShift.target.readRect() ?? null,
  };

  const disconnected = collectionFixture();
  const disconnectedRegistry = new DropTargetRegistry();
  disconnectedRegistry.register(canvasTarget);
  disconnectedRegistry.register(disconnected.target);
  disconnected.element.isConnected = false;
  const disconnectedHit = disconnectedRegistry.hitTest(point);
  const disconnectedResolution = resolveDropIntent(payload, disconnectedHit);
  assert.equal(disconnectedHit?.targetId, canvasTarget.targetId,
    'a disconnected/deleted DOM node releases its old Collection occlusion');
  assert.equal(disconnectedResolution.status, 'ready',
    'only the real active Canvas remains a valid receiver after the old DOM node is gone');

  console.log(JSON.stringify({
    mode: 'controlled source-extracted target + actual DropTargetRegistry/resolveDropIntent; no GUI/Core writes',
    selectedResolver: selectedResourcePaths.find((resource) => resource.endsWith('drop/dropIntentResolver.ts')),
    disabledVisibleCases: cases,
    changedApi: apiChange,
    disconnectedDomControl: {
      hitTargetId: disconnectedHit?.targetId ?? null,
      status: disconnectedResolution.status,
      intentKind: disconnectedResolution.status === 'ready' ? disconnectedResolution.intent.kind : null,
    },
  }, null, 2));

  assert.equal(apiChange.status, 'ineligible',
    'a stale Collection Canvas/API owner must not turn the same visible drop into a lower-priority Canvas write');
  assert.notEqual(apiChange.intentKind, 'assembly-apply',
    'owner/API identity changes must not authorize an unintended Main/Canvas assembly operation');
} finally {
  const resolved = path.resolve(runtimeRoot);
  const relative = path.relative(path.resolve(runtimeParent), resolved);
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'temporary build cleanup stays inside this test runtime');
  await fs.rm(resolved, { recursive: true, force: true });
}
