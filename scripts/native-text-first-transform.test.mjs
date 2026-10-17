import assert from 'node:assert/strict';
import fs from 'node:fs';
import { transformNativeFirstTextScript, restoreNativeFirstTextScriptForComparison } from '../lab/native-text-first-transform.mjs';
const name = 'course-api-base-url-CifxI1ia.js';
const original = fs.readFileSync(new URL('../reference/tapnow-installed/resources/web/assets/' + name, import.meta.url), 'utf8');
const transformed = transformNativeFirstTextScript(name, original);
assert.notEqual(transformed, original);
assert.equal(transformNativeFirstTextScript(name, transformed), transformed);
assert.equal(restoreNativeFirstTextScriptForComparison(name, transformed), original);
assert.equal((transformed.match(/NativeToolbar:JT/g) || []).length, 0);
assert.ok(transformed.includes('/lcos/native-text-first-ui.js'));
assert.ok(transformed.includes('?Ck.PURE:e.data.type||Ck.GENERATE;return d.useMemo'));
const routerExpression = transformed.match(/const t=(e\.data\.lcos_ref\?\.version===1[^;]+);return d\.useMemo/)[1];
const chooseRenderer = new Function('e', 'Ck', 'return (' + routerExpression + ')');
const kinds = { PURE: 'pure', GENERATE: 'generate' };
const goodRef = { version: 1, entityType: 'artifact', entityId: 'a', artifactId: 'a', artifactViewId: 'v', revisionId: 'r' };
assert.equal(chooseRenderer({ data: { lcos_ref: goodRef } }, kinds), 'pure');
assert.equal(chooseRenderer({ data: { lcos_ref: { ...goodRef, entityType: 'view', entityId: goodRef.artifactViewId } } }, kinds), 'pure', 'exact version View uses original Pure reading shell');
for (const badRef of [{ version: 1, entityType: 'artifact' }, { ...goodRef, revisionId: '' },
  { ...goodRef, artifactViewId: undefined }, { ...goodRef, entityId: 'other' }, { ...goodRef, entityType: 'view' }]) {
  assert.equal(chooseRenderer({ data: { lcos_ref: badRef } }, kinds), 'generate');
}
assert.equal(chooseRenderer({ data: { type: 'pure' } }, kinds), 'pure', 'Unbound original pure routing remains untouched.');
assert.equal(transformNativeFirstTextScript('unrelated.js', 'untouched'), 'untouched');
const ui = fs.readFileSync(new URL('../lab/pilot/native-text-first-ui.tsx', import.meta.url), 'utf8');
assert.ok(!ui.includes('LcosCanvasTextBody') && !ui.includes('LcosTextFaces') && !ui.includes('MilkdownEditor'));
assert.ok(ui.includes('return originalEdit()') && ui.includes('cloneElement(props.originalBody'));
assert.ok(ui.includes('LCOSNativeTextNodeOwner') && ui.includes('NativeTextNodeContext.Provider'));
assert.ok(ui.includes('requestNativeMaterialView') && ui.includes('verifyNativeCanvasTextSave'));
assert.ok(!ui.includes('<NativeToolbar') && !ui.includes('native-first-toolbar'));
console.log(JSON.stringify({ passed: true, scope: 'original Text shells/Markdown/edit policy/toolbar preserved, reversible seam, no whole GN2 text body' }));
