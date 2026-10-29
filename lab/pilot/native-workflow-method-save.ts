import type { PresentationViewV0, ProjectGraphSnapshot } from '../../lcos/packages/contracts/src/index';
import { withWorkflowMaterials, workflowMaterialCatalog } from './native-workflow-materials';
const record = (v: any): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const fail = (message: string): never => { throw new Error(message); };
const text = (v: unknown, label: string, max = 200) => {
  if (typeof v !== 'string' || !v.trim() || v.length > max) fail(`${label}为空或过长。`);
  return (v as string).trim();
};
const unique = (v: any[], label: string) => { if (new Set(v).size !== v.length) fail(`${label}重复。`); };
const keys = (v: any, allowed: string[]) => record(v) && Object.keys(v).every(k => allowed.includes(k));

/** Prepare existing Scope/Workspace/Presentation writes inside their metadata
 * transaction. There is no second method entity or store. */
export function prepareNativeWorkflowMethodSave(projectId: string, scopeId: string, input: any,
  graph: ProjectGraphSnapshot | undefined, existing: readonly PresentationViewV0[], validate: (state: any) => void) {
  if (!keys(input,['create','name','expectedGraphVersion','presentations']) || typeof input.create !== 'boolean'
    || !Number.isInteger(input.expectedGraphVersion) || input.expectedGraphVersion < 0) fail('方法保存信息不完整，请重新打开。');
  if (!graph || String(graph.project.id) !== projectId) fail('项目不存在。');
  if (Number(graph.graphVersion) !== input.expectedGraphVersion) fail('项目已更新，未覆盖其他修改。请保留输入并重新打开。');
  text(scopeId,'方法身份');
  const name=text(input.name,'方法名称',120), old=graph.scopes.find(s=>String(s.id)===scopeId), root=graph.scopes.find(s=>s.kind==='root');
  if (input.create ? !!old : !old || old.kind!=='workflow') fail('方法身份已改变，请重新打开。');
  if ((old as {archivedAt?:string}|undefined)?.archivedAt!==undefined) fail('方法已移除，恢复后可继续编辑。');
  if (input.create && !root) fail('项目尚未准备好创建方法。');
  const previous=existing.filter(v=>v.scopeId===scopeId&&v.capability==='workflow');
  if (!Array.isArray(input.presentations)||!input.presentations.length||input.presentations.length>100) fail('至少保留一组方法步骤。');
  unique(input.presentations.map((v:any)=>v?.id),'步骤组');
  if (input.create&&(input.presentations.length!==1||input.presentations[0]?.id!==`presentation:workflow:${scopeId}`)) fail('新方法来源无效。');
  if (!input.create&&(previous.length!==input.presentations.length||previous.some(v=>!input.presentations.some((p:any)=>p?.id===v.id)))) fail('方法步骤组已更新，请重新打开；原输入保留。');
  const now=new Date().toISOString();
  const scope=old?{...old,name,updatedAt:now}:{id:scopeId,projectId,parentScopeId:root!.id,containerViewId:null,kind:'workflow',name,createdAt:now,updatedAt:now};
  const workspace=input.create?{id:`workspace:${scopeId}`,projectId,scopeId,name,intent:'build',viewport:{x:0,y:0,zoom:1},focusedViewIds:[],visibleLayers:['core','process'],contextPolicy:'workspace-related',preferredSurface:'workflow',updatedAt:now}:undefined;
  const views=input.presentations.map((item:any)=>{
    if (!keys(item,['id','expectedVersion','memberViewIds','workflowActions','workflowActionEdges','workflowOperators'])||!Number.isInteger(item.expectedVersion)||item.expectedVersion<0) fail('步骤版本不完整，请重新打开。');
    const before=previous.find(v=>v.id===item.id);
    if(before?before.version!==item.expectedVersion:!input.create||item.expectedVersion!==0) fail('方法已被修改，未覆盖新版本。');
    const members=item.memberViewIds??before?.state.memberViewIds??[];
    if(!Array.isArray(members)||members.some((id:any)=>typeof id!=='string'||!id))fail('方法材料列表无效。');
    unique(members,'方法材料');
    const available=new Set(workflowMaterialCatalog(graph).filter(m=>m.available).map(m=>m.id));
    for(const id of members)if(!before?.state.memberViewIds.includes(id)&&!available.has(id))fail('新增材料或版本已不可用，请重新读取。');
    if(!Array.isArray(item.workflowActions)||item.workflowActions.length>500||!Array.isArray(item.workflowActionEdges)||item.workflowActionEdges.length>1000||!record(item.workflowOperators)) fail('方法步骤格式不完整。');
    for(const action of item.workflowActions){
      if(!keys(action,['id','label','description','attachedViewIds','x','y']))fail('步骤格式不完整。');
      text(action.id,'步骤身份');text(action.label,'步骤名称',500);
      if(action.description!==undefined&&(typeof action.description!=='string'||action.description.length>100000))fail('步骤说明过长。');
      if(!Array.isArray(action.attachedViewIds)||action.attachedViewIds.some((id:any)=>typeof id!=='string'||!id)||!Number.isFinite(action.x)||!Number.isFinite(action.y))fail('步骤材料或位置无效。');
      unique(action.attachedViewIds,'步骤材料');
    }
    unique(item.workflowActions.map((a:any)=>a.id),'步骤');
    const actionIds=new Set(item.workflowActions.map((a:any)=>a.id));
    for(const edge of item.workflowActionEdges){
      if(!keys(edge,['id','fromActionId','toActionId','label'])||!actionIds.has(edge.fromActionId)||!actionIds.has(edge.toActionId)||edge.fromActionId===edge.toActionId||edge.label!==undefined&&typeof edge.label!=='string')fail('连接需要指向另一个有效步骤。');
      text(edge.id,'连接身份');
    }
    unique(item.workflowActionEdges.map((e:any)=>e.id),'步骤连接');
    for(const [id,operator] of Object.entries(item.workflowOperators) as [string,any][]){
      text(id,'结构身份');
      if(!keys(operator,['kind','label','branches'])||!['condition','parallel-split','parallel-join','reference'].includes(operator.kind)||operator.label!==undefined&&typeof operator.label!=='string'||operator.branches!==undefined&&!Array.isArray(operator.branches))fail('分支结构无效。');
      for(const branch of operator.branches??[]){
        if(!keys(branch,['id','label','predicateText','targetViewId']))fail('分支内容无效。');
        text(branch.id,'分支身份');text(branch.label,'分支名称',500);
        if(branch.predicateText!==undefined&&typeof branch.predicateText!=='string'||branch.targetViewId!==undefined&&typeof branch.targetViewId!=='string')fail('分支内容无效。');
      }
      unique((operator.branches??[]).map((b:any)=>b.id),'分支');
    }
    const state=withWorkflowMaterials({...(before?.state??{memberViewIds:[],hiddenViewIds:[],positions:{},hierarchy:{parentByViewId:{},orderByParent:{}},presentationEdges:[],pinnedViewIds:[],emphasisByViewId:{}}),workflowActions:item.workflowActions,workflowActionEdges:item.workflowActionEdges,workflowOperators:item.workflowOperators},members);
    for(const action of state.workflowActions??[])for(const id of action.attachedViewIds)if(!state.memberViewIds.includes(id))fail('步骤引用了尚未加入方法的材料。');
    for(const operator of Object.values(state.workflowOperators??{}))for(const branch of operator.branches??[])if(branch.targetViewId!==undefined&&!members.includes(branch.targetViewId))fail('分支引用了尚未加入方法的材料。');
    validate(state);
    return{expectedVersion:item.expectedVersion,view:{schemaVersion:0,id:item.id,projectId,scopeId,capability:'workflow',renderer:before?.renderer??'workflow',state,version:before?before.version+1:0,updatedBy:'web',createdAt:before?.createdAt??now,updatedAt:now}};
  });
  if(!views.some((v:any)=>v.view.state.workflowActions.length||Object.keys(v.view.state.workflowOperators).length))fail('至少填写一个步骤或分支。');
  return{scope,workspace,views};
}
