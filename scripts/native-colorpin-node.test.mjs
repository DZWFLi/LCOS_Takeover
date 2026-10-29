import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';
import { parseOriginalDonorScript as parse } from '../lab/agent-node-transform.mjs';
import { transformNativeColorPinCourseScript as transform } from '../lab/native-colorpin-course-transform.mjs';

const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'output/原生ColorPin整合_20261017h');
await fs.mkdir(output, { recursive: true });
const temp = await fs.mkdtemp(path.join(root, '.runtime/native-colorpin-node-'));
const report = { passed: false, scope: 'actual original course action/read seams + production headless controller/model, controlled typed Core leaf; no candidate/Core/model', cases: [] };
try {
  const bundle = path.join(temp, 'controller.mjs'); await buildPilotEntry('lab/pilot/native-colorpin-controller.ts', bundle);
  const { createNativeColorPinController } = await import(pathToFileURL(bundle));
  const modelBundle = path.join(temp, 'model.mjs'); await buildPilotEntry('lab/pilot/native-colorpin-model.ts', modelBundle);
  const { projectNativePins } = await import(pathToFileURL(modelBundle));
  const file = 'course-api-base-url-CifxI1ia.js', original = await fs.readFile(path.join(root, 'reference/tapnow-installed/resources/web/assets', file), 'utf8');
  const changed = transform(file, original); assert.equal(transform(file, changed), changed); assert.equal(transform('other.js', original), original);
  const owners = source => new Map(parse(source, file).body.flatMap(node => node.type === 'FunctionDeclaration' ? [[node.id.name, node]]
    : node.type === 'VariableDeclaration' ? node.declarations.map(value => [value.id?.name, value]) : []));
  const before = owners(original), after = owners(changed), patched = new Set(['Dg', 'n5', 'Xie', 'Yie', 'pBe', 'Toe', 'Roe', 'Iie', 'Hie', 'Gie', 'Lie', 'jie']);
  for (const [name, node] of before) if (!patched.has(name)) assert.equal(changed.slice(after.get(name).start, after.get(name).end), original.slice(node.start, node.end), name + ' original owner stays byte-identical');
  assert.equal(await fs.readFile(path.join(root, 'reference/tapnow-installed/resources/web/assets', file), 'utf8'), original);
  report.cases.push('all non-seam original owners unchanged, including Mie/KT/Foe/Noe/Pie/Die/yBe/Oie focus/motion; transform parses/idempotent and vendor untouched');
  const evaluate = (name, source, declarations, env) => new Function(...Object.keys(env), 'return (' + source.slice(declarations.get(name).start, declarations.get(name).end).replace(/^function (\w+)/, 'function $1').replace(new RegExp('^' + name + '='), '') + ');')(...Object.values(env));
  let native = { managed: true, controlled: true, enabled: true, disabled: false, triggerDisabled: false, authoringPins: ['123ABC'], pinState: { pins: ['123ABC'], isPinned: true } };
  const jsx = (type, props) => ({ type, props }), hooks = { useMemo: callback => callback(), useCallback: callback => callback,
    useRef: current => ({ current }), memo: value => value };
  const itemEnv = { d: hooks, a: { jsx }, MF: () => false, Wie: () => ({ pinnable: true }), n5: () => ({ pins: ['shared-entity-pin'] }),
    Yie: () => ({ togglePinOnNode() {} }), Hie: 'OriginalHie', LCOSUseNativeColorPinNode: () => native, ii: () => ({ id: 'node', data: {} }), wL: () => false };
  const originalItem = evaluate('Dg', changed, after, itemEnv);
  let item = originalItem('node'); assert.equal(item.key, 'pin'); assert.equal(item.node.type, 'OriginalHie');
  assert.deepEqual(item.node.props.pins, ['123ABC'], 'Pressed dots are only this exact View; shared entity markers are not silently removed');
  native = { ...native, enabled: false }; assert.equal(originalItem('node'), null, 'No bound View, no newly exposed failed Pin item');
  report.cases.push('actual Dg retains one original Hie item; capability opens only exact View and pressed pins stay View-local');
  let localWrites = 0, coreCalls = 0, handled = true;
  const commandEnv = { d: hooks, _t: () => ({ getNodes: () => [{ id: 'node', type: 'text', data: { color_pins: [] } }],
    updateNodeData() { localWrites++; }, setNodes() { localWrites++; } }), wL: () => false, zie: () => 'text', pp: data => data.color_pins,
    Ioe: (pins, color) => [...pins, color], wM: (data, pins) => ({ ...data, color_pins: pins }), $ie() {}, Kie() {}, qie() {}, Loe: () => [],
    LCOSUseNativeColorPinCommands: () => ({ toggle() { if (handled) coreCalls++; return handled; }, clear() { return handled; } }) };
  const commands = evaluate('Yie', changed, after, commandEnv)(); commands.togglePinOnNode('node', '123ABC'); assert.equal(coreCalls, 1); assert.equal(localWrites, 0);
  handled = false; commands.togglePinOnNode('node', '4EA8FF'); assert.equal(localWrites, 1);
  report.cases.push('actual Yie consumes managed Core action before nodeData/setNodes; nonmanaged original command path retained');
  const fixture = () => {
    const makeNode = (id, view) => ({ id, type: 'text', data: { id, text: '保留正文', lcos_ref: { version: 1, entityType: 'view', entityId: view,
      artifactId: 'artifact', artifactViewId: view, revisionId: 'r1' } }, position: { x: 10, y: 20 } });
    const nodes = [makeNode('a', 'v1'), makeNode('b', 'v2')], scene = { projectId: 'p', canvasId: 'c', workspaceId: 'w', api: {}, nodes, surfaceRef: 'main' };
    const graph = { project: { id: 'p' }, scopes: [{ id: 'scope', projectId: 'p' }], artifacts: [{ id: 'artifact', projectId: 'p' }], artifactRevisions: [{ id: 'r1', artifactId: 'artifact' }],
      artifactViews: ['v1', 'v2'].map(id => ({ id, scopeId: 'scope', artifactId: 'artifact', revisionId: 'r1' })) };
    const bindings = nodes.map(node => ({ projectId: 'p', canvasId: 'c', spatialKind: 'node', spatialId: node.id, entityType: 'view', entityId: node.data.lcos_ref.artifactViewId }));
    let snapshot = { definitions: [{ id: 'custom', projectId: 'p', color: '#123ABC', label: '自定义色', createdAt: '0', updatedAt: '1' }], memberships: [] };
    let current = scene, mutationLost = false, failGet = false, pendingRead = null; const calls = [];
    const ports = { scene: () => current, facts: async () => { calls.push('GET'); if (pendingRead) await pendingRead; if (failGet) throw new Error('HTTP internals'); return structuredClone({ snapshot, graph, bindings }); },
      client: { async assign(project, input) { calls.push(['POST', input]); const definition = snapshot.definitions.find(d => d.id === input.colorPinId || d.color === input.color)
        ?? { id: 'blue', projectId: project, color: input.color, createdAt: '0', updatedAt: '1' }; if (!snapshot.definitions.some(d => d.id === definition.id)) snapshot.definitions.push(definition);
        const membership = { id: 'm' + snapshot.memberships.length, projectId: project, colorPinId: definition.id, targetRef: input.targetRef, createdAt: '0', updatedAt: '1' };
        snapshot.memberships.push(membership); if (mutationLost) throw new Error('committed response lost'); return { definition, membership }; },
        async removeMembership(project, id) { calls.push(['DELETE', id]); snapshot.memberships = snapshot.memberships.filter(member => member.id !== id); if (mutationLost) throw new Error('committed delete response lost'); return { deleted: true, membershipId: id }; },
        async renameDefinition(project, id, input) { calls.push(['PATCH', id, input]); const d = snapshot.definitions.find(d => d.id === id); d.label = input.label; d.updatedAt = '2'; return { definition: d }; } } };
    return { scene, graph, bindings, ports, calls, snapshot: () => snapshot, swapApi() { current = { ...scene, api: {} }; },
      lose(value) { mutationLost = value; }, failGet(value) { failGet = value; }, hold(value) { pendingRead = value; } };
  };
  let f = fixture(), controller = createNativeColorPinController(f.ports); await controller.refresh();
  assert.equal((await controller.toggleNode('a', '123ABC')).status, 'confirmed');
  assert.equal(f.snapshot().memberships[0].targetRef.id, 'v1'); assert.equal(f.snapshot().memberships[0].targetRef.kind, 'view');
  assert.deepEqual(controller.read().projection.byNode.get('b').pins, []);
  assert.ok(controller.read().projection.choices.some(choice => choice.id === '123ABC'));
  assert.equal(controller.read().projection.groups[0].count, 1);
  await controller.toggleNode('a', '4EA8FF'); assert.equal(controller.read().projection.byNode.get('a').pins.length, 2);
  await controller.toggleNode('a', '123ABC'); assert.deepEqual(controller.read().projection.byNode.get('a').pins, ['4EA8FF']);
  assert.equal(f.scene.nodes[0].data.text, '保留正文'); report.cases.push('production controller: exact View toggle, same Artifact other View unchanged, multi-color add/remove, custom colors and current node count preserved');
  f = fixture(); controller = createNativeColorPinController(f.ports); await controller.refresh(); f.lose(true);
  assert.equal((await controller.toggleNode('a', '123ABC')).status, 'unknown'); assert.equal(controller.read().needsCheck, true);
  assert.equal((await controller.toggleNode('a', '123ABC')).status, 'rejected'); const posts = f.calls.filter(c => Array.isArray(c) && c[0] === 'POST').length;
  f.failGet(true); assert.equal((await controller.verifyPending()).status, 'unknown'); assert.equal(controller.read().needsCheck, true);
  f.failGet(false); assert.equal((await controller.verifyPending()).status, 'confirmed'); assert.equal(controller.read().needsCheck, false);
  assert.equal(f.calls.filter(c => Array.isArray(c) && c[0] === 'POST').length, posts);
  assert.equal((await controller.toggleNode('a', '123ABC')).status, 'unknown'); const deletes = f.calls.filter(c => Array.isArray(c) && c[0] === 'DELETE').length;
  await controller.verifyPending(); assert.equal(f.calls.filter(c => Array.isArray(c) && c[0] === 'DELETE').length, deletes);
  report.cases.push('lost assign/delete commit: original target retained, same-scene toggle held, failed GET retains unknown, verification GET-only confirms no mutation replay');
  f = fixture(); controller = createNativeColorPinController(f.ports); await controller.refresh(); let release;
  f.hold(new Promise(resolve => release = resolve)); const operation = controller.toggleNode('a', '123ABC'); f.swapApi(); release();
  assert.equal((await operation).status, 'rejected'); assert.equal(f.calls.filter(c => Array.isArray(c)).length, 0);
  report.cases.push('API switches during preflight reject before mutation; no delayed Canvas write or projected marker adoption');
  f = fixture(); f.snapshot().memberships.push({ id: 'shared', projectId: 'p', colorPinId: 'custom', targetRef: { projectId: 'p', kind: 'entity', id: 'artifact' } });
  const projected = projectNativePins(f.scene, { snapshot: f.snapshot(), graph: f.graph, bindings: f.bindings });
  assert.equal(projected.groups[0].count, 2); assert.equal(projected.groups[0].sharedMembershipCount, 1); assert.deepEqual(projected.groups[0].membershipIds, ['shared']);
  controller = createNativeColorPinController(f.ports); await controller.refresh(); await controller.toggleNode('a', '123ABC');
  assert.ok(f.snapshot().memberships.some(member => member.id === 'shared')); assert.equal(f.snapshot().memberships.length, 2);
  assert.equal((await controller.clearCurrentGroup('custom', { expectedMembershipIds: ['shared'], expectedCanvasId: 'c', expectedApi: f.scene.api })).status, 'rejected');
  assert.equal(f.calls.filter(c => Array.isArray(c) && c[0] === 'DELETE').length, 0);
  report.cases.push('entity Pin reads both exact occurrences but is not rewritten/deleted by View toggle; clear rejects newly changed confirmation membership set');
  assert.ok(controller.read().message.includes('组内标记已变化'), 'Public precheck rejection goes to the existing visible notice owner');
  f = fixture(); controller = createNativeColorPinController(f.ports); await controller.refresh();
  assert.equal((await controller.renameDefinition({ definitionId: 'custom', label: '更新', expectedUpdatedAt: 'old', expectedLabel: null })).status, 'rejected');
  assert.ok(controller.read().message.includes('名称已更新')); assert.equal(f.calls.filter(c => Array.isArray(c) && c[0] === 'PATCH').length, 0);
  f.ports.client.renameDefinition = async () => { throw Object.assign(new Error('internal Core CAS failure ID'), { status: 409 }); };
  assert.equal((await controller.renameDefinition({ definitionId: 'custom', label: '更新', expectedUpdatedAt: '1', expectedLabel: '自定义色' })).status, 'rejected');
  assert.equal(controller.read().needsCheck, false); assert.ok(!controller.read().message.includes('ID'));
  assert.equal((await controller.toggleNode('a', '4EA8FF')).status, 'confirmed', 'Original CAS rejection must allow a new explicit valid operation');
  report.cases.push('precheck rename/clear rejection uses same visible notice; actual 4xx semantics reject without unknown hold, next explicit action works; internal reason not shown');
  f = fixture(); controller = createNativeColorPinController(f.ports); await controller.refresh();
  const originalRead = f.ports.facts; let holdNext = true, readEntered, releaseOld;
  const entered = new Promise(resolve => readEntered = resolve), gate = new Promise(resolve => releaseOld = resolve);
  f.ports.facts = async (...args) => { const snapshot = await originalRead(...args); if (holdNext) { holdNext = false; readEntered(); await gate; } return snapshot; };
  const background = controller.refresh(); await entered;
  assert.equal((await controller.toggleNode('a', '123ABC')).status, 'confirmed');
  releaseOld(); await background;
  assert.deepEqual(controller.read().projection.byNode.get('a').pins, ['123ABC'], 'An older background GET must not erase a newer confirmed Pin marker');
  report.cases.push('older in-flight background snapshot cannot overwrite a newly confirmed mutation readback');
  f = fixture(); controller = createNativeColorPinController(f.ports); await controller.refresh();
  const pendingRead = f.ports.facts; let holdUnknownRead = true, unknownReadEntered, releaseUnknownRead;
  const unknownEntered = new Promise(resolve => unknownReadEntered = resolve), unknownGate = new Promise(resolve => releaseUnknownRead = resolve);
  f.ports.facts = async (...args) => { const value = await pendingRead(...args); if (holdUnknownRead) { holdUnknownRead = false; unknownReadEntered(); await unknownGate; } return value; };
  const oldUnknown = controller.refresh(); await unknownEntered; f.lose(true);
  assert.equal((await controller.toggleNode('a', '123ABC')).status, 'unknown');
  releaseUnknownRead(); await oldUnknown;
  assert.equal(controller.read().needsCheck, true, 'Old GET cannot clear an unknown mutation');
  const mutationCount = f.calls.filter(c => Array.isArray(c)).length;
  assert.equal((await controller.verifyPending()).status, 'confirmed');
  assert.equal(f.calls.filter(c => Array.isArray(c)).length, mutationCount);
  assert.deepEqual(controller.read().projection.byNode.get('a').pins, ['123ABC']);
  report.cases.push('mutation unknown + old GET late keeps unknown hold; only explicit fresh GET checks saved exact relation, no mutation replay');
  f = fixture(); controller = createNativeColorPinController(f.ports); await controller.refresh();
  const originalAssign = f.ports.client.assign; let mutationEntered, releaseMutation;
  const sent = new Promise(resolve => mutationEntered = resolve), mutationGate = new Promise(resolve => releaseMutation = resolve);
  f.ports.client.assign = async (...args) => { const value = await originalAssign(...args); mutationEntered(); await mutationGate; return value; };
  const oldApiOperation = controller.toggleNode('a', '123ABC'); await sent; f.swapApi(); controller.sceneChanged();
  assert.equal(controller.read().busy, true, 'An old API in-flight mutation still owns this exact place');
  await controller.refresh(); assert.equal((await controller.toggleNode('a', '4EA8FF')).status, 'rejected');
  assert.equal(f.calls.filter(c => Array.isArray(c) && c[0] === 'POST').length, 1);
  releaseMutation(); assert.equal((await oldApiOperation).status, 'unknown');
  assert.equal(controller.read().needsCheck, true); await controller.verifyPending();
  assert.equal(controller.read().needsCheck, false); assert.deepEqual(controller.read().projection.byNode.get('a').pins, ['123ABC']);
  assert.equal(f.calls.filter(c => Array.isArray(c) && c[0] === 'POST').length, 1);
  report.cases.push('old API in-flight POST remains busy at the same project/Canvas/Workspace; replacement API cannot write a second mutation, fresh new-API GET alone confirms');
  f = fixture(); controller = createNativeColorPinController(f.ports); await controller.refresh(); f.lose(true);
  assert.equal((await controller.toggleNode('a', '123ABC')).status, 'unknown'); f.swapApi(); controller.sceneChanged(); await controller.refresh();
  assert.equal(controller.read().needsCheck, true, 'An already unknown attempt remains visible after same-place API replacement');
  assert.equal((await controller.toggleNode('a', '4EA8FF')).status, 'rejected');
  const samePlaceWrites = f.calls.filter(c => Array.isArray(c)).length;
  assert.equal((await controller.verifyPending()).status, 'confirmed');
  assert.equal(f.calls.filter(c => Array.isArray(c)).length, samePlaceWrites);
  assert.deepEqual(controller.read().projection.byNode.get('a').pins, ['123ABC']);
  report.cases.push('settled unknown survives same-place API replacement; replacement API checks the exact original target by GET only and does not resend');
  f = fixture(); controller = createNativeColorPinController(f.ports); await controller.refresh();
  const successfulAssign = f.ports.client.assign, successfulRead = f.ports.facts; let failReadback = false;
  f.ports.client.assign = async (...args) => { const value = await successfulAssign(...args); failReadback = true; return value; };
  f.ports.facts = async (...args) => { if (failReadback) { failReadback = false; throw Object.assign(new Error('Synthetic read authorization changed'), { status: 403 }); } return successfulRead(...args); };
  assert.equal((await controller.toggleNode('a', '123ABC')).status, 'unknown', 'A successful mutation followed by GET403 is not a rejected write');
  assert.equal(controller.read().needsCheck, true); const successfulWrites = f.calls.filter(c => Array.isArray(c)).length;
  assert.equal((await controller.verifyPending()).status, 'confirmed'); assert.equal(f.calls.filter(c => Array.isArray(c)).length, successfulWrites);
  report.cases.push('accepted mutation followed by readback 4xx remains unknown; only mutation-request explicit 4xx rejects, and later GET never resends');
  f = fixture(); controller = createNativeColorPinController(f.ports); await controller.refresh();
  const assignForQueue=f.ports.client.assign;let queueSent,queueRelease;
  const queueEntered=new Promise(resolve=>queueSent=resolve),queueGate=new Promise(resolve=>queueRelease=resolve);
  f.ports.client.assign=async(...args)=>{const value=await assignForQueue(...args);queueSent();await queueGate;return value;};
  const queueWrite=controller.toggleNode('a','123ABC');await queueEntered;
  const busyGets=f.calls.filter(call=>call==='GET').length;
  await Promise.all([controller.refresh(),controller.refresh(),controller.refresh()]);
  assert.equal(f.calls.filter(call=>call==='GET').length,busyGets,'Project notifications do not read over the original busy writer');
  f.snapshot().definitions[0].label='外部新名称';queueRelease();assert.equal((await queueWrite).status,'confirmed');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.calls.filter(call=>call==='GET').length,busyGets+2,'Original mutation readback plus exactly one deferred project GET');
  assert.equal(controller.read().projection.groups[0].label,'外部新名称');
  assert.equal(f.calls.filter(call=>Array.isArray(call)&&call[0]==='POST').length,1);
  report.cases.push('project notifications during an active original writer coalesce into one follow-up GET, preserve the exact View result and shared new label, and never replay the mutation');

  f=fixture();controller=createNativeColorPinController(f.ports);await controller.refresh();f.lose(true);
  assert.equal((await controller.toggleNode('a','123ABC')).status,'unknown');
  const checkRead=f.ports.facts;let checkEntered,checkRelease;
  const checkStarted=new Promise(resolve=>checkEntered=resolve),checkGate=new Promise(resolve=>checkRelease=resolve);
  let pauseCheck=true;
  f.ports.facts=async(...args)=>{const value=await checkRead(...args);if(pauseCheck){pauseCheck=false;checkEntered();await checkGate;}return value;};
  const checking=controller.verifyPending();await checkStarted;const checkGets=f.calls.filter(call=>call==='GET').length;
  await controller.refresh();await controller.refresh();f.snapshot().definitions[0].label='核对期间新名称';checkRelease();
  assert.equal((await checking).status,'confirmed');await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.calls.filter(call=>call==='GET').length,checkGets+1);assert.equal(controller.read().projection.groups[0].label,'核对期间新名称');
  assert.equal(f.calls.filter(call=>Array.isArray(call)&&call[0]==='POST').length,1);
  report.cases.push('project change during explicit pending verification is not lost: exactly one later GET reads the new shared label, without a second write or implicit retry');

  f=fixture();controller=createNativeColorPinController(f.ports);await controller.refresh();
  const staleAssign=f.ports.client.assign;let staleSent,staleRelease;
  const staleEntered=new Promise(resolve=>staleSent=resolve),staleGate=new Promise(resolve=>staleRelease=resolve);
  f.ports.client.assign=async(...args)=>{const value=await staleAssign(...args);staleSent();await staleGate;return value;};
  const staleWrite=controller.toggleNode('a','123ABC');await staleEntered;await controller.refresh();
  const getsBeforeReplacement=f.calls.filter(call=>call==='GET').length;f.swapApi();staleRelease();
  assert.equal((await staleWrite).status,'unknown');await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.calls.filter(call=>call==='GET').length,getsBeforeReplacement+1,'Only the existing readback runs; a queued old API refresh cannot migrate to the new owner');
  assert.equal(controller.read().needsCheck,true);assert.equal(f.calls.filter(call=>Array.isArray(call)&&call[0]==='POST').length,1);
  report.cases.push('queued old-API event is discarded on API replacement; the original unknown result remains explicitly checkable and is never auto-replayed');
  f=fixture();controller=createNativeColorPinController(f.ports);await controller.refresh();await controller.toggleNode('a','123ABC');
  const successfulMessage=controller.read().message;assert.equal(successfulMessage,'已添加颜色标记');await controller.refresh();assert.equal(controller.read().message,successfulMessage,'An equivalent project read keeps the original success announcement');
  f.snapshot().memberships.splice(0);await controller.refresh();assert.equal(controller.read().message,'');assert.deepEqual(controller.read().projection.byNode.get('a').pins,[]);
  await controller.toggleNode('a','123ABC');assert.equal(controller.read().message,successfulMessage);f.snapshot().definitions[0].label='Agent共享改名';f.snapshot().definitions[0].updatedAt='3';
  await controller.refresh();assert.equal(controller.read().message,'');assert.equal(controller.read().projection.groups[0].label,'Agent共享改名');
  assert.equal(f.calls.filter(call=>Array.isArray(call)&&call[0]==='PATCH').length,0);
  report.cases.push('changed authoritative membership/definition snapshot clears only an obsolete known-success notice; equivalent GET preserves it; external removal/rename never invokes a mutation');

  f=fixture();controller=createNativeColorPinController(f.ports);await controller.refresh();f.lose(true);await controller.toggleNode('a','123ABC');
  const unknownNotice=controller.read().message;assert.equal(controller.read().needsCheck,true);f.snapshot().memberships.splice(0);await controller.refresh();assert.equal(controller.read().needsCheck,true);assert.equal(controller.read().message,unknownNotice);
  f=fixture();controller=createNativeColorPinController(f.ports);await controller.refresh();await controller.toggleNode('a','123ABC');f.failGet(true);await controller.refresh();
  const errorNotice=controller.read().message;assert.match(errorNotice,/暂时无法读取/);f.failGet(false);f.snapshot().definitions[0].label='外部更新';await controller.refresh();assert.equal(controller.read().message,errorNotice);
  report.cases.push('unknown/pending and read-error notices survive changed project readback; only the prior known-success kind is cleared, no string blacklist and no implicit retry');
  f=fixture();controller=createNativeColorPinController(f.ports);await controller.refresh();
  const ackAssign=f.ports.client.assign;f.ports.client.assign=async(...args)=>{const receipt=structuredClone(await ackAssign(...args));f.snapshot().memberships.splice(0);return receipt;};
  assert.equal((await controller.toggleNode('a','123ABC')).status,'rejected');assert.equal(controller.read().needsCheck,false);assert.deepEqual(controller.read().projection.byNode.get('a').pins,[]);
  assert.equal(controller.read().message,'颜色标记刚有变化，已显示最新结果。');assert.equal(f.calls.filter(call=>Array.isArray(call)&&call[0]==='POST').length,1);
  report.cases.push('valid exact assign ACK followed by external deletion adopts the new empty snapshot, reports Changed, has no pending hold and never retries');

  f=fixture();controller=createNativeColorPinController(f.ports);await controller.refresh();await controller.toggleNode('a','123ABC');
  const oldMembership=structuredClone(f.snapshot().memberships[0]),ackRemove=f.ports.client.removeMembership;
  f.ports.client.removeMembership=async(...args)=>{const receipt=await ackRemove(...args);f.snapshot().memberships.push({...oldMembership,id:'new-external-membership'});return receipt;};
  assert.equal((await controller.toggleNode('a','123ABC')).status,'rejected');assert.equal(controller.read().needsCheck,false);
  assert.deepEqual(f.snapshot().memberships.map(row=>row.id),['new-external-membership']);assert.deepEqual(controller.read().projection.byNode.get('a').pins,['123ABC']);
  assert.equal(f.calls.filter(call=>Array.isArray(call)&&call[0]==='DELETE').length,1);assert.equal(controller.read().message,'颜色标记刚有变化，已显示最新结果。');
  report.cases.push('exact old-membership DELETE ACK followed by a new ID on the same target/color is Changed, never deletes the replacement and never says the current dot is gone');

  f=fixture();controller=createNativeColorPinController(f.ports);await controller.refresh();await controller.toggleNode('a','123ABC');
  f.ports.client.removeMembership=async(_project,id)=>{f.calls.push(['DELETE',id]);f.snapshot().memberships.splice(0);throw Object.assign(Error('already absent'),{status:404});};
  assert.equal((await controller.toggleNode('a','123ABC')).status,'confirmed');assert.equal(controller.read().needsCheck,false);assert.deepEqual(controller.read().projection.byNode.get('a').pins,[]);
  report.cases.push('original exact DELETE 404 is completed absence and is read back without an unknown hold or replay');

  f=fixture();controller=createNativeColorPinController(f.ports);await controller.refresh();await controller.toggleNode('a','123ABC');
  const restoredMember=structuredClone(f.snapshot().memberships[0]);
  f.ports.client.removeMembership=async(_project,id)=>{f.calls.push(['DELETE',id]);f.snapshot().memberships.splice(0);f.snapshot().memberships.push(restoredMember);throw Object.assign(Error('404 followed by Undo'),{status:404});};
  assert.equal((await controller.toggleNode('a','123ABC')).status,'rejected');assert.equal(controller.read().needsCheck,false);assert.deepEqual(controller.read().projection.byNode.get('a').pins,['123ABC']);
  assert.equal(f.calls.filter(call=>Array.isArray(call)&&call[0]==='DELETE').length,1);
  report.cases.push('completed DELETE 404 followed by restored same ID is Changed rather than permanent pending; restored current membership is not deleted again');

  f=fixture();controller=createNativeColorPinController(f.ports);await controller.refresh();const ackRename=f.ports.client.renameDefinition;
  f.ports.client.renameDefinition=async(...args)=>{const receipt=structuredClone(await ackRename(...args));f.snapshot().definitions[0].label='另一方的新名称';f.snapshot().definitions[0].updatedAt='3';return receipt;};
  assert.equal((await controller.renameDefinition({definitionId:'custom',label:'我的新名称',expectedUpdatedAt:'1',expectedLabel:'自定义色'})).status,'rejected');
  assert.equal(controller.read().needsCheck,false);assert.equal(controller.read().facts.snapshot.definitions[0].label,'另一方的新名称');assert.equal(controller.read().message,'颜色标记刚有变化，已显示最新结果。');
  assert.equal(f.calls.filter(call=>Array.isArray(call)&&call[0]==='PATCH').length,1);
  report.cases.push('valid exact rename ACK superseded by a later shared rename adopts the later label and releases the attempt without retrying or claiming the old name survived');

  f=fixture();controller=createNativeColorPinController(f.ports);await controller.refresh();const delayedAssign=f.ports.client.assign,readAfterAck=f.ports.facts;let failAfterAck=false;
  f.ports.client.assign=async(...args)=>{const receipt=await delayedAssign(...args);failAfterAck=true;return receipt;};
  f.ports.facts=async(...args)=>{if(failAfterAck){failAfterAck=false;throw Error('post-ACK GET unavailable');}return readAfterAck(...args);};
  assert.equal((await controller.toggleNode('a','123ABC')).status,'unknown');assert.equal(controller.read().needsCheck,true);f.snapshot().memberships.splice(0);
  assert.equal((await controller.verifyPending()).status,'confirmed');assert.equal(controller.read().needsCheck,false);assert.equal(controller.read().message,'颜色标记刚有变化，已显示最新结果。');
  assert.equal(f.calls.filter(call=>Array.isArray(call)&&call[0]==='POST').length,1);
  report.cases.push('valid ACK survives a failed post-read inside the original pending attempt; later GET sees supersession and checks it without another assign');

  f=fixture();controller=createNativeColorPinController(f.ports);await controller.refresh();const lostAssign=f.ports.client.assign;
  f.ports.client.assign=async(...args)=>{await lostAssign(...args);f.snapshot().memberships.splice(0);throw Error('no ACK delivered');};
  assert.equal((await controller.toggleNode('a','123ABC')).status,'unknown');assert.equal((await controller.verifyPending()).status,'unknown');assert.equal(controller.read().needsCheck,true);
  assert.equal(f.calls.filter(call=>Array.isArray(call)&&call[0]==='POST').length,1);
  report.cases.push('no assign ACK plus current absence remains unknown; a quiet read or verification cannot invent commit evidence or resend');

  f=fixture();controller=createNativeColorPinController(f.ports);await controller.refresh();const lostRename=f.ports.client.renameDefinition;
  f.ports.client.renameDefinition=async(...args)=>{await lostRename(...args);f.snapshot().definitions[0].label='后来的名称';throw Error('rename ACK lost');};
  assert.equal((await controller.renameDefinition({definitionId:'custom',label:'我的名称',expectedUpdatedAt:'1',expectedLabel:'自定义色'})).status,'unknown');
  assert.equal((await controller.verifyPending()).status,'unknown');assert.equal(controller.read().needsCheck,true);assert.equal(f.calls.filter(call=>Array.isArray(call)&&call[0]==='PATCH').length,1);
  report.cases.push('no rename ACK plus a different current label remains unknown and explicitly checkable, never auto-replayed');

  f=fixture();controller=createNativeColorPinController(f.ports);await controller.refresh();const badAssign=f.ports.client.assign;
  f.ports.client.assign=async(...args)=>{const receipt=structuredClone(await badAssign(...args));receipt.membership.targetRef.id='another-view';f.snapshot().memberships.splice(0);return receipt;};
  assert.equal((await controller.toggleNode('a','123ABC')).status,'unknown');assert.equal((await controller.verifyPending()).status,'unknown');assert.equal(controller.read().needsCheck,true);
  assert.equal(f.calls.filter(call=>Array.isArray(call)&&call[0]==='POST').length,1);
  report.cases.push('wrong exact-target ACK is not trusted as acceptance; current absence stays unknown and cannot clear the original safety hold');
  report.passed = true;
} catch (error) { report.error = String(error.stack ?? error); throw error; }
finally {
  await fs.writeFile(path.join(output, '节点原入口与headless回归.json'), JSON.stringify(report, null, 2));
  if (path.dirname(temp) === path.join(root, '.runtime') && path.basename(temp).startsWith('native-colorpin-node-')) await fs.rm(temp, { recursive: true, force: true });
}
console.log(JSON.stringify({ passed: report.passed, cases: report.cases.length, report: path.join(output, '节点原入口与headless回归.json') }));
