import {useLcosDropStore} from '../../lcos/huabu/apps/web/src/lcos/lcosDropState';
import {useLcosShellStore} from '../../lcos/huabu/apps/web/src/lcos/shell/lcosShellStore';
import {semanticCarryTriggerFromPointer} from '../../lcos/huabu/apps/web/src/lcos/drop/rightCarry';
import {nativeLibraryEntry} from './native-library-entry';
import {nativeLibraryScopePreviewTargetId} from './native-library-scope-preview-drop';
import type {DropTargetRegistration} from '../../lcos/huabu/apps/web/src/lcos/drop/dropTypes';
import type {SemanticDropState} from '../../lcos/apps/web-gen2/src/interaction/semanticDropMachine';
import {nativeLibraryReadingRetains} from './native-library-reading-return';
import {nativeLibraryNavigationRetains} from './native-library-contexts';

export type NativePreviewDismissReason='pointer-outside'|'focus-outside'|'peer-open'|'hover-leave'|'viewer-open';
interface Read {readonly projectId:string|null;readonly state:SemanticDropState;readonly targets:readonly DropTargetRegistration[]}

/** Drop-only retention for an actual current Scope receiver. Viewer continuity
 * is handled separately below; idle background/explicit closure stays native. */
export function shouldRetainNativeLibraryPreview(detail:unknown,reason:NativePreviewDismissReason,event:unknown,read:Read):boolean {
  if(!read.projectId)return false;
  const entry=nativeLibraryEntry(detail,read.projectId),item=entry?.item;
  if(!entry||!item||(item.kind!=='context'&&item.kind!=='workflow'))return false;
  const targetId=nativeLibraryScopePreviewTargetId(entry.projectId,{kind:item.kind,id:item.entityRef.id});
  const receiver=read.targets.find(target=>target.targetId===targetId);
  if(!receiver||receiver.semantic.kind!=='spatial-membership'||receiver.semantic.targetRef.kind!==item.kind
    ||receiver.semantic.targetRef.id!==item.entityRef.id)return false;
  if(['tracking','dwell','preview','committing'].includes(read.state.status))return true;
  if(reason!=='pointer-outside'||!(event instanceof PointerEvent)||!event.isPrimary||event.pointerType!=='mouse')return false;
  const element=event.target instanceof Element?event.target:null;
  if(!element||element.closest('input,textarea,select,button,a,[contenteditable="true"]'))return false;
  // The original pointer owner has not crossed slop yet; recognize its same
  // trigger and actual source DOM, never arm a second drag state here.
  if(semanticCarryTriggerFromPointer(event)!==null)
    return !!element.closest('.react-flow__node.draggable, [data-native-gallery-carry]');
  // The original Library starts HTML drag from its existing draggable row.
  // A plain click on another row still opens that row and peer-closes this one.
  return event.button===0&&!event.altKey&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey
    &&!!element.closest('[draggable="true"]')&&!!element.closest('[data-library-view="library"]');
}

export function LCOSNativeLibraryPreviewRetain(detail:unknown,reason:NativePreviewDismissReason,event?:unknown):boolean {
  const projectId=useLcosShellStore.getState().projectId,entry=nativeLibraryEntry(detail,projectId??undefined);
  if(entry&&nativeLibraryReadingRetains(entry.projectId,entry.item.kind,entry.item.entityRef.id))return true;
  if(entry&&['focus-outside','peer-open','hover-leave'].includes(reason)&&nativeLibraryNavigationRetains(entry.projectId,entry.item.kind,entry.item.entityRef.id))return true;
  if(reason==='viewer-open')return false;
  // A linked Scope replaces the body of this same Zp/TS. Its current registered
  // receiver, rather than the original row's Scope, owns the existing gesture.
  let activeDetail=detail;
  if(entry&&typeof document!=='undefined'){
    const address=JSON.stringify([entry.projectId,entry.item.kind,entry.item.entityRef.id]);
    const host=[...document.querySelectorAll<HTMLElement>('[data-native-library-browse-root]')].find(element=>element.dataset.nativeLibraryBrowseRoot===address);
    const target=host?.querySelector<HTMLElement>('[data-native-library-scope-drop-target]');
    const kind=target?.dataset.nativeLibraryScopeDropKind,id=target?.dataset.nativeLibraryScopeDropTarget;
    if((kind==='context'||kind==='workflow')&&id)activeDetail={asset:{lcos_library_entry:{projectId:entry.projectId,
      item:{...entry.item,kind,entityRef:{type:kind,id}}}}};
  }
  const drop=useLcosDropStore.getState();return shouldRetainNativeLibraryPreview(activeDetail,reason,event,{
    projectId,state:drop.state,targets:drop.targets(),
  });
}
