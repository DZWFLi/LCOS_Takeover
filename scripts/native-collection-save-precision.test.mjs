import assert from 'node:assert/strict';
import fs from 'node:fs';
import { nativeCollectionSavedPlacementMatches as matches } from '../lab/pilot/native-collection-save-precision.mjs';

const source = fs.readFileSync(new URL('../reference/tapnow-installed/resources/web/assets/page-Da_DfwiK.js', import.meta.url), 'utf8');
const donor = source.match(/DC=\(e,t=2\)=>\{if\(!e\)return;const s=10\*\*t;return\{x:Math\.round\(e\.x\*s\)\/s,y:Math\.round\(e\.y\*s\)\/s\}\}/)?.[0];
assert.ok(donor, 'the installed private DC persistence quantizer remains exact and inspectable');
assert.ok(source.includes('position:DC(e.position)'), 'the actual donor node serializer applies this quantizer');
const quantize = new Function(`return (${donor.slice(3)});`)();
for (const point of [{ x: 269.5, y: 29.615384615384613 }, { x: -17.235, y: -0.005 },
  { x: 0, y: 0 }, { x: 344.5, y: 224.25 }, { x: 123456.789123, y: -98765.4321 }]) {
  const saved = quantize(point);
  assert.equal(matches(saved, point), true);
  assert.equal(matches(point, point), true);
  assert.equal(matches({ x: saved.x + 0.001, y: saved.y + 0.001 }, point), false,
    'do not replace exact serializer acknowledgement with a broad tolerance');
}
assert.equal(matches({ x: NaN, y: 0 }, { x: 0, y: 0 }), false);
assert.equal(matches({ x: 0, y: Infinity }, { x: 0, y: 0 }), false);
assert.equal(matches(null, { x: 0, y: 0 }), false);
console.log(JSON.stringify({ passed: true, mode: 'actual installed private quantizer + pure readback matcher, not GUI', cases: 8 }));
