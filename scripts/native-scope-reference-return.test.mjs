import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { currentGen2Root } from '../lab/current-gen2-resources.mjs';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';

const root = process.cwd(), output = path.join(root, 'output/混合Scope取用_20261022/原Scope芯片回程', new Date().toISOString().replaceAll(':', '-'));
await fs.mkdir(output, { recursive: true });
const report = { passed: false, checks: [], realBrowserVerified: false, networkRequests: 0, domainWrites: 0 };
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
try {
  // Execute the actual original-Library routing callback, including its graph
  // await, exact category/row key and cancellation checks. Same titles never
  // choose a sibling row or a separate method Gallery.
  const source=(await fs.readFile('lab/pilot/native-library-contexts.tsx','utf8')).replaceAll('\r\n','\n');
  const start=source.indexOf('openScope: async (scopeId:'),end=source.indexOf('\n      },\n      openEntry:',start);
  assert.ok(start>0&&end>start);
  const esbuild=createRequire(path.join(currentGen2Root,'package.json'))('esbuild');
  const compiled=await esbuild.transform('const route='+source.slice(start+'openScope: '.length,end+8)+';',{loader:'ts',format:'cjs'});
  function routeHarness(scopes,requested='workflow-exact',pendingQuery=false){
    const calls={rows:[],categories:[],spaces:[],search:[],open:0},owner={},rows=new Map(),gate=deferred(),api={};let alive=true;
    const latest={current:Object.fromEntries(['context','workflow'].map(kind=>[kind,{loading:false,source:{projectId:'p',canvasId:'canvas',api,query:'同名内容'}}]))};
    if(pendingQuery)for(const page of Object.values(latest.current)){page.source.query='之前的查询';page.loading=true}
    for(const scope of scopes)rows.set(JSON.stringify(['p',scope.kind,scope.id]),{canvasId:'canvas',open:()=>calls.rows.push(scope.id)});
    const env={value:owner,libraryListOwner:owner,projectId:'p',canvasId:'canvas',session:{http:{}},latest,useCanvasStore:{getState:()=>({rfInstance:api})},
      coreRequest:async()=>{await gate.promise;return {project:{id:'p'},scopes}},UserError:Error,
      NativeLibraryStore:{getState:()=>({activeSpace:'SPACE_TYPE_SHARED',setActiveSpace:async space=>calls.spaces.push(space),setSearchKeyword:name=>calls.search.push(name),open:()=>calls.open++})},
      setExpanded:next=>{calls.categories=next(calls.categories)},nativeLibraryCategoryId:(project,kind)=>JSON.stringify([project,kind]),libraryRowOwners:rows,
      requestAnimationFrame:callback=>{calls.frames=(calls.frames??0)+1;if(pendingQuery){assert.deepEqual(calls.rows,[]);for(const page of Object.values(latest.current)){page.source.query='同名内容';if(calls.frames>1)page.loading=false}}queueMicrotask(callback);return 1}};
    const route=new Function(...Object.keys(env),compiled.code+';return route;')(...Object.values(env));
    return {calls,gate,run:signal=>route(requested,()=>alive,signal),cancel:()=>alive=false};
  }
  const routeScopes=[{id:'workflow-wrong',projectId:'p',kind:'workflow',name:'同名内容'},{id:'workflow-exact',projectId:'p',kind:'workflow',name:'同名内容'},
    {id:'context-exact',projectId:'p',kind:'context',name:'同名内容'}];
  for(const [id,kind]of [['workflow-exact','workflow'],['context-exact','context']]){
    const h=routeHarness(routeScopes,id),pending=h.run();h.gate.resolve();await pending;
    assert.deepEqual(h.calls.rows,[id]);assert.deepEqual(h.calls.categories,[JSON.stringify(['p',kind])]);assert.deepEqual(h.calls.search,['同名内容']);assert.equal(h.calls.open,1);
  }
  const waiting=routeHarness(routeScopes,'workflow-exact',true),waitingOpen=waiting.run();waiting.gate.resolve();await waitingOpen;
  assert.equal(waiting.calls.frames,2);assert.deepEqual(waiting.calls.rows,['workflow-exact']);
  for(const scopes of [[{...routeScopes[1],projectId:'foreign'}],[routeScopes[1],routeScopes[1]],[{...routeScopes[1],kind:'collection'}]]){
    const h=routeHarness(scopes),pending=h.run();h.gate.resolve();await assert.rejects(pending,/内容已变化/);assert.equal(h.calls.open,0);assert.deepEqual(h.calls.rows,[]);
  }
  for(const mode of ['cancel','abort']){
    const h=routeHarness(routeScopes),controller=new AbortController(),pending=h.run(controller.signal);
    if(mode==='cancel')h.cancel();else controller.abort();h.gate.resolve();await assert.rejects(pending);assert.equal(h.calls.open,0);assert.deepEqual(h.calls.rows,[]);
  }
  report.checks.push('Actual Scope chip callback routes workflow/context into the same original private Library category and exact identity row, despite identical labels; stale-query/loading pages are not opened, and foreign/duplicate/unsupported/stale graph results open nothing.');
  await buildPilotEntry('lab/pilot/native-library-contexts.tsx', path.join(output, 'library.mjs'), 'node');
  await buildPilotEntry('lcos/huabu/apps/web/src/lcos/composer/composerInputJourney.ts', path.join(output, 'journey.mjs'), 'node');
  const { openNativeScopeReferenceView: open, cancelNativeScopeReferenceView: cancel, captureNativeLibraryInputReturn: capture,
    returnNativeLibraryInputReturn: returnInput } = await import(pathToFileURL(path.join(output, 'library.mjs')));
  const { composerInputKey } = await import(pathToFileURL(path.join(output, 'journey.mjs')));
  function harness() {
    const api = {}, target = { nodeId: 'conversation:exact', intent: 'continue', workspaceId: 'w', receiverConversationId: 'c', messageId: 'm1', continuationOperationId: 'o1' };
    const shell = { projectId: 'p', composerTarget: { ...target }, composerPrompt: '保持原输入正文', composerCaret: null,
      rememberComposerCaret(caret) { this.composerCaret = caret; }, resumeComposer(key) { events.resumes.push(key); return true; } };
    const canvas = { canvasId: 'canvas', rfInstance: api };
    const events = { opens: [], rows: [], closes: 0, resumes: [], focus: 0, notices: [], ranges: [] };
    let visible = true, onFrame;
    const editor = { isConnected: true, get value() { return shell.composerPrompt; }, set value(_) { throw new Error('No draft copying allowed.'); },
      selectionStart: 2, selectionEnd: 5, closest: () => null, getClientRects: () => visible ? [{}] : [],
      focus() { events.focus++; }, setSelectionRange(start, end) { events.ranges.push([start, end]); } };
    const inputPorts = { shell: () => shell, canvas: () => canvas, editor: () => editor, open: () => events.opens.push('original-composer'),
      frame: callback => { queueMicrotask(() => { onFrame?.(); callback(0); }); return 1; } };
    const owner = capture('p', inputPorts);
    let list = { projectId: 'p', canvasId: 'canvas', openScope: async (id, current) => { if (current()) events.rows.push(id); } };
    const current = old => shell.projectId === old.projectId && composerInputKey(shell.composerTarget) === old.inputKey
      && shell.composerTarget.messageId === old.messageId && shell.composerTarget.continuationOperationId === old.continuationOperationId
      && canvas.canvasId === old.canvasId && canvas.rfInstance === old.api;
    const ports = { capture: projectId => capture(projectId, inputPorts), current, openLibrary: old => events.opens.push(old.inputKey), list: () => list,
      frame: inputPorts.frame, timeoutMs: 100 };
    const request = { projectId: 'p', scopeId: 'scope', composerOriginKey: owner.inputKey, messageId: 'm1', continuationOperationId: 'o1' };
    return { shell, canvas, owner, events, ports, request, inputPorts, current, api,
      setList(value) { list = value; }, hide() { visible = false; }, show() { visible = true; }, onFrame(callback) { onFrame = callback; } };
  }
  let h = harness(); await open(h.request, h.ports); assert.deepEqual(h.events.rows, ['scope']);
  for (const change of [h => h.shell.projectId = 'other', h => h.shell.composerTarget.messageId = 'm2', h => h.shell.composerTarget.continuationOperationId = 'o2']) {
    h = harness(); change(h); await assert.rejects(open(h.request, h.ports), /原输入地址已变化/); assert.equal(h.events.rows.length, 0);
  }
  report.checks.push('Original Scope row is called once; same input key with another message, operation or project rejects before opening.');

  for (const invalidate of [h => h.shell.composerTarget.messageId = 'm2', h => h.shell.composerTarget.continuationOperationId = 'o2',
    h => h.canvas.canvasId = 'other', h => h.canvas.rfInstance = {}]) {
    h = harness(); const gate = deferred();
    h.setList({ projectId: 'p', canvasId: 'canvas', openScope: async (id, current) => { await gate.promise; if (current()) h.events.rows.push(id); } });
    const pending = open(h.request, h.ports); invalidate(h); gate.resolve();
    await assert.rejects(pending, error => error.name === 'AbortError'); assert.equal(h.events.rows.length, 0);
  }
  h = harness(); const gate = deferred(), abort = new AbortController(); let passedSignal;
  h.setList({ projectId: 'p', canvasId: 'canvas', openScope: async (id, current, signal) => { passedSignal = signal; await gate.promise; if (current()) h.events.rows.push(id); } });
  const aborted = open({ ...h.request, signal: abort.signal }, h.ports); abort.abort();
  await assert.rejects(aborted, error => error.name === 'AbortError'); assert.equal(passedSignal.aborted, true); gate.resolve(); await tick(); assert.equal(h.events.rows.length, 0);
  report.checks.push('Every late graph/row completion rechecks message, operation, canvas/API and the original inspection abort signal; stale reads never open a row.');

  h = harness(); const closeGate = deferred();
  h.setList({ projectId: 'p', canvasId: 'canvas', openScope: async (id, current) => { await closeGate.promise; if (current()) h.events.rows.push(id); } });
  const closing = open(h.request, h.ports); assert.equal(cancel('canvas', {}), false); assert.equal(cancel('canvas', h.api), true);
  await assert.rejects(closing, error => error.name === 'AbortError'); closeGate.resolve(); await tick(); assert.equal(h.events.rows.length, 0);
  h = harness(); const firstGate = deferred(); let first = true;
  h.setList({ projectId: 'p', canvasId: 'canvas', openScope: async (id, current) => { if (first) { first = false; await firstGate.promise; } if (current()) h.events.rows.push(id); } });
  const firstOpen = open(h.request, h.ports), firstFailure = assert.rejects(firstOpen, error => error.name === 'AbortError');
  await open({ ...h.request, scopeId: 'new-scope' }, h.ports); firstGate.resolve(); await firstFailure; await tick(); assert.deepEqual(h.events.rows, ['new-scope']);
  report.checks.push('Original Library close cancels only its exact canvas/API request; a second request supersedes the first without a duplicate late opening.');

  h = harness(); h.ports.timeoutMs = 5; const hung = deferred(); let lateSignal;
  h.setList({ projectId: 'p', canvasId: 'canvas', openScope: async (id, current, signal) => { lateSignal = signal; await hung.promise; if (current()) h.events.rows.push(id); } });
  await assert.rejects(open(h.request, h.ports), /打开尚未确认/); assert.equal(lateSignal.aborted, true); hung.resolve(); await tick(); assert.equal(h.events.rows.length, 0);
  h = harness(); let settled = false; const receiptGate = deferred();
  h.setList({ projectId: 'p', canvasId: 'canvas', openScope: async (id, current) => { await receiptGate.promise; if (current()) h.events.rows.push(id); } });
  const receipt = open({ ...h.request, isCurrent: () => !settled }, h.ports); settled = true; receiptGate.resolve();
  await assert.rejects(receipt, error => error.name === 'AbortError'); assert.equal(h.events.rows.length, 0);
  report.checks.push('Whole-operation deadline covers a hung graph await and aborts it; late receipts after port settlement cannot reopen Scope.');

  h = harness(); h.hide(); const notice = (message, retry) => h.events.notices.push({ message, retry });
  assert.equal(await returnInput(h.owner, () => h.events.closes++, notice, h.inputPorts), false);
  assert.equal(h.events.notices.length, 1); assert.equal(typeof h.events.notices[0].retry, 'function'); assert.equal(h.events.focus, 0);
  h.show(); h.events.notices[0].retry(); await tick(); assert.equal(h.events.focus, 1); assert.deepEqual(h.events.ranges, [[2, 5]]);
  assert.equal(h.shell.composerPrompt, '保持原输入正文');
  report.checks.push('A missing original textarea returns false visibly through the existing toast callback with retry; retry restores the same editor/caret without copying text.');

  h = harness(); h.hide(); const wrongNotice = (message, retry) => h.events.notices.push({ message, retry });
  assert.equal(await returnInput(h.owner, () => h.events.closes++, wrongNotice, h.inputPorts), false);
  h.shell.composerTarget.messageId = 'm2'; h.show(); h.events.notices[0].retry(); await tick();
  assert.equal(h.events.focus, 0); assert.equal(h.events.closes, 1); assert.equal(h.events.notices.at(-1).retry, undefined);
  report.checks.push('An old toast action cannot close/focus or copy a return address into a newer same-key message.');
  report.passed = true;
} catch (error) { report.error = { message: error.message, stack: error.stack }; process.exitCode = 1; }
await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, report: path.join(output, 'report.json') }, null, 2));
