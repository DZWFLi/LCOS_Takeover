import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Server } from 'node:net';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeBase = path.join(root, '.runtime'); await fs.mkdir(runtimeBase, { recursive: true });
const runtime = await fs.mkdtemp(path.join(runtimeBase, 'native-navigation-markers-'));
const output=path.join(root,'output/导航固定并发ACK_20261027',new Date().toISOString().replace(/[:.]/g,'-'));await fs.mkdir(output,{recursive:true});
const upstream = globalThis.fetch;
const envBefore = new Map(Object.entries(process.env).filter(([key]) => /^(?:LCOS_|LOCAL_CORE_|HUABU_|OPENAI_|ANTHROPIC_|GEMINI_|GOOGLE_API_|OPENROUTER_|DEEPSEEK_)/.test(key)));
for (const key of envBefore.keys()) delete process.env[key];
process.env.LCOS_RECOVERY_TRANSPORT = 'none'; process.env.LCOS_OLLAMA_URL = 'http://127.0.0.1:1';
process.env.LCOS_CAPTURE_STAGING_ROOT = path.join(runtime, 'capture'); process.env.LCOS_OCR_RUNTIME_DIR = path.join(runtime, 'ocr');
let facade, responseFault, onRead;
const calls = [], cases = [];
const ownedOrigin = origin => process._getActiveHandles().some(handle => {
  if (!(handle instanceof Server) || !handle.listening) return false;
  const address = handle.address(); return address && typeof address !== 'string'
    && ['127.0.0.1', '::1'].includes(address.address) && new URL(origin).port === String(address.port);
});
globalThis.fetch = async (input, init = {}) => {
  const address = input instanceof Request ? input.url : String(input);
  if (address.startsWith('/api/lcos/core/')) {
    assert.ok(facade, 'adapter requests only belong to this disposable Core');
    const route = address.slice('/api/lcos/core'.length), method = init.method ?? 'GET';
    calls.push({ route, method, body: init.body ? JSON.parse(init.body) : undefined });
    if (method === 'GET') await onRead?.(route);
    if (responseFault?.before && responseFault.when(method, route)) {
      const fault = responseFault; responseFault = undefined; return fault.before();
    }
    const response = await upstream(facade.core.origin + route, init);
    if (responseFault && responseFault.when(method, route)) {
      const fault = responseFault; responseFault = undefined; return fault.after(response);
    }
    return response;
  }
  const url = new URL(address);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !ownedOrigin(url.origin))
    throw new Error('Navigation fixture refused an unowned endpoint.');
  return upstream(input, init);
};
try {
  const entry = path.join(runtime, 'fixture.ts');
  const relative = value => path.relative(runtime, path.join(root, value)).replaceAll('\\', '/');
  await fs.writeFile(entry, `export * from ${JSON.stringify(relative('lab/pilot/native-navigation-markers.ts'))};\nexport {startSurfaceCoreFacade} from ${JSON.stringify(relative('lab/pilot/surface-core-facade.ts'))};`);
  const bundle = await buildPilotEntry(path.relative(root, entry), path.join(runtime, 'fixture.mjs'), 'node', {
    coreCollectionTitle: true, coreColorPin: true, coreWorkspaceMembership: true, coreWorkflowCollectionMembers: true, coreMixedScopeContext: true,
  });
  const module = await import(pathToFileURL(bundle).href);
  // Pure exact-target coverage also covers canonical types absent from a new
  // empty fixture. It does not stand in for the real producer tests below.
  const projectId = 'pure-project', canvasId = 'pure-canvas', workspaceId = 'pure-workspace';
  const scene = { projectId, canvasId, workspaceId, surfaceRef: 'main', api: {} };
  const graph = { project: { id: projectId }, workspaces: [{ id: workspaceId, projectId, canvasId }],
    scopes: [{ id: 'scope', projectId }], artifacts: [{ id: 'artifact', projectId }],
    artifactViews: [{ id: 'view', scopeId: 'scope', artifactId: 'artifact', revisionId: 'revision' }],
    artifactRevisions: [{ id: 'revision', artifactId: 'artifact' }], notes: [{ id: 'note', projectId }],
    collections: [{ id: 'collection', projectId }], connectedConversations: [{ id: 'conversation', projectId }], runs: [{ id: 'run', projectId }], resultSlots: [{ id: 'slot', projectId }] };
  const carrier = (type, id, key, ref) => ({ node: { id: 'node', canvas_id: canvasId, data: { id: 'node', [key]: ref } },
    facts: { markers: [], graph, bindings: [{ projectId, canvasId, spatialKind: 'node', spatialId: 'node', entityType: type, entityId: id }] } });
  const ref = { version: 1, entityType: 'artifact', entityId: 'artifact', artifactId: 'artifact', artifactViewId: 'view', revisionId: 'revision' };
  const material = carrier('artifact', 'artifact', 'lcos_ref', ref);
  assert.deepEqual(module.nativeNavigationTarget(material.node, scene, material.facts), { projectId, kind: 'view', id: 'view' });
  for (const [type, key, idKey, id] of [
    ['collection', 'lcos_collection_ref', 'collectionId', 'collection'],
    ['conversation', 'lcos_conversation_ref', 'connectedConversationId', 'conversation'], ['run', 'lcos_execution_ref', 'entityId', 'run'], ['result-slot', 'lcos_execution_ref', 'entityId', 'slot'],
    ['note', 'lcos_member_ref', 'entityId', 'note'], ['scope', 'lcos_member_ref', 'entityId', 'scope'], ['workspace', 'lcos_member_ref', 'entityId', workspaceId],
  ]) {
    const input = carrier(type, id, key, { projectId, canvasId, workspaceId, [idKey]: id,
      ...(['lcos_member_ref', 'lcos_execution_ref'].includes(key) ? { entityType: type } : {}) });
    assert.deepEqual(module.nativeNavigationTarget(input.node, scene, input.facts), { projectId, kind: 'entity', id });
    assert.equal(module.nativeNavigationTarget({ ...input.node, data: { ...input.node.data, [key]: { ...input.node.data[key], workspaceId: 'foreign' } } }, scene, input.facts), undefined);
  }
  for (const mutate of [
    input => input.facts.bindings.push({ ...input.facts.bindings[0] }),
    input => input.facts.bindings[0].entityId = 'other', input => input.node.data.lcos_ref.revisionId = 'other',
    input => input.node.data.id = 'other', input => input.node.canvas_id = 'other',
    input => input.facts.graph.project.id = 'other', input => input.facts.graph.workspaces[0].canvasId = 'other',
    input => input.node.data.lcos_collection_ref = { projectId, canvasId, workspaceId, collectionId: 'collection' },
    input => input.facts.graph.artifactViews.push({ ...input.facts.graph.artifactViews[0] }),
  ]) {
    const input = structuredClone(material); mutate(input);
    assert.equal(module.nativeNavigationTarget(input.node, scene, input.facts), undefined, 'inexact identity cannot become an authored target');
  }
  const collision = carrier('note', 'note', 'lcos_member_ref', { projectId, canvasId, workspaceId, entityType: 'note', entityId: 'note' });
  collision.facts = structuredClone(collision.facts); collision.facts.graph.runs.push({ id: 'note', projectId });
  assert.equal(module.nativeNavigationTarget(collision.node, scene, collision.facts), undefined, 'untyped entity target cannot cross-table rebind');
  cases.push('exact View and collection/conversation/Run/note/scope/workspace targets; wrong ref, duplicate binding, stale version, foreign owner and cross-table collisions rejected without names or geometry');

  facade = await module.startSurfaceCoreFacade({ runtimeRoot: path.join(runtime, 'owned'), publicOrigin: 'http://127.0.0.1:19971',
    fullIntegration: true, nativeCollectionPilot: true, nativeTextPilot: true, nativeAssemblyPilot: true, nativeRailPilot: true });
  const expectFacade = async (method, url, body, status = 200) => {
    const result = await facade.handle({ method, url, body }); assert.equal(result.status, status, JSON.stringify(result.body));
    return result.body.value ?? result.body.data;
  };
  const prefix = '/api/lcos/core/projects/' + facade.core.projectId;
  const initialGraph = facade.core.repository.get(facade.core.projectId);
  const mainWorkspace = initialGraph.workspaces.find(row => row.canvasId === 'surface-core-main'); assert.ok(mainWorkspace);
  const childScopeId = 'scope-navigation-marker-child', childWorkspaceId = 'workspace:' + childScopeId;
  const sourceView = initialGraph.artifactViews.find(view => initialGraph.artifacts.find(artifact => artifact.id === view.artifactId)?.title === 'Context · 资料现场');
  assert.ok(sourceView);
  await expectFacade('PUT', prefix + '/workflow/methods/' + childScopeId, { create: true, name: '导航事实子现场验证',
    expectedGraphVersion: initialGraph.graphVersion, presentations: [{ id: 'presentation:workflow:' + childScopeId, expectedVersion: 0,
      memberViewIds: [sourceView.id], workflowActions: [{ id: 'inspect', label: '只检查准确位置', attachedViewIds: [sourceView.id], x: 0, y: 0 }],
      workflowActionEdges: [], workflowOperators: {} }] });
  const childOpened = await expectFacade('POST', '/api/lcos/workflow/' + childScopeId + '/workspace:open', { workspaceId: childWorkspaceId });
  const mainRun = (await expectFacade('POST', prefix + '/runs', { instruction: '只登记主现场导航验证，不派发', outputIntent: 'analyze',
    workspaceId: mainWorkspace.id, requestedProvider: 'workbuddy' }, 201)).review;
  const childRun = (await expectFacade('POST', prefix + '/runs', { instruction: '只登记子现场导航验证，不派发', outputIntent: 'analyze',
    workspaceId: childWorkspaceId, requestedProvider: 'workbuddy' }, 201)).review;
  const childSlot = await expectFacade('POST', prefix + '/result-slots', { scopeId: childScopeId, workspaceId: childWorkspaceId,
    x: 450, y: 80, width: 200, height: 150 }, 201);
  for (const review of [mainRun, childRun]) {
    assert.equal(review.run.status, 'created'); assert.equal(review.dispatch.status, 'planned'); assert.equal(review.dispatch.attemptCount, 0);
    assert.equal(facade.core.repository.getRuntimeBinding(review.run.id), undefined);
  }
  for (const id of ['surface-core-main', childOpened.canvasId])
    await expectFacade('POST', '/api/lcos/canvases/' + id + '/execution:reconcile', {});
  const canvasResponse = await facade.handle({ method: 'GET', url: '/api/canvas/v1/canvases/surface-core-main' });
  assert.equal(canvasResponse.status, 200);
  const canvas = canvasResponse.body.data, nodes = canvas.nodes;
  const workspace = facade.core.repository.getWorkspaces(facade.core.projectId).find(row => row.canvasId === canvas.id);
  let active = true;
  const liveScene = { projectId: facade.core.projectId, canvasId: canvas.id, workspaceId: workspace.id, surfaceRef: 'main',
    api: { getNodes: () => nodes, getNode: id => nodes.find(node => node.id === id) } };
  const current = () => active;
  const facts = await module.readNativeNavigationFacts(liveScene);
  const realMainRunNode = nodes.find(node => node.data?.lcos_execution_ref?.entityId === mainRun.run.id); assert.ok(realMainRunNode);
  assert.deepEqual(realMainRunNode.data.lcos_execution_ref, { projectId: liveScene.projectId, canvasId: canvas.id,
    workspaceId: mainWorkspace.id, entityType: 'run', entityId: mainRun.run.id });
  assert.equal(realMainRunNode.data.lcos_run_ref, undefined, 'the real producer uses execution_ref, not the old inferred shape');
  assert.deepEqual(module.nativeNavigationTarget(realMainRunNode, liveScene, facts), { projectId: liveScene.projectId, kind: 'entity', id: mainRun.run.id });
  const childCanvas = await expectFacade('GET', '/api/canvas/v1/canvases/' + childOpened.canvasId);
  const childScene = { projectId: liveScene.projectId, canvasId: childCanvas.id, workspaceId: childWorkspaceId,
    surfaceRef: 'workspace:' + childWorkspaceId, api: { getNodes: () => childCanvas.nodes } };
  const childFacts = await module.readNativeNavigationFacts(childScene);
  const realChildRunNode = childCanvas.nodes.find(node => node.data?.lcos_execution_ref?.entityId === childRun.run.id); assert.ok(realChildRunNode);
  assert.deepEqual(module.nativeNavigationTarget(realChildRunNode, childScene, childFacts), { projectId: liveScene.projectId, kind: 'entity', id: childRun.run.id });
  const realSlotNode = childCanvas.nodes.find(node => node.data?.lcos_execution_ref?.entityId === childSlot.id); assert.ok(realSlotNode);
  assert.deepEqual(module.nativeNavigationTarget(realSlotNode, childScene, childFacts), {projectId:liveScene.projectId,kind:'entity',id:childSlot.id}, 'a real ResultSlot keeps its own identity rather than being relabelled as Run');
  for (const changed of [
    { ...realMainRunNode, data: { ...realMainRunNode.data, lcos_execution_ref: { ...realMainRunNode.data.lcos_execution_ref, workspaceId: childWorkspaceId } } },
    { ...realMainRunNode, data: { ...realMainRunNode.data, lcos_execution_ref: { ...realMainRunNode.data.lcos_execution_ref, entityType: 'result-slot' } } },
    { ...realMainRunNode, data: { ...realMainRunNode.data, lcos_run_ref: { projectId: liveScene.projectId, canvasId: canvas.id, workspaceId: mainWorkspace.id, runId: mainRun.run.id } } },
  ]) assert.equal(module.nativeNavigationTarget(changed, liveScene, facts), undefined);
  assert.equal(module.nativeNavigationTarget(realMainRunNode, childScene, childFacts), undefined);
  assert.equal(module.nativeNavigationTarget(realChildRunNode, liveScene, facts), undefined);
  cases.push('real Core planned Run and ResultSlot → original execution:reconcile → actual Canvas GET producer: execution_ref admitted with real type in Main/child; foreign carrier and dual refs rejected');
  const node = nodes.find(node => module.nativeNavigationTarget(node, liveScene, facts)?.kind === 'view'); assert.ok(node);
  const before = { graph: facade.core.repository.get(liveScene.projectId), canvas: structuredClone(await facade.spatial.read(canvas.id)),
    childCanvas: structuredClone(await facade.spatial.read(childCanvas.id)),
    execution: facade.core.repository.getProjectExecutionProjection(liveScene.projectId) };
  const target = module.nativeNavigationTarget(node, liveScene, facts);
  const resolver = await module.resolveNativeNavigationTarget(liveScene, target); assert.equal(resolver.status, 'resolved');
  const foreignCalls = calls.length;
  await assert.rejects(module.resolveNativeNavigationTarget(liveScene, { ...target, projectId: 'foreign' }), cause => cause.outcome === 'rejected');
  assert.equal(calls.length, foreignCalls);
  assert.ok(facts.graph.connectedConversations.every(row => row.projectId === liveScene.projectId));
  assert.deepEqual(facts.graph.runs, before.execution.runs);
  const marker = await module.createNativeNavigationMarker(liveScene, node.id, facts, current);
  assert.deepEqual(marker.targetRef, target); assert.equal(marker.sourceSurfaceRef, 'main'); assert.equal(marker.scope, 'local');
  const writes = () => calls.filter(call => call.method === 'POST' && call.route.endsWith('/spatial-markers'));
  assert.deepEqual(writes().at(-1).body, { targetRef: target, scope: 'local', sourceSurfaceRef: 'main' }, 'no geometry or invented operation data is written');
  let writeCount = writes().length;
  assert.equal((await module.createNativeNavigationMarker(liveScene, node.id, facts, current)).id, marker.id);
  assert.equal(writes().length, writeCount, 'existing exact marker is reused with reads only');
  await module.removeNativeNavigationMarker(liveScene, marker.id, current);
  assert.ok(!(await module.readNativeNavigationFacts(liveScene)).markers.some(row => row.id === marker.id));
  for (const [runScene, runNode, runFacts] of [[liveScene, realMainRunNode, facts], [childScene, realChildRunNode, childFacts], [childScene,realSlotNode,childFacts]]) {
    const target = module.nativeNavigationTarget(runNode, runScene, runFacts);
    const runMarker = await module.createNativeNavigationMarker(runScene, runNode.id, runFacts, current);
    assert.deepEqual(runMarker.targetRef, target); assert.equal(runMarker.sourceSurfaceRef, runScene.surfaceRef);
    const runResolution=await module.resolveNativeNavigationTarget(runScene,target);assert.equal(runResolution.status,'resolved');assert.equal(runResolution.target.anchorRef,target.id);assert.equal(runResolution.target.surfaceRef,'workspace:'+runScene.workspaceId,'Current original typed resolver supports the exact Run without invented geometry');
    const typedRows=(await module.readNativeNavigationFacts(runScene)).graph[runNode.data.lcos_execution_ref.entityType==='result-slot'?'resultSlots':'runs'];
    assert.ok(typedRows.some(row => row.id === target.id));
    await module.removeNativeNavigationMarker(runScene, runMarker.id, current);
  }
  for(const suffix of ['/connected-conversations','/execution-projection']){
    responseFault={before:()=>Response.json({ok:false,error:{message:'optional service unavailable'}},{status:503}),
      when:(method,route)=>method==='GET'&&route.endsWith(suffix)};
    const partial=await module.readNativeNavigationFacts(liveScene);
    assert.equal(partial.availability[suffix==='/connected-conversations'?'conversations':'runs'],false);
    assert.deepEqual(module.nativeNavigationTarget(node,liveScene,partial),target,'Optional conversation/Run reads do not lock unrelated materials');
    assert.deepEqual(partial.markers,[],'Mandatory canonical marker reads remain real');
  }
  responseFault={before:()=>Response.json({ok:true,value:[{id:'foreign',projectId:'foreign'}]}),
    when:(method,route)=>method==='GET'&&route.endsWith('/connected-conversations')};
  const foreignOptional=await module.readNativeNavigationFacts(liveScene);
  assert.equal(foreignOptional.availability.conversations,false);assert.deepEqual(foreignOptional.graph.connectedConversations,[]);
  responseFault={before:()=>Response.json({ok:false,error:{message:'required marker read unavailable'}},{status:503}),
    when:(method,route)=>method==='GET'&&route.endsWith('/spatial-markers')};
  await assert.rejects(module.readNativeNavigationFacts(liveScene),/required marker read unavailable/);
  cases.push('optional conversation/Run 503 or foreign payload cannot lock exact material navigation or supply fake entities; mandatory marker read failure still fails honestly');
  const directoryMarker=await expectFacade('POST',prefix+'/spatial-markers',{targetRef:target,scope:'cross-surface'},201);
  const directoryDeletes=calls.filter(row=>row.method==='DELETE').length;
  await assert.rejects(module.removeNativeNavigationMarker(liveScene,directoryMarker.id,current),/不属于当前现场/);
  await assert.rejects(module.removeNativeNavigationMarker(liveScene,directoryMarker.id,current,
    {selectedMarker:{...directoryMarker,targetRef:{...target,id:'other-target'}}}),/选中的固定记录已变化/);
  assert.equal(calls.filter(row=>row.method==='DELETE').length,directoryDeletes);
  assert.ok((await module.readNativeNavigationFacts(liveScene)).markers.some(row=>row.id===directoryMarker.id));
  await module.removeNativeNavigationMarker(liveScene,directoryMarker.id,current,{selectedMarker:directoryMarker});
  assert.equal(calls.filter(row=>row.method==='DELETE').length,directoryDeletes+1);
  assert.ok(!(await module.readNativeNavigationFacts(liveScene)).markers.some(row=>row.id===directoryMarker.id));
  const staleSourceMarker=await expectFacade('POST',prefix+'/spatial-markers',{targetRef:target,scope:'local',sourceSurfaceRef:childScene.surfaceRef},201);
  await module.removeNativeNavigationMarker(liveScene,staleSourceMarker.id,current,{selectedMarker:staleSourceMarker});
  assert.ok(!(await module.readNativeNavigationFacts(liveScene)).markers.some(row=>row.id===staleSourceMarker.id));
  cases.push('explicit directory selection removes only the fresh same-project/target/scope/source marker across scenes; default near-field restrictions remain, altered selections send no DELETE');
  writeCount = writes().length;
  cases.push('real isolated Core routes: parallel canonical facts, exact View resolve, local create with original ChangeSet, repeat reuses, remove reads back; no spatial fields sent');

  // Double-click and owner change occur during actual preflight GETs.
  let releaseRead, enteredRead;
  const blocked = new Promise(resolve => { releaseRead = resolve; });
  const entered = new Promise(resolve => { enteredRead = resolve; });
  onRead = async route => { if (route.endsWith('/spatial-markers')) { enteredRead(); await blocked; } };
  const first = module.createNativeNavigationMarker(liveScene, node.id, facts, current); await entered;
  await assert.rejects(module.createNativeNavigationMarker(liveScene, node.id, facts, current), cause => cause.outcome === 'unknown');
  active = false; releaseRead(); onRead = undefined;
  await assert.rejects(first, cause => cause.outcome === 'rejected'); active = true;
  assert.equal(writes().length, writeCount);
  const oldRef = node.data.lcos_ref;
  onRead = async route => { if (route.endsWith('/graph')) node.data.lcos_ref = { ...oldRef, revisionId: 'synthetic-stale-revision' }; };
  await assert.rejects(module.createNativeNavigationMarker(liveScene, node.id, facts, current), cause => cause.outcome === 'rejected');
  node.data.lcos_ref = oldRef; onRead = undefined; assert.equal(writes().length, writeCount);
  cases.push('concurrent duplicate click has one preflight reservation; owner/API callback change and live identity change prevent the POST after actual asynchronous Core reads');

  const interleavings=[];
  const directCore=async(method,route,body)=>{
    assert.ok(ownedOrigin(facade.core.origin));const response=await upstream(facade.core.origin+route,{method,redirect:'error',...(body===undefined?{}:{headers:{'content-type':'application/json'},body:JSON.stringify(body)})});
    const envelope=await response.json();assert.ok(response.ok&&envelope.ok===true,JSON.stringify(envelope));interleavings.push({method,route,status:response.status,value:envelope.value});return envelope;
  };
  const coreMarkerPath='/projects/'+liveScene.projectId+'/spatial-markers',markerInput={targetRef:target,scope:'local',sourceSurfaceRef:liveScene.surfaceRef};
  let acknowledged,replacement;
  responseFault={when:(method,route)=>method==='POST'&&route.endsWith('/spatial-markers'),after:async response=>{
    assert.equal(response.status,201);acknowledged=(await response.clone().json()).value;
    await directCore('DELETE',coreMarkerPath+'/'+encodeURIComponent(acknowledged.id));return response;
  }};
  let postCount=writes().length;
  await assert.rejects(module.createNativeNavigationMarker(liveScene,node.id,facts,current),cause=>cause.outcome==='rejected'&&cause.status===409&&cause.code==='NAVIGATION_MARKER_CHANGED'
    &&cause.facts.markers.length===0);
  assert.equal(module.nativeNavigationMarkerPending(liveScene).length,0);assert.equal(writes().length,postCount+1);
  assert.equal((await module.verifyNativeNavigationMarkerPending(liveScene,current)).status,'confirmed');assert.equal(writes().length,postCount+1);
  cases.push('Original CREATE valid 201 ACK then Agent exact DELETE before postread: reports changed 409 with verified empty facts, clears only its attempt, GET verification does not replay/create');
  responseFault={when:(method,route)=>method==='POST'&&route.endsWith('/spatial-markers'),after:async response=>{
    acknowledged=(await response.clone().json()).value;await directCore('DELETE',coreMarkerPath+'/'+encodeURIComponent(acknowledged.id));replacement=(await directCore('POST',coreMarkerPath,markerInput)).value;return response;
  }};
  await assert.rejects(module.createNativeNavigationMarker(liveScene,node.id,facts,current),cause=>cause.code==='NAVIGATION_MARKER_CHANGED'
    &&cause.facts.markers.length===1&&cause.facts.markers[0].id===replacement.id&&replacement.id!==acknowledged.id);
  assert.equal(module.nativeNavigationMarkerPending(liveScene).length,0);assert.equal(facade.core.repository.listSpatialMarkerIntents(liveScene.projectId)[0].id,replacement.id);
  await module.removeNativeNavigationMarker(liveScene,replacement.id,current);
  cases.push('Valid CREATE ACK superseded by a different exact-target marker: current replacement facts remain, no fabricated still-fixed return or deletion of the replacement');
  responseFault={when:(method,route)=>method==='POST'&&route.endsWith('/spatial-markers'),after:async response=>{
    acknowledged=(await response.clone().json()).value;responseFault={when:(method,route)=>method==='GET'&&route.endsWith('/spatial-markers'),before:()=>Response.json({ok:false,error:{message:'postread temporarily unavailable'}},{status:503})};return response;
  }};
  await assert.rejects(module.createNativeNavigationMarker(liveScene,node.id,facts,current),cause=>cause.outcome==='unknown');assert.equal(module.nativeNavigationMarkerPending(liveScene).length,1);
  await directCore('DELETE',coreMarkerPath+'/'+encodeURIComponent(acknowledged.id));postCount=writes().length;
  let verifiedAck=await module.verifyNativeNavigationMarkerPending(liveScene,current);assert.equal(verifiedAck.status,'confirmed');assert.equal(verifiedAck.changed,true);assert.equal(verifiedAck.facts.markers.length,0);assert.equal(module.nativeNavigationMarkerPending(liveScene).length,0);assert.equal(writes().length,postCount);
  cases.push('ACK retained across a failed postread: later GET proves the ACK record superseded, returns changed/confirmed and fresh absence without replay');
  const deleteOriginal=await module.createNativeNavigationMarker(liveScene,node.id,facts,current);
  responseFault={when:(method,route)=>method==='DELETE'&&route.endsWith('/'+deleteOriginal.id),after:async response=>{
    assert.equal(response.status,200);assert.equal((await response.clone().json()).value.markerId,deleteOriginal.id);replacement=(await directCore('POST',coreMarkerPath,markerInput)).value;return response;
  }};
  const deleteCount=calls.filter(row=>row.method==='DELETE').length;await module.removeNativeNavigationMarker(liveScene,deleteOriginal.id,current);
  assert.equal(module.nativeNavigationMarkerPending(liveScene).length,0);assert.equal(calls.filter(row=>row.method==='DELETE').length,deleteCount+1);assert.notEqual(replacement.id,deleteOriginal.id);assert.equal((await module.readNativeNavigationFacts(liveScene)).markers[0].id,replacement.id);await module.removeNativeNavigationMarker(liveScene,replacement.id,current);
  cases.push('Valid DELETE ACK followed by Agent new CREATE: confirms only old marker removal, leaves the new canonical record and sends no follow-up DELETE');
  const restoredOriginal=await module.createNativeNavigationMarker(liveScene,node.id,facts,current);
  responseFault={when:(method,route)=>method==='DELETE'&&route.endsWith('/'+restoredOriginal.id),after:async response=>{
    const ack=await response.clone().json();assert.ok(ack.meta.changeSetId);const undo=await directCore('POST','/projects/'+liveScene.projectId+'/change-sets/'+encodeURIComponent(ack.meta.changeSetId)+'/revert',{});assert.equal(undo.value.status,'reverted');return response;
  }};
  await assert.rejects(module.removeNativeNavigationMarker(liveScene,restoredOriginal.id,current),cause=>cause.code==='NAVIGATION_MARKER_CHANGED'
    &&cause.outcome==='rejected'&&cause.facts.markers.some(row=>row.id===restoredOriginal.id));assert.equal(module.nativeNavigationMarkerPending(liveScene).length,0);
  await module.removeNativeNavigationMarker(liveScene,restoredOriginal.id,current);
  cases.push('Original DELETE ACK then original ChangeSet Undo restoring same ID: reports fresh changed state, no permanent pending and no automatic second delete');
  const notFoundOriginal=await module.createNativeNavigationMarker(liveScene,node.id,facts,current);
  responseFault={when:(method,route)=>method==='DELETE'&&route.endsWith('/'+notFoundOriginal.id),before:async()=>{
    const external=await directCore('DELETE',coreMarkerPath+'/'+encodeURIComponent(notFoundOriginal.id));
    // This is the actual original Core DELETE 404 after another actor removed
    // the exact ID, not an invented response or a suppressed client request.
    const notFound=await upstream(facade.core.origin+coreMarkerPath+'/'+encodeURIComponent(notFoundOriginal.id),{method:'DELETE',redirect:'error'});assert.equal(notFound.status,404);
    interleavings.push({method:'DELETE',route:coreMarkerPath+'/'+notFoundOriginal.id,status:404});
    const undo=await directCore('POST','/projects/'+liveScene.projectId+'/change-sets/'+encodeURIComponent(external.meta.changeSetId)+'/revert',{});assert.equal(undo.value.status,'reverted');return notFound;
  }};
  await assert.rejects(module.removeNativeNavigationMarker(liveScene,notFoundOriginal.id,current),cause=>cause.code==='NAVIGATION_MARKER_CHANGED'&&cause.status===409&&cause.facts.markers.some(row=>row.id===notFoundOriginal.id));assert.equal(module.nativeNavigationMarkerPending(liveScene).length,0);await module.removeNativeNavigationMarker(liveScene,notFoundOriginal.id,current);
  cases.push('Actual original DELETE 404 after another actor removes exact ID, then original Undo restores it: completed absence ACK reports changed, not unknown or a replayed delete');
  // An invalid ACK is not promoted to an acknowledged commit, even if its
  // actual request committed and another actor subsequently removed it.
  responseFault={when:(method,route)=>method==='POST'&&route.endsWith('/spatial-markers'),after:async response=>{
    const envelope=await response.clone().json();acknowledged=envelope.value;await directCore('DELETE',coreMarkerPath+'/'+encodeURIComponent(acknowledged.id));return Response.json({...envelope,value:{...envelope.value,targetRef:{...envelope.value.targetRef,id:'wrong-ack-target'}}},{status:201});
  }};
  await assert.rejects(module.createNativeNavigationMarker(liveScene,node.id,facts,current),cause=>cause.outcome==='unknown');postCount=writes().length;
  assert.equal((await module.verifyNativeNavigationMarkerPending(liveScene,current)).status,'unknown');assert.equal(module.nativeNavigationMarkerPending(liveScene).length,1);assert.equal(writes().length,postCount);
  await assert.rejects(module.createNativeNavigationMarker(liveScene,node.id,facts,current),cause=>cause.outcome==='unknown');assert.equal(writes().length,postCount);
  replacement=(await directCore('POST',coreMarkerPath,markerInput)).value;assert.equal((await module.verifyNativeNavigationMarkerPending(liveScene,current)).status,'confirmed');await module.removeNativeNavigationMarker(liveScene,replacement.id,current);
  cases.push('Malformed target ACK plus absent record stays unknown and blocks repeat CREATE; only an actual later canonical record can satisfy the original GET-only verification');

  responseFault = { when: (method, route) => method === 'POST' && route.endsWith('/spatial-markers'), after: async response => {
    assert.equal(response.status, 201); await response.text(); throw new Error('synthetic lost reply after actual Core commit');
  } };
  await assert.rejects(module.createNativeNavigationMarker(liveScene, node.id, facts, current), cause => cause.outcome === 'unknown');
  const countAfterLostReply = writes().length;
  assert.equal(module.nativeNavigationMarkerPending(liveScene).length, 1);
  await assert.rejects(module.createNativeNavigationMarker(liveScene, node.id, facts, current), cause => cause.outcome === 'unknown');
  assert.equal(writes().length, countAfterLostReply);
  const verified = await module.verifyNativeNavigationMarkerPending(liveScene, current);
  assert.equal(verified.status, 'confirmed'); assert.equal(module.nativeNavigationMarkerPending(liveScene).length, 0);
  assert.equal(writes().length, countAfterLostReply); const committed = verified.facts.markers.find(row => row.targetRef.id === target.id); assert.ok(committed);
  responseFault = { when: (method, route) => method === 'DELETE' && route.endsWith('/' + committed.id), after: async response => {
    assert.equal(response.status, 200); await response.text(); throw new Error('synthetic lost DELETE reply after actual Core commit');
  } };
  await assert.rejects(module.removeNativeNavigationMarker(liveScene, committed.id, current), cause => cause.outcome === 'unknown');
  const deletes = calls.filter(row => row.method === 'DELETE').length;
  assert.equal((await module.verifyNativeNavigationMarkerPending(liveScene, current)).status, 'confirmed');
  assert.equal(calls.filter(row => row.method === 'DELETE').length, deletes);
  cases.push('real committed CREATE/DELETE replies discarded: unknown outcomes are retained, repeat CREATE never resends, GET-only verification adopts canonical id or confirmed absence');

  responseFault = { before: () => Response.json({ ok: false, error: { message: 'synthetic original transactional rejection' } }, { status: 422 }),
    when: (method, route) => method === 'POST' && route.endsWith('/spatial-markers') };
  await assert.rejects(module.createNativeNavigationMarker(liveScene, node.id, facts, current), cause => cause.status === 422 && cause.outcome === 'rejected');
  assert.equal(module.nativeNavigationMarkerPending(liveScene).length, 0);
  responseFault = { before: () => { throw new Error('synthetic request state unknown, no commit observed'); },
    when: (method, route) => method === 'POST' && route.endsWith('/spatial-markers') };
  await assert.rejects(module.createNativeNavigationMarker(liveScene, node.id, facts, current), cause => cause.outcome === 'unknown');
  assert.equal((await module.verifyNativeNavigationMarkerPending(liveScene, current)).status, 'unknown', 'absence cannot prove a late CREATE will not commit');
  assert.equal(module.nativeNavigationMarkerPending(liveScene).length, 1);
  cases.push('definite 422 rejection releases reservation; transport unknown with no marker readback stays unknown rather than replaying a possibly late CREATE');

  const afterGraph = facade.core.repository.get(liveScene.projectId);
  for (const key of ['scopes', 'workspaces', 'artifacts', 'artifactRevisions', 'artifactViews', 'notes', 'collections', 'collectionMemberships', 'workspaceMemberships'])
    assert.deepEqual(afterGraph[key], before.graph[key], key + ' unchanged');
  assert.deepEqual(await facade.spatial.read(canvas.id), before.canvas);
  assert.deepEqual(await facade.spatial.read(childCanvas.id), before.childCanvas);
  assert.deepEqual(facade.core.repository.getProjectExecutionProjection(liveScene.projectId), before.execution);
  assert.ok(calls.every(call => /\/spatial-markers(?:\/[^/]+)?$|\/navigation\/resolve$/.test(call.route) || call.method === 'GET'));
  cases.push('all domain content, versions, workspaces/memberships, native saved canvas and execution projection unchanged; no model, task send or real runtime touched');
  const report={passed:true,cases,requests:calls.length,interleavings,runtime:'disposable Core and Huabu only',runningCoreRequests:0,models:0};await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({output,...report},null,2));
} catch(error) {await fs.writeFile(path.join(output,'report.json'),JSON.stringify({passed:false,cases,error:String(error.stack??error),runningCoreRequests:0,models:0},null,2));throw error;
} finally {
  await facade?.close(); globalThis.fetch = upstream;
  for (const key of Object.keys(process.env)) if (/^(?:LCOS_|LOCAL_CORE_|HUABU_|OPENAI_|ANTHROPIC_|GEMINI_|GOOGLE_API_|OPENROUTER_|DEEPSEEK_)/.test(key)) delete process.env[key];
  for (const [key, value] of envBefore) process.env[key] = value;
  const absolute = path.resolve(runtime);
  if (!absolute.startsWith(path.resolve(runtimeBase) + path.sep)) throw new Error('Unexpected fixture path.');
  await fs.rm(absolute, { recursive: true, force: true });
}
