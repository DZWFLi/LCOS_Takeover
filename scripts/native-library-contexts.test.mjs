import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { currentGen2Root } from '../lab/current-gen2-resources.mjs';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';
import { parseOriginalDonorScript } from '../lab/agent-node-transform.mjs';
import { transformSurfaceDockScript } from '../lab/surface-dock-transform.mjs';
import { transformNativeAssemblyLibraryScript } from '../lab/native-assembly-library-transform.mjs';
import { transformNativeMaterialRailScript } from '../lab/native-material-rail-transform.mjs';
import { transformNativeLibraryContextsScript } from '../lab/native-library-contexts-transform.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const filename = 'page-Da_DfwiK.js';
const donor = path.join(root, 'reference/tapnow-installed/resources/web/assets', filename);
const original = await readFile(donor, 'utf8');
const base = transformNativeMaterialRailScript(filename, transformNativeAssemblyLibraryScript(filename, transformSurfaceDockScript(filename, original)));
const transformed = transformNativeLibraryContextsScript(filename, base);
assert.equal(transformNativeLibraryContextsScript(filename, transformed), transformed);
assert.equal(transformNativeLibraryContextsScript('unrelated.js', 'not JavaScript'), 'not JavaScript');
assert.equal(await readFile(donor, 'utf8'), original);

function declarations(source) {
  const result = new Map();
  const pending = [parseOriginalDonorScript(source, filename)];
  while (pending.length) {
    const node = pending.pop();
    if (!node?.type) continue;
    if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier' && node.init) result.set(node.id.name, source.slice(node.init.start, node.init.end));
    if (node.type === 'FunctionDeclaration' && node.id?.name) result.set(node.id.name, source.slice(node.start, node.end));
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) { for (const child of value) if (child?.type) pending.push(child); }
      else if (value?.type) pending.push(value);
    }
  }
  return result;
}
const before = declarations(base), after = declarations(transformed);
for (const name of ['sF', '$U', 'VU', 'OS', 'CU', 'LF', 'oF']) assert.equal(after.get(name), before.get(name), `${name} stays original.`);
const imported = parseOriginalDonorScript(transformed, filename).body.filter(node => node.type === 'ImportDeclaration')
  .flatMap(node => node.specifiers.map(specifier => specifier.local.name));
for (const name of ['LCOSNativeLibraryContexts', 'LCOSNativeLibraryContextDetail', 'LCOSNativeLibraryNavigationOwner']) assert.equal(imported.filter(value => value === name).length, 1);
assert.throws(() => transformNativeLibraryContextsScript(filename, transformed.replace('bodySlot:LCOSLibraryBody', 'unusedSlot:LCOSLibraryBody')), /slots are partial/);

const jsx = (type, props, key) => ({ type, props, key });
const evaluate = (code, env) => new Function(...Object.keys(env), `return (${code});`)(...Object.values(env));
const nativeAsset = { id: 'original-artifact', name: 'Original', asset_type: 4, content: '原正文', created_at: '2026-10-17T00:00:00.000Z' };
const previewEnv = { r: { jsx, jsxs: jsx }, he: () => ({ t: key => key }), sU: detail => ({ asset: detail.asset, textContent: detail.asset.content }),
  Br: value => value, dt: { ASSET_TYPE_WORLD: 5 }, xk: () => false, yk: 'OriginalMedia', D1: 'VerifiedIcon', bk: 'OriginalBadge', vk: value => value,
  LCOSIsPinnedAssemblyDetail: detail => !!detail.asset.lcos_projection?.pinned_revision };
const nativePreview = evaluate(before.get('TS'), previewEnv);
const slottedPreview = evaluate(after.get('TS'), previewEnv);
const normalize = value => typeof value === 'function' ? '[callback]' : Array.isArray(value) ? value.map(normalize)
  : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined).map(([key, entry]) => [key, normalize(entry)])) : value;
assert.deepEqual(normalize(slottedPreview({ detail: { asset: nativeAsset } })), normalize(nativePreview({ detail: { asset: nativeAsset } })),
  'The native TS layout and action remain identical when slots are omitted.');
const slotted = slottedPreview({ detail: { asset: nativeAsset }, bodySlot: jsx('ContextMembers', {}), metaSlot: jsx('ContextTitle', {}), actionsSlot: jsx('ContextActions', {}) });
const types = [];
function inspect(node, visitor) {
  if (Array.isArray(node)) { node.forEach(entry => inspect(entry, visitor)); return; }
  if (!node || typeof node !== 'object') return;
  visitor(node); inspect(node.props?.children, visitor);
}
inspect(slotted, node => types.push(node.type));
assert.ok(types.includes('ContextMembers') && types.includes('ContextTitle') && types.includes('ContextActions'));
assert.equal(types.includes('OriginalMedia'), false);
assert.equal(types.includes('button'), false, 'The replaced content action must not also create an unrelated canvas text node.');
const contentPreview = slottedPreview({ detail: { asset: nativeAsset }, contentVariant: 'content',
  bodySlot: jsx('ContextMembers', {}), metaSlot: jsx('ContextTitle', {}), actionsSlot: jsx('ContextActions', {}) });
assert.ok(contentPreview.props.className.includes('native-library-content-preview'));
assert.equal(contentPreview.props.children[0].props.className, 'native-library-content-body',
  'Content does not inherit the fixed 225px media basis or overflow-hidden crop.');
assert.ok(contentPreview.props.children[1].props.className.includes('shrink-0'), 'Original metadata and actions stay outside body scrolling.');

let cloudDetailReads = 0;
const runRefresh = async asset => {
  const effects = [];
  const useAsset = evaluate(after.get('sU'), { l: { useState: value => [value, () => {}], useEffect: callback => effects.push(callback) },
    Ed: { getAssetDetail: async () => { cloudDetailReads += 1; return { code: 1 }; } }, Vv: value => value.content, gk: value => value,
    LCOSIsPinnedAssemblyDetail: detail => !!detail.asset.lcos_projection?.pinned_revision });
  const value = useAsset({ asset }); effects.forEach(callback => callback()); await Promise.resolve(); return value;
};
const virtualAsset = { ...nativeAsset, lcos_library_entry: { projectId: 'project', item: { schemaVersion:1,kind:'context',entityRef:{type:'context',id:'scope'},title:'原上下文',usageCount:0 } } };
assert.equal((await runRefresh(virtualAsset)).textContent, '原正文');
assert.equal(cloudDetailReads, 0, 'Context rows do not make unsupported native cloud detail requests.');
await runRefresh({ ...nativeAsset, lcos_projection: { pinned_revision: true } });
assert.equal(cloudDetailReads, 0, 'Existing pinned-version detail safety remains effective.');
await runRefresh(nativeAsset);
assert.equal(cloudDetailReads, 1, 'Ordinary original assets retain their original refresh behavior.');

const category = { id: 'category', name: '上下文', asset_count: 2, children: [] };
const flattenEnv = { gr: '0' };
flattenEnv.OS = evaluate(after.get('OS'), flattenEnv);
const flatten = evaluate(after.get('VU'), flattenEnv);
const rows = flatten({ roots: [category], expandedFolderIds: ['category'], getFolderAssetsState: () => ({ assets: [nativeAsset, virtualAsset], loading: false }) });
assert.deepEqual(rows.map(row => row.kind), ['folder', 'asset', 'asset']);
assert.equal(rows[1].asset, nativeAsset);
assert.equal(rows[2].asset, virtualAsset);

const runtimeBase = path.join(root, '.runtime');
await mkdir(runtimeBase, { recursive: true });
const runtime = await mkdtemp(path.join(runtimeBase, 'native-library-contexts-test-'));
try {
  const output = path.join(runtime, 'ui.mjs');
  await buildPilotEntry('lab/pilot/native-library-contexts.tsx', output, 'node');
  const module = await import(pathToFileURL(output));
let ordinaryApplies = 0, assemblyOpens = 0;
const stateSets = [];
let stateIndex;
let rowSide = 'right';
const rowEnv = {
  LCOSUseNativeLibraryRowOwner:asset=>module.nativeLibraryUsesResponsivePreview(asset,'project')?rowSide:undefined,
  LCOSUseNativeLibraryPreviewLayout:()=>undefined,
  r: { jsx, jsxs: jsx, Fragment: 'Fragment' }, l: { useState: () => { const index = stateIndex++; return [false, value => stateSets.push([index, value])]; },
    useRef: current => ({ current }), useCallback: callback => callback, useEffect: () => {} },
  ie: (...values) => values.filter(Boolean).join(' '), M1: '', R1: '', dU: 300, Ko: 'original-drag',
  LCOSNativeAssemblyOpen: detail => { assert.equal(detail.asset?.lcos_library_entry,undefined,'Context entry must not enter the Artifact inspector.'); assemblyOpens++; return true; },
  LCOSNativeAssemblyTools: 'ArtifactInspector', LCOSNativeLibraryContextDetail: 'ContextDetail', TS: 'OriginalTS',
  em: 'OriginalButton', Zp: 'OriginalAssetRow',
  pr: 'OriginalPopover', hU: 'OriginalAssetIcon', Kn: 'Rename', uU: 'OriginalName', ai: 'TooltipProvider', fs: 'Tooltip', ps: 'TooltipTrigger', Ns: 'TooltipContent', IS: 'OriginalMenu',
};
const rowComponent = evaluate(after.get('Zp'), rowEnv);
function openRow(asset) {
  stateIndex = 0;
  const tree = rowComponent({ asset, onApply: () => { ordinaryApplies += 1; } });
  let action, drag;
  inspect(tree, node => { if (node.props?.role === 'button') action = node.props.onClick; if (node.props && 'draggable' in node.props) drag = node.props.draggable; });
  assert.equal(typeof action, 'function'); action(); return { tree, drag };
}
const contextRow = openRow(virtualAsset);
assert.equal(ordinaryApplies, 0);
assert.ok(stateSets.some(([index, value]) => index === 1 && value === true));
assert.equal(contextRow.tree.props.content.type, 'ContextDetail');
assert.equal(contextRow.tree.props.trigger, 'click');
assert.equal(contextRow.tree.props.side, 'right');
assert.equal(contextRow.tree.props.collisionPadding, 16);
rowSide = 'bottom';
assert.equal(openRow(virtualAsset).tree.props.side, 'bottom', 'Core previews use the original Popover below the rail on narrow viewports, with all-edge collision padding.');
assert.equal(contextRow.drag, true, 'Core aggregate rows retain the original gesture; shared source admission supplies the real aggregate, not a copied artifact.');
const ordinary = openRow(nativeAsset);
assert.equal(ordinaryApplies, 1);
assert.equal(ordinary.drag, true);
assert.equal(ordinary.tree.props.side, 'right', 'Ordinary vendor rows retain their original positioning.');
const materialItem = { schemaVersion:1,kind:'artifact',entityRef:{type:'artifact',id:nativeAsset.id,viewId:'exact-view'},title:nativeAsset.name,presentedRevisionId:'exact-revision',usageCount:0 };
const materialAsset = { ...nativeAsset, lcos_projection:{source:'assembly-warehouse',project_id:'project',artifact_id:nativeAsset.id,artifact_view_id:'exact-view',
  presented_revision_id:'exact-revision',file_record_id:'exact-file',content_available:true,referenceable:true,assembly_item:materialItem} };
assert.equal(Object.hasOwn(materialAsset.lcos_projection,'pinned_revision'),false,'Real initial Assembly rows do not yet carry the later detail-only pinned flag.');
assert.equal(module.nativeLibraryUsesResponsivePreview(materialAsset,'project'),true);
const beforeMaterialApply=ordinaryApplies,beforeMaterialOpen=assemblyOpens,materialRow=openRow(materialAsset);
assert.equal(materialRow.tree.props.side,'bottom');assert.equal(materialRow.tree.props.collisionPadding,16);
assert.equal(ordinaryApplies,beforeMaterialApply);assert.equal(assemblyOpens,beforeMaterialOpen+1,'Responsive placement preserves the exact original material handler rather than turning it into Scope/Collection registration.');
assert.notEqual(materialRow.tree.props.content.type,'ContextDetail','Original material preview/Assembly owner remains original.');
assert.equal(module.nativeLibraryUsesResponsivePreview({...materialAsset,lcos_projection:{...materialAsset.lcos_projection,pinned_revision:true}},'project'),true);
for(const bad of [nativeAsset,{...nativeAsset,lcos_projection:{pinned_revision:true}},
  {...materialAsset,lcos_projection:{...materialAsset.lcos_projection,project_id:'other'}},
  {...materialAsset,lcos_projection:{...materialAsset.lcos_projection,artifact_id:'another'}},
  {...materialAsset,lcos_projection:{...materialAsset.lcos_projection,presented_revision_id:'another'}},
  {...materialAsset,lcos_projection:{...materialAsset.lcos_projection,file_record_id:''}},
  {...materialAsset,lcos_projection:{...materialAsset.lcos_projection,artifact_view_id:'another'}}]){
  assert.equal(module.nativeLibraryUsesResponsivePreview(bad,'project'),false,'Only the existing exact Core address qualifies for this GUI adaptation.');
  assert.equal(openRow(bad).tree.props.side,'right','Unmatched/ordinary rows keep the native side even while the controlled hook reports a narrow viewport for eligible rows.');
}
rowSide='right';assert.equal(openRow(materialAsset).tree.props.side,'right','The same exact material returns to original right positioning on desktop.');

// Execute the actual source hook with controlled React hook slots, not a second
// media-query/eligibility implementation. The original domain map is observed.
const dependency=createRequire(path.join(currentGen2Root,'package.json')),ts=dependency('typescript'),esbuild=dependency('esbuild');
const rowOwnerSource=await readFile(path.join(root,'lab/pilot/native-library-contexts.tsx'),'utf8');
const rowOwnerAst=ts.createSourceFile('native-library-contexts.tsx',rowOwnerSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const rowOwnerDeclaration=rowOwnerAst.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='LCOSUseNativeLibraryRowOwner');assert.ok(rowOwnerDeclaration);
const hookCode=esbuild.transformSync(rowOwnerDeclaration.getText(rowOwnerAst),{loader:'ts',format:'cjs'}).code;
function controlledRowOwner(asset,narrow){
  let value,writes=0,mediaReads=0;const effects=[],listeners=new Set(),rows=new Map(),media={matches:narrow,addEventListener(type,fn){assert.equal(type,'change');listeners.add(fn)},removeEventListener(type,fn){assert.equal(type,'change');listeners.delete(fn)}};
  const environment={window:{matchMedia(query){assert.equal(query,'(max-width: 700px)');mediaReads++;return media}},
    useLcosShellStore:selector=>selector({projectId:'project'}),useCanvasStore:selector=>selector({canvasId:'canvas'}),
    nativeLibraryEntry:module.nativeLibraryEntry,nativeLibraryUsesResponsivePreview:module.nativeLibraryUsesResponsivePreview,libraryRowOwners:rows,
    useState:initial=>{if(value===undefined)value=typeof initial==='function'?initial():initial;return[value,next=>{writes++;value=next}]},useEffect:callback=>effects.push(callback)};
  const wrapped={exports:{}};new Function('module','exports',...Object.keys(environment),hookCode)(wrapped,wrapped.exports,...Object.values(environment));
  const hook=wrapped.exports.LCOSUseNativeLibraryRowOwner,open=()=>{};
  const side=hook(asset,open),cleanups=effects.splice(0).map(effect=>effect()).filter(Boolean);
  return{side,rows,listeners,media,reads:()=>mediaReads,writes:()=>writes,render:()=>hook(asset,open),dispose(){cleanups.forEach(cleanup=>cleanup())}};
}
const materialOwner=controlledRowOwner(materialAsset,true);assert.equal(materialOwner.side,'bottom');assert.equal(materialOwner.listeners.size,1);assert.equal(materialOwner.rows.size,0,'Core material layout does not acquire a Scope/Collection return owner.');
const lateMedia=[...materialOwner.listeners][0];materialOwner.media.matches=false;lateMedia();assert.equal(materialOwner.render(),'right');materialOwner.dispose();assert.equal(materialOwner.listeners.size,0);const writesAfterDispose=materialOwner.writes();materialOwner.media.matches=true;lateMedia();assert.equal(materialOwner.writes(),writesAfterDispose,'An already queued old matchMedia callback cannot change state after cleanup.');
const scopeOwner=controlledRowOwner(virtualAsset,true);assert.equal(scopeOwner.side,'bottom');assert.equal(scopeOwner.rows.size,1,'The original domain entry still registers exactly its own return callback.');scopeOwner.dispose();assert.equal(scopeOwner.rows.size,0);assert.equal(scopeOwner.listeners.size,0);
const vendorOwner=controlledRowOwner(nativeAsset,true);assert.equal(vendorOwner.side,undefined);assert.equal(vendorOwner.reads(),0);assert.equal(vendorOwner.listeners.size,0);assert.equal(vendorOwner.rows.size,0);vendorOwner.dispose();

  const nativeApi = {};
  let inputShell = { projectId: 'project', composerTarget: { nodeId: 'conversation:exact', intent: 'continue', workspaceId: 'workspace',
    receiverConversationId: 'exact', messageId: 'message-original', continuationOperationId: 'operation-original' },
    composerPrompt: '保留原草稿和中间光标', composerCaret: null,
    rememberComposerCaret(caret) { inputShell.composerCaret = caret; },
    resumeComposer(key) { resumes.push(key); return true; } };
  let inputCanvas = { canvasId: 'canvas', rfInstance: nativeApi }, editorVisible = true;
  let opens = 0, focuses = 0;
  const resumes = [], caretRanges = [], frames = [];
  const editor = { isConnected: true, get value() { return inputShell.composerPrompt; }, selectionStart: 2, selectionEnd: 5,
    closest() { return null; }, getClientRects() { return [1]; }, focus() { focuses += 1; },
    setSelectionRange(start, end) { caretRanges.push([start, end]); } };
  const inputPorts = { shell: () => inputShell, canvas: () => inputCanvas, editor: () => editorVisible ? editor : null,
    open() { opens += 1; }, frame(callback) { frames.push(callback); return frames.length; } };
  const returnInput = module.captureNativeLibraryInputReturn('project', inputPorts);
  assert.ok(returnInput?.inputKey);
  assert.deepEqual([inputShell.composerCaret.start, inputShell.composerCaret.end], [2, 5]);
  editorVisible = false;
  const returning = module.restoreNativeLibraryInputReturn(returnInput, inputPorts);
  assert.equal(opens, 1);
  assert.deepEqual(resumes, [returnInput.inputKey]);
  frames.shift()(0);
  assert.equal(focuses, 0, 'Wait for the original rail textarea to publish.');
  // A user edit/selection made while the read was pending wins; restore may
  // focus it, but cannot write the captured old prompt/caret over it.
  inputShell.composerPrompt = '用户后来改过的草稿，必须保留';
  inputShell.composerCaret = { projectId: 'project', targetKey: returnInput.inputKey, text: inputShell.composerPrompt, start: 7, end: 9 };
  editorVisible = true;
  frames.shift()(0);
  assert.equal(await returning, true);
  assert.equal(inputShell.composerPrompt, '用户后来改过的草稿，必须保留');
  assert.deepEqual(caretRanges, [[7, 9]], 'Restore the latest same-input caret, never an old selection.');
  const beforeOpen = opens;
  for (const patch of [{ messageId: 'next-message' }, { continuationOperationId: 'next-operation' }, { receiverConversationId: 'another-conversation' }]) {
    const previous = inputShell.composerTarget;
    inputShell.composerTarget = { ...previous, ...patch };
    assert.equal(await module.restoreNativeLibraryInputReturn(returnInput, inputPorts), false);
    inputShell.composerTarget = previous;
  }
  inputCanvas = { canvasId: 'canvas', rfInstance: {} };
  assert.equal(await module.restoreNativeLibraryInputReturn(returnInput, inputPorts), false);
  inputCanvas = { canvasId: 'another-canvas', rfInstance: nativeApi };
  assert.equal(await module.restoreNativeLibraryInputReturn(returnInput, inputPorts), false);
  inputCanvas = { canvasId: 'canvas', rfInstance: nativeApi };
  assert.equal(opens, beforeOpen, 'Wrong identity cannot even reopen another input.');
  editorVisible = false;
  const staleReturn = module.restoreNativeLibraryInputReturn(returnInput, inputPorts);
  inputShell.composerTarget = { ...inputShell.composerTarget, messageId: 'late-next-message' };
  frames.shift()(0);
  assert.equal(await staleReturn, false);
  assert.equal(focuses, 1, 'A late native rail publication cannot focus a newer message.');
  const item = (kind, id) => ({ schemaVersion: 1, kind, entityRef: { type: kind, id }, title: `${kind} 名称`, usageCount: 1 });
  const context = item('context', 'scope-context');
  const method = item('workflow', 'scope-method');
  const collection = item('collection', 'canonical-collection');
  const assets = module.nativeLibraryEntryAssets('project', 'context', [context]);
  assert.equal(assets[0].lcos_library_entry.item, context);
  assert.equal('lcos_projection' in assets[0], false, 'Scope rows never pretend to be Artifact/Revision rows.');
  assert.equal(module.nativeLibraryEntry({ asset: assets[0] }, 'other-project'), undefined);
  const collectionAssets = module.nativeLibraryEntryAssets('project', 'collection', [collection]);
  assert.equal(collectionAssets[0].folder_id, module.nativeLibraryCategoryId('project', 'collection'));
  assert.equal(collectionAssets[0].lcos_library_entry.item, collection);
  assert.equal('lcos_projection' in collectionAssets[0], false, 'Collection rows never impersonate Artifact/View or Scope.');
  const collectionSearch = module.nativeLibraryEntrySearchResults('project', 'collection', [collection]);
  assert.equal(collectionSearch[0].folder_name, '集合');
  const collectionRow = openRow(collectionAssets[0]);
  assert.equal(collectionRow.tree.props.content.type, 'ContextDetail', 'The real original Zp/TS Popover owns Collection detail too.');
  assert.equal(collectionRow.drag, true, 'A Collection retains the native row gesture and is admitted by the shared aggregate producer.');
  assert.throws(() => module.nativeLibraryEntryAssets('project', 'workflow', [context]));
  assert.throws(() => module.nativeLibraryEntryAssets('project', 'context', [context, context]));
  const details = module.nativeLibraryEntrySearchResults('project', 'context', [context]);
  const search = evaluate(after.get('tF'), { r: { jsx, jsxs: jsx }, he: () => ({ t: key => key }),
    l: { useRef: current => ({ current }), useMemo: callback => callback(), useCallback: callback => callback },
    wt: selector => selector({ activeSpace: 'private' }), mr: { SPACE_TYPE_PRIVATE: 'private', SPACE_TYPE_TEAM: 'team' },
    LS: 'OriginalSearchVirtualList', XU: () => 48, ZU: 'OriginalSearchSkeleton' });
  const searchTree = search({ results: details, searchKeyword: '名称', loading: false });
  assert.equal(searchTree.type, 'OriginalSearchVirtualList');
  assert.equal(searchTree.props.rows[0].detail.asset.lcos_library_entry.item, context,
    'The real original search consumer receives detail envelopes with canonical metadata.');
  const graph = { project: { id: 'project' }, scopes: [
    { id: 'scope-context', projectId: 'project', kind: 'context', name: '上下文' },
    { id: 'scope-method', projectId: 'project', kind: 'workflow', name: '方法' },
  ], artifactViews: [{ id: 'view', artifactId: 'artifact', revisionId: 'old-revision' }],
  artifacts: [{ id: 'artifact', projectId: 'project', title: '真实材料名', currentRevisionId: 'latest-revision' }],
  artifactRevisions: [{ id: 'old-revision', artifactId: 'artifact', fileRecordId: 'old-file' }, { id: 'latest-revision', artifactId: 'artifact', fileRecordId: 'latest-file' }],
  fileRecords: [{ id: 'old-file', mimeType: 'text/markdown' }, { id: 'latest-file', mimeType: 'text/plain' }] };
  const presentation = { id: 'presentation:context:scope-context', projectId: 'project', scopeId: 'scope-context', capability: 'context', version: 1,
    state: { memberViewIds: ['view'], memberEntityRefs: [] } };
  const refs = module.nativeLibraryContextReferences('project', context, graph, [presentation]);
  assert.deepEqual(refs, [{ entityType: 'scope', entityId: context.entityRef.id, displayLabel: context.title }], 'Keep the canonical Scope intact as one reference; the submit owner resolves exact member versions atomically.');
  assert.throws(() => module.nativeLibraryContextReferences('other-project', context, graph, [presentation]));
  assert.deepEqual(module.nativeLibraryContextReferences('project', context, { ...graph, fileRecords: graph.fileRecords.slice(1) }, [presentation]), refs, 'The Library does not silently flatten or replace an unreadable member; original submit rejects the whole Scope.');
  assert.throws(() => module.nativeLibraryContextReferences('project', context, graph, [presentation, presentation]));
  assert.deepEqual(module.nativeLibraryContextReferences('project', context, graph, [{ ...presentation, state: { ...presentation.state, memberEntityRefs: [{ type: 'collection', id: 'set' }, { type: 'note', id: 'note' }, { type: 'conversation', id: 'chat' }, { type: 'run', id: 'run' }, { type: 'scope', id: 'nested' }] } }]), refs, 'Mixed members remain inside the one Scope rather than being omitted by the Library.');
  const description = '保留第一段\n\n来源 Project：这是用户写的方法说明，不能删\n继续执行';
  const workflow = { id: 'presentation-workflow-real-id', projectId: 'project', scopeId: 'scope-method', capability: 'workflow', version: 2,
    state: { memberViewIds: [], workflowActions: [{ id: 'action', label: '核对正文', description, attachedViewIds: [] }], workflowOperators: {} } };
  const methodText = module.nativeLibraryMethodText('project', method, graph, [workflow]);
  assert.ok(methodText.includes(description), 'Arbitrary user-authored method instructions must survive byte-for-byte.');
  assert.equal(methodText.includes('presentation-workflow-real-id'), false);
  assert.equal(methodText.includes('来源 Scope：scope-method'), false);
  assert.equal(methodText.includes('version 2'), false);
  let state = { status: 'ready', canvasId: 'source-canvas' };
  const listeners = new Set();
  const selections = [];
  const target = { id: 'real-workspace', projectId: 'project', scopeId: 'scope-context', canvasId: 'target-canvas' };
  const navOwner = { projectId: 'project', canvasId: 'source-canvas', disabled: false, onSelect: async value => {
    selections.push(value); state = { status: 'ready', canvasId: value.id }; listeners.forEach(callback => callback());
  } };
  const navPorts = { owner: () => navOwner, getState: () => state, projectId: () => 'project', timeoutMs: 20,
    subscribe: callback => { listeners.add(callback); return () => listeners.delete(callback); } };
  await module.navigateNativeLibraryWorkspace('project', 'source-canvas', target, navPorts);
  assert.deepEqual(selections, [{ id: 'target-canvas' }]);
  assert.equal(listeners.size, 0);
  state = { status: 'ready', canvasId: 'source-canvas' };
  await assert.rejects(module.navigateNativeLibraryWorkspace('project', 'source-canvas', { ...target, projectId: 'foreign' }, navPorts), /身份已变化/);
  await assert.rejects(module.navigateNativeLibraryWorkspace('project', 'source-canvas', target, { ...navPorts,
    owner: () => ({ ...navOwner, disabled: true }) }), /暂时不能切换/);
  await assert.rejects(module.navigateNativeLibraryWorkspace('project', 'source-canvas', target, { ...navPorts,
    owner: () => ({ ...navOwner, onSelect: async () => {} }), timeoutMs: 1 }), /切换尚未确认/);
  assert.deepEqual(selections, [{ id: 'target-canvas' }], 'Rejected or uncertain navigation never retries or invents a Router fallback.');
  assert.equal(listeners.size, 0);
} finally {
  const target = path.resolve(runtime);
  assert.ok(target.startsWith(path.resolve(runtimeBase) + path.sep) && path.basename(target).startsWith('native-library-contexts-test-'));
  await rm(target, { recursive: true, force: true });
}
const report = { passed: true, cases: [
  'original sF/tree/search owners unchanged; composition and idempotency',
  'native TS optional slots preserve ordinary asset layout', 'virtual detail skips cloud reads without losing pinned safety',
  'content variant removes media crop and keeps native metadata/actions',
  'same-input reopen and late native textarea focus; newer drafts/carets preserved; wrong scene/message/operation rejected',
  'original tree consumes virtual category/rows', 'original row click opens context detail instead of Artifact mutation',
  'initial exact Core material without later pinned flag uses native narrow Popover and keeps its original action; foreign/malformed/ordinary paths stay native',
  'actual row hook matchMedia updates/cleanup/late cancellation; Scope-only return registration and ordinary zero-listener path',
  'real Warehouse metadata identity; no Artifact impersonation', 'exact historical Context members and whole-input refusal',
  'canonical Collection category/search use the original Zp preview; no Artifact drag or legacy Scope identity',
  'method instructions preserved; generated source metadata stays internal',
  'same original Ke navigation; exact arrival and failure without fallback',
], realBrowserVerified: false, providerOrModelExecution: false };
const reportDirectory=path.join(root,'output/原库材料窄屏接线_20261026');await mkdir(reportDirectory,{recursive:true});
const reportPath=path.join(reportDirectory,'原列表与实际Hook专项.json');await writeFile(reportPath,JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,reportPath},null,2));
