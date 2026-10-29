import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';
import {
  nativeSavedContextAtlasSource,
  transformNativeSavedContextAtlas,
} from '../lab/native-saved-context-transform.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(root, nativeSavedContextAtlasSource);
const actionPath = path.join(root, 'lab/pilot/native-saved-context-action.tsx');
const ownerPath = path.join(root, 'lab/pilot/native-saved-context-owner.ts');
const original = fs.readFileSync(sourcePath, 'utf8');
const originalBytes = fs.readFileSync(sourcePath);
const actionSource = fs.readFileSync(actionPath, 'utf8');
const ownerSource = fs.readFileSync(ownerPath, 'utf8');
const helperSpecifier = path.relative(path.dirname(sourcePath), actionPath).split(path.sep).join('/');
const specifier = helperSpecifier.startsWith('.') ? helperSpecifier : `./${helperSpecifier}`;
const transform = (source, target = sourcePath) => transformNativeSavedContextAtlas(source, { sourcePath: target });

function section(source, startToken, endToken) {
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start);
  assert.ok(start >= 0 && end > start, `section markers exist: ${startToken} … ${endToken}`);
  return source.slice(start, end);
}

const transformed = transform(original);
assert.notEqual(transformed, original, 'the exact Context Atlas focused-summary seam is extended');
assert.equal(transform(transformed), transformed, 'valid installation is idempotent');
assert.equal(path.resolve(path.dirname(sourcePath), specifier), actionPath,
  'the injected import resolves relative to the actual copied source file');
assert.match(transformed,
  /mode === 'context' && focusedItem\?\.kind === 'context' && focusedItem\.entityRef\.type === 'context' \? <NativeSavedContextAction key=\{focusedItem\.entityRef\.id\} projectId=\{projectId\} item=\{focusedItem\} \/> : null/,
  'only the focused exact Context card in Context mode receives the action');
assert.equal(section(original, 'const action = (', 'const collectionProps ='),
  section(transformed, 'const action = (', 'const collectionProps ='),
  'the original take/enter/locate card controls are byte-for-byte retained');
assert.match(transformed, /mode === 'main-collections'\s*\? <CanonicalCollectionView/,
  'Main Collections retains its original non-Saved-Context view branch');
assert.equal(fs.readFileSync(sourcePath, 'utf8'), original,
  'the copied ContextAtlasStage remains byte-for-byte unchanged');

assert.throws(() => transformNativeSavedContextAtlas(original, {}), /real copied ContextAtlasStage sourcePath/,
  'missing sourcePath is rejected');
assert.throws(() => transform(original, `${sourcePath}.backup`), /only applies to/,
  'a different path is never transformed');
assert.throws(() => transform(original.replace('className="lcos-atlas-focus-summary"', 'className="atlas-summary-renamed"')),
  /focused item summary/,
  'summary seam drift fails closed');
assert.throws(() => transform(original.replace('focusOnCanvas(item)', 'focusOnCanvas(changedItem)')),
  /original card take\/enter\/locate actions changed/,
  'original card-action caller drift is rejected');
const importOnly = original.replace('import { CoreAssemblyClient }',
  `import { NativeSavedContextAction } from '${specifier}';\nimport { CoreAssemblyClient }`);
assert.throws(() => transform(importOnly), /partially installed or duplicated/,
  'a partial transform does not silently proceed');
assert.throws(() => transform(transformed.replace('focusedItem.entityRef.id', 'projectId')),
  /seam drift/,
  'changed scope identity/key is rejected instead of targeting another Context');

assert.match(actionSource, /readSelectedCanvasNodes\(canvas\)/,
  'the action reads selection from the original Canvas port helper');
assert.match(actionSource, /createNativeContextReferencePort\(\{ http, projectId \}\)/,
  'the existing exact-reference/Core Assembly port is reused');
assert.match(actionSource, /kind: 'context' as const, id: contextId, projectId/,
  'the target is only the focused canonical Context scope ID');
assert.match(actionSource, /reviewAssemblyApply\(preview\.request, rawResult\)/,
  'per-item success/partial/unknown replies use the original Assembly review');
assert.match(actionSource, /listPresentations\(projectId\)/,
  'the UI reads the existing Core Presentation endpoint');
assert.match(actionSource, /state\.memberViewIds/,
  'ArtifactView members are confirmed from Presentation state, not Canvas geometry');
assert.match(actionSource, /state\.memberEntityRefs/,
  'aggregate entity members remain visible alongside ArtifactViews');
assert.match(actionSource, /data-saved-context-receipt-item=/,
  'per-item Core receipt status is observable in the existing UI');
assert.match(actionSource, /const disabled = working \|\| contextId === undefined \|\| identityProblem !== undefined \|\| selected\.status !== 'ready'/,
  'a completed receipt does not freeze the action; deliberate replay can receive Core already-member');
assert.equal((actionSource.match(/port\.apply\(preview\)/g) ?? []).length, 1,
  'there is one explicit apply call site and no automatic retry');

const applyAction = section(actionSource, 'const applyCurrentSelection = async', '\n  return (');
assert.match(actionSource,
  /if \(!canvas\.rfInstance \|\| nodeLab\?\.api !== canvas\.rfInstance\)/,
  'the native snapshot must refer to the exact currently-owned TapNow NodeLab API');
assert.match(applyAction,
  /const capturedCanvasId = liveCanvas\.canvasId;\s*const capturedRfInstance = liveCanvas\.rfInstance;\s*const capturedProjectId = projectId;/,
  'a click captures its exact original project, Canvas ID, and ReactFlow API before async preview');
const targetGuard = section(applyAction, 'const isCurrentTarget =', "const target = { kind: 'context'");
assert.match(targetGuard, /isNativeSavedContextOwnerCurrent\(/,
  'async continuations use the pure exact-owner guard');
assert.match(targetGuard,
  /projectId: capturedProjectId, canvasId: capturedCanvasId, rfInstance: capturedRfInstance/,
  'the owner guard receives the exact owner captured at click time');
assert.match(targetGuard, /currentNodeLab\?\.api,/,
  'the owner guard compares against the live TapNow NodeLab API');
assert.match(targetGuard, /currentActionGeneration,\s*actionGeneration\.current/,
  'the owner guard rejects replies from invalidated action generations');
assert.match(applyAction,
  /if \(!isCurrentTarget\(\)\) return;\s*if \(preview\.status !== 'ready'\)/,
  'a scene/API switch while preview is pending cannot proceed to apply');
const beforeApplyGuard = section(applyAction, 'const beforeApplyCanvas =', "setNotice({ status: 'working', phase: 'applying' })");
assert.ok(beforeApplyGuard.includes('if (!isCurrentTarget() || beforeApplyCanvas.canvasId !== capturedCanvasId'),
  'pre-apply guard checks the same Canvas ID captured by the click');
assert.ok(beforeApplyGuard.includes('|| beforeApplyCanvas.rfInstance !== capturedRfInstance || beforeApplyProblem)'),
  'pre-apply guard checks the same API captured by the click and current project identity');
assert.ok(beforeApplyGuard.includes('Core 尚未收到 Assembly apply。'),
  'a stale pre-apply action is explicitly reported as not submitted');
assert.ok(applyAction.indexOf('Core 尚未收到 Assembly apply。') < applyAction.indexOf('rawResult = await port.apply(preview)'),
  'a stale preview is rejected before crossing the Core write boundary');
assert.ok(applyAction.indexOf('rawResult = await port.apply(preview)') < applyAction.indexOf('if (!isCurrentTarget()) return;\n\n    const reviewed'),
  'a completed Core apply is checked against the captured scene before any receipt display');
assert.ok(applyAction.indexOf('if (!isCurrentTarget()) return;\n\n    const reviewed') < applyAction.indexOf('readPresentationMembership(projects, projectId, contextId, expectedViewIds)'),
  'readback begins only after the post-apply exact-identity check');
assert.match(applyAction,
  /const presentation = await readPresentationMembership\(projects, projectId, contextId, expectedViewIds\);\s*if \(!isCurrentTarget\(\)\) return;\s*setMembership\(presentation\);/,
  'a scene/API switch during readback prevents stale membership and success from appearing');
assert.match(actionSource,
  /canvas\.rfInstance, shellProjectId, referenceProjectId, identityProblem\]/,
  'a native API replacement also invalidates the current action generation');
assert.match(actionSource, /from '\.\/native-saved-context-owner\.ts'/,
  'the tested owner guard is the one used by the native action');
assert.match(ownerSource, /captured\.rfInstance === current\.rfInstance\s*&& captured\.rfInstance === nativeHostApi/,
  'the owner helper requires identical snapshot and host API object references');
assert.match(ownerSource, /capturedGeneration === currentGeneration/,
  'the owner helper reuses the existing generation to invalidate A→B→A stale work');

const outputDir = path.join(root, '.runtime', `native-saved-context-target-${Date.now()}`);
const output = path.join(outputDir, 'context-atlas.js');
await buildPilotEntry(nativeSavedContextAtlasSource, output, 'browser', {
  nativeReact: true,
  env: { LCOS_CORE_URL: '/api/lcos/core', LCOS_CORE_TOKEN: '', PROJECT_ID: 'disposable-surface-core-facade' },
  sourceOverrides: { 'lcos/huabu/apps/web/src/store/canvasStore.ts': 'lab/pilot/native-canvas-port.ts' },
  sourceTransforms: { [nativeSavedContextAtlasSource]: transformNativeSavedContextAtlas },
});
const bundle = fs.readFileSync(output, 'utf8');
assert.match(bundle, /NativeSavedContextAction/, 'the transformed Atlas caller and action build into one target bundle');
assert.match(bundle, /data-lcos-native-saved-context-action/, 'the focused-summary action is in the built module graph');
assert.match(bundle, /data-saved-context-members/, 'the built UI contains read-only Core membership display');
assert.match(bundle, /isNativeSavedContextOwnerCurrent/, 'the exact owner/generation guard is present in the target bundle');
assert.match(bundle, /presentation:context:/, 'the canonical Context Presentation identity is preserved');
assert.match(bundle, /data-semantic-drop-handle/, 'the original card carry action remains in the target bundle');
assert.doesNotMatch(bundle, /react-dom\/client/,
  'the Saved Context leaf does not create another React root');
assert.deepEqual(fs.readFileSync(sourcePath), originalBytes,
  'the target build applies the AST transform in memory without changing the donor');

console.log(JSON.stringify({
  passed: true,
  scope: 'exact ContextAtlasStage focused-summary transform and temporary native React target bundle; no browser/Core service run',
  sourcePath: nativeSavedContextAtlasSource,
  targetBundle: path.relative(root, output).replaceAll('\\', '/'),
  originalContextAtlasByteIdentical: true,
  originalCardActionSectionUnchanged: true,
  nativeGuiVerified: false,
  cases: [
    'exact source path, summary-only guarded caller, idempotence, and partial-install refusal',
    'donor action drift, summary drift, Main mode separation, and unchanged original source',
    'selected persisted lcos_ref → canonical Context Scope → existing Assembly review/apply',
    'captured project/Canvas/API identity guards preview, pre-apply, post-apply receipt, and readback; no retry',
    'Core Presentation memberViewIds + memberEntityRefs readback and per-item receipt labels',
    'temporary target bundle reuses original React and has no second React root',
  ],
}, null, 2));
