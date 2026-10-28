import type { ConnectedConversationV1, RunCanvasProjection } from '../../lcos/packages/contracts/src/index';
import type { NativeScopeMember } from './native-library-scope-members';
import type { NativeMaterialViewRequest } from './native-material-viewer-port';
import type { NativeNoteViewRequest } from './native-note-viewer';
import type { NativeConversationViewRequest, NativeTaskViewRequest } from './native-task-route';
import { withNativeLibraryReadingReturn, type NativeLibraryReadingReturn } from './native-library-reading-return';

/** Read the original catalogues, retaining read failure separately from an
 * authoritative empty list. No alternate conversation or Run is substituted. */
export async function readNativeWorkflowRelatedMembers(projectId:string, client:{
  conversations:{listConnectedConversations(projectId:string,signal?:AbortSignal):Promise<readonly ConnectedConversationV1[]>};
  runs:{readExecutionProjection(projectId:string,signal?:AbortSignal):Promise<{projectId:string;runs:readonly RunCanvasProjection[]}>};
},signal?:AbortSignal){
  const [conversations,runs]=await Promise.all([
    client.conversations.listConnectedConversations(projectId,signal).then(value=>{
      if(!Array.isArray(value)||value.some(row=>row.projectId!==projectId))throw new Error('原对话列表来源未确认。');
      return value;
    }).catch(()=>null),
    client.runs.readExecutionProjection(projectId,signal).then(value=>{
      if(value?.projectId!==projectId||!Array.isArray(value.runs)||value.runs.some(row=>row.projectId!==projectId))throw new Error('原任务列表来源未确认。');
      return value.runs;
    }).catch(()=>null),
  ]);
  return{conversations,runs};
}

export type NativeWorkflowReadableMember=Extract<NativeScopeMember,{kind:'material'|'note'|'conversation'|'run'|'scope'|'collection'}>;
export function nativeWorkflowMemberReadable(member:NativeScopeMember):member is NativeWorkflowReadableMember{
  return['material','note','conversation','run','scope','collection'].includes(member.kind);
}
/** Dispatch addresses to the already-mounted original Viewer/chat/task owners.
 * The caller supplies their shared return lease, never another window. */
export function requestNativeWorkflowMember(projectId:string,member:NativeWorkflowReadableMember,lease:NativeLibraryReadingReturn,ports:{
  material(request:NativeMaterialViewRequest):unknown;note(request:NativeNoteViewRequest):unknown;
  conversation(request:NativeConversationViewRequest):boolean;task(request:NativeTaskViewRequest):boolean;
  library?(member:Extract<NativeScopeMember,{kind:'scope'|'collection'}>):void|Promise<void>;
}):void|Promise<void>{
  if(lease.projectId!==projectId||lease.closed||!lease.current())throw new Error('原方法入口已变化，请重新打开。');
  if(member.kind==='scope'||member.kind==='collection'){
    if(!ports.library)throw new Error('原资料库暂未就绪，请重新打开。');
    return ports.library(member);
  }else if(member.kind==='material'){
    if(member.target.projectId!==projectId)throw new Error('材料来源已变化，原输入保留。');
    ports.material(withNativeLibraryReadingReturn(member.target,lease));
  }else if(member.kind==='note')ports.note(withNativeLibraryReadingReturn({projectId,noteId:member.noteId,updatedAt:member.updatedAt,title:member.title},lease));
  else if(member.kind==='conversation'){
    if(!ports.conversation(withNativeLibraryReadingReturn({projectId,conversationId:member.conversationId},lease)))throw new Error('原对话暂时无法打开，原输入保留。');
  }else if(member.kind==='run'){
    if(!ports.task(withNativeLibraryReadingReturn({projectId,runId:member.runId},lease)))throw new Error('原任务暂时无法打开，原输入保留。');
  }else throw new Error('此成员的原入口尚未接入方法详情。');
}
