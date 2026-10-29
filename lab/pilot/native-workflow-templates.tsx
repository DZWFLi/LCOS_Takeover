import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type MouseEvent } from 'react';
import { CoreAssemblyClient } from '../../lcos/apps/web-gen2/src/backend/assembly';
import { coreRequest } from '../../lcos/apps/web-gen2/src/backend/coreTypes';
import { createLcosCoreSession } from '../../lcos/huabu/apps/web/src/lcos/app/lcosCoreClient';
import { useLcosShellStore } from '../../lcos/huabu/apps/web/src/lcos/shell/lcosShellStore';
import { useLcosReferenceStore } from '../../lcos/huabu/apps/web/src/lcos/lcosReferenceState';
import { composerInputKey } from '../../lcos/huabu/apps/web/src/lcos/composer/composerInputJourney';
import { referencePickOwnerKey } from '../../lcos/huabu/apps/web/src/lcos/referencePickOwnership';
import { buildWorkflowMethodDraft, type WorkflowMethodDraft } from '../../lcos/huabu/apps/web/src/lcos/surfaces/workflow/workflowMethodDraft';
import { appendWorkflowMethodDraft } from '../../lcos/huabu/apps/web/src/lcos/surfaces/workflow/workflowMethodTake';
import type { PresentationViewV0, WarehouseItemV1 } from '../../lcos/packages/contracts/src/index';
import useCanvasStore from './native-canvas-port';
import { nativeLibraryEntryAssets, nativeLibraryMethodText, captureNativeLibraryInputReturn, restoreNativeLibraryInputReturn, enterNativeWorkspaceWithReturn, nativeWorkspaceSourceRestoring, requestNativeLibraryMemberView } from './native-library-contexts';
import './native-workflow-templates.css';
import { workflowEditableViews } from './native-workflow-method-editor';
import { workflowMaterialCatalog, type WorkflowMaterial } from './native-workflow-materials';
import { nativeLibraryScopeMembers, type NativeScopeMember } from './native-library-scope-members';
import { nativeMaterialViewerAvailable, requestNativeMaterialView } from './native-material-viewer-port';
import { cancelNativeLibraryReadingReturn, type NativeLibraryReadingReturn } from './native-library-reading-return';
import { requestNativeNoteView } from './native-note-viewer';
import { requestNativeConversationView, requestNativeTaskView } from './native-task-route';
import { readNativeConversationSelection, restoreNativeConversationSelection } from './native-conversation-selection';
import { nativeWorkflowMemberReadable, readNativeWorkflowRelatedMembers, requestNativeWorkflowMember } from './native-workflow-member-reading';

type Owner = { projectId: string; canvasId: string; api: unknown };
type Method = { owner: Owner; item: WarehouseItemV1; draft: WorkflowMethodDraft; text: string; graphVersion: number; presentations: readonly PresentationViewV0[]; materials: WorkflowMaterial[]; members: readonly NativeScopeMember[]; workspaces?:readonly {id:string;name:string}[]; create?: boolean; archivedAt?:string; lifecycleVersion?:number };
type Template = { id: string; name: string; title: string; description: string; preview_image: string; cover_media_type: 'image'; lcos_method: Method };
const session = () => createLcosCoreSession();
const sameOwner = (owner: Owner) => useLcosShellStore.getState().projectId === owner.projectId
  && useCanvasStore.getState().canvasId === owner.canvasId && useCanvasStore.getState().rfInstance === owner.api;
const xml = (text: string) => text.replace(/[<>&"']/g, value => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;', "'":'&apos;' }[value]!));
function cover(text: string): string {
  const lines = text.split('\n').filter(line => line.trim()).slice(0, 5);
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240" viewBox="0 0 320 240"><rect width="320" height="240" rx="16" fill="#f3f5f2"/><g fill="#303b36" font-family="sans-serif" font-size="14">${lines.map((line, index) => `<text x="22" y="${36 + index * 37}">${xml(line.length > 18 ? line.slice(0, 18) + '…' : line)}</text>`).join('')}</g></svg>`);
}
async function readMethods(owner: Owner, items: readonly WarehouseItemV1[], signal?: AbortSignal): Promise<Template[]> {
  nativeLibraryEntryAssets(owner.projectId, 'workflow', items);
  const client = session();
  const [graph, presentations, related] = await Promise.all([client.projects.getProjectGraph(owner.projectId),
    coreRequest<readonly PresentationViewV0[]>(client.http, 'GET', `/projects/${encodeURIComponent(owner.projectId)}/presentations`, { signal }),
    readNativeWorkflowRelatedMembers(owner.projectId,client,signal)]);
  if (!graph || signal?.aborted) throw new Error('方法暂时没有读完，请重新读取。');
  return items.map(item => {
    const scope=graph.scopes.find(scope=>String(scope.id)===item.entityRef.id) as {name:string;archivedAt?:string;lifecycleVersion?:number}|undefined;
    const title=scope?.name??item.title;
    item={...item,title};
    const draft = buildWorkflowMethodDraft(owner.projectId, item.entityRef.id, graph, presentations);
    const text = nativeLibraryMethodText(owner.projectId, item, graph, presentations);
    const members=nativeLibraryScopeMembers(owner.projectId,item,graph,presentations,graph.workspaces,related.conversations,related.runs);
    return { id: item.entityRef.id, name: title, title, preview_image: cover(text), cover_media_type: 'image',
      description: scope?.archivedAt ? '已从方法库移除。步骤、材料、工作现场和历史引用保留，恢复后可继续使用。' : draft.status === 'ready' ? `完整方法及关联内容会加入当前输入，步骤仍可编辑。${members.length ? `关联 ${members.length} 项内容，可逐项查看。` : '暂未关联内容。'}` : '这份方法尚未准备好可取用的步骤或材料。',
      lcos_method: { owner, item, draft, text, materials:workflowMaterialCatalog(graph), members,
        workspaces:graph.workspaces.filter(w=>w.scopeId===item.entityRef.id).map(w=>({id:String(w.id),name:w.name})), archivedAt:scope?.archivedAt,lifecycleVersion:scope?.lifecycleVersion??0,graphVersion: Number(graph.graphVersion), presentations: presentations.filter(view=>view.scopeId===item.entityRef.id&&view.capability==='workflow') } };
  });
}

/** The existing template views own their navigation. This hook supplies only
 * Core rows and cursors; it never opens another library or stores a second method. */
function useRows(search: string, scopeLifecycle:'active'|'archived'='active') {
  const queryKey=scopeLifecycle+':'+search;
  const projectId = useLcosShellStore(state => state.projectId), canvasId = useCanvasStore(state => state.canvasId), api = useCanvasStore(state => state.rfInstance);
  const owner = useMemo(() => projectId && canvasId && api ? { projectId, canvasId, api } : null, [projectId, canvasId, api]);
  const [state, setState] = useState<{ owner: Owner | null; search: string; rows: Template[]; loading: boolean; nextCursor?: string; error?: string }>({ owner: null, search: '', rows: [], loading: true });
  const request = useRef<AbortController | null>(null), stateRef = useRef(state); stateRef.current = state;
  const load = useCallback(async (more = false) => {
    if (!owner) return;
    const previous = stateRef.current;
    if (more && (previous.loading || previous.owner !== owner || previous.search !== queryKey || !previous.nextCursor)) return;
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    const rows = more ? previous.rows : [];
    setState({ owner, search:queryKey, rows, loading: true, nextCursor: more ? previous.nextCursor : undefined });
    try {
      const client = session(), page = await new CoreAssemblyClient(client.http).queryWarehouse(owner.projectId,
        { kinds: ['workflow'], search, limit: 100, cursor: more ? previous.nextCursor : undefined, ...{scopeLifecycle} }, controller.signal);
      if (page.projectId !== owner.projectId || page.schemaVersion !== 1 || !Array.isArray(page.items)) throw new Error('Invalid method page');
      const next = page.items.length ? await readMethods(owner, page.items, controller.signal) : [];
      if (controller.signal.aborted || !sameOwner(owner)) return;
      const combined = [...rows];
      for (const row of next) { const index = combined.findIndex(item => item.id === row.id); if (index < 0) combined.push(row); else combined[index] = row; }
      setState({ owner, search:queryKey, rows: combined, loading: false, nextCursor: page.nextCursor });
    } catch {
      if (!controller.signal.aborted && sameOwner(owner)) setState({ owner, search:queryKey, rows, loading: false,
        nextCursor: more ? previous.nextCursor : undefined, error: '方法暂时没读到，请重新读取。' });
    }
  }, [owner, search, scopeLifecycle]);
  useEffect(() => { void load(); return () => request.current?.abort(); }, [load]);
  useEffect(()=>{const refresh=()=>{void load()};window.addEventListener('lcos-native-methods-changed',refresh);return()=>window.removeEventListener('lcos-native-methods-changed',refresh)},[load]);
  const current = state.owner === owner && state.search === queryKey;
  return { rows: current ? state.rows : [], loading: !!owner && (!current || state.loading), error: current ? state.error : undefined,
    hasMore: current && !state.error && !!state.nextCursor, refresh: useCallback(() => { void load(); }, [load]), more: useCallback(() => { void load(true); }, [load]) };
}

export async function takeNativeWorkflowTemplate(template: Template, current: () => boolean = () => true): Promise<() => Promise<boolean>> {
  const method = template?.lcos_method;
  if (!method || !current() || !sameOwner(method.owner)) throw new Error('现场已切换，请重新打开这份方法。');
  const { owner, item } = method, shell = useLcosShellStore.getState(), target = shell.composerTarget;
  const input = captureNativeLibraryInputReturn(owner.projectId), key = composerInputKey(target), referenceOwner = referencePickOwnerKey(owner.projectId, target);
  if (!input || !key || !referenceOwner || !target) throw new Error('先打开要使用这份方法的对话输入。');
  const refs = useLcosReferenceStore.getState();
  const busy = () => [...useLcosReferenceStore.getState().referenceInputOperations.values()].some(value => value.owner === referenceOwner && value.kind === 'sending');
  if (busy()) throw new Error('这条消息正在发送，稍后再加入方法。');
  const token = refs.beginReferenceInputOperation(referenceOwner, 'preparing');
  try {
    const [fresh] = await readMethods(owner, [item]).catch(() => { throw new Error('方法暂时没读到，原输入保留。'); });
    const after = useLcosShellStore.getState().composerTarget;
    if (!current() || !sameOwner(owner) || composerInputKey(after) !== key || after?.messageId !== target.messageId
      || after?.continuationOperationId !== target.continuationOperationId || busy()) throw new Error('原输入已变化，方法没有加入其他消息。');
    const next = fresh.lcos_method;
    if(next.archivedAt)throw new Error('方法已移除，恢复后可继续使用。');
    if (next.draft.status !== 'ready') throw new Error('方法的步骤或材料尚未准备好，原输入保留。');
    if (JSON.stringify(next.draft) !== JSON.stringify(method.draft) || next.text !== method.text
      || JSON.stringify(next.presentations) !== JSON.stringify(method.presentations))
      throw new Error('方法已更新，请重新读取后再使用；原输入保留。');
    appendWorkflowMethodDraft({ ...next.draft, prompt: next.text }, owner.projectId, key);
    return () => restoreNativeLibraryInputReturn(input);
  } finally { useLcosReferenceStore.getState().finishReferenceInputOperation(token); }
}

export function LCOSUseNativeWorkflowTemplates() {
  const [query, setQuery] = useState(''), data = useRows(query), busy = useRef(false), epoch = useRef(0);
  useEffect(() => () => { epoch.current++; }, []);
  const rows = data.rows.map(raw => ({ raw, title: raw.name, src: raw.preview_image }));
  return { activeTab: 'public', switchTab: () => {}, publicTemplates: rows, publicLoading: data.loading, publicTemplatesLoaded: !data.loading,
    publicTemplatesHasMore: data.hasMore, loadMorePublicTemplates: data.more, refreshPublicTemplates: data.refresh,
    myTemplates: [], myTemplatesLoading: false, myTemplatesLoaded: true, myTemplatesHasMore: false,
    loadMoreMyTemplates: data.more, refreshMyTemplates: data.refresh, error: data.error, search: setQuery, cancel: () => { epoch.current++; },
    apply: async (template: Template, close: () => void, notify: (message: string) => void) => {
      if (busy.current) return false; busy.current = true;
      const attempt = epoch.current;
      try { const restore = await takeNativeWorkflowTemplate(template, () => epoch.current === attempt); close(); await restore(); return true; }
      catch (error) { if (epoch.current === attempt) notify(error instanceof Error ? error.message : '方法暂时未能加入，原输入保留。'); return false; }
      finally { busy.current = false; }
    } };
}

function useTemplateWidth() {
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => { const resize = () => setWidth(window.innerWidth); window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize); }, []);
  return width;
}
export function LCOSUseNativeWorkflowRailSide() { return useTemplateWidth() <= 700 ? 'bottom' : 'right'; }
type MethodResume={query:string;category:string;scroll:number;workspaceId?:string;memberKey?:string};
let methodRailOwner:{canvasId:string;open():void}|undefined;
let methodGalleryOwner:{canvasId:string;open(template:Template,resume:MethodResume):void}|undefined;
export function LCOSNativeWorkflowRetainsPopover(){
  const projectId=useLcosShellStore.getState().projectId,canvasId=useCanvasStore.getState().canvasId;
  return !!projectId&&!!canvasId&&nativeWorkspaceSourceRestoring(projectId,canvasId);
}
export function LCOSUseNativeWorkflowRailOwner(open:()=>void){
  const canvasId=useCanvasStore(state=>state.canvasId);
  useEffect(()=>{if(!canvasId)return;const owner={canvasId,open};methodRailOwner=owner;return()=>{if(methodRailOwner===owner)methodRailOwner=undefined}},[canvasId,open]);
}
export function LCOSUseNativeWorkflowGalleryOwner(open:(template:Template)=>void){
  const canvasId=useCanvasStore(state=>state.canvasId),[resume,setResume]=useState<MethodResume>();
  useEffect(()=>{if(!canvasId)return;const owner={canvasId,open:(template:Template,value:MethodResume)=>{setResume(value);open(template)}};methodGalleryOwner=owner;return()=>{if(methodGalleryOwner===owner)methodGalleryOwner=undefined}},[canvasId,open]);
  return{resume,clear:()=>setResume(undefined)};
}
async function restoreNativeMethod(owner:Owner,item:WarehouseItemV1,resume:MethodResume){
  const canvas=useCanvasStore.getState();if(canvas.canvasId!==owner.canvasId||useLcosShellStore.getState().projectId!==owner.projectId)throw new Error('原方法现场已经切换。');
  const current=()=>useLcosShellStore.getState().projectId===owner.projectId&&useCanvasStore.getState().canvasId===owner.canvasId&&useCanvasStore.getState().rfInstance===canvas.rfInstance;
  const [fresh]=await readMethods({...owner,api:canvas.rfInstance},[item]);
  const wait=async(test:()=>boolean)=>new Promise<void>((resolve,reject)=>{let frames=0;const check=()=>{
    if(!current()){reject(new Error('当前现场已变化，原方法返回位置保留。'));return;}
    if(test()){resolve();return;}if(++frames>180){reject(new Error('已回到原现场，方法页暂未就绪；可重试返回。'));return;}requestAnimationFrame(check);
  };check()});
  await wait(()=>methodRailOwner?.canvasId===owner.canvasId);methodRailOwner!.open();
  await wait(()=>methodGalleryOwner?.canvasId===owner.canvasId);methodGalleryOwner!.open(fresh,resume);
  await wait(()=>{const root=document.querySelector<HTMLElement>('[data-native-workflow-preview]');if(root?.dataset.methodId!==item.entityRef.id)return false;
    root.scrollTop=resume.scroll;const button=resume.memberKey
      ? [...root.querySelectorAll<HTMLButtonElement>('[data-native-method-member]')].find(b=>b.dataset.nativeMethodMember===resume.memberKey)
      : [...root.querySelectorAll<HTMLButtonElement>('[data-native-method-enter]')].find(b=>b.dataset.nativeMethodEnter===resume.workspaceId);
    if(!button)return false;button.focus({preventScroll:true});return document.activeElement===button;});
}
export function LCOSUseNativeWorkflowGallery({ searchKeyword = '', onClose, onMaterialUse }: { searchKeyword?: string; onClose?:()=>void; onMaterialUse?:()=>void }) {
  const [activeCategory, setActiveCategory] = useState('all');
  const data = useRows(searchKeyword,activeCategory==='removed'?'archived':'active'), [selectedTemplate, updateSelectedTemplate] = useState<Template | null>(null);
  const [editingTemplate,setEditingTemplate]=useState<Template|null>(null), editing=useRef(editingTemplate);editing.current=editingTemplate;
  const [isSaving,setIsSaving]=useState(false);
  const [isReading,setIsReading]=useState(false),reading=useRef<NativeLibraryReadingReturn>();
  const readAttempt=useRef(0),pendingRead=useRef<AbortController>();
  const setSelectedTemplate=useCallback((value:Template|null)=>{readAttempt.current++;pendingRead.current?.abort();updateSelectedTemplate(value)},[]);
  const selected=useRef(selectedTemplate);selected.current=selectedTemplate;
  const alive=useRef(true),saving=useRef(false);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
  useEffect(()=>()=>{readAttempt.current++;pendingRead.current?.abort();cancelNativeLibraryReadingReturn(reading.current,true)},[]);
  const readMaterial=async(template:Template,member:NativeScopeMember,element:HTMLButtonElement)=>{
    const method=template.lcos_method;
    if(!sameOwner(method.owner)||selected.current!==template||!nativeWorkflowMemberReadable(member)&&member.kind!=='unavailable'
      ||(member.kind==='material'||member.kind==='note')&&!nativeMaterialViewerAvailable())throw new Error('当前内容入口尚未就绪，请重新打开。');
    pendingRead.current?.abort();const controller=new AbortController(),attempt=++readAttempt.current;pendingRead.current=controller;
    const current=()=>!controller.signal.aborted&&readAttempt.current===attempt&&alive.current&&sameOwner(method.owner)&&selected.current===template;
    let fresh:Template;
    try{[fresh]=await readMethods(method.owner,[method.item],controller.signal)}catch(error){if(!current())return;throw error}
    if(!current())return;
    if(member.kind==='unavailable'){
      const scroll=element.closest<HTMLElement>('[data-native-workflow-preview]')?.scrollTop??0;
      setSelectedTemplate(fresh);
      requestAnimationFrame(()=>{
        if(!alive.current||!sameOwner(method.owner)||selected.current?.id!==template.id)return;
        const root=document.querySelector<HTMLElement>(`[data-native-workflow-preview][data-method-id="${CSS.escape(template.id)}"]`);
        if(root){root.scrollTop=scroll;[...root.querySelectorAll<HTMLButtonElement>('[data-native-method-member]')].find(button=>button.dataset.nativeMethodMember===member.key)?.focus({preventScroll:true});}
      });
      return;
    }
    const exact=fresh.lcos_method.members.find(row=>row.key===member.key);
    if(exact?.kind==='unavailable')throw new Error(exact.reason);
    if(!exact||!nativeWorkflowMemberReadable(exact)||JSON.stringify(exact)!==JSON.stringify(member))throw new Error('内容或所存版本已变化，请重新打开方法；原输入保留。');
    const root=element.closest<HTMLElement>('[data-native-workflow-preview]'),scroll=root?.scrollTop??0;
    const previousConversation=readNativeConversationSelection(),originalTarget=useLcosShellStore.getState().composerTarget;
    captureNativeLibraryInputReturn(method.owner.projectId);
    const lease:NativeLibraryReadingReturn={projectId:method.owner.projectId,rootKind:'workflow',rootId:template.id,closed:false,
      current:()=>!lease.closed&&reading.current===lease&&current(),
      onUse:()=>{(onMaterialUse??onClose)?.()},
      onRelease:preserve=>{if(alive.current){setIsReading(false);if(!preserve)onClose?.()}},
      onReturn:()=>new Promise<void>(resolve=>{setIsReading(false);
        if(exact.kind==='conversation'||exact.kind==='run'){
          restoreNativeConversationSelection(previousConversation,method.owner.projectId,method.owner.canvasId);
          // Restore only the original input address. Its parked prompt, refs
          // and caret remain owned by the existing Shell/ReferenceStore.
          if(originalTarget&&sameOwner(method.owner))useLcosShellStore.getState().openComposer({...originalTarget,focusInput:false});
        }
        let frames=0,stable=0;const restore=()=>{
        if(!lease.current()||++frames>120){resolve();return;}
        if(document.querySelector('[data-media-viewer]')){requestAnimationFrame(restore);return;}
        // Radix switches between modal/nonmodal content owners, so use the
        // current original content node after its transition, not a stale DOM ref.
        const liveRoot=[...document.querySelectorAll<HTMLElement>('[data-native-workflow-preview]')].find(node=>node.dataset.methodId===template.id);
        const liveButton=liveRoot&&[...liveRoot.querySelectorAll<HTMLButtonElement>('[data-native-method-member]')].find(node=>node.dataset.nativeMethodMember===member.key);
        if(liveRoot&&liveButton&&liveRoot.getClientRects().length){liveRoot.scrollTop=scroll;liveButton.focus({preventScroll:true});stable=document.activeElement===liveButton?stable+1:0;}
        if(stable>=3){resolve();return;}requestAnimationFrame(restore);
      };requestAnimationFrame(restore)}),
    };
    cancelNativeLibraryReadingReturn(reading.current,true);reading.current=lease;setIsReading(true);
    try{await requestNativeWorkflowMember(method.owner.projectId,exact,lease,{material:requestNativeMaterialView,note:requestNativeNoteView,
      conversation:requestNativeConversationView,task:requestNativeTaskView,
      library:member=>requestNativeLibraryMemberView(method.owner.projectId,member,{title:template.name,current:()=>lease.current(),
        release:preserve=>cancelNativeLibraryReadingReturn(lease,preserve),
        restore:()=>restoreNativeMethod(method.owner,method.item,{query:searchKeyword,category:activeCategory,scroll,memberKey:member.key})},controller.signal)
    })}catch(error){cancelNativeLibraryReadingReturn(lease,true);if(current())throw error}
  };
  const enterWorkspace=async(template:Template,workspaceId:string,element:HTMLButtonElement)=>{
    const method=template.lcos_method;if(!sameOwner(method.owner)||selected.current?.id!==template.id)throw new Error('原方法入口已变化，请重新打开。');
    const resume={query:searchKeyword,category:activeCategory,scroll:element.closest('[data-native-workflow-preview]')?.scrollTop??0,workspaceId};
    const response=await fetch(`/api/lcos/workflow/${encodeURIComponent(template.id)}/workspace:open`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({workspaceId})});
    const result=await response.json();if(!response.ok||!result.data?.workspace){
      const message=result.error?.code?.startsWith('METHOD_')?result.error.message:
        result.error?.code==='MATERIAL_PLACEMENT_UNCONFIRMED'?'部分材料安放尚未完成，已有现场保留；未重复创建。':'方法材料或现场尚未准备完成，原页面和输入保留。';
      throw new Error(message);
    }
    if(!alive.current||!sameOwner(method.owner)||selected.current?.id!==template.id)return;
    await enterNativeWorkspaceWithReturn(method.owner.projectId,result.data.workspace,{kind:'workflow',id:template.id,title:template.name},()=>restoreNativeMethod(method.owner,method.item,resume));
  };
  const width = useTemplateWidth();
  const columns=width>1100?4:width>700?3:1;
  const [gridElement,setGridElement]=useState<HTMLDivElement|null>(null),[gridWidth,setGridWidth]=useState(0);
  useEffect(()=>{if(!gridElement)return;const measure=()=>setGridWidth(gridElement.clientWidth);measure();const observer=new ResizeObserver(measure);observer.observe(gridElement);return()=>observer.disconnect()},[gridElement]);
  const lifecycle=async(template:Template,archived:boolean)=>{
    if(saving.current)return false;const method=template.lcos_method;
    if(!sameOwner(method.owner))throw new Error('现场已切换，请重新打开方法。');
    saving.current=true;setIsSaving(true);
    try{
      let [fresh]=await readMethods(method.owner,[method.item]);
      if(!alive.current||!sameOwner(method.owner))return false;
      if(!!fresh.lcos_method.archivedAt!==archived){
        if(fresh.lcos_method.lifecycleVersion!==method.lifecycleVersion)throw new Error('方法状态已变化，请重新打开后再操作。');
        let error:unknown;
        try{await coreRequest(session().http,'POST',`/projects/${encodeURIComponent(method.owner.projectId)}/workflow/methods/${encodeURIComponent(template.id)}/${archived?'archive':'restore'}`,{body:{expectedVersion:method.lifecycleVersion??0}})}catch(value){error=value}
        const result=await readMethods(method.owner,[method.item]).catch(()=>null);
        if(!result||!!result[0].lcos_method.archivedAt!==archived)throw new Error(error?'移除或恢复尚未确认，内容保留；请重新读取后核对。':'方法状态已变化，请重新读取。');
        [fresh]=result;
      }
      if(alive.current&&sameOwner(method.owner)){setEditingTemplate(null);if(archived)setSelectedTemplate(null);else{setActiveCategory('all');setSelectedTemplate(fresh)}data.refresh();window.dispatchEvent(new CustomEvent('lcos-native-methods-changed'));}
      return true;
    }finally{saving.current=false;if(alive.current)setIsSaving(false)}
  };
  return { selectedTemplate, setSelectedTemplate, activeCategory, setActiveCategory, templates: data.rows,
    columnCount: columns, gridRef:setGridElement, itemHeight:Math.ceil((gridWidth||Math.min(1100,width-28)-(width>700?168:0)-48)/columns)+52,
    loading: data.loading, initialLoading: data.loading && !data.rows.length, hasMore: data.hasMore, error: data.error,
    refresh: data.refresh, isMyCategory: false, title: activeCategory==='removed'?'已移除的方法':'项目方法', editingTemplate, setEditingTemplate, isSaving, isReading, readMaterial, enterWorkspace,
    handleDelete:async(id:string)=>{const template=data.rows.find(row=>row.id===id);if(!template)throw new Error('方法列表已变化，请重新读取。');return lifecycle(template,true)},
    handleRestore:(template:Template)=>lifecycle(template,false),
    handleCreate: async()=>{
      const projectId=useLcosShellStore.getState().projectId,canvas=useCanvasStore.getState();if(!projectId||!canvas.canvasId||!canvas.rfInstance)return;
      const owner={projectId,canvasId:canvas.canvasId,api:canvas.rfInstance},graph=await session().projects.getProjectGraph(projectId);
      if(!alive.current||!sameOwner(owner)||!graph)return;
      const id='scope-workflow-'+crypto.randomUUID(),item={schemaVersion:1,entityRef:{type:'workflow',id},kind:'workflow',title:'新方法',updatedAt:new Date().toISOString(),usageCount:0} as WarehouseItemV1;
      const presentation={id:`presentation:workflow:${id}`,version:0,scopeId:id,projectId,capability:'workflow',state:{workflowActions:[{id:crypto.randomUUID(),label:'',description:'',attachedViewIds:[],x:0,y:0}]}} as unknown as PresentationViewV0;
      setActiveCategory('all');setEditingTemplate({id,name:'',title:'新方法',description:'',preview_image:'',cover_media_type:'image',lcos_method:{owner,item,create:true,materials:workflowMaterialCatalog(graph),members:[],graphVersion:Number(graph.graphVersion),presentations:[presentation],draft:{status:'unavailable',reason:'尚未保存'},text:''}});
    },
    handleUpdate: async(id:string,payload:any)=>{
      const template=editing.current;if(!template||template.id!==id||!sameOwner(template.lcos_method.owner))throw new Error('方法或现场已切换，输入保留。');
      if(saving.current)return;saving.current=true;setIsSaving(true);
      try{
        const {owner,item}=template.lcos_method,body={create:!!template.lcos_method.create,name:payload.name,expectedGraphVersion:template.lcos_method.graphVersion,presentations:payload.lcos_method_edit};
        if(!body.name?.trim())throw new Error('填写方法名称后再保存。');
        let writeError:unknown;
        try{await coreRequest(session().http,'PUT',`/projects/${encodeURIComponent(owner.projectId)}/workflow/methods/${encodeURIComponent(id)}`,{body});}catch(error){writeError=error;}
        // A lost response is read back once. Never silently replay a save.
        const fresh=await readMethods(owner,[{...item,title:body.name.trim()}]).catch(()=>null);
        const saved=fresh?.[0],wanted=body.presentations?.map((v:any)=>({id:v.id,memberViewIds:v.memberViewIds,workflowActions:v.workflowActions,workflowActionEdges:v.workflowActionEdges,workflowOperators:v.workflowOperators}));
        const actual=saved&&workflowEditableViews(saved.lcos_method.presentations).map(({expectedVersion,...v})=>v);
        if(!saved||JSON.stringify(wanted)!==JSON.stringify(actual)||saved.name!==body.name.trim()){
          if(writeError)throw new Error('方法未确认保存，输入保留；请先重新读取，避免覆盖其他修改。');
          throw new Error('保存结果尚未确认，输入保留；请重新读取后核对。');
        }
        if(alive.current&&editing.current===template&&sameOwner(owner)){setEditingTemplate(null);setSelectedTemplate(saved);data.refresh();window.dispatchEvent(new CustomEvent('lcos-native-methods-changed'));}
      }finally{saving.current=false;if(alive.current)setIsSaving(false);}
    },
    handleTemplateClick: setSelectedTemplate, handleLoadMore: data.more, categories: [{ id: 'all', name: '项目方法' },{id:'removed',name:'已移除'}], categoriesLoading: false };
}

/** Fills the original preview's media slot; no new reader or window. */
export function LCOSNativeWorkflowPreview({ template, onReadMaterial, onEnterWorkspace, Button }: { template: Template; onReadMaterial?:ReturnType<typeof LCOSUseNativeWorkflowGallery>['readMaterial']; onEnterWorkspace?:ReturnType<typeof LCOSUseNativeWorkflowGallery>['enterWorkspace']; Button:ComponentType<any> }) {
  const method = template.lcos_method;
  const [error,setError]=useState<string>(),[busy,setBusy]=useState(false),alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
  return <div className="lcos-native-method-preview" data-native-workflow-preview data-method-id={template.id}>
    <div className="lcos-native-method-steps">{method.text}</div>
    {method.members.length > 0 && <div className="lcos-native-method-materials"><span>关联材料</span>
      {method.members.map(member=>nativeWorkflowMemberReadable(member)||member.kind==='unavailable'?<Button key={member.key} type="button" variant="ghost" disabled={busy||!onReadMaterial}
        data-native-method-material={member.kind==='material'?member.key:undefined} data-native-method-member={member.key}
        aria-label={`${member.kind==='unavailable'?'重新读取':['run','conversation','scope','collection'].includes(member.kind)?'进入':'查看'} ${member.title}`} onClick={(event:MouseEvent<HTMLButtonElement>)=>{
        const element=event.currentTarget;setBusy(true);setError(undefined);void onReadMaterial?.(template,member,element).catch(error=>{if(alive.current)setError(error instanceof Error?error.message:'材料暂未打开，请重试。')}).finally(()=>{if(alive.current)setBusy(false)});
      }}><span>{member.title}{member.kind==='unavailable'&&<small>{member.reason}</small>}</span><span aria-hidden>{member.kind==='unavailable'?'↻':'↗'}</span></Button>:<div key={member.key}>{member.title}<small>此成员的原入口尚未接入方法详情</small></div>)}</div>}
    {error&&<p role="status">{error}</p>}
    {(method.workspaces?.length?method.workspaces:[{id:`workspace:${template.id}`,name:'工作现场'}]).map(workspace=><Button key={workspace.id} type="button" variant="secondary" disabled={busy||!!method.archivedAt||!onEnterWorkspace} data-native-method-enter={workspace.id} onClick={(event:MouseEvent<HTMLButtonElement>)=>{
      const element=event.currentTarget;setBusy(true);setError(undefined);void onEnterWorkspace?.(template,workspace.id,element).catch(error=>{if(alive.current)setError(error instanceof Error?error.message:'现场暂未打开，请重试。')}).finally(()=>{if(alive.current)setBusy(false)});
    }}>{busy?'正在准备…':method.workspaces&&method.workspaces.length>1?`进入 ${workspace.name}`:'进入工作现场'}</Button>)}
  </div>;
}
