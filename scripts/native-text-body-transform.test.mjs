import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';

import { buildPilotEntry, installedRoot } from '../lab/pilot/build-pilot.mjs';
import { transformNativeTextBody } from '../lab/native-text-body-transform.mjs';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const relativeSource = 'lcos/huabu/apps/web/src/lcos/nodes/LcosCanvasTextBody.tsx';
const sourcePath = path.join(workspaceRoot, relativeSource);
const helperPath = path.join(workspaceRoot, 'lab/pilot/native-text-save.ts');
const nativeEntry = path.join(workspaceRoot, 'lab/pilot/native-text-ui.tsx');
const original = fs.readFileSync(sourcePath, 'utf8');
const transformed = transformNativeTextBody(original, { sourcePath });
const require = createRequire(path.join(installedRoot, 'package.json'));
const esbuild = require('esbuild');

function helperSpecifier(from) {
  const relative = path.relative(path.dirname(from), helperPath).split(path.sep).join('/');
  return relative.startsWith('.') ? relative : `./${relative}`;
}

function assertSourceStillReadOnly() {
  assert.equal(fs.readFileSync(sourcePath, 'utf8'), original,
    'the copied mature body remains byte-for-byte unchanged');
}

async function compileHelper() {
  const output = path.join(workspaceRoot, '.runtime', `native-text-helper-test-${Date.now()}.mjs`);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  await esbuild.build({ entryPoints: [helperPath], outfile: output, bundle: true,
    platform: 'node', format: 'esm', target: 'node22', logLevel: 'silent' });
  return import(`${pathToFileURL(output).href}?test=${Date.now()}`);
}

async function assertRealTsxHelperBundle() {
  const specifier = helperSpecifier(sourcePath);
  assert.equal(path.resolve(path.dirname(sourcePath), specifier), helperPath,
    'the helper import resolves relative to the actual copied source path');
  const result = await esbuild.build({
    stdin: { contents: transformed, sourcefile: sourcePath, resolveDir: path.dirname(sourcePath), loader: 'tsx' },
    bundle: true, write: false, platform: 'browser', format: 'esm', target: 'es2022', jsx: 'automatic', logLevel: 'silent',
    plugins: [{ name: 'bundle-native-text-save-helper', setup(build) {
      build.onResolve({ filter: /.*/ }, args => args.path === specifier ? undefined : { path: args.path, external: true });
    } }],
  });
  assert.equal(result.errors.length, 0, 'the transformed TSX and typed helper bundle without type/runtime leaks');
  const bundle = result.outputFiles[0]?.text ?? '';
  assert.match(bundle, /__LCOS_NATIVE_TEXT_SAVE_PORT__/,
    'the real typed helper implementation is bundled, not merely a source marker');
  assert.match(bundle, /saveNativeCanvasText/);
  assert.match(bundle, /verifyNativeCanvasTextSave/);
  assert.match(bundle, /acknowledgeNativeCanvasTextSave/);
}

async function assertNativeHostGraphBundle() {
  const output = path.join(workspaceRoot, '.runtime', `native-text-body-host-test-${Date.now()}`, 'native-text-ui.js');
  const before = fs.readFileSync(sourcePath, 'utf8');
  await buildPilotEntry('lab/pilot/native-text-ui.tsx', output, 'browser', {
    nativeReact: true,
    env: { LCOS_CORE_URL: '/api/lcos/core', LCOS_CORE_TOKEN: '', PROJECT_ID: 'disposable-native-text-transform-test' },
    sourceTransforms: { [relativeSource]: transformNativeTextBody },
  });
  const bundle = fs.readFileSync(output, 'utf8');
  assert.match(bundle, /saveNativeCanvasText/);
  assert.match(bundle, /verifyNativeCanvasTextSave/);
  assert.match(bundle, /__LCOS_NATIVE_TEXT_SAVE_PORT__/);
  assert.match(bundle, /lcosNativeReadOnly/);
  assert.match(bundle, /layoutNodeLocked/);
  assert.match(bundle, /MilkdownEditor/);
  assert.doesNotMatch(bundle, /react-dom\/client/,
    'the mature body stays in the original React runtime and does not create another root');
  assert.equal(fs.readFileSync(sourcePath, 'utf8'), before,
    'buildPilotEntry applies the transform in-memory and does not mutate the copied source');
}

const cases = [];
cases.push(['transforms only the exact mature body seam and is idempotent', () => {
  assert.notEqual(transformed, original);
  assert.equal(transformNativeTextBody(transformed, { sourcePath }), transformed,
    'reinstalling an already-valid transform does not duplicate imports or behavior');
  assert.doesNotMatch(transformed, /session\.artifacts\.saveCanvasText/,
    'the mature body has no direct Core writer in save or retry');
  assert.match(transformed, /await saveNativeCanvasText\(\{ projectId, canvasId, nodeId: input\.nodeId,/);
  assert.match(transformed, /const retryOriginal = async \(\) => \{ await verify\(\); \};/);
  assert.match(transformed, /只读核对原回执（不重发）/);
  assert.match(transformed, /lcosNativeReadOnly === true/);
  assert.match(transformed, /layoutNodeLocked\(s\.nodes, input\.nodeId\)\) \|\| input\.data\.lcosNativeReadOnly === true/,
    'host policy only adds a lock; the copied layout-lock policy remains');
  assert.match(transformed, /if \(!draft\.base\)[\s\S]*?原生文本创建\/正文绑定尚未确认，请重读[\s\S]*?return false;/,
    'unbound body updates fail closed and preserve the draft instead of becoming a create writer');
  assert.match(transformed, /receipt\.status === 'conflict' && receipt\.httpStatus !== undefined/,
    'a sent native batch CAS conflict stays distinct from preflight conflict');
  assert.match(transformed, /receipt\.status === 'busy'/,
    'busy result is not associated with this draft as an operation receipt');
  assert.match(transformed, /candidate\.body === sent\.body && candidate\.artifactId === sent\.artifactId[\s\S]*?candidate\.expectedRevisionId === sent\.expectedRevisionId/,
    'recovered pending receipt must match the exact immutable payload');
  const carrierGuard = transformed.indexOf('if (current() && !canvasTextCarrierMatches');
  const acknowledgement = transformed.indexOf('if (receiptOperationId) acknowledgeNativeCanvasTextSave(receiptOperationId)');
  assert.ok(carrierGuard >= 0 && acknowledgement > carrierGuard,
    'receipt acknowledgement occurs only after the carrier identity guard');
  assertSourceStillReadOnly();
}]);

cases.push(['source path, partial install, duplicates, and drift fail closed', () => {
  assert.throws(() => transformNativeTextBody(original), /requires the real sourcePath/);
  assert.throws(() => transformNativeTextBody(original, { sourcePath: nativeEntry }), /only transforms .*LcosCanvasTextBody/);
  assert.throws(() => transformNativeTextBody(original.replace(
    'const value = await session.artifacts.saveCanvasText(projectId, sent);',
    'const value = await session.artifacts.createCanvasText(projectId, sent);'), { sourcePath }), /direct-save seam drift/);
  assert.throws(() => transformNativeTextBody(original.replace(
    'const locked = useCanvasStore((s) => layoutNodeLocked(s.nodes, input.nodeId));',
    'const locked = false;'), { sourcePath }), /host read-only projection seam drift/);

  const helperLine = `import { acknowledgeNativeCanvasTextSave, saveNativeCanvasText, verifyNativeCanvasTextSave } from "${helperSpecifier(sourcePath)}";`;
  assert.throws(() => transformNativeTextBody(original.replace(
    "import { canvasTextReplyMatches, canvasTextCarrierMatches } from './canvasTextSave';",
    `import { canvasTextReplyMatches, canvasTextCarrierMatches } from './canvasTextSave';\n${helperLine}`), { sourcePath }),
  /partially installed|duplicated|different helper/);

  const damagedInstall = transformed.replace('receiptOperationId?: string', 'receiptIntentId?: string');
  assert.throws(() => transformNativeTextBody(damagedInstall, { sourcePath }), /incomplete or duplicated receipt field/);
  assertSourceStillReadOnly();
}]);

cases.push(['typed helper forwards only the original save, read-only verify, and acknowledgement', async () => {
  const helper = await compileHelper();
  const own = Object.prototype.hasOwnProperty.call(globalThis, 'window');
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const calls = [];
  const result = { status: 'confirmed', operationId: 'save-op-1', value: { body: '# canonical' }, retrySent: false };
  Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: {
    __LCOS_NATIVE_TEXT_SAVE_PORT__: {
      save: async input => { calls.push(['save', input]); return result; },
      verify: async operationId => { calls.push(['verify', operationId]); return result; },
      acknowledge: operationId => { calls.push(['acknowledge', operationId]); return true; },
    },
  } });
  try {
    const input = { projectId: 'p', canvasId: 'c', nodeId: 'n', artifactId: 'a', expectedRevisionId: 'r1', body: '# canonical' };
    assert.equal(await helper.saveNativeCanvasText(input), result);
    assert.equal(await helper.verifyNativeCanvasTextSave('save-op-1'), result);
    assert.equal(helper.acknowledgeNativeCanvasTextSave('save-op-1'), true);
    assert.deepEqual(calls, [['save', input], ['verify', 'save-op-1'], ['acknowledge', 'save-op-1']]);
    assert.equal(calls.filter(([name]) => name === 'save').length, 1,
      'verification is read-only and never calls the save port again');
  } finally {
    if (own) Object.defineProperty(globalThis, 'window', descriptor);
    else delete globalThis.window;
  }
}]);

cases.push(['typed helper degrades to explicit unavailable without a host receipt port', async () => {
  const helper = await compileHelper();
  const own = Object.prototype.hasOwnProperty.call(globalThis, 'window');
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: {} });
  try {
    const saved = await helper.saveNativeCanvasText({ projectId: 'p', canvasId: 'c', nodeId: 'n',
      artifactId: 'a', expectedRevisionId: 'r1', body: 'draft' });
    assert.equal(saved.status, 'unavailable');
    assert.equal(saved.retrySent, false);
    const verified = await helper.verifyNativeCanvasTextSave('missing-op');
    assert.equal(verified.status, 'unavailable');
    assert.equal(verified.retrySent, false);
    assert.equal(helper.acknowledgeNativeCanvasTextSave('missing-op'), false);
  } finally {
    if (own) Object.defineProperty(globalThis, 'window', descriptor);
    else delete globalThis.window;
  }
}]);

cases.push(['real TSX/helper bundle and native host graph compile', async () => {
  await assertRealTsxHelperBundle();
  await assertNativeHostGraphBundle();
  assertSourceStillReadOnly();
}]);

for (const [name, run] of cases) {
  await run();
  console.log(`ok - ${name}`);
}

console.log(JSON.stringify({ passed: true, scope: 'source transform, typed receipt helpers, and offline real bundle only',
  transform: 'transformNativeTextBody(source,{sourcePath})', copiedSourceUnchanged: true,
  cases: cases.map(([name]) => name) }, null, 2));
