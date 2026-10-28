import { composerInputKey, type ComposerCaret } from '../../lcos/huabu/apps/web/src/lcos/composer/composerInputJourney';
import type { LcosComposerTarget } from '../../lcos/huabu/apps/web/src/lcos/shell/lcosShellStore';
import type { ConversationSendAttempt } from '../../lcos/huabu/apps/web/src/lcos/composer/conversationSendAttempt';
import { useLcosReferenceStore, type LcosNodeEntityRef } from '../../lcos/huabu/apps/web/src/lcos/lcosReferenceState';
import { createReferenceControllerState, type ReferenceControllerState } from '../../lcos/huabu/apps/web/src/lcos/referenceBridge';

export interface NativeComposerDraft {
  target: LcosComposerTarget;
  prompt: string;
  references: ReferenceControllerState<LcosNodeEntityRef>;
  caret: ComposerCaret | null;
}
type State={projectId:string|null;composerTarget:LcosComposerTarget|null;composerPrompt:string;composerCaret:ComposerCaret|null;
  composerInputDrafts?:ReadonlyMap<string,NativeComposerDraft>};
export function nativeComposerDraftKey(projectId:string|null,target:LcosComposerTarget|null):string|undefined {
  if(!projectId||!target)return;
  // A real conversation owns its draft across scenes. Canvas/nearfield inputs
  // retain the original precise input address (workspace, intent and receiver).
  return target.intent==='continue'&&target.receiverConversationId
    ? JSON.stringify([projectId,'conversation',target.receiverConversationId])
    : JSON.stringify([projectId,'input',composerInputKey(target)]);
}
const empty=()=>createReferenceControllerState<LcosNodeEntityRef>('canvas-draft');
export function rememberNativeComposerDraft(state:State):ReadonlyMap<string,NativeComposerDraft> {
  const drafts=new Map(state.composerInputDrafts??[]),key=nativeComposerDraftKey(state.projectId,state.composerTarget);
  if(key&&state.composerTarget){const references=useLcosReferenceStore.getState();
    drafts.set(key,{target:state.composerTarget,prompt:state.composerPrompt,caret:state.composerCaret,
      references:references.projectId===state.projectId?references.draft:drafts.get(key)?.references??empty()});
  }
  return drafts;
}

/** Part of the original Shell openComposer transition. ReferenceStore remains
 * the one active reference owner; the Shell holds only parked UI drafts. */
export function prepareNativeComposerDraft(state:State,target:LcosComposerTarget){
  const previous=nativeComposerDraftKey(state.projectId,state.composerTarget),next=nativeComposerDraftKey(state.projectId,target);
  if(!next)return{target,patch:{}};
  if(previous===next){
    const oldKey=composerInputKey(state.composerTarget),nextKey=composerInputKey(target),caret=state.composerCaret;
    return{target,patch:caret&&nextKey&&oldKey!==nextKey&&caret.targetKey===oldKey&&caret.text===state.composerPrompt
      ?{composerCaret:{...caret,targetKey:nextKey}}:{}};
  }
  const drafts=rememberNativeComposerDraft(state),saved=drafts.get(next);
  const references=useLcosReferenceStore.getState();
  if(state.projectId&&references.projectId!==state.projectId)references.setProject(state.projectId);
  // An unaddressed initial draft is adopted once. Switching an existing input
  // never carries its text/references into a different receiver implicitly.
  const refs=saved?.references??(previous===undefined?useLcosReferenceStore.getState().draft:empty());
  useLcosReferenceStore.setState({draft:refs,referencePickOwner:null});
  const restored=target.intent==='continue'&&saved?.target.intent==='continue'
    ? {...target,messageId:saved.target.messageId,continuationOperationId:saved.target.continuationOperationId}:target;
  const inputKey=composerInputKey(restored),caret=saved?.caret;
  return{target:restored,patch:{composerInputDrafts:drafts,
    composerPrompt:saved?.prompt??(previous===undefined?state.composerPrompt:''),
    composerCaret:caret&&state.projectId&&inputKey?{...caret,projectId:state.projectId,targetKey:inputKey}:null}};
}

export function nativeComposerDraftReferences(state:State,projectId:string,target:LcosComposerTarget){
  const key=nativeComposerDraftKey(projectId,target),active=nativeComposerDraftKey(state.projectId,state.composerTarget);
  const refs=useLcosReferenceStore.getState();
  if(key===active&&refs.projectId===projectId)return refs.draft.orderedEntityRefs;
  return key?state.composerInputDrafts?.get(key)?.references.orderedEntityRefs??[]:[];
}

/** A late confirmed send clears only the matching parked message, never the
 * new active draft. Unconfirmed sends retain their original retry ticket. */
export function clearNativeParkedComposerDraft(state:State,projectId:string,target:LcosComposerTarget,prompt:string,newMessageId:()=>string){
  const key=nativeComposerDraftKey(projectId,target);
  if(!key||key===nativeComposerDraftKey(state.projectId,state.composerTarget))return;
  const saved=state.composerInputDrafts?.get(key);
  if(!saved||saved.prompt.trim()!==prompt.trim()||target.intent==='continue'&&(
    saved.target.messageId!==target.messageId||saved.target.continuationOperationId!==target.continuationOperationId))return;
  const drafts=new Map(state.composerInputDrafts);
  drafts.set(key,{...saved,prompt:'',caret:null,target:target.intent==='continue'?{...saved.target,messageId:newMessageId()}:saved.target});
  return{composerInputDrafts:drafts};
}

/** An accepted message retires its identity even when the user has edited the
 * parked draft. Text/references remain untouched; an uncertain send never calls
 * this transition and keeps the original retry identity. */
export function settleNativeParkedComposerSend(state:State,attempt:ConversationSendAttempt,newMessageId:()=>string){
  const key=JSON.stringify([attempt.projectId,'conversation',attempt.input.conversationId]);
  const saved=state.composerInputDrafts?.get(key),target=saved?.target;
  if(!saved||target?.intent!=='continue'||target.receiverConversationId!==attempt.input.conversationId
    ||target.messageId!==attempt.input.messageId||target.continuationOperationId!==attempt.input.continuationOperationId)return;
  const messageId=newMessageId(),drafts=new Map(state.composerInputDrafts);
  drafts.set(key,{...saved,target:{...target,messageId}});
  return{messageId,patch:{composerInputDrafts:drafts}};
}
