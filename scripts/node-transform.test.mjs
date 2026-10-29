import assert from 'node:assert/strict';
import fs from 'node:fs';
import { transformCutScript } from '../lab/cut-transform.mjs';
import { transformNodeBridgeScript } from '../lab/node-transform.mjs';
const name = 'page-Da_DfwiK.js';
const original = fs.readFileSync(new URL('../reference/tapnow-installed/resources/web/assets/' + name, import.meta.url), 'utf8');
const cut = transformCutScript(name, original);
const transformed = transformNodeBridgeScript(name, cut);
assert.ok(/jsx\(LCOSOriginalNodeBridge,\{canvasId:[A-Za-z_$][\w$]*,undo:[A-Za-z_$][\w$]*,redo:[A-Za-z_$][\w$]*,originalNodes:[A-Za-z_$][\w$]*,pointerInteraction:\{explicitToolActive:!!\([\w$|]+\),interactivityLocked:!![\w$]+\}\}\)/.test(transformed), 'same original bridge receives its original current tool policy');
assert.equal((transformed.match(/LCOSOriginalNodeBridge/g) || []).length, 2);
const originalInput = cut.match(/=B8\(\{canvasId:[\w$]+,isCollaborationEnabled:[\w$]+,nodes:([\w$]+),/)?.[1];
assert.ok(originalInput);
assert.ok(transformed.includes(',originalNodes:' + originalInput + ',pointerInteraction:'), 'the private bridge reads the same original editing nodes as O8, not pile/hidden display projection');
assert.ok(transformed.includes('LF=()=>window.__LCOS_CUSTOM_PANEL__?.render(r)||null'));
assert.equal(transformNodeBridgeScript(name, transformed), transformed);
assert.equal(transformNodeBridgeScript('main.js', 'const x=1;'), 'const x=1;');
const policy = transformed.match(/pointerInteraction:(\{[^}]+\})/)?.[1]; assert.ok(policy);
const flags = ['f','g','p','Ws','Qs','Ln','ce','d','es'];
const read = new Function(...flags, 'return ' + policy);
for (let mask = 0; mask < 512; mask++) {
  const values = flags.map((_, index) => Boolean(mask & (1 << index)));
  const value = read(...values);
  assert.equal(value.explicitToolActive, values.slice(0, 8).some(Boolean), 'all original editor/selection/comment modes, mask ' + mask);
  assert.equal(value.interactivityLocked, values[8], 'original collaboration editing block, mask ' + mask);
}
assert.ok(!policy.includes('draggable'), 'the movement preference is not used as a content-reading prohibition');
console.log('PASS: original Canvas AST seam + original history callbacks; vendor untouched.');
