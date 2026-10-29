import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),base='lcos/huabu/apps/web/src/lcos/';
const marker='/* original composer per-input draft continuity */';
function once(source,from,to){if(source.split(from).length!==2)throw new Error('Original Composer draft seam changed: '+from.slice(0,70));return source.replace(from,to)}
function adapt(source,kind,sourcePath){
  if(source.includes(marker))return source;let next=source.replaceAll('\r\n','\n');
  let helper=path.relative(path.dirname(sourcePath),path.join(root,'lab/pilot/native-composer-draft-state.ts')).replaceAll('\\','/');if(!helper.startsWith('.'))helper='./'+helper;
  if(kind==='shell'){
    next='import { prepareNativeComposerDraft, rememberNativeComposerDraft, clearNativeParkedComposerDraft, settleNativeParkedComposerSend, nativeComposerDraftKey, type NativeComposerDraft } from '+JSON.stringify(helper)+';\n'+next;
    next=once(next,'export interface LcosShellUiState {','export interface LcosShellUiState {\n  composerInputDrafts: ReadonlyMap<string, NativeComposerDraft>;');
    next=once(next,'export const useLcosShellStore = create<LcosShellUiState>((set, get) => ({','export const useLcosShellStore = create<LcosShellUiState>((set, get) => ({\n  composerInputDrafts: new Map(),');
    next=once(next,'    if (state.projectId === projectId) return state;','    if (state.projectId === projectId) return state;\n    const composerInputDrafts = rememberNativeComposerDraft(state);');
    next=once(next,"      composerPrompt: sameTabRestored?.composerPrompt ?? '',","      composerInputDrafts,\n      composerPrompt: sameTabRestored?.composerPrompt ?? '',");
    next=once(next,'    const next = new Map(state.conversationSendAttempts);\n    if (accepted) next.delete(key);','    const draftSettlement = accepted ? settleNativeParkedComposerSend(state,attempt,createComposerMessageId) : undefined;\n    const next = new Map(state.conversationSendAttempts);\n    if (accepted) next.delete(key);');
    next=once(next,'return { conversationSendAttempts: next, composerTarget: { ...state.composerTarget!, messageId: createComposerMessageId() } };','return { ...draftSettlement?.patch, conversationSendAttempts: next, composerTarget: { ...state.composerTarget!, messageId: draftSettlement?.messageId ?? createComposerMessageId() } };');
    next=once(next,'{ ...saved, composerTarget: { ...saved.composerTarget!, messageId: createComposerMessageId() } });','{ ...saved, composerTarget: { ...saved.composerTarget!, messageId: draftSettlement?.messageId ?? createComposerMessageId() } });');
    next=once(next,'    return { conversationSendAttempts: next };\n  }),\n  openComposer:','    return { ...draftSettlement?.patch, conversationSendAttempts: next };\n  }),\n  openComposer:');
    next=once(next,'  openComposer: (composerTarget) => set((state) => {','  openComposer: (composerTarget) => set((state) => {\n    const draftTransition = prepareNativeComposerDraft(state,composerTarget);\n    composerTarget = draftTransition.target;');
    next=once(next,'    return { composerOpen: true,','    return { ...draftTransition.patch, composerOpen: true,');
    next=once(next,'  clearSubmittedComposerPrompt: (projectId, target, prompt) => set((state) => {',`  clearSubmittedComposerPrompt: (projectId, target, prompt) => set((state) => {
    const parked = clearNativeParkedComposerDraft(state,projectId,target,prompt,createComposerMessageId);
    if (parked) {
      const saved = projectUiSessions.get(projectId);
      const draftKey = nativeComposerDraftKey(projectId,target);
      if (saved && draftKey && nativeComposerDraftKey(projectId,saved.composerTarget) === draftKey && saved.composerPrompt.trim() === prompt.trim())
        projectUiSessions.set(projectId,{...saved,composerPrompt:'',composerTarget:parked.composerInputDrafts.get(draftKey)?.target ?? saved.composerTarget});
      return parked;
    }`);
    next=once(next,'    projectUiSessions.clear();\n    set({','    projectUiSessions.clear();\n    set({\n      composerInputDrafts: new Map(),');
  }else if(kind==='composer'){
    next='import { nativeComposerDraftReferences } from '+JSON.stringify(helper)+';\n'+next;
    next=once(next,'  const referenceInputOwner = referencePickOwnerKey(projectId, composerTarget);',`  const referenceInputOwner = referencePickOwnerKey(projectId, composerTarget);
  // The existing input-operation map owns the pending request even when this
  // Composer unmounts or moves to a different input. Precise input addresses
  // keep two task targets in the same visible panel independent.
  const referenceSendingOwner = referenceInputOwner;
  const referenceSendingInput = composerInputKey(composerTarget);
  const submittingInput = useLcosReferenceStore((s) => [...s.referenceInputOperations.values()]
    .some((operation) => operation.owner === referenceSendingOwner && operation.kind === 'sending'
      && (operation.inputKey === undefined || operation.inputKey === referenceSendingInput)));`);
    next=once(next,'  const canSubmit = !preparingReferences &&','  const canSubmit = !preparingReferences && !submittingInput &&');
    next=once(next,"    const submittingOwner = referencePickOwnerKey(projectId, liveShell.composerTarget);\n    if (submittingOwner === undefined || [...liveReferences.referenceInputOperations.values()]\n      .some((operation) => operation.owner === submittingOwner && operation.kind === 'preparing')) return;",`    const submittingOwner = referencePickOwnerKey(projectId, liveShell.composerTarget);
    const sendingInput = composerInputKey(liveShell.composerTarget);
    if (submittingOwner === undefined || [...liveReferences.referenceInputOperations.values()]
      .some((operation) => operation.owner === submittingOwner && operation.kind === 'preparing'
        || operation.owner === submittingOwner && operation.kind === 'sending'
          && (operation.inputKey === undefined || operation.inputKey === sendingInput))) return;`);
    next=once(next,"liveReferences.beginReferenceInputOperation(submittingOwner, 'sending')","liveReferences.beginReferenceInputOperation(submittingOwner, 'sending', sendingInput)");
    next=once(next,'  }, [presentationKey]);','  }, [projectId, inputKey]);');
    next=once(next,'        && shell.composerOpen && shell.composerTarget === composerTarget;',`        && shell.composerOpen && composerInputKey(shell.composerTarget) === composerInputKey(composerTarget)
        && (!isContinuation || shell.composerTarget?.messageId === composerTarget.messageId
          && shell.composerTarget?.continuationOperationId === composerTarget.continuationOperationId);`);
    next=once(next,"      state={state === 'submitting' ? 'sending'","      state={state === 'submitting' || submittingInput ? 'sending'");
    next=once(next,"      submitTitle={preparingReferences ? '正在准备材料引用…'","      submitTitle={submittingInput ? '当前输入正在提交…' : preparingReferences ? '正在准备材料引用…'");
    next=once(next,'          || preparingReferences || materialNotice','          || submittingInput || preparingReferences || materialNotice');
    next=once(next,"              {state === 'submitting' && <div data-feedback-tone=\"loading\">提交中…</div>}","              {(state === 'submitting' || submittingInput) && <div data-lcos-composer-submitting data-feedback-tone=\"loading\">提交中…</div>}");
    next=once(next,'const currentRefs = buildSelectedContextReferences(useLcosReferenceStore.getState().draft.orderedEntityRefs);','const currentRefs = buildSelectedContextReferences(nativeComposerDraftReferences(useLcosShellStore.getState(), projectId, composerTarget));');
    next=once(next,'if (!sendAttempt || (useLcosReferenceStore.getState().projectId === projectId\n            && JSON.stringify(currentRefs.orderedReferences)', 'if (!sendAttempt || (JSON.stringify(currentRefs.orderedReferences)');
  }else if(kind==='references'){
    next=once(next,"referenceInputOperations: ReadonlyMap<symbol, { readonly owner: string; readonly kind: 'preparing' | 'sending' }>;","referenceInputOperations: ReadonlyMap<symbol, { readonly owner: string; readonly kind: 'preparing' | 'sending'; readonly inputKey?: string }>;");
    next=once(next,"beginReferenceInputOperation(owner: string, kind: 'preparing' | 'sending'): symbol;","beginReferenceInputOperation(owner: string, kind: 'preparing' | 'sending', inputKey?: string): symbol;");
    next=once(next,'  beginReferenceInputOperation: (owner, kind) => {','  beginReferenceInputOperation: (owner, kind, inputKey) => {');
    next=once(next,'      next.set(token, { owner, kind });','      next.set(token, { owner, kind, ...(inputKey === undefined ? {} : { inputKey }) });');
    next=once(next,'      projectId,\n      referencePickOwner: null,\n      referenceInputOperations: new Map(),',`      projectId,
      referencePickOwner: null,
      // A pending HTTP request outlives a project switch. Its original token
      // remains releasable; preparing work and picker ownership still reset.
      referenceInputOperations: new Map([...state.referenceInputOperations].filter(([, operation]) => operation.kind === 'sending')),`);
  }
  return next+'\n'+marker;
}
export function withNativeComposerDraftTransforms(existing={}){const next={...existing};for(const[kind,file]of [['shell',base+'shell/lcosShellStore.ts'],['composer',base+'composer/LcosComposerHost.tsx'],['references',base+'lcosReferenceState.ts']]){
  const prior=next[file];next[file]=(source,options)=>adapt(prior?prior(source,options):source,kind,options.sourcePath);
}return next;}
