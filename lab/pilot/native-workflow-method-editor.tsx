import { useState, type ComponentType, type ReactNode } from 'react';
import type { PresentationViewV0 } from '../../lcos/packages/contracts/src/index';
import type { WorkflowMaterial } from './native-workflow-materials';

export function workflowEditableViews(views: readonly PresentationViewV0[]) {
  return views.map(view=>({id:view.id,expectedVersion:view.version,memberViewIds:[...(view.state.memberViewIds??[])],
    workflowActions:structuredClone(view.state.workflowActions??[]),workflowActionEdges:structuredClone(view.state.workflowActionEdges??[]),
    workflowOperators:structuredClone(view.state.workflowOperators??{})}));
}
export function LCOSUseNativeWorkflowEditForm(template: any) {
  const [values,setValues]=useState(()=>workflowEditableViews(template?.lcos_method?.presentations??[]));
  return {values,setValues};
}
type Parts=Record<'Input'|'TextArea'|'Label'|'Button'|'Checkbox'|'Select'|'SelectTrigger'|'SelectValue'|'SelectContent'|'SelectItem',ComponentType<any>>;
const kinds=[['condition','条件分支'],['parallel-split','分头进行'],['parallel-join','汇合结果'],['reference','材料说明']];
function EditSection({title,count,children}:{title:string;count:number;children:ReactNode}) {
  const [open,setOpen]=useState(count>0);
  return <details className="native-method-edit-section" open={open} onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary>{title} <span>{count}</span></summary>{children}
  </details>;
}
/** TapNow's own controls inside its original form. Only Confirm persists. */
export function LCOSNativeWorkflowEditFields({form,parts,template,disabled=false}:{form:ReturnType<typeof LCOSUseNativeWorkflowEditForm>;parts:Parts;template:any;disabled?:boolean}) {
  const {Input,TextArea,Label,Button,Checkbox,Select,SelectTrigger,SelectValue,SelectContent,SelectItem}=parts;
  const catalog:WorkflowMaterial[]=template.lcos_method.materials??[];
  const material=(id:string)=>catalog.find(m=>m.id===id)??{id,title:'暂不可用的材料',detail:'已有引用保留，可移除后重新选择',available:false};
  const update=(index:number,change:(value:ReturnType<typeof workflowEditableViews>[number])=>void)=>form.setValues(values=>values.map((value,i)=>{if(i!==index)return value;const next=structuredClone(value);change(next);return next;}));
  const choice=(label:string,value:string,options:{value:string;label:string;disabled?:boolean}[],onChange:(value:string)=>void,placeholder='请选择')=><Select value={value} onValueChange={onChange} disabled={disabled||!options.length}>
    <SelectTrigger aria-label={label}><SelectValue placeholder={placeholder}/></SelectTrigger>
    <SelectContent data-native-method-select>{options.map(option=><SelectItem key={option.value} value={option.value} disabled={option.disabled}>{option.label}</SelectItem>)}</SelectContent>
  </Select>;
  return <fieldset disabled={disabled} className="native-method-edit-fields" data-native-method-edit-fields>
    {form.values.map((view,vi)=>{
      const names=view.workflowActions.map((a,i)=>({value:a.id,label:a.label||`步骤 ${i+1}`}));
      return <div key={view.id} data-native-method-group>
        {form.values.length>1&&<Label>步骤组 {vi+1}</Label>}
        <details className="native-method-edit-section" open><summary>关联材料 <span>{view.memberViewIds.length}</span></summary>
          <p className="native-method-edit-hint">这些材料随整份方法加入对话；下方可指定各步骤使用哪些。</p>
          {view.memberViewIds.map(id=>{const m=material(id);return <div className="native-method-material-row" key={id}>
            <div><span>{m.title}</span><small>{m.detail}</small></div>
            <Button type="button" variant="ghost" aria-label={`移除材料 ${m.title}`} onClick={()=>update(vi,v=>{
              v.memberViewIds=v.memberViewIds.filter(x=>x!==id);for(const a of v.workflowActions)a.attachedViewIds=a.attachedViewIds.filter(x=>x!==id);
              for(const op of Object.values(v.workflowOperators))for(const b of op.branches??[])if(b.targetViewId===id)delete b.targetViewId;
            })}>移除</Button></div>})}
          {choice('添加关联材料','',catalog.filter(m=>m.available&&!view.memberViewIds.includes(m.id)).map(m=>({value:m.id,label:`${m.title} · ${m.detail}`})),id=>update(vi,v=>{v.memberViewIds.push(id)}),'添加项目材料')}
          <p className="native-method-edit-hint">移除会一并解除步骤与分支的引用，材料原件保留。</p>
        </details>
        {view.workflowActions.map((action,ai)=><div className="native-method-edit-step" key={action.id} data-native-method-step>
          <div className="native-method-edit-heading"><Label htmlFor={`method-step-${action.id}`}>步骤 {ai+1}</Label><div>
            <Button type="button" variant="ghost" aria-label={`上移步骤 ${ai+1}`} disabled={disabled||ai===0} onClick={()=>update(vi,v=>{[v.workflowActions[ai-1],v.workflowActions[ai]]=[v.workflowActions[ai],v.workflowActions[ai-1]]})}>上移</Button>
            <Button type="button" variant="ghost" aria-label={`下移步骤 ${ai+1}`} disabled={disabled||ai===view.workflowActions.length-1} onClick={()=>update(vi,v=>{[v.workflowActions[ai],v.workflowActions[ai+1]]=[v.workflowActions[ai+1],v.workflowActions[ai]]})}>下移</Button>
            <Button type="button" variant="ghost" aria-label={`移除步骤 ${ai+1}`} onClick={()=>update(vi,v=>{v.workflowActions=v.workflowActions.filter(a=>a.id!==action.id);v.workflowActionEdges=v.workflowActionEdges.filter(edge=>edge.fromActionId!==action.id&&edge.toActionId!==action.id)})}>移除</Button>
          </div></div>
          <Input id={`method-step-${action.id}`} aria-label={`步骤 ${ai+1} 名称`} value={action.label} placeholder="步骤名称" onChange={(e:any)=>update(vi,v=>{v.workflowActions[ai].label=e.target.value})}/>
          <TextArea aria-label={`步骤 ${ai+1} 说明`} value={action.description??''} placeholder="写下这个步骤要做什么" onChange={(e:any)=>update(vi,v=>{v.workflowActions[ai].description=e.target.value})}/>
          {!!view.memberViewIds.length&&<details className="native-method-step-materials"><summary>使用材料 · {action.attachedViewIds.length}</summary>
            {view.memberViewIds.map(id=><label key={id} className="native-method-material-check"><Checkbox disabled={disabled} aria-label={`步骤 ${ai+1} 使用 ${material(id).title}`} checked={action.attachedViewIds.includes(id)} onChange={(checked:boolean)=>update(vi,v=>{
              const a=v.workflowActions[ai];a.attachedViewIds=checked?[...a.attachedViewIds.filter(x=>x!==id),id]:a.attachedViewIds.filter(x=>x!==id);
            })}/><span>{material(id).title}</span></label>)}
          </details>}
        </div>)}
        <Button type="button" variant="secondary" onClick={()=>update(vi,v=>{v.workflowActions.push({id:crypto.randomUUID(),label:'',description:'',attachedViewIds:[],x:0,y:v.workflowActions.length*180})})}>添加步骤</Button>
        <EditSection title="步骤连接" count={view.workflowActionEdges.length}>
          {view.workflowActionEdges.map((edge,ei)=><div className="native-method-edit-connection" key={edge.id} data-native-method-connection>
            {choice(`连接 ${ei+1} 起点`,edge.fromActionId,names.filter(n=>n.value!==edge.toActionId),value=>update(vi,v=>{v.workflowActionEdges[ei].fromActionId=value}))}
            <span aria-hidden>→</span>
            {choice(`连接 ${ei+1} 终点`,edge.toActionId,names.filter(n=>n.value!==edge.fromActionId),value=>update(vi,v=>{v.workflowActionEdges[ei].toActionId=value}))}
            <Input className="native-method-connection-label" aria-label={`连接 ${ei+1} 说明`} placeholder="连接说明（可选）" value={edge.label??''} onChange={(e:any)=>update(vi,v=>{v.workflowActionEdges[ei].label=e.target.value})}/>
            <Button type="button" variant="ghost" aria-label={`移除连接 ${ei+1}`} onClick={()=>update(vi,v=>{v.workflowActionEdges=v.workflowActionEdges.filter(x=>x.id!==edge.id)})}>移除</Button>
          </div>)}
          <Button type="button" variant="secondary" disabled={disabled||view.workflowActions.length<2} onClick={()=>update(vi,v=>{v.workflowActionEdges.push({id:crypto.randomUUID(),fromActionId:v.workflowActions[0].id,toActionId:v.workflowActions[1].id})})}>添加连接</Button>
        </EditSection>
        <EditSection title="分支与结构" count={Object.keys(view.workflowOperators).length}>
          <p className="native-method-edit-hint">条件和说明会随方法交给助手，用于理解步骤；这里不自动执行条件。</p>
          {Object.entries(view.workflowOperators).map(([id,operator],oi)=><div key={id} className="native-method-edit-step" data-native-method-operator>
            <div className="native-method-edit-heading"><Label>结构 {oi+1}</Label><Button type="button" variant="ghost" aria-label={`移除结构 ${oi+1}`} onClick={()=>update(vi,v=>{delete v.workflowOperators[id]})}>移除</Button></div>
            {choice(`结构 ${oi+1} 类型`,operator.kind,kinds.map(([value,label])=>({value,label})),value=>update(vi,v=>{v.workflowOperators[id].kind=value as typeof operator.kind}))}
            <Input aria-label={`结构 ${oi+1} 名称`} value={operator.label??''} placeholder="结构名称" onChange={(e:any)=>update(vi,v=>{v.workflowOperators[id].label=e.target.value})}/>
            {(operator.branches??[]).map((branch,bi)=><div className="native-method-edit-branch" key={branch.id}>
              <Input aria-label={`结构 ${oi+1} 分支 ${bi+1} 名称`} value={branch.label} placeholder="分支名称" onChange={(e:any)=>update(vi,v=>{v.workflowOperators[id].branches![bi].label=e.target.value})}/>
              <TextArea aria-label={`结构 ${oi+1} 分支 ${bi+1} 条件`} value={branch.predicateText??''} placeholder="条件或判断说明" onChange={(e:any)=>update(vi,v=>{v.workflowOperators[id].branches![bi].predicateText=e.target.value})}/>
              {choice(`结构 ${oi+1} 分支 ${bi+1} 材料`,branch.targetViewId??'none',[{value:'none',label:'不指定材料'},...view.memberViewIds.map(id=>({value:id,label:material(id).title}))],value=>update(vi,v=>{const b=v.workflowOperators[id].branches![bi];if(value==='none')delete b.targetViewId;else b.targetViewId=value}))}
              <Button type="button" variant="ghost" aria-label={`移除结构 ${oi+1} 分支 ${bi+1}`} onClick={()=>update(vi,v=>{v.workflowOperators[id].branches=v.workflowOperators[id].branches!.filter(b=>b.id!==branch.id)})}>移除分支</Button>
            </div>)}
            <Button type="button" variant="secondary" onClick={()=>update(vi,v=>{(v.workflowOperators[id].branches??=[]).push({id:crypto.randomUUID(),label:'',predicateText:''})})}>添加分支</Button>
          </div>)}
          <Button type="button" variant="secondary" onClick={()=>update(vi,v=>{v.workflowOperators[crypto.randomUUID()]={kind:'condition',label:'',branches:[]}})}>添加结构</Button>
        </EditSection>
      </div>;
    })}
  </fieldset>;
}
