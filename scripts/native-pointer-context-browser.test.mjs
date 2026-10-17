import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pointerHitEvidence } from './native-pointer-hit-test.mjs';
import { coreBoundContextFingerprint, workViewCoreReadback } from './native-pointer-context-readback.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [browserTest, dropAdapter, agentUi, originalCanvasPage, originalTitleHook, originalMainBundle] = await Promise.all([
  readFile(path.join(root, 'scripts/native-pointer-context-browser.mjs'), 'utf8'),
  readFile(path.join(root, 'lab/pilot/native-conversation-drop.tsx'), 'utf8'),
  readFile(path.join(root, 'lab/pilot/native-agent-ui.tsx'), 'utf8'),
  readFile(path.join(root, 'reference/tapnow-installed/resources/web/assets/page-Da_DfwiK.js'), 'utf8'),
  readFile(path.join(root, 'reference/tapnow-installed/resources/web/assets/use-meta-data-CZxGZrMF.js'), 'utf8'),
  readFile(path.join(root, 'reference/tapnow-installed/resources/web/assets/index-BAQXnPag.js'), 'utf8'),
]);
const report = { mode: 'native-pointer-context-browser-safety-and-source-seams', passed: false, cases: [] };

const distinctDestination = { x: 671.675048828125, y: 467.08599853515625,
  exposedTargetIds: ['node-exact'] };
assert.equal(pointerHitEvidence([distinctDestination], 'node-exact', 671.6750415, 467.0859863), distinctDestination,
  'Different x/y destinations must match each coordinate against its own expected axis.');
assert.equal(pointerHitEvidence([
  { x: 671.675048828125, y: 671.675048828125, exposedTargetIds: ['node-exact'] },
  { x: 467.08599853515625, y: 467.08599853515625, exposedTargetIds: ['node-exact'] },
], 'node-exact', 671.6750415, 467.0859863), null,
'A pair that only reuses x or y for both axes must not match.');
report.cases.push('hit-test matcher checks x and y independently, including a distinct-axis regression');

const threeRefProjection = { relation: { boundContext: [
  { entityRef: { type: 'artifact', id: 'artifact-a', viewId: 'view-a' }, title: 'Text' },
  { entityRef: { type: 'artifact', id: 'artifact-b', viewId: 'view-b' }, title: 'Text' },
  { entityRef: { type: 'artifact', id: 'artifact-c', viewId: 'view-c' }, title: 'Image' },
] } };
const threeRefExpected = coreBoundContextFingerprint(threeRefProjection);
const threeRefReadback = workViewCoreReadback(threeRefProjection);
assert.deepEqual(Object.keys(threeRefReadback), ['coreBoundContextFingerprint'],
  'Original Work View Core-readback must expose one explicit fingerprint field.');
assert.deepEqual(threeRefReadback.coreBoundContextFingerprint, threeRefExpected,
  'Work View readback shape must preserve the complete Core refs and titles.');
assert.equal(threeRefReadback.coreBoundContextFingerprint.length, 3,
  'The readback contract must retain all Core context rows, not only the selected row.');
assert.deepEqual(threeRefReadback.coreBoundContextFingerprint.map((row) => row.entityRef.viewId).sort(),
  ['view-a', 'view-b', 'view-c']);
report.cases.push('Work View readback shape preserves and names the complete exact Core ref fingerprint');

assert.match(browserTest, /--deployed/);
assert.match(browserTest, /--allow-one-assembly-apply/,
  'A canonical Core relation write must require an explicit invocation flag.');
assert.match(browserTest, /--artifact-view-id/,
  'An already-bound exact Core view must be selectable for a no-duplicate idempotency check.');
assert.match(browserTest, /--readback-only/,
  'An existing ArtifactView should be inspectable and pointer-preview-cancellable without any canonical write.');
assert.match(browserTest, /canvasId = 'surface-core-workflow'/,
  'The browser scope must remain on Workflow only.');
assert.match(browserTest, /page\.mouse\.down\(\)[\s\S]*page\.mouse\.move\([\s\S]*page\.mouse\.up\(\)/,
  'The proof must use a real Chromium pointer sequence through the original visible handle.');
assert.match(browserTest, /\[data-semantic-drop-handle\]/,
  'The carry must originate from the original Assembly handle.');
assert.match(browserTest, /\[data-lcos-drop-preview\]\[data-presentation="preview"\]/);
assert.match(browserTest, /\[data-lcos-drop-receptor\]\[data-state="receptive"\]/,
  'Pointer release stays behind the original exact receptive preview.');
assert.match(browserTest, /writeGateOpen = true/);
assert.match(browserTest, /writeGateConsumed = true/);
assert.match(browserTest, /body\.targetRef\?\.kind === 'conversation'[\s\S]*body\.sourceRefs\[0\]\?\.kind === 'artifactView'[\s\S]*selectedSource\.artifactViewId/,
  'Only the already-read exact Workflow ArtifactView→ConnectedConversation Core apply is allowed.');
assert.match(browserTest, /Core collaboration-session and original Glyth Work View read back/);
assert.match(originalCanvasPage, /const Mt=Se\.data\.data\.name;v\(Mt\)/,
  'The original CanvasPage must source its title from returned persisted Canvas metadata.');
assert.match(originalCanvasPage, /Fe=C\.trim\(\)\?`\$\{C\.trim\(\)\} \| \$\{t\("common\.pageTitle"\)\}`:t\("common\.pageTitle"\);sk\(Fe\)/,
  'The source CanvasPage title updater changed; re-audit its original metadata-derived composition before changing this browser assertion.');
assert.match(originalTitleHook, /document\.title=t/,
  'The original title hook no longer assigns the computed title to document.title.');
assert.ok(originalMainBundle.includes('pageTitle:"TapNow｜你的智能体创意画布"'),
  'The original common.pageTitle translation used by the CanvasPage updater changed.');
assert.match(browserTest, /canvasBefore\?\.name[\s\S]*originalCommonPageTitle/,
  'Expected Workflow title must derive from the persisted Canvas metadata plus the original common page-title translation.');
assert.match(browserTest, /waitForFunction\(\(expected\) => document\.title === expected/,
  'Initial and reload identity checks must wait for the exact settled metadata-derived title.');
assert.match(browserTest, /titleVerification: \{ originalUpdater:[\s\S]*initial: null, afterReload: null/,
  'Evidence must retain the original updater and both initial/reload raw title checks.');
assert.match(browserTest, /rawTitle: document\.title/,
  'The raw title value must remain in both page identity records.');
assert.doesNotMatch(browserTest, /TapNow Desktop/,
  'The test must not mistake the original static HTML fallback title for the settled Canvas title.');
assert.match(browserTest, /\.\.\.workViewCoreReadback\(projection\)/,
  'The mature Work View must return the declared exact Core readback shape.');
assert.match(browserTest, /coreBoundContextFingerprint\(projectionAfterCancel\), readback\.coreBoundContextFingerprint/,
  'Readback-only reload comparison must compare all before/after Core entity refs.');
assert.match(browserTest, /coreBoundContextFingerprint\(preReloadProjection\), reloadedWorkView\.coreBoundContextFingerprint/,
  'Normal reload comparison must compare all before/after Core entity refs.');
assert.match(browserTest, /reloadedWorkView\.coreBoundContextFingerprint\.length/,
  'The reported post-reload context count must use the same readback shape.');
assert.doesNotMatch(browserTest, /(?:readback|reloadedWorkView)\.coreBoundContext(?:\.|,)/,
  'Do not read an undefined legacy `coreBoundContext` field from Work View readback.');
assert.match(browserTest, /identity\.href, workflowUrl/);
assert.match(browserTest, /await page\.reload\(\{ waitUntil: 'domcontentloaded' \}\)/,
  'The mature Work View must be reopened and read after a real page reload.');
assert.match(browserTest, /openOriginalWorkViewReadback\('after-drop-reload'\)/);
assert.match(browserTest, /openOriginalWorkViewReadback\('readback-only-after-reload'\)/);
assert.match(browserTest, /pointerHitTestMatched[\s\S]*paintAudit/);
assert.match(browserTest, /--gen2-accent[\s\S]*--lcos-glass-bg[\s\S]*backdropFilter/,
  'Preview diagnostics must capture actual LCOS token resolution and computed paint styles.');
assert.match(browserTest, /saveLocatorScreenshot\(preview[\s\S]*saveLocatorScreenshot\(receptive/,
  'The on-screen feedback and receiver need separate real DOM crops, not only a full-page screenshot.');
assert.match(browserTest, /page\.keyboard\.press\('Escape'\)[\s\S]*page\.mouse\.up\(\)[\s\S]*applyRequests\.length, 0/,
  'Readback-only pointer testing must cancel before release and verify zero canonical POSTs.');
const responseWatchIndex = browserTest.indexOf('const browserApplyResponsePromise = page.waitForResponse');
const releaseIndex = browserTest.indexOf('await page.mouse.up()', responseWatchIndex);
assert.ok(responseWatchIndex >= 0 && releaseIndex > responseWatchIndex,
  'The exact response listener must be installed before the user pointer releases.');
assert.match(browserTest, /await browserApplyResponse\.finished\(\)[\s\S]*await applyRouteCapturePromise/,
  'The Core response body and the exact route capture must settle before receipt assertions.');
assert.match(browserTest, /status === 'success' \|\| status === 'partial' \|\| status === 'failed'/,
  'The script must wait for every real terminal receipt state, not the interim committing state.');
assert.match(browserTest, /browserApplyRequests\.length, 1/,
  'A real pointer drop must not auto-retry or duplicate the canonical write.');
assert.match(browserTest, /\[data-lcos-conversation-bound-context\][\s\S]*\[data-lcos-bound-material\]/,
  'The post-write readback must use the original ConversationWorkViewBody material rendering.');
assert.match(browserTest, /assert\.deepEqual\(uiTitles, coreTitles,/,
  'Mature Work View labels must match the full Core boundContext material title multiset/count.');
assert.match(browserTest, /titleMultisetMatches: true/);
assert.match(browserTest, /ConversationWorkViewBody exposes labels, not ArtifactView IDs/,
  'Do not claim exact identity from UI labels when the donor renderer omits reference IDs.');
for (const field of ['remoteBlocked:', 'remoteWebSocketsBlocked:', 'pageErrors:', 'consoleErrors:',
  'apiFailures:', 'blockedOtherWrites:', 'scopeViolations:']) {
  assert.ok(browserTest.includes(field), `Browser evidence omitted ${field.replace(':', '')}.`);
}
assert.match(browserTest, /E:\/AppMoved\/\.codex\/visualizations/,
  'Visual evidence must stay outside the repository.');
assert.doesNotMatch(browserTest, /\.dispatchEvent\s*\(/,
  'The browser proof cannot manufacture pointer or DOM events.');
assert.doesNotMatch(browserTest, /new\s+DataTransfer\s*\(|dataTransfer\.setData/,
  'This vertical slice is pointer carry, not a synthetic HTML drag/drop path.');
report.cases.push('browser flow is Workflow-only, real-pointer-only, and release-gated by the exact original receptive preview');

assert.match(dropAdapter, /rectFromDomRect\(live\.getBoundingClientRect\(\)\)/);
assert.match(dropAdapter, /isDropPointExposed\(live, point\)/);
assert.match(dropAdapter, /semantic: \{ kind: 'collaboration-reference', conversationId: reference\.connectedConversationId \}/);
assert.match(dropAdapter, /from ['"].*lcos\/LcosHostOverlay\.tsx?['"]/);
assert.doesNotMatch(dropAdapter, /new\s+DropTargetRegistry|createRailwayPointerDropController|dispatchEvent\s*\(/);
assert.match(agentUi, /NativeConversationDropHost/);
assert.match(agentUi, /NativeConversationDropTarget/);
report.cases.push('native target adapter uses the original drop registry/commit owner and live original Glyth DOM bounds');

report.passed = true;
console.log(JSON.stringify(report, null, 2));
