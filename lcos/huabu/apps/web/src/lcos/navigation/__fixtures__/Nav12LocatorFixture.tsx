/** DEV QA route only: synthetic projection data, production DOM/commands. No Core calls or writes. */
import { ReactFlow, ReactFlowProvider, Background, useReactFlow, type Node, type Edge } from '@xyflow/react';
import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, useNavigate } from 'react-router-dom';

import useCanvasStore from '@/store/canvasStore';

import { useLcosWorksiteNav } from '../../app/useLcosWorksiteNav';
import { useLcosReferenceStore } from '../../lcosReferenceState';
import { useLcosShellStore } from '../../shell/lcosShellStore';
import { LcosNavigatorIslandView } from '../../ui/families/LcosNavigatorIslandView';
import { LcosSurfaceDockView } from '../../ui/families/LcosSurfaceDockView';
import { beginChildWorksiteNavigation } from '../childWorksiteNavigation';
import { LcosCanvasCommands } from '../LcosCanvasCommands';
import { returnToSourceWorksite } from '../returnToSourceWorksite';

import type { Workspace } from '@local-creative-os/domain';

import '../../../index.css';
import '@xyflow/react/dist/style.css';

const nodes: Node[] = Array.from({length:24},(_,index)=>({id:`nav12-test-${String(index+1).padStart(2,'0')}`, selected:true,
 position:index<16?{x:2500+index*2,y:350+index*2}:{x:660+(index-16)*3,y:-1800-index*3},
 width:100,height:60,style:{width:100,height:60},data:{label:`测试目标 ${index+1}`} }));
function TestControls() {
 const actualCanvas=useCanvasStore(s=>s.canvasId);
 const navigate=useNavigate();
 const nav=useLcosWorksiteNav({projectId:'nav12-test-only',canvasBySurface:{main:'canvas-171d1990-29a9-45ba-b5ea-08227ac2e577'},ensureCanvas:async()=>undefined});
 const [returnResult,setReturnResult]=useState('idle');
 const rf=useReactFlow();const request=useLcosShellStore(s=>s.locateRequest);
 const [entry,setEntry]=useState('未进入');
 const [last,setLast]=useState('未点击');const [wide,setWide]=useState(false);
 useEffect(()=>{if(request?.nodeId)setLast(request.nodeId);},[request]);
 const dock=useMemo(()=>[{key:'main',label:'Main',glyph:'root' as const,selected:true,busy:false,disabled:false},{key:'context',label:'Context',glyph:'context' as const,selected:false,busy:false,disabled:false},{key:'workflow',label:'Workflow',glyph:'workflow' as const,selected:false,busy:false,disabled:false}],[]);
 return <>
  <LcosCanvasCommands />
  <div data-lcos-shell-project-cluster style={{position:'fixed',left:24,top:24,zIndex:40,padding:12,borderRadius:24,background:'white'}}>NAV12 · 测试场景</div>
  <div style={{position:'fixed',left:'50%',top:24,transform:'translateX(-50%)',zIndex:40}}><LcosNavigatorIslandView state={wide?'搜索':'静息'} expanded={wide} onToggleSearch={()=>setWide(v=>!v)} query="测试HUD占位" /></div>
  <LcosSurfaceDockView items={dock} onSelect={()=>undefined} className="fixed z-40" style={{left:'50%',bottom:24,transform:'translateX(-50%)'}} />
  <section style={{position:'fixed',left:'50%',top:'50%',transform:'translate(-50%,-50%)',textAlign:'center',zIndex:45,fontSize:12,color:'#59616d'}}>
   <strong>24 个模拟投影 · 非真实项目数据</strong><p>生产浮标 / 真实 RF 相机命令；不连接 Core，不写入项目。</p>
   <button data-fixture-reset onClick={()=>void rf.setViewport({x:0,y:0,zoom:1},{duration:0})} style={{padding:12,background:'white',borderRadius:18}}>重置测试镜头</button>
   <button data-fixture-enter-missing onClick={async()=>{
     setEntry('loading');const ok=await beginChildWorksiteNavigation({projectId:'nav12-test-only',sourceSurface:'main',sourceWasChild:false,targetSurface:'context',targetWorkspace:{id:'missing' as Workspace['id'],canvasId:new URLSearchParams(location.search).get('entryCanvas')??'nav12-missing-read-only'},navigate:to=>setEntry('navigated:'+to)});
     setEntry((ok?'entered':'failed')+'; canvas='+useCanvasStore.getState().canvasId+'; history='+String(useLcosShellStore.getState().childReturn?.sourceCanvasId??'none'));
   }}>验证加载目标（只读）</button>
   <button data-fixture-return onClick={async()=>{setReturnResult('pending');try{const result=await returnToSourceWorksite({projectId:'nav12-test-only',context:useLcosShellStore.getState().childReturn,navigate});setReturnResult(result?'returned':'cancelled');}catch{setReturnResult('failed');}}}>返回原现场</button>
   <button data-fixture-root onClick={()=>void nav.switchWorksite('main')}>切换根现场</button>
   <output data-fixture-return-status>{returnResult}</output>
   <output data-fixture-current-canvas>{actualCanvas}</output>
   <output data-fixture-entry style={{display:'block'}}>{entry}</output>
   <output data-fixture-last-target style={{display:'block',padding:8}}>{last}</output>
  </section>
 </>;
}
function Fixture() {
 useEffect(()=>{
  useLcosShellStore.getState().setProject('nav12-test-only');
  useLcosReferenceStore.getState().setProject('nav12-test-only');
  useLcosReferenceStore.setState({nodeEntityRefs:new Map(nodes.map((node,index)=>[node.id,{entityType:'note',entityId:`test-note-${index}`,displayLabel:`测试目标 ${index+1}`}]))});
  // Fixture hydration uses the existing load setter: synthetic nodes never schedule autosave.
  useCanvasStore.getState()._setStateNoAutosave({canvasId:'nav12-test-only',nodes});
 },[]);
 return <div style={{width:'100vw',height:'100vh'}} data-lcos-project-shell>
  <ReactFlow<Node, Edge> nodes={nodes} edges={[]} nodesDraggable={false} nodesConnectable={false} elementsSelectable={false}
   onInit={(instance)=>useCanvasStore.setState({rfInstance:instance})} minZoom={.1} maxZoom={2} defaultViewport={{x:0,y:0,zoom:1}}>
   <Background gap={16} size={1}/><TestControls/>
  </ReactFlow>
 </div>;
}
if (import.meta.env.DEV) {
 const root = createRoot(document.getElementById('root')!);
 root.render(<BrowserRouter><ReactFlowProvider><Fixture/></ReactFlowProvider></BrowserRouter>);
 import.meta.hot?.dispose(() => root.unmount());
}
