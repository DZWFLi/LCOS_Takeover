// Historical test-driver archive, executed against the pre-fix test/product on
// 2026-10-17T13:35:13Z. Do not run this archived driver against later sources;
// current fixed-behavior regression is scripts/native-reader-recovery.test.mjs.
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Test-only diagnostic: reuse the existing source-executed React fixture without
// changing the shipped delegate, Stage, Core, runtime, or original test evidence.
const root = path.resolve(import.meta.dirname, '..');
let source = await fs.readFile(path.join(root, 'scripts/native-reader-recovery.test.mjs'), 'utf8');
source = source.replace(/from '(\.\.\/lab\/[^']+)'/g, (_, file) => `from ${JSON.stringify(pathToFileURL(path.resolve(root, 'scripts', file)).href)}`);
source = source.replace("path.resolve(import.meta.dirname, '..')", JSON.stringify(root));
source = source.replace('旧Reader独立委托', '旧Reader启动时序只读诊断');
source = source.replace('deferred, occupied = false } = {})', 'deferred, occupied = false, bootUnmapped = false } = {})');
source = source.replace("m.useLcosShellStore.getState().setSurfaceCanvasMap({ main: 'c' });", "if (!bootUnmapped) m.useLcosShellStore.getState().setSurfaceCanvasMap({ main: 'c' });");
const start = source.indexOf('  let value = await openFixture();');
const end = source.indexOf('  report.passed = true;', start);
if (start < 0 || end < 0 || !source.includes('if (!bootUnmapped)')) throw Error('Original test fixture seam changed');
source = source.slice(0, start) + `
  let value = await openFixture({ bootUnmapped: true });
  await tick();
  const before = { runtime: { phase: value.runtime.getState().phase, session: value.runtime.getState().session },
    fallbackBodies: value.rootElement.querySelectorAll('[data-old-reader-body]').length,
    surfaceCanvasId: m.useLcosShellStore.getState().surfaceCanvasId, requests: requestTargets.length };
  assert.deepEqual(before.runtime, { phase: 'open', session: null });
  assert.equal(before.fallbackBodies, 1); assert.equal(before.requests, 0);
  await act(async () => {
    m.useLcosShellStore.getState().setSurfaceCanvasMap({ main: 'c' });
    m.useLcosShellStore.setState({ windows: [...m.useLcosShellStore.getState().windows] });
  });
  await tick(); await tick();
  const after = { runtime: { phase: value.runtime.getState().phase, session: value.runtime.getState().session },
    fallbackBodies: value.rootElement.querySelectorAll('[data-old-reader-body]').length,
    surfaceCanvasId: m.useLcosShellStore.getState().surfaceCanvasId, requests: requestTargets.length };
  assert.equal(after.fallbackBodies, 1); assert.equal(after.requests, 0); assert.equal(after.runtime.session, null);
  pass('REPRODUCED: ready native API + temporarily unmapped Surface permanently retains fallback after the same source receives its correct map', { before, after });
  await value.close();
  value = await openFixture();
  await wait(() => value.runtime.getState().session?.mode === 'view', 'already-mapped control opens exact revision');
  assert.equal(requestTargets.length, 1);
  assert.equal(value.rootElement.querySelectorAll('[data-old-reader-body]').length, 0);
  pass('control: identical restored source with mapping ready before mount reaches native Viewer once', { revisionId: requestTargets[0].revisionId });
  await value.close();
  report.scope += ' This is a failing-product-behavior reproduction, not a fix: the actual delegate/host and original wa execute, while the whole ProfessionalWindowStage is not mounted. Its actual source return closures are extracted by the reused fixture; Stage item identity was checked separately in source.';
` + source.slice(end);
await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
