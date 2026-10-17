import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { parseOriginalDonorScript } from '../lab/agent-node-transform.mjs';
import { transformAgentNodeScript } from '../lab/agent-node-transform.mjs';
import { transformCutScript } from '../lab/cut-transform.mjs';
import { transformHistoryIntentScript } from '../lab/history-intent-transform.mjs';
import { transformNodeBridgeScript } from '../lab/node-transform.mjs';
import { transformNativePileCollectionScript } from '../lab/native-pile-collection-transform.mjs';
import { planOriginalTapNowGroupLayout } from '../lab/native-pile-group-layout.mjs';
import { transformRendererScript } from '../lab/startup-transform.mjs';
import { transformSurfaceDockScript } from '../lab/surface-dock-transform.mjs';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(root, 'reference/tapnow-installed/resources/web/assets');
const courseName = 'course-api-base-url-CifxI1ia.js';
const pageName = 'page-Da_DfwiK.js';
const originalCourse = fs.readFileSync(path.join(assets, courseName), 'utf8');
const originalPage = fs.readFileSync(path.join(assets, pageName), 'utf8');
const transformedCourse = transformNativePileCollectionScript(courseName, originalCourse);
const transformedPage = transformNativePileCollectionScript(pageName, originalPage);

async function loadNativePileChangeHelpers() {
  const runtimeBase = path.join(root, '.runtime');
  await mkdir(runtimeBase, { recursive: true });
  const runtime = await mkdtemp(path.join(runtimeBase, 'native-pile-change-guard-'));
  try {
    const output = path.join(runtime, 'native-pile-ui.mjs');
    await buildPilotEntry('lab/pilot/native-pile-ui.tsx', output);
    const module = await import(pathToFileURL(output).href);
    assert.equal(typeof module.LCOSNativePileChangeGuardNodes, 'function',
      'the native UI producer exports the exact temporary jVe guard-input helper');
    assert.equal(typeof module.LCOSNativePileCanonicalChanges, 'function',
      'the native UI producer exports the exact jVe canonical-change filter');
    return { guard: module.LCOSNativePileChangeGuardNodes, canonical: module.LCOSNativePileCanonicalChanges };
  } finally {
    const target = path.resolve(runtime);
    assert.ok(target.startsWith(path.resolve(runtimeBase) + path.sep)
      && path.basename(target).startsWith('native-pile-change-guard-'));
    await rm(target, { recursive: true, force: true });
  }
}

const { guard: nativePileChangeGuard, canonical: nativePileCanonicalChanges } = await loadNativePileChangeHelpers();

function serveCollectionPilot(filename, source) {
  const started = transformRendererScript(filename, source);
  const cut = transformCutScript(filename, started);
  const bridged = transformNodeBridgeScript(filename, cut).replace(
    'VITE_FILE_ACCESS_URL:""', 'VITE_FILE_ACCESS_URL:window.location.origin');
  const docked = transformSurfaceDockScript(filename, bridged);
  const historied = transformHistoryIntentScript(filename, docked);
  const agented = transformAgentNodeScript(filename, historied);
  // Native Collection pilot intentionally skips the text and image-title source transforms.
  return transformNativePileCollectionScript(filename, agented);
}

function walk(rootNode, visit) {
  const pending = [rootNode];
  while (pending.length) {
    const node = pending.pop();
    if (!node || typeof node.type !== 'string') continue;
    visit(node);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (const child of value) if (child?.type) pending.push(child);
      } else if (value?.type) pending.push(value);
    }
  }
}

function matching(rootNode, predicate) {
  const found = [];
  walk(rootNode, node => { if (predicate(node)) found.push(node); });
  return found;
}

function one(items, label) {
  assert.equal(items.length, 1, `expected exactly one ${label}`);
  return items[0];
}

function topLevel(program, name) {
  return one(program.body.flatMap(statement => statement.type === 'VariableDeclaration'
    ? statement.declarations : []).filter(declaration => declaration.id?.type === 'Identifier'
    && declaration.id.name === name), `top-level ${name}`);
}

function functionNode(program, name) {
  return one(program.body.filter(statement => statement.type === 'FunctionDeclaration'
    && statement.id?.name === name), `function ${name}`);
}

function objectProperty(object, name) {
  return object?.type === 'ObjectExpression'
    ? object.properties.find(property => property.type === 'ObjectProperty' && property.key?.name === name)
    : undefined;
}

function pileFaceParts(renderer) {
  const root = one(matching(renderer.body, node => node.type === 'CallExpression'
    && node.callee?.type === 'MemberExpression' && node.callee.object?.name === 'a'
    && node.callee.property?.name === 'jsxs' && node.arguments[0]?.value === 'div'
    && objectProperty(node.arguments[1], 'role')?.value?.value === 'button'
    && objectProperty(node.arguments[1], 'onClick')?.value?.name === 'ae'
    && objectProperty(node.arguments[1], 'onKeyDown')?.value?.name === 'ke'), 'Pile role/button Gallery root');
  const faceContainer = one(matching(root, node => node.type === 'CallExpression'
    && node.callee?.type === 'MemberExpression' && node.callee.object?.name === 'a'
    && node.callee.property?.name === 'jsxs' && node.arguments[0]?.value === 'div'
    && objectProperty(node.arguments[1], 'className')?.value?.type === 'ConditionalExpression'
    && objectProperty(node.arguments[1], 'className').value.test?.type === 'LogicalExpression'
    && objectProperty(node.arguments[1], 'className').value.test.operator === '||'
    && objectProperty(node.arguments[1], 'className').value.test.left?.name === 'C'
    && objectProperty(node.arguments[1], 'className').value.test.right?.name === 'z'), 'original Pile face container');
  return {
    root,
    rootProps: root.arguments[1],
    faceContainer,
    faceProps: faceContainer.arguments[1],
    face: objectProperty(faceContainer.arguments[1], 'children')?.value,
  };
}

function declarator(owner, name) {
  return one(owner.body.body.flatMap(statement => statement.type === 'VariableDeclaration'
    ? statement.declarations : []).filter(item => item.type === 'VariableDeclarator'
    && item.id?.type === 'Identifier' && item.id.name === name), `${name} callback binding`);
}

function directCallback(owner, name) {
  const declaration = one(owner.body.body.flatMap(statement => statement.type === 'VariableDeclaration'
    ? statement.declarations : []).filter(item => item.id?.type === 'Identifier'
    && item.id.name === name), `${name} callback binding`);
  assert.equal(declaration.init?.type, 'CallExpression');
  assert.equal(declaration.init.callee?.property?.name, 'useCallback');
  assert.equal(declaration.init.arguments[0]?.type, 'ArrowFunctionExpression');
  return declaration.init.arguments[0];
}

function evalArrow(source, arrow, params, values) {
  return new Function(...params, `return (${source.slice(arrow.start, arrow.end)});`)(...values);
}

assert.equal(transformNativePileCollectionScript(courseName, transformedCourse), transformedCourse,
  'course transform is idempotent');
assert.equal(transformNativePileCollectionScript(pageName, transformedPage), transformedPage,
  'page transform is idempotent');
assert.equal(transformNativePileCollectionScript('unrelated.js', originalCourse), originalCourse,
  'non-target assets pass through byte-for-byte');
assert.throws(() => transformNativePileCollectionScript(courseName,
  originalCourse.replace('return wFe(s,n)', 'return changedDisplay(s,n)')),
/BVe→wFe|display projection drifted/,
'a moved or changed original post-wFe projection seam is refused');
assert.throws(() => transformNativePileCollectionScript(courseName,
  originalCourse.replace('U.map(he=>{const ge=he.node.id', 'U.filter(he=>{const ge=he.node.id')),
/exact original member-map\/empty-Pile face fallback drifted/,
'a moved or changed original yFe card-face seam is refused');
assert.throws(() => transformNativePileCollectionScript(courseName,
  transformedCourse.replace('lcosCollectionFace===void 0?', 'lcosCollectionFace?')),
/optional face slot no longer selects/,
'an installed face-slot guard drift is refused rather than silently changing fallback semantics');
assert.throws(() => transformNativePileCollectionScript(pageName,
  transformedPage.replace('import{LCOSNativePileOperation}from"\/lcos\/native-pile-ui.js";\n', '')),
/partially installed/,
'a surviving page callback without its operation import is refused');

const originalCourseProgram = parseOriginalDonorScript(originalCourse, courseName);
const transformedCourseProgram = parseOriginalDonorScript(transformedCourse, courseName);
const originalPageProgram = parseOriginalDonorScript(originalPage, pageName);
const transformedPageProgram = parseOriginalDonorScript(transformedPage, pageName);

const pileRenderer = functionNode(originalCourseProgram, 'yFe');
const transformedPileRenderer = functionNode(transformedCourseProgram, 'yFe');
const originalGroupRenderer = topLevel(originalCourseProgram, 'i3');
const transformedGroupRenderer = topLevel(transformedCourseProgram, 'i3');
const originalPileFace = pileFaceParts(pileRenderer);
const transformedPileFace = pileFaceParts(transformedPileRenderer);
const slotProperty = transformedPileRenderer.params[0].properties.find(property => property.type === 'ObjectProperty'
  && property.key?.name === 'lcosCollectionFace');
assert.ok(slotProperty && slotProperty.shorthand && slotProperty.value?.name === 'lcosCollectionFace',
  'the original yFe receives one optional ReactNode face prop');
assert.equal(transformedPileFace.face.type, 'ConditionalExpression');
assert.equal(transformedPileFace.face.test.left?.name, 'lcosCollectionFace');
assert.equal(transformedPileFace.face.test.operator, '===');
assert.equal(transformedPileFace.face.alternate?.name, 'lcosCollectionFace');
assert.equal(transformedCourse.slice(transformedPileFace.face.consequent.start, transformedPileFace.face.consequent.end),
  originalCourse.slice(originalPileFace.face.start, originalPileFace.face.end),
'undefined slot selects the exact original member-map and empty-Pile fallback expression');

const faceRunner = new Function('lcosCollectionFace', 'U', '_', 'a',
  `return (${transformedCourse.slice(transformedPileFace.face.start, transformedPileFace.face.end)});`);
const originalFaceRunner = new Function('U', '_', 'a',
  `return (${originalCourse.slice(originalPileFace.face.start, originalPileFace.face.end)});`);
const virtualMemberViews = [{ id: 'original-member-view' }];
const faceRuntime = { U: { map: () => virtualMemberViews }, _: { length: 3 }, a: {
  jsx: () => { throw new Error('non-empty fallback must not render the empty-Pile view'); },
} };
assert.deepEqual(faceRunner(undefined, faceRuntime.U, faceRuntime._, faceRuntime.a),
  originalFaceRunner(faceRuntime.U, faceRuntime._, faceRuntime.a),
'source execution with no slot matches the original Pile face for ordinary/originalview nodes');
const suppliedRareFace = { type: 'RareFolder', props: { open: false } };
assert.equal(faceRunner(suppliedRareFace, undefined, undefined, undefined), suppliedRareFace,
'source execution with a supplied slot renders that face without evaluating the original member JSX');
assert.equal(faceRunner(null, undefined, undefined, undefined), null,
'an explicitly supplied null face remains an explicit replacement; only undefined selects fallback');

const originalPileRootProps = originalPileFace.rootProps;
const transformedPileRootProps = transformedPileFace.rootProps;
for (const name of ['role', 'onClick', 'onKeyDown', 'onMouseEnter', 'onMouseLeave', 'onFocus', 'onBlur']) {
  const originalProp = originalPileRootProps.properties.find(property => property.type === 'ObjectProperty'
    && property.key?.name === name);
  const transformedProp = transformedPileRootProps.properties.find(property => property.type === 'ObjectProperty'
    && property.key?.name === name);
  assert.ok(originalProp && transformedProp, `original outer Pile handler ${name} remains present`);
  assert.equal(transformedCourse.slice(transformedProp.start, transformedProp.end),
    originalCourse.slice(originalProp.start, originalProp.end),
  `original outer Pile handler ${name} remains byte-identical`);
}
for (const name of ['ae', 'ke']) {
  const originalCallback = declarator(pileRenderer, name);
  const transformedCallback = declarator(transformedPileRenderer, name);
  const callbackText = transformedCourse.slice(transformedCallback.start, transformedCallback.end)
    .replace('(!lcosCollectionGallery&&S.length===0)', 'S.length===0').replaceAll(',lcosCollectionGallery', '');
  assert.equal(callbackText,
    originalCourse.slice(originalCallback.start, originalCallback.end),
  `ordinary Pile ${name} callback restores byte-identically after removing the explicit Core Gallery read admission`);
}

const restoredPileRenderer = transformedCourse.slice(transformedPileRenderer.start, transformedPileRenderer.end);
const inverseEdits = [
  { start: slotProperty.start - transformedPileRenderer.start - 1,
    end: slotProperty.end - transformedPileRenderer.start, text: '' },
  { start: transformedPileFace.face.start - transformedPileRenderer.start,
    end: transformedPileFace.face.end - transformedPileRenderer.start,
    text: transformedCourse.slice(transformedPileFace.face.consequent.start, transformedPileFace.face.consequent.end) },
].sort((left, right) => right.start - left.start);
const donorRestoredPileRenderer = inverseEdits.reduce((source, edit) =>
  source.slice(0, edit.start) + edit.text + source.slice(edit.end), restoredPileRenderer);
assert.equal(donorRestoredPileRenderer.replaceAll(',lcosCollectionTools', '').replaceAll(',lcosCollectionGallery', '')
  .replace('(!lcosCollectionGallery&&S.length===0)', 'S.length===0'), originalCourse.slice(pileRenderer.start, pileRenderer.end),
'removing the single optional-prop and face-children slot seam restores the complete donor yFe byte-for-byte');

assert.equal(transformedCourse.slice(transformedGroupRenderer.init.start, transformedGroupRenderer.init.end)
    .replace(',lcosCollectionTools', '').replace('typeof lcosCollectionTools==="function"?lcosCollectionTools(u):u', 'u'),
  originalCourse.slice(originalGroupRenderer.init.start, originalGroupRenderer.init.end),
'the original Group renderer body stays byte-identical and is passed as a renderer, not copied');

const courseImports = transformedCourseProgram.body.filter(node => node.type === 'ImportDeclaration'
  && node.source?.value === '/lcos/native-pile-ui.js');
const courseImport = one(courseImports, 'course native-pile-ui import');
assert.deepEqual(courseImport.specifiers.map(specifier => specifier.imported?.name),
  ['LCOSNativePileCollectionShell', 'LCOSNativePileDisplay', 'LCOSNativePileTitleCommit',
    'LCOSNativePileChangeGuardNodes', 'LCOSNativePileCanonicalChanges', 'LCOSUseNativePileGallery']);

const originalPileChangeGuard = functionNode(originalCourseProgram, 'jVe');
const transformedPileChangeGuard = functionNode(transformedCourseProgram, 'jVe');
const originalPileChangeGuardSource = originalCourse.slice(originalPileChangeGuard.start, originalPileChangeGuard.end);
const transformedPileChangeGuardSource = transformedCourse.slice(transformedPileChangeGuard.start, transformedPileChangeGuard.end);
assert.equal(transformedPileChangeGuardSource
  .replace('Ri(LCOSNativePileChangeGuardNodes(e,t)).pileIdByNodeId', 'Ri(t).pileIdByNodeId')
  .replace('for(const o of LCOSNativePileCanonicalChanges(e,t))', 'for(const o of e)'), originalPileChangeGuardSource,
'only the two exact Core-aware jVe input seams change; every original branch remains byte-identical');

const originalRi = functionNode(originalCourseProgram, 'Ri');
const originalQy = functionNode(originalCourseProgram, 'qy');
const originalQp = functionNode(originalCourseProgram, 'qP');
const sourceExecutedRi = new Function('ye', 'qy', 'Pz', originalCourse.slice(originalRi.start, originalRi.end)
  + '; return Ri;')({ PILE: 'pile' }, new Function('ye', originalCourse.slice(originalQy.start, originalQy.end)
    + '; return qy;')({ PILE: 'pile' }), node => ['image', 'video', 'audio', 'text'].includes(node?.type));
const sourceExecutedPileChangeFilter = new Function('ye', 'LCOSNativePileChangeGuardNodes', 'LCOSNativePileCanonicalChanges', 'Ri', 'TFe', 'qP',
  `${transformedPileChangeGuardSource}; return jVe;`)({ PILE: 'pile' }, nativePileChangeGuard, nativePileCanonicalChanges, sourceExecutedRi,
  change => change, new Function(originalCourse.slice(originalQp.start, originalQp.end) + '; return qP;')());
const collectionRef = { projectId: 'project-core', canvasId: 'canvas-main', workspaceId: 'workspace-main', collectionId: 'collection-core' };
const corePile = { id: 'pile-core', type: 'pile', data: { id: 'pile-core', lcos_native_collection: true,
  lcos_collection_ref: collectionRef, memberIds: ['member-core'] } };
const coreMember = { id: 'member-core', type: 'text', position: { x: 12, y: 24 },
  data: { id: 'member-core', text: 'member', lcos_ref: { version: 1, entityType: 'artifact', entityId: 'artifact-core',
    artifactId: 'artifact-core', artifactViewId: 'view-core', revisionId: 'revision-core' } }, selected: true };
const coreGroup = { id: 'group-core', type: 'group', position: { x: 0, y: 0 },
  data: { id: 'group-core', lcosCollectionId: collectionRef.collectionId,
    lcosCollectionNodeId: corePile.id, lcos_collection_ref: collectionRef } };
const coreMove = { type: 'replace', id: coreMember.id,
  item: { ...coreMember, parentId: coreGroup.id, position: { x: 30, y: 42 }, selected: false } };
const coreChanges = [{ type: 'add', item: coreGroup }, coreMove];
const coreSourceNodes = [corePile, coreMember];
const coreSourceSnapshot = structuredClone(coreSourceNodes);
const coreGuardInput = nativePileChangeGuard(coreChanges, coreSourceNodes);
assert.notEqual(coreGuardInput, coreSourceNodes,
  'an exact Core Pile + exact Core Group + member reparent gets an isolated temporary Ri input');
assert.equal(sourceExecutedRi(coreGuardInput).pileIdByNodeId.has(coreMember.id), false,
  'the temporary Ri input removes only the moving Core member from original Pile protection');
assert.deepEqual(coreSourceNodes, coreSourceSnapshot,
  'the guard helper never mutates raw editable nodes or canonical Pile memberIds');
const appliedCoreChanges = sourceExecutedPileChangeFilter(coreChanges, coreSourceNodes);
assert.equal(appliedCoreChanges[0], coreChanges[0], 'the batch-added Core Group is preserved exactly');
assert.equal(appliedCoreChanges[1].item.parentId, coreGroup.id,
  'jVe lets an exact Core Group member receive its planned parent');
assert.deepEqual(appliedCoreChanges[1].item.position, coreMove.item.position,
  'jVe lets an exact Core Group member receive TapNow’s parent-local position');

const ordinaryPile = { id: 'pile-ordinary', type: 'pile', data: { id: 'pile-ordinary', memberIds: ['member-core'] } };
const ordinaryGroup = { ...coreGroup, id: 'group-ordinary', data: { id: 'group-ordinary' } };
const ordinaryChanges = [{ type: 'add', item: ordinaryGroup },
  { ...coreMove, item: { ...coreMove.item, parentId: ordinaryGroup.id } }];
const ordinaryNodes = [ordinaryPile, coreMember];
assert.equal(nativePileChangeGuard(ordinaryChanges, ordinaryNodes), ordinaryNodes,
  'ordinary Piles keep the exact original guard-input array');
const ordinaryResult = sourceExecutedPileChangeFilter(ordinaryChanges, ordinaryNodes);
assert.equal(ordinaryResult[0], ordinaryChanges[0]);
assert.equal(ordinaryResult[1].item.parentId, undefined,
  'ordinary Pile members retain the original no-reparent protection');
assert.deepEqual(ordinaryResult[1].item.position, coreMember.position,
  'ordinary Pile member position stays protected by the original jVe fallback');

const mismatchedGroup = { ...coreGroup, id: 'group-mismatched', data: { ...coreGroup.data,
  lcos_collection_ref: { ...collectionRef, collectionId: 'another-collection' } } };
const mismatchedChanges = [{ type: 'add', item: mismatchedGroup },
  { ...coreMove, item: { ...coreMove.item, parentId: mismatchedGroup.id } }];
assert.equal(nativePileChangeGuard(mismatchedChanges, coreSourceNodes), coreSourceNodes,
  'a same-canvas but mismatched Core collection cannot relax Pile protection');
assert.equal(sourceExecutedPileChangeFilter(mismatchedChanges, coreSourceNodes)[1].item.parentId, undefined,
  'jVe retains the original guard when the destination group is not the exact Core Collection');

const corePileDimension = { id: corePile.id, type: 'dimensions', dimensions: { width: 375, height: 250 } };
const corePileDimensionSnapshot = structuredClone(corePileDimension);
const pileMeasurementNodes = [corePile];
const pileMeasurementSnapshot = structuredClone(pileMeasurementNodes);
assert.deepEqual(nativePileCanonicalChanges([corePileDimension], pileMeasurementNodes), [],
  'passive positive finite wFe observer dimensions for an exact marked Core Pile are filtered before jVe');
assert.deepEqual(sourceExecutedPileChangeFilter([corePileDimension], pileMeasurementNodes), [],
  'the source-executed donor jVe never returns the volatile Core Pile display measurement to R6 persistence');
assert.deepEqual(corePileDimension, corePileDimensionSnapshot, 'canonical measurement filtering does not mutate observer change input');
assert.deepEqual(pileMeasurementNodes, pileMeasurementSnapshot, 'canonical measurement filtering does not mutate the raw Pile node');

const ordinaryPileDimension = { ...corePileDimension, id: ordinaryPile.id };
assert.deepEqual(nativePileCanonicalChanges([ordinaryPileDimension], [ordinaryPile]), [ordinaryPileDimension],
  'ordinary TapNow Pile measurements pass through unchanged');
assert.deepEqual(sourceExecutedPileChangeFilter([ordinaryPileDimension], [ordinaryPile]), [ordinaryPileDimension],
  'ordinary Pile measurement continues through the original jVe loop');

for (const explicit of [
  { ...corePileDimension, resizing: true },
  { ...corePileDimension, setAttributes: true },
  { ...corePileDimension, extra: 'unknown-field' },
  { ...corePileDimension, dimensions: { width: 0, height: 250 } },
  { ...corePileDimension, dimensions: { width: Infinity, height: 250 } },
]) {
  const result = nativePileCanonicalChanges([explicit], pileMeasurementNodes);
  assert.deepEqual(result, [explicit], 'explicit, malformed, or unknown-field dimensions are not swallowed');
  assert.deepEqual(sourceExecutedPileChangeFilter([explicit], pileMeasurementNodes), [explicit],
    'explicit resize / attribute setting retains the original jVe persistence route');
}

const nodeTypes = topLevel(transformedCourseProgram, 'zVe');
for (const [kind, wrapperName, rendererName] of [
  ['PILE', 'LCOSNativePileCollectionNodeRenderer', 'yFe'],
  ['GROUP', 'LCOSNativePileCollectionGroupRenderer', 'i3'],
]) {
  const registration = one(nodeTypes.init.properties.filter(property => property.computed
    && property.key?.object?.name === 'ye' && property.key.property?.name === kind), `${kind} node registration`);
  assert.equal(registration.value.callee?.property?.name, 'memo');
  assert.equal(registration.value.arguments[0]?.name, wrapperName,
    `${kind} uses the stable named memo wrapper instead of recursively calling itself`);
  const wrapper = topLevel(transformedCourseProgram, wrapperName);
  assert.equal(wrapper.init.callee?.property?.name, 'memo');
  const shell = one(matching(wrapper.init.arguments[0].body, node => node.type === 'CallExpression'
    && node.callee?.property?.name === 'jsx' && node.arguments[0]?.name === 'LCOSNativePileCollectionShell'),
  `${kind} shell JSX`);
  const props = Object.fromEntries(shell.arguments[1].properties.map(property => [property.key.name, property.value]));
  assert.equal(props.NativeRenderer.name, rendererName);
  assert.equal(props.NativeTitle.name, 'h5');
  assert.equal(props.NativeToolbar.name, 'JT');
  assert.equal(props.nodeKind.value, kind.toLowerCase());
  assert.equal(props.nativeProps.name, 'e');
}

const bve = functionNode(transformedCourseProgram, 'BVe');
const displayCall = one(matching(bve.body, node => node.type === 'CallExpression'
  && node.callee?.name === 'LCOSNativePileDisplay'), 'post-wFe display modifier');
assert.equal(displayCall.arguments[0]?.name, 'e', 'display modifier receives the original input graph');
assert.equal(displayCall.arguments[1]?.callee?.name, 'wFe', 'display modifier wraps the exact original wFe output');
assert.deepEqual(displayCall.arguments[1].arguments.map(argument => argument.name), ['s', 'n']);
assert.equal(displayCall.arguments[2]?.name, 'Ep', 'Collection read projection reuses the original member display factory');
const titleComponent = topLevel(transformedCourseProgram, 'Aie');
const titleEditor = one(matching(titleComponent.init.body, node => node.type === 'ConditionalExpression'
  && node.consequent?.type === 'CallExpression' && node.consequent.callee?.property?.name === 'jsx'
  && node.consequent.arguments[0]?.name === 'kie'), 'original title editor guard');
const titleCommitCall = one(matching(titleEditor.consequent, node => node.type === 'CallExpression'
  && node.callee?.name === 'LCOSNativePileTitleCommit'), 'Core title commit factory');
assert.equal(titleCommitCall.arguments[0]?.callee?.name, 'c');
assert.equal(titleCommitCall.arguments[0]?.arguments[0]?.name, 't');
const canEditTitle = new Function('n', 'p', 'LCOSNativePileTitleCommit','c','t',
  `return (${transformedCourse.slice(titleEditor.test.start, titleEditor.test.end)});`);
assert.equal(canEditTitle(true, true,()=>undefined,()=>null,'ordinary'), true, 'the original inline title remains editable for selected Core Collections');
assert.equal(canEditTitle(true,false,()=>()=>{},()=>null,'core'),true,'Core Pile adopts the original input although ordinary native Pile types have no editable title')
assert.equal(canEditTitle(true,false,()=>undefined,()=>null,'ordinary'),false,'ordinary Pile title policy stays unchanged')
assert.equal(canEditTitle(false, true,()=>undefined,()=>null,'ordinary'), false, 'the original selection/titleEditable policy is retained');
const inlineEditor = topLevel(transformedCourseProgram, 'kie');
const nativeDebounce = one(matching(inlineEditor.init.body, node => node.type === 'CallExpression'
  && node.callee?.name === 'hl'), 'original title debounce');
assert.equal(nativeDebounce.arguments[2].value, 1000, 'native input keeps its original debounce');
const commitSource = transformedCourse.slice(nativeDebounce.arguments[1].start, nativeDebounce.arguments[1].end);
let originalWrites = 0, coreWrites = 0;
const makeCommit = commit => new Function('lcosCollectionCommit', 't', 'u', `return (${commitSource});`)(
  commit, 'node', () => { originalWrites++ });
makeCommit(() => { coreWrites++ })('canonical title');
assert.equal(coreWrites, 1); assert.equal(originalWrites, 0, 'Core title never writes a Canvas-only title');
makeCommit(undefined)('ordinary title');
assert.equal(originalWrites, 1, 'ordinary native title uses its exact original updateNodeData route');

const originalCanvas = functionNode(originalPageProgram, 'bB');
const transformedCanvas = functionNode(transformedPageProgram, 'bB');
const originalUnpile = directCallback(originalCanvas, 'It');
const originalRemove = directCallback(originalCanvas, 'ht');
const unpile = directCallback(transformedCanvas, 'It');
const remove = directCallback(transformedCanvas, 'ht');
const originalDrop = directCallback(originalCanvas, 'Rm');
const drop = directCallback(transformedCanvas, 'Rm');
const pageImports = transformedPageProgram.body.filter(node => node.type === 'ImportDeclaration'
  && node.source?.value === '/lcos/native-pile-ui.js');
assert.deepEqual(one(pageImports, 'page native-pile-ui import').specifiers.map(specifier => specifier.imported?.name),
  ['LCOSNativePileOperation']);

const originalOperationCount = arrow => matching(arrow.body, node => node.type === 'CallExpression'
  && node.callee?.name === 'LCOSNativePileOperation').length;
assert.equal(originalOperationCount(originalUnpile), 0);
assert.equal(originalOperationCount(originalRemove), 0);
assert.equal(originalOperationCount(unpile), 1);
assert.equal(originalOperationCount(remove), 1);
assert.equal(originalOperationCount(originalDrop), 0);
assert.equal(originalOperationCount(drop), 2,
  'the original drag-to-Pile add and source/target merge paths are guarded against local Core membership edits');

const dropMutations = matching(drop.body, node => node.type === 'VariableDeclarator'
  && node.id?.name === 'Ct' && node.init?.type === 'ConditionalExpression');
const mergedExpression = one(dropMutations.filter(item => matching(item.init,
  node => node.type === 'CallExpression' && node.callee?.name === 'LCOSNativePileOperation'
    && node.arguments[0]?.value === 'merge').length === 1), 'Core-aware original merge expression').init;
const addedExpression = one(dropMutations.filter(item => matching(item.init,
  node => node.type === 'CallExpression' && node.callee?.name === 'LCOSNativePileOperation'
    && node.arguments[0]?.value === 'addMember').length === 1), 'Core-aware original add expression').init;
const mergeSourcePile = { id: 'pile-core-source', type: 'pile' };
const mergeTargetPile = { id: 'pile-core-target', type: 'pile' };
const ordinaryMergeTarget = { id: 'pile-ordinary-target', type: 'pile' };
const dragNodes = [];
let mergeCalls = 0;
const runMergeExpression = (corePileId, sourcePileId, targetPile) => new Function(
  'LCOSNativePileOperation', 'Ge', 'it', 'et', 'be', 'KA', 'oe',
  `let Be=false; const result=${transformedPage.slice(mergedExpression.start, mergedExpression.end)}; return {result,blocked:Be};`)(
  (_kind, _nodes, targetId, sourceId) => { mergeCalls++; return targetId === corePileId || sourceId === corePileId; },
  { targetPileId: targetPile.id, sourceBounds: {}, targetBounds: {} }, false, dragNodes,
  { sourcePileId }, () => { throw new Error('Core-bound merge must not enter original EVe'); }, {});
const blockedSourceMerge = runMergeExpression(mergeSourcePile.id, mergeSourcePile.id, ordinaryMergeTarget);
assert.equal(blockedSourceMerge.result, null);
assert.equal(blockedSourceMerge.blocked, true, 'Core source Pile merge is reported and suppresses the local merge');
const blockedTargetMerge = runMergeExpression(mergeTargetPile.id, 'pile-ordinary-source', mergeTargetPile);
assert.equal(blockedTargetMerge.result, null);
assert.equal(blockedTargetMerge.blocked, true, 'Core target Pile merge is reported and suppresses the local merge');
let ordinaryMerges = 0;
const ordinaryMerge = new Function('LCOSNativePileOperation', 'Ge', 'it', 'et', 'be', 'KA', 'oe',
  `let Be=false; const result=${transformedPage.slice(mergedExpression.start, mergedExpression.end)}; return {result,blocked:Be};`)(
  () => false, { targetPileId: ordinaryMergeTarget.id }, false, dragNodes,
  { sourcePileId: 'pile-ordinary-source' }, (...args) => { ordinaryMerges++; return args; }, {});
assert.equal(ordinaryMerges, 1, 'ordinary Pile merge still runs the original EVe expression');
assert.equal(ordinaryMerge.blocked, false);

const targetCoreId = 'pile-core-add-target';
let coreAdds = 0;
const coreAdd = new Function('LCOSNativePileOperation', 'Oe', 'Le', 'lt', 'Zg', 'et', 'Re', 'oe', 'ZA',
  `let Be=false; const result=${transformedPage.slice(addedExpression.start, addedExpression.end)}; return {result,blocked:Be};`)(
  (_kind, _nodes, id) => { coreAdds++; return id === targetCoreId; }, true, false, targetCoreId,
  () => true, dragNodes, ['member'], {}, () => { throw new Error('Core-bound add must not enter original CVe'); });
assert.equal(coreAdds, 1);
assert.equal(coreAdd.result, dragNodes, 'Core-bound target preserves original node array instead of local memberIds update');
assert.equal(coreAdd.blocked, true);
let ordinaryAdds = 0;
const ordinaryAddResult = [{ id: 'ordinary-add' }];
const ordinaryAdd = new Function('LCOSNativePileOperation', 'Oe', 'Le', 'lt', 'Zg', 'et', 'Re', 'oe', 'ZA',
  `let Be=false; const result=${transformedPage.slice(addedExpression.start, addedExpression.end)}; return {result,blocked:Be};`)(
  () => false, true, false, 'pile-ordinary-target', () => true, dragNodes, ['member'], {},
  (...args) => { ordinaryAdds++; return args.length ? ordinaryAddResult : null; });
assert.equal(ordinaryAdds, 1, 'ordinary Pile add still runs the original CVe expression');
assert.equal(ordinaryAdd.result, ordinaryAddResult);
assert.equal(ordinaryAdd.blocked, false);

const pileId = 'pile-core-bound';
const sourceNodes = [
  { id: pileId, type: 'pile', data: { lcos_native_collection: true, lcos_collection_ref: { collectionId: 'core-c' } } },
  { id: 'member', type: 'image', data: { lcos_ref: { artifactId: 'artifact-1' } } },
];
let unpileDelegations = 0;
const handledUnpile = evalArrow(transformedPage, unpile,
  ['Oe', 're', 'LCOSNativePileOperation', 'rs', 'E6', 'Kg', 'rt', 'je', 'window', 'C6'],
  [true, { current: sourceNodes }, (...args) => { unpileDelegations++; assert.deepEqual(args, ['unpile', sourceNodes, pileId]); return true; },
    { getState: () => { throw new Error('native unpile must not enter the original animation owner'); } },
    () => { throw new Error('native unpile must not build the original NVe animation'); },
    () => { throw new Error('native unpile must not delete the Pile carrier'); },
    () => { throw new Error('native unpile must not update ReactFlow nodes'); }, {}, {}, () => { throw new Error('unreachable'); }]);
handledUnpile(pileId, 1, []);
assert.equal(unpileDelegations, 1, 'Core-bound unpile enters the native operation owner once');
assert.equal(sourceNodes[0].type, 'pile', 'Core-bound unpile never deletes the Pile carrier locally');

let nativeUnpileApply = 0;
let originalUnpileApply = 0;
const regularUnpile = evalArrow(transformedPage, unpile,
  ['Oe', 're', 'LCOSNativePileOperation', 'rs', 'E6', 'Kg', 'rt'],
  [true, { current: sourceNodes }, () => false,
    { getState: () => ({ unstackPlan: null }) }, () => null,
    (nodes, id) => { originalUnpileApply++; return { nodes, id, nativeUnpileApply }; },
    result => { nativeUnpileApply++; assert.equal(result.id, pileId); }]);
regularUnpile(pileId, 1, []);
assert.equal(originalUnpileApply, 1, 'ordinary Pile unpile still invokes the original NVe path');
assert.equal(nativeUnpileApply, 1);

let removeDelegations = 0;
let originalRemoveApply = 0;
const removePosition = { x: 40, y: 80 };
const removeTopLeft = { x: -10, y: 55 };
const handledRemove = evalArrow(transformedPage, remove,
  ['Oe', 'W', 're', 'LCOSNativePileOperation', 'kt', 'Vs', 'lp', 'FA', 'Xg', 'rt'],
  [true, point => point, { current: sourceNodes }, (...args) => {
    removeDelegations++; assert.deepEqual(args, ['removeMember', sourceNodes, pileId, 'member', removeTopLeft]); return true;
  }, () => 100,
  () => 50,
  () => [{ id: 'member' }, { id: 'member-2' }],
  () => { throw new Error('native member removal must bypass TVe'); },
  () => { throw new Error('native member removal must bypass local history'); },
  () => { throw new Error('native member removal must bypass local history'); }]);
assert.equal(handledRemove(pileId, 'member', removePosition), null);
assert.equal(removeDelegations, 1, 'Core-bound removeMember delegates once after native guards/identity lookup');
assert.equal(originalRemoveApply, 0);

const regularRemoveResult = [{ id: pileId, type: 'pile' }, { id: 'member', type: 'image' }];
const regularRemove = evalArrow(transformedPage, remove,
  ['Oe', 'W', 're', 'LCOSNativePileOperation', 'kt', 'Vs', 'lp', 'FA', 'Xg', 'rt'],
  [true, point => point, { current: sourceNodes }, () => false,
    () => 100, () => 50, () => [{ id: 'member' }],
    (nodes, id, member, position) => { originalRemoveApply++; assert.deepEqual(position, removeTopLeft); return regularRemoveResult; },
    () => ['member'], result => result === regularRemoveResult]);
assert.deepEqual(regularRemove(pileId, 'member', removePosition), {
  position: removeTopLeft, actualSize: { width: 100, height: 50 }, dissolved: true, remainingMemberIds: ['member'],
});
assert.equal(originalRemoveApply, 1, 'ordinary Pile removeMember still reaches the original TVe path');

const a = { id: 'image-a', type: 'image', position: { x: 10, y: 20 }, width: 100, height: 50, selected: true };
const b = { id: 'text-b', type: 'text', position: { x: 160, y: 80 }, width: 120, height: 40, selected: true };
const outside = { id: 'outside', type: 'image', position: { x: 600, y: 600 }, width: 50, height: 50 };
const layout = planOriginalTapNowGroupLayout([a, b, outside], [a, b], 'group-core-id', { title: 'Collection title' });
assert.deepEqual(layout.bounds, { x: -10, y: 0, width: 310, height: 140 },
  'Group bounds execute the original h0→Yn padding-20 logic with native dimensions');
assert.deepEqual(layout.frame, {
  id: 'group-core-id', type: 'group', data: { createdBy: 'client', title: 'Collection title', loading: false, layoutType: 'horizontal' },
  position: { x: -10, y: 0 }, selected: true, width: 310, height: 140,
}, 'frame uses original ma→p0 source shape with only its ID supplied by the owning caller');
assert.deepEqual(layout.nodes[0], { ...a, parentId: 'group-core-id', position: { x: 20, y: 20 }, selected: false });
assert.deepEqual(layout.nodes[1], { ...b, parentId: 'group-core-id', position: { x: 170, y: 80 }, selected: false });
assert.equal(layout.nodes[2], outside, 'original m0 preserves unrelated nodes by identity');

const fallbackLayout = planOriginalTapNowGroupLayout([
  { id: 'fallback', type: 'image', position: { x: 5, y: 9 } },
], [{ id: 'fallback', type: 'image', position: { x: 5, y: 9 } }], 'group-fallback');
assert.deepEqual(fallbackLayout.bounds, { x: -15, y: -11, width: 240, height: 140 },
  'the original Yn→Ms sizing defaults are retained when native measurements are absent');

const servedPage = serveCollectionPilot(pageName, originalPage);
const servedCourse = serveCollectionPilot(courseName, originalCourse);
const servedPageProgram = parseOriginalDonorScript(servedPage, pageName);
const servedCourseProgram = parseOriginalDonorScript(servedCourse, courseName);
assert.ok(servedPage.includes('LCOSNativePileOperation'), 'server-order page transforms retain the native operation callback seam');
assert.ok(servedCourse.includes('LCOSNativePileCollectionShell') && servedCourse.includes('LCOSNativePileDisplay'),
  'server-order course transforms retain the original renderer wrappers and display seam');
const servedPileRenderer = functionNode(servedCourseProgram, 'yFe');
const servedPileFace = pileFaceParts(servedPileRenderer).face;
assert.equal(servedPileFace.type, 'ConditionalExpression',
  'the complete startup→cut→node→dock→history→agent→native server chain retains the optional Pile face slot');
assert.equal(servedCourse.slice(servedPileFace.consequent.start, servedPileFace.consequent.end),
  originalCourse.slice(originalPileFace.face.start, originalPileFace.face.end),
'the complete server chain retains the donor face expression byte-for-byte as the slot fallback');
const servedChangeGuard = functionNode(servedCourseProgram, 'jVe');
assert.ok(matching(servedChangeGuard.body, node => node.type === 'CallExpression'
  && node.callee?.name === 'LCOSNativePileChangeGuardNodes'
  && node.arguments[0]?.name === servedChangeGuard.params[0]?.name
  && node.arguments[1]?.name === servedChangeGuard.params[1]?.name).length === 1,
'the actual startup → cut → node → dock → history → agent → native server chain keeps the exact-Core group guard wired');
assert.ok(matching(servedChangeGuard.body, node => node.type === 'CallExpression'
  && node.callee?.name === 'LCOSNativePileCanonicalChanges'
  && node.arguments[0]?.name === servedChangeGuard.params[0]?.name
  && node.arguments[1]?.name === servedChangeGuard.params[1]?.name).length === 1,
'the actual server chain filters only canonical jVe input before the original O8/R6 change loop');

assert.equal(fs.readFileSync(path.join(assets, courseName), 'utf8'), originalCourse,
  'TapNow course vendor bytes remain untouched');
assert.equal(fs.readFileSync(path.join(assets, pageName), 'utf8'), originalPage,
  'TapNow page vendor bytes remain untouched');

console.log(JSON.stringify({
  passed: true,
  scope: 'source-executed TapNow Pile/Group seam and original Group layout helpers; no GUI/service/Core writes',
  originalPileRenderer: 'donor yFe restores byte-for-byte after removing optional face/tools props and face-children slot seam',
  originalGroupRendererPreserved: true,
  ordinaryGalleryHandlersRestored: true,
  coreGalleryReadAdmission: 'same original session/dialog; accurate canonical read, separate physical drag admission',
  stableNodeTypeWrappers: ['pile', 'group'],
  display: 'original BVe input + exact wFe display output',
  title: 'Core-bound h5 input keeps original debounce and captures Core commit; ordinary input retains original Canvas route',
  operationRouting: { coreBoundUnpile: 'Root operation only', ordinaryUnpile: 'original NVe path',
    coreBoundRemoveMember: 'Root operation only', ordinaryRemoveMember: 'original TVe path' },
  dragMutationProtection: { coreBoundAdd: 'complete original selected NodeIDs via Core membership + original carrier receipt; no local CVe',
    coreBoundMerge: 'one Core operation contains exact source+target identities; no local EVe', ordinaryAddAndMerge: 'original transforms' },
  serverTransformChain: 'startup → cut → node bridge → surface dock → history → agent → native pile; skip text/image-title',
  groupLayout: 'exact extracted jC h0/f0/p0/m0 + UnlimitedMode Uh/Ms + original ma constructor; no grid-reflow claim',
  vendorBytesUnchanged: true,
}, null, 2));
