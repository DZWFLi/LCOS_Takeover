import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  resolveStablePresentationDensity,
} from '../lcos/apps/web-gen2/src/presentation/nodePresentation.ts';
import { SEMANTIC_ZOOM_CONFIG } from '../lcos/huabu/apps/web/src/config/semanticZoom.ts';
import { finishPresentationDensity } from '../lcos/huabu/apps/web/src/lcos/nodes/densityBudget.ts';
import { nativeTextWorldSize } from '../lab/pilot/native-text-policy.ts';
import {
  deriveNativeTextReadingMarkdown,
  resolveNativeTextDensity,
  nativeTextCarrierSize,
} from '../lab/pilot/native-text-first-policy.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
assert.deepEqual(nativeTextCarrierSize({ width: 551, height: 182 }), { width: 551, height: 250 });
assert.deepEqual(nativeTextCarrierSize({ width: 300, height: 280 }), { width: 300, height: 280 });
assert.deepEqual(nativeTextCarrierSize({ width: NaN, height: -2 }), { width: 250, height: 250 });

function ownerResult(input) {
  const size = nativeTextWorldSize(input.node, input.worldWidth, input.worldHeight);
  const zoom = Number.isFinite(input.zoom) && input.zoom >= 0 ? input.zoom : 1;
  const dpr = Number.isFinite(input.dpr) && input.dpr > 0 ? input.dpr : 1;
  const density = resolveStablePresentationDensity({
    worldWidth: size.width,
    worldHeight: size.height,
    zoom,
    dpr,
    screenWidth: size.width * zoom,
    screenHeight: size.height * zoom,
    phase: input.phase,
  }, input.previous, SEMANTIC_ZOOM_CONFIG.hysteresis);
  return finishPresentationDensity(density, input.nodeCount, input.phase);
}

const ordinary = {
  worldWidth: 360,
  worldHeight: 240,
  zoom: 1,
  dpr: 1,
  phase: 'rest',
  nodeCount: 20,
};

// The policy executes the real resolver and budget owners with their current exports.
for (const input of [
  ordinary,
  { ...ordinary, zoom: 0.02 },
  { ...ordinary, dpr: 2.5 },
  { ...ordinary, worldWidth: undefined, worldHeight: undefined, node: { measured: { width: 500, height: 300 } } },
  { ...ordinary, worldWidth: undefined, worldHeight: undefined },
  { ...ordinary, zoom: -1 },
  { ...ordinary, phase: 'editing', zoom: 0.001, previous: 'mark', nodeCount: 999 },
  { ...ordinary, worldWidth: 600, worldHeight: 400, nodeCount: 151 },
  { ...ordinary, worldWidth: 600, worldHeight: 400, nodeCount: 301 },
  { ...ordinary, worldWidth: 600, worldHeight: 400, nodeCount: 150 },
]) {
  assert.equal(resolveNativeTextDensity(input), ownerResult(input));
}

assert.equal(resolveNativeTextDensity({ ...ordinary, zoom: 0.02 }), 'mark', 'a valid small zoom is preserved as screen-space input');
assert.equal(resolveNativeTextDensity({ ...ordinary, phase: 'editing', zoom: 0.001, previous: 'mark', nodeCount: 999 }), 'working', 'editing wins over both hysteresis and capacity cap');
assert.equal(resolveNativeTextDensity({ ...ordinary, worldWidth: 600, worldHeight: 400, nodeCount: 151 }), 'working');
assert.equal(resolveNativeTextDensity({ ...ordinary, worldWidth: 600, worldHeight: 400, nodeCount: 301 }), 'summary');
assert.equal(resolveNativeTextDensity({ ...ordinary, worldWidth: 600, worldHeight: 400, nodeCount: 150 }), 'reading');

const promotionNearEdge = { ...ordinary, worldWidth: 300, worldHeight: 200, zoom: 1.62, previous: 'working' };
const promotionPastBand = { ...promotionNearEdge, zoom: 1.7 };
const demotionNearEdge = { ...ordinary, worldWidth: 300, worldHeight: 200, zoom: 1.57, previous: 'reading' };
assert.equal(resolveNativeTextDensity(promotionNearEdge), 'working', 'retains previous stage inside the promotion hysteresis band');
assert.equal(resolveNativeTextDensity(promotionPastBand), 'reading', 'promotes after clearing the existing hysteresis band');
assert.equal(resolveNativeTextDensity(demotionNearEdge), 'reading', 'retains previous stage inside the demotion hysteresis band');
assert.equal(
  resolveNativeTextDensity({ ...ordinary, zoom: 0.02, dpr: 1 }),
  resolveNativeTextDensity({ ...ordinary, zoom: 0.02, dpr: 3 }),
  'DPR cannot change density',
);

const markdown = '\uFEFF# 标题\r\n\r\n段落含有 **加粗**、[链接](https://example.test)、中文与 emoji 🧪。\r\n\r\n```ts\r\nconst value = 1;\r\n```\r\n';
for (const density of ['reading', 'working']) {
  const projected = deriveNativeTextReadingMarkdown(markdown, '投影标题', density);
  assert.deepEqual(Buffer.from(projected, 'utf8'), Buffer.from(markdown, 'utf8'), `${density} keeps original Markdown bytes`);
}
assert.equal(deriveNativeTextReadingMarkdown(markdown, '投影标题', 'mark'), '投影标题');
const longMarkdown = `${'复合正文🧪'.repeat(40)}\n\n## 后续段落`;
const summary = deriveNativeTextReadingMarkdown(longMarkdown, '标题', 'summary');
assert.ok(summary.length < longMarkdown.length, 'summary is a short source excerpt');
assert.ok(longMarkdown.startsWith(summary.slice(0, -1)), 'summary comes from the original Markdown');
assert.ok(summary.endsWith('…'));

// Frozen canonical values model the Store/Core read snapshot: deriving a view cannot mutate it.
const canonicalSnapshot = Object.freeze({ title: '规范标题', body: markdown });
const before = { ...canonicalSnapshot };
const textView = deriveNativeTextReadingMarkdown(canonicalSnapshot.body, canonicalSnapshot.title, 'summary');
assert.notEqual(textView, canonicalSnapshot.body);
assert.deepEqual(canonicalSnapshot, before, 'display projection leaves the canonical read snapshot untouched');
assert.equal(canonicalSnapshot.body, markdown);

// The implementation stays on the pure projection surface and has no Store/Core write imports.
const policySource = await readFile(path.join(root, 'lab/pilot/native-text-first-policy.ts'), 'utf8');
assert.doesNotMatch(policySource, /\b(?:store|core)\.(?:set|write|save|persist)\s*\(/i);
assert.doesNotMatch(policySource, /from\s+['"][^'"]*(?:store|core)[^'"]*['"]/i);

console.log(JSON.stringify({ passed: true, scope: 'native text display policy and pure Markdown projection' }));
