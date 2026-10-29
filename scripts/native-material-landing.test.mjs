import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { parseOriginalDonorScript } from '../lab/agent-node-transform.mjs';

const directory = new URL('../reference/tapnow-installed/resources/web/assets/', import.meta.url);
const read = async file => { const source = await fs.readFile(new URL(file, directory), 'utf8'); return { source, ast: parseOriginalDonorScript(source, file) }; };
const declaration = (file, name) => file.ast.body.flatMap(row => row.type === 'FunctionDeclaration' ? [row]
  : row.type === 'VariableDeclaration' ? row.declarations : []).find(row => row.id?.name === name);
const exported = (file, name) => file.ast.body.filter(row => row.type === 'ExportNamedDeclaration').flatMap(row => row.specifiers ?? [])
  .find(row => row.exported?.name === name)?.local?.name;
const compile = (file, name, args = [], values = []) => {
  const node = declaration(file, name); assert(node, `${name} exists in the installed module`);
  const expression = node.type === 'VariableDeclarator' ? node.init : node;
  return new Function(...args, `return (${file.source.slice(expression.start, expression.end)});`)(...values);
};
const index = await read('index-BAQXnPag.js'), unlimited = await read('UnlimitedModeToggle-D4wysAbz.js');
const dimensions = compile(index, 'Od');
const width = compile(index, exported(index, 'dk'), ['Od'], [dimensions]);
const height = compile(index, exported(index, 'dl'), ['Od'], [dimensions]);
const add = compile(unlimited, 'iA');
const position = compile(unlimited, exported(unlimited, 'a'), ['iA'], [add]);
const placementSource = await fs.readFile(new URL('canvas-export-placement-BcB3femJ.js', directory), 'utf8');
const placement = new Function('h', 'B', 'g', placementSource.replace(/import[^;]+;/g, '').replace(/export\{[^}]+\};?/g, '') + ';return H;')(width, height, position);
const bridgeSource = await fs.readFile(new URL('../lab/startup-node-bridge.js', import.meta.url), 'utf8');
const start = bridgeSource.indexOf('export function createOriginalNodeApi('), end = bridgeSource.indexOf('\nfunction nonEmptyString(', start);
assert(start >= 0 && end > start);
const sandbox = { originalExportPlacement: placement, originalNodePosition: position, originalNodeWidth: width,
  safeClone: structuredClone, Number, Map, Object };
vm.runInNewContext(bridgeSource.slice(start, end).replace('export ', '') + ';globalThis.createApi=createOriginalNodeApi;', sandbox);
const cases = [[], [{ id: 'main', position: { x: -700, y: -400 }, width: 360, height: 280 }],
  [{ id: 'frame', position: { x: 1000, y: 500 }, width: 400, height: 600 },
    { id: 'child', parentId: 'frame', position: { x: 350, y: 50 }, measured: { width: 700, height: 280 } },
    { id: 'left', position: { x: -300, y: 0 } }],
  Array.from({ length: 250 }, (_, index) => ({ id: `dense-${index}`, position: { x: (index % 10) * 250, y: Math.floor(index / 10) * 250 }, width: 300, height: 300 }))];
for (const nodes of cases) {
  const before = structuredClone(nodes), byId = new Map(nodes.map(node => [node.id, node]));
  const api = sandbox.createApi({ getNodes: () => nodes, getNode: id => byId.get(id) });
  const next = api.findMaterialPlacement({ width: 360, height: 280 }); assert(Number.isFinite(next?.x) && Number.isFinite(next?.y));
  for (const node of nodes) {
    const old = position(node, byId);
    assert(next.x >= old.x + width(node) || next.x + 360 <= old.x || next.y >= old.y + height(node) || next.y + 280 <= old.y,
      `Original export placement stays clear of ${node.id}, including absolute nested geometry`);
  }
  assert.deepEqual(nodes, before, 'No original position, size, parent or draft is mutated');
  assert.equal(api.findMaterialPlacement({ width: NaN, height: 280 }), undefined);
}
const report = { passed: true, cases: cases.length, originalSources: ['canvas-export-placement:H', 'index:dk/dl', 'UnlimitedModeToggle:a/iA'],
  nestedAndMeasuredGeometry: true, denseNodes: 250, oldNodesChanged: false, cameraActions: 0,
  limit: 'Executes actual installed pure geometry functions through the production API wrapper; full original GUI and Core placement are separate checks.' };
const out = new URL('../output/原流程融合_20261017c/', import.meta.url); await fs.mkdir(out, { recursive: true });
await fs.writeFile(new URL('original-material-landing.json', out), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
