import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { currentGen2Root } from '../lab/current-gen2-resources.mjs';

const ts = createRequire(path.join(currentGen2Root, 'package.json'))('typescript');
const source = await fs.readFile('lab/pilot/native-library-contexts.tsx', 'utf8');
const file = ts.createSourceFile('actual-library.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
assert.equal(file.parseDiagnostics.length, 0);
function declaration(name) {
  const nodes = file.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === name
    || ts.isVariableStatement(node) && node.declarationList.declarations.some(value => value.name.getText(file) === name));
  assert.equal(nodes.length, 1, 'one actual declaration: ' + name);
  return nodes[0].getText(file).replace(/^export\s+/, '');
}
const journey = await fs.readFile('lcos/huabu/apps/web/src/lcos/composer/composerInputJourney.ts', 'utf8');
const journeyFile = ts.createSourceFile('actual-journey.ts', journey, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const inputKey = journeyFile.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'composerInputKey'); assert.ok(inputKey);
const actual = ['navigationOwner', 'libraryNavigation', 'navigationListeners', 'publishNavigation', 'sameNavigationScene',
  'captureNativeLibraryInputReturn', 'restoreOriginalLibrary', 'navigateNativeLibraryWorkspace', 'consumeNativeWorkspaceReturn',
  'enterNativeWorkspaceWithReturn', 'LCOSUseNativeLibraryNavigationBack', 'LCOSNativeLibraryNavigationOwner'].map(declaration).join('\n')
  + '\n' + inputKey.getText(journeyFile).replace(/^export\s+/, '');
const code = ts.transpileModule(actual, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React } }).outputText;
const tick = () => new Promise(resolve => setImmediate(resolve));
const checks = [];
function harness() {
  const projectId = 'p', rows = ['A', 'B', 'C', 'D'].map(name => ({ id: 'workspace-' + name, canvasId: 'canvas-' + name, projectId, scopeId: 'scope-' + name, name }));
  const target = (messageId, scene = 'B') => ({ nodeId: 'conversation-' + scene, intent: 'continue', workspaceId: 'workspace-' + scene, receiverConversationId: 'receiver-' + scene, messageId, continuationOperationId: 'continuation-' + messageId });
  const originalTarget = target('original');
  const references = Object.freeze([{ entityType: 'view', entityId: 'source-view', revisionId: 'exact-revision' }].map(Object.freeze));
  originalTarget.targetReferences = references;
  let prompt = '原方法子现场的草稿，中间光标保留', queued = false, selectMode = '', selectSideEffect, restoreSideEffect, sourceInputHeld = false, releaseSelection;
  const drafts = new Map([['B', { target: originalTarget, text: prompt, caret: null }], ['A', { target: target('original-A', 'A'), text: '原方法来源的草稿', caret: null }]]);
  const calls = { selects: [], viewport: [], resumes: [], carets: [], restored: 0, priorRestored: 0, conversation: [], promptWrites: 0 };
  const listeners = new Set(), timers = new Set(), frames = [];
  let apiSerial = 0;
  const api = () => ({ serial: ++apiSerial, getViewport: () => ({ x: 120, y: 150, zoom: .8 }) });
  const shell = { projectId, activeWorkspaceId: rows[1].id, composerTarget: originalTarget, composerCaret: null,
    rememberComposerCaret(value) { calls.carets.push(value); shell.composerCaret = value; },
    resumeComposer(key) { calls.resumes.push(key); return true; } };
  Object.defineProperty(shell, 'composerPrompt', { get: () => prompt, set: () => { calls.promptWrites++; throw Error('Bridge cannot write draft text'); } });
  const canvas = { status: 'ready', canvasId: rows[1].canvasId, rfInstance: api(),
    async setViewport(value, options) { calls.viewport.push({ value, options, canvasId: canvas.canvasId }); return true; } };
  const store = selector => selector(canvas); store.getState = () => canvas;
  store.subscribe = callback => { listeners.add(callback); return () => listeners.delete(callback); };
  const shellStore = selector => selector(shell); shellStore.getState = () => shell;
  let h, subscribed = false;
  function schedule() { if (!queued) { queued = true; queueMicrotask(() => { queued = false; mount(); }); } }
  function emit() { for (const callback of [...listeners]) callback(); schedule(); }
  const select = async ({ id }) => {
    calls.selects.push(id); selectSideEffect?.();
    if (selectMode === 'pause') await new Promise(resolve => { releaseSelection = resolve; });
    if (selectMode === 'fail') throw Error('Synthetic original select failure');
    if (selectMode === 'third') { canvas.canvasId = rows[3].canvasId; shell.activeWorkspaceId = rows[3].id; canvas.rfInstance = api(); emit(); return; }
    if (selectMode === 'project') { shell.projectId = 'other-project'; canvas.canvasId = rows[3].canvasId; emit(); return; }
    const row = rows.find(row => row.canvasId === id); assert.ok(row);
    const currentDraft = drafts.get(shell.activeWorkspaceId.replace('workspace-', ''));
    if (currentDraft && shell.composerTarget?.workspaceId === shell.activeWorkspaceId) {
      currentDraft.target = shell.composerTarget; currentDraft.text = prompt; currentDraft.caret = shell.composerCaret;
    }
    canvas.canvasId = row.canvasId; shell.activeWorkspaceId = row.id; canvas.rfInstance = api();
    const draft = drafts.get(row.name);
    shell.composerTarget = row.name === 'B' && sourceInputHeld ? null : draft?.target ?? null; prompt = draft?.text ?? ''; shell.composerCaret = draft?.caret ?? null;
    emit();
  };
  function mount() { if (h) h.owner({ canvasId: canvas.canvasId, onSelect: select, disabled: false }); }
  const editor = { isConnected: true, get value() { return prompt; }, selectionStart: 4, selectionEnd: 9 };
  const inputPorts = { shell: () => shell, canvas: () => canvas, editor: () => editor, open() {}, frame: callback => { frames.push(callback); return frames.length; } };
  const env = { useCanvasStore: store, useLcosShellStore: shellStore, inputReturnPorts: inputPorts,
    useSyncExternalStore(subscribe, snapshot) { if (!subscribed) { subscribed = true; subscribe(schedule); } return snapshot(); },
    useEffect(callback) { callback(); },
    createLcosCoreSession: () => ({ projects: { async getWorkspaces() { return rows; } } }),
    UserError: class UserError extends Error {}, nonEmpty: value => typeof value === 'string' && !!value.trim(),
    readNativeConversationSelection: () => ({ id: 'selection-B' }), restoreNativeConversationSelection: (...args) => calls.conversation.push(args),
    requestAnimationFrame: callback => { frames.push(callback); return frames.length; },
    setTimeout(callback, milliseconds) { const id = setTimeout(callback, milliseconds); timers.add(id); return id; },
    clearTimeout(id) { timers.delete(id); clearTimeout(id); },
    React: { createElement: (...args) => ({ args }) }, ArrowLeft: 'OriginalArrowLeft',
  };
  h = new Function(...Object.keys(env), code + '\nreturn {enter:enterNativeWorkspaceWithReturn,back:LCOSUseNativeLibraryNavigationBack,owner:LCOSNativeLibraryNavigationOwner,read:()=>libraryNavigation,set:publishNavigation,consume:consumeNativeWorkspaceReturn,restore:restoreOriginalLibrary,key:composerInputKey};')(...Object.values(env));
  const prior = { projectId, source: rows[0], destination: rows[1], root: { kind: 'workflow', id: 'method-original', title: '原方法' },
    phase: 'visiting', path: [{ key: 'scope:child-method', detail: '原子层级', scroll: 51, focus: 'member' }], query: '原方法搜索', expanded: ['workflow:parent'],
    listScroll: 74, viewport: { x: 8, y: 9, zoom: .6 }, input: null, conversation: null, caret: null };
  h.set(prior); mount();
  return { h, rows, shell, canvas, calls, prior, references,
    async drain() { for (let i = 0; i < 12; i++) { while (frames.length) frames.shift()(); await tick(); } },
    async enter(options = { preservePriorReturn: true }) { return h.enter(projectId, rows[2], { kind: 'navigation', id: 'marker-row', title: '固定目录' }, async () => { calls.restored++; restoreSideEffect?.(); }, options); },
    mode(value, sideEffect) { selectMode = value; selectSideEffect = sideEffect; },
    releaseSelection() { selectMode = ''; releaseSelection?.(); },
    onRestore(value) { restoreSideEffect = value; },
    holdSourceInput() { sourceInputHeld = true; },
    newInput(mode = 'both', scene = 'B') {
      const draft = drafts.get(scene), original = draft.target;
      let reading = { ...original, messageId: mode === 'operation' ? original.messageId : 'new-message', continuationOperationId: 'new-operation' };
      if (mode === 'message') reading.continuationOperationId = original.continuationOperationId;
      if (mode === 'address') reading = { ...reading, nodeId: 'new-conversation-' + scene, receiverConversationId: 'new-receiver' };
      draft.target = reading; this.editInput(scene, '用户在新输入中的最新草稿');
    },
    editInput(scene, text = '同一输入刚编辑的新内容，保留新光标') {
      const draft = drafts.get(scene); draft.text = text;
      draft.caret = { projectId, targetKey: h.key(draft.target), text, start: 2, end: 3 };
      if (shell.activeWorkspaceId === 'workspace-' + scene) {
        shell.composerTarget = draft.target; prompt = draft.text; shell.composerCaret = draft.caret;
      }
    },
    priorInput() {
      const draft = drafts.get('A'), inputKey = h.key(draft.target);
      prior.input = { projectId, inputKey, nodeId: draft.target.nodeId, messageId: draft.target.messageId,
        continuationOperationId: draft.target.continuationOperationId, canvasId: rows[0].canvasId, api: { originalA: true } };
      prior.caret = { projectId, targetKey: inputKey, text: draft.text, start: 5, end: 7 };
      prior.conversation = { id: 'selection-A' }; prior.returnToSource = async () => { calls.priorRestored++; };
    },
    move(scene, project = projectId) { shell.projectId = project; canvas.canvasId = 'canvas-' + scene; shell.activeWorkspaceId = 'workspace-' + scene; canvas.rfInstance = api(); emit(); },
    async startBack() { mount(); const header = h.back(canvas.canvasId); assert.ok(header, 'actual original HeaderBack'); header.onBack(); await tick(); },
    async back() { await this.startBack(); await this.drain(); },
    close() { for (const timer of timers) clearTimeout(timer); },
  };
}
const live = harness();
try {
  await live.enter(); await live.drain(); assert.equal(live.canvas.canvasId, live.rows[2].canvasId);
  const outward = live.h.read(); assert.equal(outward.priorReturn, live.prior);
  await live.back(); assert.equal(live.canvas.canvasId, live.rows[1].canvasId); assert.equal(live.h.read(), live.prior);
  assert.equal(live.calls.restored, 1); assert.deepEqual(live.prior.path, [{ key: 'scope:child-method', detail: '原子层级', scroll: 51, focus: 'member' }]);
  assert.deepEqual(live.calls.viewport[0].value, { x: 120, y: 150, zoom: .8 }); assert.equal(live.calls.viewport[0].options.duration, 0);
  assert.ok(live.calls.resumes.length); assert.deepEqual([live.shell.composerCaret.start, live.shell.composerCaret.end], [4, 9]);
  assert.equal(live.shell.composerPrompt, '原方法子现场的草稿，中间光标保留'); assert.equal(live.calls.promptWrites, 0);
  assert.equal(live.references[0].revisionId, 'exact-revision');
  assert.equal(live.shell.composerTarget.targetReferences, live.references, 'actual current input carries original exact reference array');
  assert.equal(live.h.back(live.rows[1].canvasId).title, '返回 原方法', 'one header returns one layer; prior method Back remains available');
  checks.push('actual enter + original Ke selection/arrival + original HeaderBack + source owner restoration returns C→B, then republishes the exact prior A→B frame, preserving hierarchy/list/camera/input/caret/reference state without text copies');
} finally { live.close(); }
for (const invalid of [
  frame => ({ ...frame, projectId: 'another-project' }), frame => ({ ...frame, phase: 'returning' }),
  frame => ({ ...frame, phase: 'restoring' }), frame => ({ ...frame, destination: { ...frame.destination, canvasId: 'wrong-canvas' } }),
  frame => ({ ...frame, destination: { ...frame.destination, id: 'wrong-workspace' } }),
]) {
  const test = harness(); try { test.h.set(invalid(test.prior)); await test.enter(); assert.equal(test.h.read().priorReturn, undefined); }
  finally { test.close(); }
}
const ordinary = harness(); try { await ordinary.enter(undefined); assert.equal(ordinary.h.read().priorReturn, ordinary.prior, 'harness default explicit opt-in'); }
finally { ordinary.close(); }
const noOption = harness(); try { await noOption.h.enter('p', noOption.rows[2], { kind: 'workflow', id: 'ordinary', title: '原默认入口' }, async () => {}); assert.equal(noOption.h.read().priorReturn, undefined); await noOption.back(); assert.equal(noOption.h.read(), null); }
finally { noOption.close(); }
checks.push('prior capture requires explicit option, same project, visiting phase and exact current destination Canvas+Workspace; ordinary callers retain the original single-frame default');
for (const invalid of [
  frame => { frame.projectId = 'another-project'; }, frame => { frame.phase = 'returning'; },
  frame => { frame.destination = { ...frame.destination, canvasId: 'wrong-canvas' }; },
  frame => { frame.destination = { ...frame.destination, id: 'wrong-workspace' }; },
]) {
  const test = harness(); try { await test.enter(); invalid(test.prior); await test.back(); assert.equal(test.h.read(), null, 'prior must remain valid at actual return, not only entry'); }
  finally { test.close(); }
}
checks.push('prior project, visiting phase and exact destination Workspace+Canvas are checked again after actual return; later-invalidated prior is never refilled');
const pendingSelection = harness();
try {
  pendingSelection.mode('pause'); const entering = pendingSelection.enter(); await tick();
  assert.equal(pendingSelection.canvas.canvasId, pendingSelection.rows[1].canvasId); assert.equal(pendingSelection.h.read()?.phase, 'visiting');
  pendingSelection.releaseSelection(); await entering; await pendingSelection.drain();
  pendingSelection.mode('pause'); await pendingSelection.startBack();
  assert.equal(pendingSelection.canvas.canvasId, pendingSelection.rows[2].canvasId); assert.equal(pendingSelection.h.read()?.phase, 'returning');
  pendingSelection.releaseSelection(); await pendingSelection.drain(); assert.equal(pendingSelection.h.read(), pendingSelection.prior);
} finally { pendingSelection.close(); }
checks.push('owner invalidation keeps legitimate source→destination and destination→source pending original selection; neither valid endpoint is mistaken for third-scene departure');
const failed = harness(); try { failed.mode('fail'); await assert.rejects(failed.enter()); assert.equal(failed.h.read(), failed.prior); assert.equal(failed.canvas.canvasId, failed.rows[1].canvasId); }
finally { failed.close(); }
for (const mode of ['project', 'third']) {
  const moved = harness(); try { moved.mode(mode); await assert.rejects(moved.enter()); await moved.drain(); assert.equal(moved.h.read(), null); assert.equal(moved.calls.restored, 0); }
  finally { moved.close(); }
}
const cancelled = harness(); try { await assert.rejects(cancelled.enter({ preservePriorReturn: true, isCurrent: () => false })); assert.equal(cancelled.calls.selects.length, 0); assert.equal(cancelled.h.read(), cancelled.prior); }
finally { cancelled.close(); }
checks.push('selection failure while still in B restores prior; explicit cancellation dispatches no selection; project switch or user third-scene navigation never resurrects prior or pulls back');
for (const mode of ['both', 'message', 'operation', 'address']) {
  const changedInput = harness();
  try {
    await changedInput.enter(); changedInput.newInput(mode); const caretsBefore = changedInput.calls.carets.length; await changedInput.back();
    assert.equal(changedInput.calls.resumes.length, 0, 'new input cannot resume old input: ' + mode);
    assert.equal(changedInput.calls.conversation.length, 0, 'new input cannot resume old conversation: ' + mode);
    assert.equal(changedInput.calls.carets.length, caretsBefore, 'new input cannot restore old caret: ' + mode);
    assert.deepEqual([changedInput.shell.composerCaret.start, changedInput.shell.composerCaret.end], [2, 3]);
    assert.equal(changedInput.shell.composerPrompt, '用户在新输入中的最新草稿'); assert.equal(changedInput.calls.promptWrites, 0);
    assert.equal(changedInput.shell.composerTarget.targetReferences, changedInput.references);
    assert.equal(changedInput.h.read(), changedInput.prior, 'valid GUI return chain survives independent input changes: ' + mode);
    assert.equal(changedInput.calls.restored, 1);
  } finally { changedInput.close(); }
}
checks.push('B input address, message-only and continuation-only changes preserve valid A→B GUI return while skipping stale B resume/conversation/caret; latest input text and selection stay untouched');
const failures = [];
for (const [label, text] of [['edited text', '同一输入刚编辑的新内容，保留新光标'], ['new selection, same text', '原方法子现场的草稿，中间光标保留']]) {
  const sameInput = harness();
  try {
    await sameInput.enter(); sameInput.editInput('B', text); const caretsBefore = sameInput.calls.carets.length; await sameInput.back();
    assert.equal(sameInput.h.read(), sameInput.prior); assert.equal(sameInput.calls.resumes.length, 1);
    if (sameInput.calls.carets.length !== caretsBefore || sameInput.shell.composerCaret.start !== 2 || sameInput.shell.composerCaret.end !== 3)
      failures.push({ scenario: 'same B input with ' + label, staleCaretRestored: sameInput.calls.carets.length !== caretsBefore,
        actualSelection: [sameInput.shell.composerCaret.start, sameInput.shell.composerCaret.end] });
    assert.equal(sameInput.shell.composerPrompt, text); assert.equal(sameInput.calls.promptWrites, 0);
  } finally { sameInput.close(); }
}
checks.push('same B input with edited text may resume through its original owner but never overwrites newer text or caret');
for (const mode of ['both', 'message', 'operation', 'address', 'same-input-edit', 'same-text-selection']) {
  const changedA = harness();
  try {
    changedA.priorInput(); await changedA.enter(); await changedA.back(); assert.equal(changedA.h.read(), changedA.prior);
    if (mode === 'same-input-edit') changedA.editInput('A');
    else if (mode === 'same-text-selection') changedA.editInput('A', '原方法来源的草稿'); else changedA.newInput(mode, 'A');
    const before = { resumes: changedA.calls.resumes.length, conversation: changedA.calls.conversation.length, carets: changedA.calls.carets.length };
    await changedA.back(); assert.equal(changedA.canvas.canvasId, changedA.rows[0].canvasId); assert.equal(changedA.h.read(), null);
    assert.equal(changedA.calls.priorRestored, 1, 'original A page returns independently from input owner');
    assert.equal(changedA.calls.resumes.length - before.resumes, mode.startsWith('same-') ? 1 : 0);
    assert.equal(changedA.calls.conversation.length - before.conversation, mode.startsWith('same-') ? 1 : 0);
    if (changedA.calls.carets.length !== before.carets || changedA.shell.composerCaret.start !== 2 || changedA.shell.composerCaret.end !== 3)
      failures.push({ scenario: 'later B→A with ' + mode, actualSelection: [changedA.shell.composerCaret.start, changedA.shell.composerCaret.end] });
    assert.equal(changedA.shell.composerPrompt, mode === 'same-input-edit' ? '同一输入刚编辑的新内容，保留新光标' : mode === 'same-text-selection' ? '原方法来源的草稿' : '用户在新输入中的最新草稿');
    assert.equal(changedA.calls.promptWrites, 0);
  } finally { changedA.close(); }
}
checks.push('later B→A restores original page but independently checks A input identity; new A input never resumes old A; same-input edits retain latest text and caret');
for (const mode of ['project', 'third']) {
  const duringRestore = harness();
  try {
    duringRestore.onRestore(() => {
      if (mode === 'project') duringRestore.shell.projectId = 'other-project';
      duringRestore.canvas.canvasId = duringRestore.rows[3].canvasId; duringRestore.shell.activeWorkspaceId = duringRestore.rows[3].id;
    });
    await duringRestore.enter(); await duringRestore.back();
    assert.equal(duringRestore.canvas.canvasId, duringRestore.rows[3].canvasId);
    const stale = duringRestore.h.read();
    if (stale) {
      duringRestore.onRestore(undefined); const previousRestores = duringRestore.calls.restored;
      duringRestore.move('B'); await duringRestore.drain();
      failures.push({ scenario: 'source restore callback left current ' + mode, stalePhase: stale.phase,
        autoRestoredOnLaterReturn: duringRestore.calls.restored > previousRestores, refilledOldPrior: duringRestore.h.read() === duringRestore.prior });
    }
  } finally { duringRestore.close(); }
}
for (const mode of ['project', 'third']) {
  const duringInput = harness();
  try {
    await duringInput.enter(); duringInput.holdSourceInput(); await duringInput.startBack();
    assert.equal(duringInput.h.read()?.phase, 'restoring');
    const before = duringInput.calls.restored;
    duringInput.move('D', mode === 'project' ? 'other-project' : 'p'); await duringInput.drain();
    if (duringInput.calls.restored !== before || duringInput.h.read()) failures.push({ scenario: 'source input awaiting readiness, user leaves ' + mode,
      staleCallbackInvoked: duringInput.calls.restored !== before, stalePhase: duringInput.h.read()?.phase });
  } finally { duringInput.close(); }
}
for (const mode of ['project', 'third']) {
  const whileVisiting = harness();
  try {
    await whileVisiting.enter(); whileVisiting.move('D', mode === 'project' ? 'other-project' : 'p'); await whileVisiting.drain();
    if (whileVisiting.h.read()) failures.push({ scenario: 'visiting C, user leaves ' + mode, stalePhase: whileVisiting.h.read().phase });
  } finally { whileVisiting.close(); }
}
assert.deepEqual(failures, [], 'GUI return must preserve current input/selection, dispose departed navigation frames and never invoke stale restoration');
checks.push('user leaves visiting scene, source-input wait or async restoration: no stale callback, restoring frame or automatic resurrection after later return');
for (const focus of [false, undefined, true]) {
  const focusedReturn = harness();
  try {
    await focusedReturn.enter({ preservePriorReturn: true, ...(focus === undefined ? {} : { restoreComposerFocus: focus }) });
    assert.equal(focusedReturn.h.read().restoreComposerFocus, focus, 'actual enter carries the optional focus choice to its frame');
    focusedReturn.editInput('B', '返回前同一输入的最新草稿');
    const caretsBefore = focusedReturn.calls.carets.length;
    await focusedReturn.back();
    assert.equal(focusedReturn.h.read(), focusedReturn.prior); assert.equal(focusedReturn.calls.restored, 1);
    assert.equal(focusedReturn.calls.resumes.length, focus === false ? 0 : 1, 'only explicit false hands focus to the original returned surface');
    assert.equal(focusedReturn.calls.conversation.length, 1, 'exact conversation selection is still restored without requesting input focus');
    assert.deepEqual([focusedReturn.shell.composerCaret.start, focusedReturn.shell.composerCaret.end], [2, 3]); assert.equal(focusedReturn.calls.carets.length, caretsBefore);
    assert.equal(focusedReturn.shell.composerPrompt, '返回前同一输入的最新草稿'); assert.equal(focusedReturn.calls.promptWrites, 0);
    assert.equal(focusedReturn.shell.composerTarget.targetReferences, focusedReturn.references);
  } finally { focusedReturn.close(); }
}
checks.push('explicit restoreComposerFocus=false preserves current exact input/conversation/caret/reference and same prior-return restoration while making zero Composer resume/focus requests; omitted/true keep original resume behavior');
for (const mode of ['message', 'operation', 'address']) {
  const replacedInput = harness();
  try {
    await replacedInput.enter({ preservePriorReturn: true, restoreComposerFocus: false }); replacedInput.newInput(mode);
    const caretsBefore = replacedInput.calls.carets.length;
    await replacedInput.back();
    assert.equal(replacedInput.h.read(), replacedInput.prior); assert.equal(replacedInput.calls.restored, 1);
    assert.equal(replacedInput.calls.resumes.length, 0); assert.equal(replacedInput.calls.conversation.length, 0);
    assert.equal(replacedInput.calls.carets.length, caretsBefore); assert.deepEqual([replacedInput.shell.composerCaret.start, replacedInput.shell.composerCaret.end], [2, 3]);
    assert.equal(replacedInput.shell.composerPrompt, '用户在新输入中的最新草稿'); assert.equal(replacedInput.calls.promptWrites, 0);
  } finally { replacedInput.close(); }
}
const failedFocusHandoff = harness();
try {
  failedFocusHandoff.mode('fail');
  await assert.rejects(failedFocusHandoff.enter({ preservePriorReturn: true, restoreComposerFocus: false }));
  assert.equal(failedFocusHandoff.h.read(), failedFocusHandoff.prior); assert.equal(failedFocusHandoff.calls.restored, 0);
  assert.equal(failedFocusHandoff.calls.resumes.length, 0); assert.equal(failedFocusHandoff.calls.promptWrites, 0);
} finally { failedFocusHandoff.close(); }
checks.push('focus handoff does not bypass message/continuation/address replacement or failed original selection protection, and never writes current draft text');
console.log(JSON.stringify({ passed: true, checks, scope: 'actual TypeScript declarations and original HeaderBack/Ke/return/input code; controlled session, stores, editor and navigation events; no files/runtime/business API/model writes' }, null, 2));
