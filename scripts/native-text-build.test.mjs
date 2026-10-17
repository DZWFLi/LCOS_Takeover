import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';
import { createNativeTextSourceTransforms } from '../lab/native-text-source-transforms.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, '.runtime', `native-text-build-test-${Date.now()}`, 'native-text-ui.js');
const sourceTransforms = createNativeTextSourceTransforms();
const readSource = () => Object.fromEntries(Object.keys(sourceTransforms).map(relative =>
  [relative, fs.readFileSync(path.join(root, relative), 'utf8')]));
const before = readSource();
await buildPilotEntry('lab/pilot/native-text-ui.tsx', output, 'browser', {
  nativeReact: true,
  env: { LCOS_CORE_URL: '/api/lcos/core', LCOS_CORE_TOKEN: '', PROJECT_ID: 'disposable-surface-core-facade' },
  sourceOverrides: { 'lcos/huabu/apps/web/src/store/canvasStore.ts': 'lab/pilot/native-canvas-port.ts' },
  sourceTransforms,
});
assert.deepEqual(readSource(), before, 'all copied donor files remain unchanged');
const bundle = fs.readFileSync(output, 'utf8');
const contains = (pattern, label) => assert.ok(pattern.test(bundle), label);
contains(/from "\/lcos\/native-flow\.js"/, 'density reads the shipped Flow query hooks');
contains(/outlineSession\.serializeOutline\(nextRoots\)/, 'canonical save uses the editor session');
contains(/outlineSession\.serializeBranch\(\[branch\]\)/, 'clipboard uses the branch serializer');
// esbuild disambiguates clipboard from dependency symbols as clipboard2, etc.
contains(/outlineSession\.cloneBranches\(clipboard\d*\)/, 'paste clones through the same editor session');
contains(/outlineSession\.serializeBranch\(\[branchNode\]\)/, 'dragged branch retains its source formatting');
contains(/canEditMap = Boolean\(onSaveText\)/, 'source-preserving text faces are installed alongside the editor');
contains(/createOutlineSourceSession/, 'the helper is bundled with the mature editor, not only source-string patched');
contains(/LcosCanvasTextBody/, 'the existing text body is retained');
contains(/MilkdownEditor/, 'the existing rich editor is retained');
contains(/expectedRevisionId/, 'the original Core CAS field is retained');
contains(/saveNativeCanvasText/, 'mature body saves via original native writer and receipt');
contains(/updateNativeTextPresentation/, 'mode and geometry delegate to one original native update');
contains(/createNativeProjectTextReceiptPort/, 'the actual branch drop caller uses the existing native creation receipt helper');
contains(/createTextCarrier: createOriginalTextCarrier/, 'branch creation delegates to the original shipped text factory');
contains(/LCOSNativeTextBodySlot/, 'real slot exported for the vendor text child');
assert.ok(!/react-dom\/client/.test(bundle), 'no second React root');
await assert.rejects(() => buildPilotEntry('lab/pilot/native-text-ui.tsx', output, 'node', { sourceTransforms }), /browser-only/);
await assert.rejects(() => buildPilotEntry('lab/pilot/native-text-ui.tsx', output, 'browser', {
  nativeReact: true, sourceTransforms: { 'reference/unknown.ts': source => source },
}), /existing copied LCOS file/);
console.log(JSON.stringify({ passed: true, scope: 'real mature-text bundle/source integration, not native GUI acceptance',
  output: path.relative(root, output).replaceAll('\\', '/'), sourceFilesUntouched: true,
  nativeHistoryCallerBundled: true, nativeGuiHistoryVerified: false,
  cases: ['four exact source transforms included in one original-React module graph',
    'full-document and branch serializers share the editor session', 'original Milkdown/Core CAS owner retained',
    'branch drop reaches original factory/addNodes and Core receipt without a second producer',
    'density imports original Flow queries', 'non-browser or out-of-scope transforms refused'] }, null, 2));
