import React,{useEffect,useState}from'react';
import{createRoot}from'react-dom/client';
import*as jsx from'react/jsx-runtime';
import clsx from'clsx';
import{useTranslation}from'react-i18next';
import{ReactFlowProvider}from'@xyflow/react';
import{Canvas}from'../../lcos/huabu/apps/web/src/components/Panels/Canvas/Canvas.tsx';
import useCanvasStore from'../../lcos/huabu/apps/web/src/store/canvasStore.ts';
import{MilkdownPreview}from'../../lcos/huabu/apps/web/src/components/Milkdown/MilkdownPreview.tsx';
import{MilkdownEditor}from'../../lcos/huabu/apps/web/src/components/Milkdown/MilkdownEditor.tsx';
import{fromMarkdown}from'mdast-util-from-markdown';
import{toMarkdown}from'mdast-util-to-markdown';
import{HttpClient}from'../../lcos/apps/web-gen2/src/backend/client.ts';
import{CoreArtifactClient}from'../../lcos/apps/web-gen2/src/backend/artifacts.ts';
import'../../lcos/huabu/apps/web/src/i18n/index.ts';
import{createRecoveredNodeLeaves}from'../../.runtime/live-adoption/recovered-node-leaves.mjs';

const boot=await(await fetch('/pilot/status')).json();
const artifacts=new CoreArtifactClient(new HttpClient({baseUrl:window.location.origin+'/_core'}));
function presentationMarkdown(markdown:string){
  const tree=fromMarkdown(markdown);
  const clean=(node:any)=>{if(!node.children)return;node.children=node.children.flatMap((child:any)=>{
    if(['html','image','imageReference'].includes(child.type))return[];
    clean(child);return['link','linkReference'].includes(child.type)?child.children:[child];});};
  clean(tree);return toMarkdown(tree);
}
function MarkdownAdapter({children}:{children:string}){return <MilkdownPreview markdown={presentationMarkdown(children)} ariaLabel="原文本节点正文"/>;}
const recovered=createRecoveredNodeLeaves({React,jsx,cn:clsx,useTranslation,Markdown:MarkdownAdapter,Icon:()=>null,Review:()=>null,status:{UNKNOWN:'unknown',APPROVED:'approved',REJECTED:'rejected'}});

function AdoptedImage({nodeId,data}:any){return <section className="takeover-node-body takeover-image" data-adopted-symbol="vT" data-core-artifact={boot.image.artifactId}>
  <div className="takeover-title-line"><recovered.Title title={data.label||'本地图片'}/></div>
  <div className="takeover-image-frame"><recovered.Image src={boot.image.src} identity={boot.image.revisionId} alt="Core 已登记本地图片" className="w-full h-full object-contain rounded-2xl"/></div>
</section>;}
function AdoptedText({nodeId,data}:any){
 const selected=useCanvasStore(s=>!!s.nodes.find(n=>n.id===nodeId)?.selected);
 const[base,setBase]=useState<any>(null),[draft,setDraft]=useState(''),[editing,setEditing]=useState(false),[error,setError]=useState(''),[saving,setSaving]=useState(false),[previewPending,setPreviewPending]=useState<any>(null);
 useEffect(()=>{let active=true;artifacts.readCanvasText(boot.projectId,{canvasId:boot.canvasId,spatialId:nodeId}).then(value=>{if(active){setBase(value);setDraft(value?.body||'');}}).catch(e=>active&&setError(e.message));return()=>{active=false;};},[nodeId]);
 async function syncPreview(value:any){
   const response=await fetch('/pilot/text-preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({artifactId:value.artifactId,revisionId:value.revisionId})});
   if(!response.ok)throw new Error('预览同步返回 '+response.status);
   const projection=await response.json(),store=useCanvasStore.getState();
   // Body is only a Core preview projection, not another undoable content owner.
   // Reuse the original empty-delta receipt path to acknowledge its Space version.
   store.applyDeltasFromAgent([],projection.toVersion,{mutatedNodes:[],deletedNodeIds:[],contentEditedNodeIds:[],deferredFitFrameIds:[]});
   store._setStateNoAutosave({nodes:store.nodes.map(node=>node.id===nodeId?{...node,data:{...node.data,content:projection.body}}:node)});
   setPreviewPending(null);
 }
 async function save(){setSaving(true);setError('');try{
   const value=await artifacts.saveCanvasText(boot.projectId,{canvasId:boot.canvasId,spatialId:nodeId,artifactId:base.artifactId,expectedRevisionId:base.revisionId,body:draft});
   setBase(value);setDraft(value.body);setEditing(false);setPreviewPending(value);
   try{await syncPreview(value);}catch(e){setError('Core 已保存，画布预览同步失败：'+(e instanceof Error?e.message:String(e)));}
 }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setSaving(false);}}
 async function retryPreview(){setSaving(true);setError('');try{await syncPreview(previewPending);}catch(e){setError('Core 已保存，画布预览同步失败：'+(e instanceof Error?e.message:String(e)));}finally{setSaving(false);}}
 return <section className="takeover-node-body takeover-text" data-adopted-symbol="e4/CT" data-core-artifact={base?.artifactId} data-core-revision={base?.revisionId}>
  <div className="takeover-title-line"><recovered.Title title={data.label||'本地文本'}/></div>
  {editing?<div className="nodrag nopan nowheel" onPointerDown={e=>e.stopPropagation()} onDoubleClick={e=>e.stopPropagation()}>
    <MilkdownEditor markdown={draft} onChange={setDraft} className="takeover-editor"/>
    <div className="takeover-edit-actions"><button onClick={save} disabled={saving}>保存到 Core</button><button onClick={()=>{setDraft(base.body);setEditing(false);}} disabled={saving}>取消</button></div>
  </div>:base?<recovered.TextBody markdown={base.body} editable={true} selected={selected} onEdit={()=>setEditing(true)}/>:<span role="status">读取已登记正文…</span>}
  {error&&<div role="alert">{error}</div>}
  {previewPending&&error&&<button className="nodrag nopan" onClick={retryPreview} disabled={saving}>重试同步预览</button>}
 </section>;
}
const bodySeam={resolve:({nodeId,nodeType}:any)=>nodeId==='pilot-image'?AdoptedImage:nodeId==='pilot-text'?AdoptedText:undefined,
 resolveHostPresentation:({nodeId}:any)=>nodeId==='pilot-image'?imagePresentation:nodeId==='pilot-text'?textPresentation:undefined,subscribe:()=>()=>{}};
const imagePresentation={surface:'media',showAiBadge:false,allowOverflow:true};
const textPresentation={surface:'paper',showAiBadge:false,allowOverflow:true};
const extension={resolveNodeBody:bodySeam};
function App(){const[ready,setReady]=useState(false),[error,setError]=useState('');useEffect(()=>{useCanvasStore.getState().loadCanvas(boot.canvasId).then(ok=>{if(!ok)throw new Error('Huabu 画布载入失败');setReady(true);}).catch(e=>setError(e.message));},[]);
 return <><header className="pilot-header"><span>LCOS · 图片文本接入实验</span><span>真实临时 Core + 原 Huabu · 无厂商云端</span></header>{error?<div role="alert">{error}</div>:ready?<ReactFlowProvider><Canvas chromeMode="lcos" hostExtension={extension}/></ReactFlowProvider>:<p role="status">打开本地工作现场…</p>}</>;
}
window.__LCOS_LIVE_PILOT__={boot,getNodes:()=>useCanvasStore.getState().nodes,getEdges:()=>useCanvasStore.getState().edges};
createRoot(document.getElementById('root')!).render(<App/>);
