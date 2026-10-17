import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';

// Execute original pure color helpers and the original Core navigation service
// against an already archived synthetic snapshot. No build/browser/HTTP/DB.
const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'output/原生库集合整合_20261017g/ColorPin语义差异验证.json');
const extracted = JSON.parse(fs.readFileSync(path.join(root, 'output/原生库集合整合_20261017g/ColorPin原件源码摘录.json'), 'utf8'));
const entries = extracted.files['course-api-base-url-CifxI1ia.js'].entries;
const names = ['Jc', 'e5', 'Eoe', 'Noe', 'Toe', '_oe', 'pp', 'Doe', 'Foe', 'Moe', 't5', 'Ioe', 'wM'];
const declarations = names.map(name => {
  assert.ok(entries[name]?.source, 'Run static source probe with palette extras first: ' + name);
  const source = entries[name].source;
  return source.startsWith('function ') ? source : 'const ' + source + ';';
});
// Eoe's original Soe dependency is the same original palette expression.
declarations.splice(1, 0, 'const Soe=Jc.map(e=>e.id);');
const helpers = vm.runInNewContext(declarations.join('\n') + '\n({Jc,pp,Foe,Ioe,wM})');
const plain = value => JSON.parse(JSON.stringify(value));
const cases = [];
const test = (name, run) => { const evidence = run(); cases.push({ name, passed: true, evidence }); };
test('Original parser accepts only exact six donor IDs, not Core definition IDs or #RRGGBB', () => {
  const value = plain(helpers.pp({ color_pins: ['4EA8FF', '#4EA8FF', 'color-pin-123', '4EA8FF', 'A55CF0', '4ea8ff'] }));
  assert.deepEqual(value, ['4EA8FF', 'A55CF0']); return value;
});
test('Original groups are current node occurrences and fixed palette order', () => {
  const groups = plain(helpers.Foe([{ id: 'a', data: { color_pins: ['A55CF0', '4EA8FF'] } },
    { id: 'b', data: { color_pins: ['4EA8FF'] } }]));
  assert.deepEqual(groups.map(row => ({ id: row.groupId, nodes: row.nodeIds, count: row.count })),
    [{ id: '4EA8FF', nodes: ['a', 'b'], count: 2 }, { id: 'A55CF0', nodes: ['a'], count: 1 }]); return groups;
});
test('Original toggle is multi-color add/remove, not recolor a shared definition', () => {
  const first = helpers.Ioe(['4EA8FF'], 'A55CF0');
  const second = helpers.Ioe(first, '4EA8FF');
  assert.deepEqual(plain(first), ['4EA8FF', 'A55CF0']); assert.deepEqual(plain(second), ['A55CF0']); return { first: plain(first), second: plain(second) };
});
const facts = JSON.parse(fs.readFileSync(path.join(root, 'output/原生Drop整合_20261017f/末态事实_23560.json'), 'utf8'));
const unwrap = value => 'ok' in value ? value.value : value.data;
const graph = unwrap(facts.raw.graph), presentations = unwrap(facts.raw.presentations);
const navFile = path.join(root, 'lcos/apps/local-core/src/navigation-marker-service.ts');
const { NavigationMarkerService } = await import(pathToFileURL(navFile).href);
const metadata = {
  getArtifactView: id => graph.artifactViews.find(row => row.id === id), getScopes: id => graph.scopes.filter(row => row.projectId === id),
  getNote: id => graph.notes.find(row => row.id === id), getConnectedConversation: () => undefined,
  getWorkspace: id => graph.workspaces.find(row => row.id === id), getArtifact: id => graph.artifacts.find(row => row.id === id),
};
const service = new NavigationMarkerService(metadata), projectId = 'disposable-surface-core-facade';
const prefix = 'view:native-drop:';
const evidence = [];
for (const kind of ['main', 'context', 'workflow']) {
  const view = graph.artifactViews.find(row => row.id.startsWith(prefix + kind + ':'));
  assert.ok(view);
  const resolution = service.resolveNavigationTarget(projectId, { projectId, kind: 'view', id: view.id });
  assert.equal(resolution.status, 'resolved');
  const placement = presentations.find(row => row.state.memberViewIds.includes(view.id));
  assert.ok(placement);
  evidence.push({ intendedCanvas: 'surface-core-' + kind, viewId: view.id, originalCoreResolution: resolution,
    presentationId: placement.id, actualPresentationPoint: placement.state.positions[view.id] });
}
test('Actual Core view resolver returns old view.position after real Main movement', () => {
  const main = evidence[0]; assert.notDeepEqual(main.originalCoreResolution.target.worldPosition, main.actualPresentationPoint); return main;
});
test('Actual Core scope-only resolver misclassifies additional Context/Workflow occurrences as Main', () => {
  for (const row of evidence.slice(1)) assert.equal(row.originalCoreResolution.target.surfaceKind, 'main'); return evidence.slice(1);
});
test('Actual Core entity target does not invent an occurrence or coordinates', () => {
  const id = graph.artifactViews.find(row => row.id === evidence[0].viewId).artifactId;
  const value = service.resolveNavigationTarget(projectId, { projectId, kind: 'entity', id });
  assert.equal(value.status, 'resolved'); assert.equal(value.target.worldPosition, undefined); return value;
});
test('Actual Core resolver rejects cross-project identity', () => {
  const value = service.resolveNavigationTarget(projectId, { projectId: 'foreign', kind: 'view', id: evidence[0].viewId });
  assert.deepEqual(value, { status: 'unresolved', reason: 'cross-project' }); return value;
});
const report = { at: new Date().toISOString(), passed: true,
  scope: 'Original local pure donor helpers + actual original Core NavigationMarkerService, archived 23560 synthetic facts only. No candidate/HTTP/DB/browser/build; PASS means differences reproduced, not ColorPin feature completion.',
  navigationService: navFile, archivedFacts: path.join(root, 'output/原生Drop整合_20261017f/末态事实_23560.json'), cases };
fs.writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ passed: true, cases: cases.length, output: out }, null, 2));
