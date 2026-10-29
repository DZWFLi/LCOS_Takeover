import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';
import {
  nativeWorkflowCardPoolSource,
  transformNativeWorkflowCardPool,
} from '../lab/native-workflow-source-transform.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(root, nativeWorkflowCardPoolSource);
const hostPath = path.join(root, 'lab/pilot/native-workflow-host.tsx');
const cssPath = path.join(root, 'lab/pilot/native-workflow-host.css');
const original = fs.readFileSync(sourcePath, 'utf8');
const originalBytes = fs.readFileSync(sourcePath);
const hostSource = fs.readFileSync(hostPath, 'utf8');
const cssSource = fs.readFileSync(cssPath, 'utf8');
const transform = (source, target = sourcePath) => transformNativeWorkflowCardPool(source, { sourcePath: target });

function section(source, startToken, endToken) {
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start);
  assert.ok(start >= 0 && end > start, `section markers exist: ${startToken} … ${endToken}`);
  return source.slice(start, end);
}

const transformed = transform(original);
assert.notEqual(transformed, original, 'the exact existing WorkflowCardPool entry seam is extended');
assert.equal(transform(transformed), transformed, 'a valid Workflow transform is idempotent');
assert.match(transformed, /sourceSurface: 'main' \| 'workflow' \| 'context'/,
  'the native leaf receives only Core-mapped Main/Context/Workflow source surfaces');
assert.match(transformed, /onNativeEnter\?: \(targetWorkspace: Workspace\) => Promise<boolean>/,
  'the narrow navigation adapter receives a canonical Workspace and an acknowledged route result');
assert.match(transformed,
  /onNativeEnter\s*\?\s*await onNativeEnter\(resolution\.targetWorkspace\)\s*:\s*sourceSurface === 'context' \? false\s*:\s*await beginChildWorksiteNavigation\(/,
  'the resolved Workspace is delegated to the original Router and Context never falls through to switchCanvas navigation');
assert.match(transformed,
  /\(sourceSurface === 'workflow' \|\| sourceSurface === 'context'\) && activeWorkspaceId !== null\s*\? \{ kind: 'workspace' as const, id: activeWorkspaceId \}/,
  'the existing empty-pool Assembly action keeps the exact current Workspace for Context as well as Workflow');
assert.equal(section(original, 'const takeCard =', 'const previewCard ='),
  section(transformed, 'const takeCard =', 'const previewCard ='),
  'the existing unsent method/reference append and Composer action remain byte-for-byte intact');
assert.equal(section(original, 'const previewCard =', 'const enterCard ='),
  section(transformed, 'const previewCard =', 'const enterCard ='),
  'the existing real method draft reader and unavailable result stay unchanged');
assert.match(transformed, /<WorkflowTaskCardView[\s\S]*?onPreview=\{\(\) => previewCard\(card, entryResolution\)\}/,
  'the original Warehouse card maps to its existing WorkflowTaskCardView caller');
assert.equal(fs.readFileSync(sourcePath, 'utf8'), original,
  'the copied WorkflowCardPool remains byte-for-byte unchanged');

assert.throws(() => transformNativeWorkflowCardPool(original, {}), /real copied WorkflowCardPool sourcePath/,
  'a missing source path is rejected');
assert.throws(() => transform(original, `${sourcePath}.backup`), /only applies to/,
  'the AST transform does not target another vendor file');
assert.throws(() => transform(original.replace("sourceSurface: 'main' | 'workflow'", "sourceSurface: 'main' | 'context' | 'workflow'")),
  /partially installed|sourceSurface must be exactly/,
  'an unexpected donor surface shape fails closed');
assert.throws(() => transform(original.replace('beginChildWorksiteNavigation({', 'beginOtherNavigation({')),
  /original child-worksite navigation call/,
  'navigation owner drift fails closed instead of hard-replacing a different route');
assert.throws(() => transform(original.replace('appendWorkflowMethodDraft(method, projectId)', 'appendOtherDraft(method, projectId)')),
  /original warehouse\/method\/task-card callers changed/,
  'method-draft producer drift fails closed');
const partial = original.replace("sourceSurface: 'main' | 'workflow';",
  "sourceSurface: 'main' | 'workflow' | 'context';");
assert.throws(() => transform(partial), /partially installed or duplicated/,
  'a partial source adaptation is never silently accepted');

assert.match(hostSource, /export function NativeWorkflowHand\(/,
  'the Root-owned panel can mount the expected Workflow leaf');
assert.match(hostSource, /readonly open: boolean/,
  'the parent can keep the leaf mounted through the donor exit-presence transition');
assert.match(hostSource, /<WorkflowHandView open=\{open\}/,
  'the original HandView, backdrop, dismiss plane, and focus-return layer remain the owner');
assert.match(hostSource, /<WorkflowCardPool[\s\S]*?onNativeEnter=\{enterNativeWorkflow\}/,
  'the original card pool receives only the narrow Router callback');
assert.match(hostSource, /readNativeSavedContextWorkspaces\(projectId, canvasId, rows\)/,
  'current source surface and target list are read from the canonical Core Workspace rows');
assert.match(hostSource, /current\.current\.preferredSurface/,
  'Main/Context/Workflow origin is never inferred from the Canvas title');
assert.match(hostSource, /navigate\(`\/canvas\/\$\{encodeURIComponent\(targetWorkspace\.canvasId\)\}`\)/,
  'entry delegates only the exact verified workflow Canvas ID to the original Router');
assert.match(hostSource, /assertCurrentWorkflowOwner\(projectId, canvasId, api\)/,
  'Core workspace reads are guarded by original Canvas/API ownership');
assert.match(hostSource, /if \(!open\) return;/,
  'closed Workflow leaves do not read Core');
assert.match(original, /readWorkflowMethodDraft\(session, projectId, card, controller\.signal\)/,
  'the actual imported donor owns real Workflow method reads');
assert.match(original, /appendWorkflowMethodDraft\(method, projectId\)/,
  'the actual imported donor owns the existing unsent method-draft append');
assert.doesNotMatch(hostSource, /WorkflowWorksite|LcosWorksiteStage|switchCanvas|createRoot|react-dom\/client/,
  'the host mounts neither a Workflow worksite/second Canvas nor another React root');
assert.doesNotMatch(hostSource, /LcosHostOverlay|LcosComposerHost/,
  'the host does not duplicate the Composer already mounted by the native drop host');
assert.match(hostSource, /nativeAssemblyDropActive/,
  'the donor dismiss/Escape protection remains active during Assembly carry');
assert.doesNotMatch(cssSource, /(^|\s)(body|html|:root)\b/i,
  'native Workflow CSS does not alter page-global layout or theme');
assert.match(cssSource, /\[data-lcos-native-workflow-host\]/,
  'all host-specific CSS is scoped to the native Workflow leaf');

const outputDir = path.join(root, '.runtime', `native-workflow-target-${Date.now()}`);
const output = path.join(outputDir, 'native-workflow-host.js');
await buildPilotEntry('lab/pilot/native-workflow-host.tsx', output, 'browser', {
  nativeReact: true,
  env: { LCOS_CORE_URL: '/api/lcos/core', LCOS_CORE_TOKEN: '', PROJECT_ID: 'disposable-surface-core-facade' },
  sourceOverrides: { 'lcos/huabu/apps/web/src/store/canvasStore.ts': 'lab/pilot/native-canvas-port.ts' },
  sourceTransforms: { [nativeWorkflowCardPoolSource]: transformNativeWorkflowCardPool },
});
const bundle = fs.readFileSync(output, 'utf8');
assert.match(bundle, /NativeWorkflowHand/, 'the host is present in its temporary native React module graph');
assert.match(bundle, /WorkflowCardPool/, 'the original Warehouse-backed WorkflowCardPool is in the target graph');
assert.match(bundle, /WorkflowTaskCardView/, 'the mature original task-card renderer remains in the target graph');
assert.match(bundle, /readWorkflowMethodDraft/, 'the real Core graph/Presentation method reader is retained');
assert.match(bundle, /appendWorkflowMethodDraft/, 'the original unsent Composer draft append is retained');
assert.match(bundle, /LightCurtainDismissPlane/, 'the mature hand backdrop/dismiss mechanism is retained');
assert.match(bundle, /data-lcos-native-workflow-host/, 'the native host namespace is present');
assert.doesNotMatch(bundle, /LcosWorksiteStage|WorkflowWorksite/,
  'the target does not pull in the donor Workflow Canvas/worksite');
assert.doesNotMatch(bundle, /react-dom\/client/,
  'the Workflow leaf reuses the single existing React root');
assert.deepEqual(fs.readFileSync(sourcePath), originalBytes,
  'the target build applies the donor adaptation in memory only');

console.log(JSON.stringify({
  passed: true,
  scope: 'exact copied WorkflowCardPool AST seam + temporary native React target bundle; no browser/Core/service run',
  sourcePath: nativeWorkflowCardPoolSource,
  targetBundle: path.relative(root, output).replaceAll('\\', '/'),
  originalWorkflowCardPoolByteIdentical: true,
  nativeGuiVerified: false,
  cases: [
    'exact source path, transform idempotence, and partial-install refusal',
    'original Workflow method preview/take and TaskCardView callers remain unchanged',
    'canonical Core source Workspace and existing Router entry; Context avoids switchCanvas helper',
    'closed leaf does not read Core; open/close retains original HandView presence and carry protections',
    'temporary bundle reuses the one React root and excludes WorkflowWorksite/LcosWorksiteStage',
  ],
}, null, 2));
