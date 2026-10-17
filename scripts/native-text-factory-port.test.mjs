import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shim = fs.readFileSync(path.join(root, 'lab/native-flow.js'), 'utf8');
const vendor = fs.readFileSync(path.join(root, 'reference/tapnow-installed/resources/web/assets/UnlimitedModeToggle-D4wysAbz.js'), 'utf8');
const page = fs.readFileSync(path.join(root, 'reference/tapnow-installed/resources/web/assets/page-Da_DfwiK.js'), 'utf8');
assert.equal((vendor.match(/XD as b_/g) || []).length, 1, 'The actual vendor factory export must remain unique.');
assert.ok(vendor.includes('XD=(e={},t)=>'), 'The shipped factory keeps its data/overrides signature.');
assert.ok(page.includes('b_ as fi'), 'The original page uses this exact factory, not a lookalike.');
assert.ok(shim.includes("export { b_ as createOriginalTextCarrier } from '/assets/UnlimitedModeToggle-D4wysAbz.js';"));
assert.equal((shim.match(/createOriginalTextCarrier/g) || []).length, 1, 'Only a direct export; no replacement node constructor.');
assert.ok(!/addNodes|setNodes|createRoot/.test(shim), 'The shim does not own Canvas mutation or a React root.');
console.log(JSON.stringify({ passed: true, scope: 'original factory export/source provenance; runtime construction needs the browser probe',
  export: 'XD as b_ / original page fi', secondFactory: false, newCanvas: false }));
