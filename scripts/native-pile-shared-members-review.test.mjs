import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseOriginalDonorScript as parse } from '../lab/agent-node-transform.mjs';
import { transformNativeColorPinCourseScript } from '../lab/native-colorpin-course-transform.mjs';

const root = path.resolve(import.meta.dirname, '..');
const evidence = path.join(root, 'output/原生ColorPin整合_20261017h');
const captured = path.join(evidence, '原库关开真实页面/2026-10-17T06-25-47-330Z');
const facts = JSON.parse(fs.readFileSync(path.join(captured, 'after-placement-facts.json'), 'utf8'));
const filename = 'course-api-base-url-CifxI1ia.js', file = path.join(root, 'reference/tapnow-installed/resources/web/assets', filename);
const original = fs.readFileSync(file, 'utf8'), ast = parse(original, filename);
const owners = source => new Map(parse(source, filename).body.flatMap(node => node.type === 'FunctionDeclaration' ? [[node.id.name, node]]
  : node.type === 'VariableDeclaration' ? node.declarations.map(row => [row.id?.name, row]) : []));
const declarations = owners(original), ownerText = name => { const node = declarations.get(name); return original.slice(node.start, node.end); };
const enumValues = { PILE: 'pile', IMAGE: 'image', VIDEO: 'video', AUDIO: 'audio', TEXT: 'text' };
const run = new Function('ye', ['const ' + ownerText('Iz') + ';', ...['qy', 'Pz', 'Ri'].map(ownerText), 'return {Ri,qy};'].join('\n'))(enumValues);
const nodes = facts.canvases['surface-core-main'].nodes;
const result = run.Ri(nodes), piles = nodes.filter(node => node.type === 'pile');
const summary = piles.map(pile => ({ id: pile.id, collectionId: pile.data.lcos_collection_ref.collectionId,
  rawMemberIds: run.qy(pile), actualOriginalMembers: result.membersByPileId.get(pile.id).map(node => node.id) }));
assert.equal(summary.length, 3);
const shared = summary.find(pile => pile.id.startsWith('node-2e0'));
assert.ok(shared); assert.equal(shared.actualOriginalMembers.length, 3);
for (const pile of summary.filter(pile => pile !== shared)) { assert.equal(pile.rawMemberIds.length, 3); assert.equal(pile.actualOriginalMembers.length, 0); }
const reversed = run.Ri([...nodes].reverse());
assert.deepEqual([...reversed.pileIdByNodeId.entries()].sort(), [...result.pileIdByNodeId.entries()].sort());
const walk = (node, visit) => { if (!node?.type) return; visit(node); for (const value of Object.values(node))
  if (Array.isArray(value)) value.forEach(child => walk(child, visit)); else if (value?.type) walk(value, visit); };
const callbacks = [];
walk(declarations.get('yFe'), node => { if (node.type === 'VariableDeclarator' && node.id?.name === 'ae') callbacks.push(node); });
assert.equal(callbacks.length, 1);
const callback = callbacks[0].init.arguments[0], callbackSource = original.slice(callback.start, callback.end);
const galleryCalls = [], environment = { B: true, S: [], g: null, s: { current: { closest: () => ({ getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 800 }) }), getBoundingClientRect: () => ({ left: 10, top: 20, width: 250, height: 146 }) } },
  IDe: input => input, i: () => ({ zoom: 1 }), ne: {}, m: input => galleryCalls.push(input), L: true, e: 'controlled-pile', fFe: 1, u: 'small' };
const open = () => new Function(...Object.keys(environment), 'return (' + callbackSource + ');')(...Object.values(environment))();
open(); assert.equal(galleryCalls.length, 0, 'Actual original yFe callback rejects empty original displayMembers before geometry or Gallery open');
environment.S = shared.actualOriginalMembers.map(id => ({ node: nodes.find(node => node.id === id) }));
open(); assert.equal(galleryCalls.length, 1, 'The same exact original callback can open a nonempty snapshot under otherwise identical admission');
const transformed = transformNativeColorPinCourseScript(filename, original), transformedDeclarations = owners(transformed);
for (const name of ['Ri', 'qy', 'Pz', 'wFe', 'BVe', 'yFe']) {
  const node = transformedDeclarations.get(name); assert.equal(transformed.slice(node.start, node.end), ownerText(name), 'Color Pin transform does not modify original Pile owner ' + name);
}
const locations = Object.fromEntries(['Ri', 'qy', 'wFe', 'BVe', 'yFe'].map(name => {
  const node = declarations.get(name); return [name, { file, line: node.loc.start.line, column: node.loc.start.column, start: node.start, end: node.end }];
}));
const report = { at: new Date().toISOString(), passed: true,
  scope: 'Read-only archived actual candidate facts; execute actual original Ri/qy/Pz and actual yFe open callback with controlled admission/geometry leaf. No candidate, HTTP, browser, build, DB, new fixture or product change.',
  captured, cases: [
    { name: 'Original exclusive member owner deterministically chooses lexicographically smallest pile ID', passed: true, piles: summary },
    { name: 'Reordering original node array cannot repair shared ownership', passed: true, ownerByNode: Object.fromEntries(result.pileIdByNodeId) },
    { name: 'Original yFe callback empty-members guard reproduces no Gallery; same callback nonempty control opens', passed: true, emptyCalls: 0, nonemptyCalls: galleryCalls.length },
    { name: 'ColorPin course transform leaves actual Pile getter, normalizer, renderer and click owner byte-identical', passed: true }
  ], locations, originalGetter: ownerText('Ri'), originalGalleryCallback: callbackSource };
fs.writeFileSync(path.join(evidence, '共享成员Pile只读诊断.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ passed: true, cases: report.cases.length, counts: summary.map(row => ({ pile: row.id, originalCount: row.actualOriginalMembers.length, rawCount: row.rawMemberIds.length })), output: path.join(evidence, '共享成员Pile只读诊断.json') }));
