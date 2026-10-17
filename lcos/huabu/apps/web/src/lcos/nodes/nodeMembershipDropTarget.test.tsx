import { describeProjectedEntity } from '@local-creative-os/web-gen2';
import { ReactFlowProvider } from '@xyflow/react';
import { act } from 'react';
import { createRoot,type Root } from 'react-dom/client';
import { afterEach,beforeEach,expect,it,vi } from 'vitest';

vi.mock('react-router-dom',()=>({useNavigate:()=>vi.fn()}));
vi.mock('../app/lcosCoreClient',()=>({createLcosCoreSession:()=>({projects:{getWorkspaces:async()=>[]}})}));
vi.mock('./CollectionNodePresentation',()=>({CollectionNodePresentation:()=> <span>真实聚合身份的外壳</span>}));
vi.mock('./NodeColorPinMarkers',()=>({NodeColorPinMarkers:()=>null}));
vi.mock('./NodeReferenceMarker',()=>({NodeReferenceMarker:()=>null}));

import useCanvasStore from '@/store/canvasStore';

import { speciesBodyFor } from './LcosSpeciesBodies';
import { nodeMembershipDropSemantic } from './nodeMembershipDropTarget';
import { resolveDropIntent } from '../drop/dropIntentResolver';
import { useLcosDropStore } from '../lcosDropState';
import { useLcosReferenceStore } from '../lcosReferenceState';
import { useLcosShellStore } from '../shell/lcosShellStore';

import type { LcosNodeSpecies } from '@local-creative-os/web-gen2';

globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let host:HTMLDivElement;let root:Root;
beforeEach(()=>{host=document.createElement('div');document.body.append(host);root=createRoot(host);
  useLcosDropStore.getState().reset();useLcosReferenceStore.getState().reset();useLcosReferenceStore.getState().setProject('p');
  useCanvasStore.setState({nodes:[],collapsedFrameIds:new Set()});
  useLcosShellStore.setState({projectId:'p',activeSurface:'main'});
  vi.spyOn(Element.prototype,'getBoundingClientRect').mockReturnValue(new DOMRect(40,50,200,160));
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();});
async function render(species:LcosNodeSpecies,locked=false) {
  const Body=speciesBodyFor(species);
  await act(async()=>root.render(<ReactFlowProvider><Body nodeId="node-target" nodeType="text" data={{label:'目标对象',locked}}/></ReactFlowProvider>));
  const target=useLcosDropStore.getState().targets().find(target=>target.nodeId==='node-target');
  if (!target) throw new Error('Actual node receiver was not registered');
  return target;
}
it.each(['main','context','workflow'] as const)('registers canonical Collection cover on the actual %s Surface',async surface=>{
  useLcosShellStore.setState({activeSurface:surface});
  useLcosReferenceStore.getState().registerNodeEntity('node-target',{entityType:'collection',entityId:'canonical'});
  const target=await render('collection');
  expect(target).toMatchObject({kind:'collection-membership',enabled:true,semantic:{kind:'collection-membership',collectionId:'canonical'}});
  expect(target?.readRect?.()).toMatchObject({left:40,top:50,width:200,height:160});
  expect(resolveDropIntent({kind:'object',entityType:'artifact',entityId:'a'},target)).toMatchObject({status:'ready',intent:{kind:'collection-membership',memberRef:{type:'artifact',id:'a'}}});
});
it.each(['context','workflow'] as const)('registers %s Scope cover to the same natural receiver as its Rail entry',async kind=>{
  useLcosReferenceStore.getState().registerNodeEntity('node-target',{entityType:'scope',entityId:'scope-real',
    descriptor:describeProjectedEntity({entityType:'scope',entityId:'scope-real',sourceKind:kind,title:'同一真实Scope'})});
  const target=await render(kind==='context'?'collection':'workflow-collection');
  expect(target).toMatchObject({kind:'spatial-membership',enabled:true,semantic:{kind:'spatial-membership',targetRef:{kind,id:'scope-real'}}});
  expect(resolveDropIntent({kind:'object',entityType:'artifact',entityId:'a',artifactViewId:'v'},target)).toMatchObject({status:'ready',intent:{kind:'assembly-apply',targetRef:{kind,id:'scope-real'}}});
});
it('a locked visible aggregate is a rejection, never a canvas fallback',async()=>{
  useLcosReferenceStore.getState().registerNodeEntity('node-target',{entityType:'collection',entityId:'canonical'});
  const target=await render('collection',true);
  expect(target?.enabled).toBe(false);expect(target?.ineligibleReason).toContain('锁定');
  expect(resolveDropIntent({kind:'object',entityType:'artifact',entityId:'a'},target).status).toBe('ineligible');
});
it('never classifies an unresolved or mismatched Scope from its body/title and unregisters on unmount',async()=>{
  useLcosReferenceStore.getState().registerNodeEntity('node-target',{entityType:'scope',entityId:'scope-real',
    descriptor:describeProjectedEntity({entityType:'scope',entityId:'different',sourceKind:'workflow',title:'Workflow'})});
  const target=await render('workflow-collection');
  expect(target).toMatchObject({kind:'drop-exclusion',enabled:false});
  await act(async()=>root.render(null));expect(useLcosDropStore.getState().targets()).toEqual([]);
});
it('keeps canonical Collection and classified Scope owners separate and rejects unknown identities',()=>{
  expect(nodeMembershipDropSemantic({entityType:'collection',entityId:'canonical'})).toEqual({kind:'collection-membership',collectionId:'canonical'});
  expect(nodeMembershipDropSemantic({entityType:'scope',entityId:'unclassified'})).toBeUndefined();
  expect(nodeMembershipDropSemantic({entityType:'artifact',entityId:'a'})).toBeUndefined();
  expect(nodeMembershipDropSemantic({entityType:'collection',entityId:''})).toBeUndefined();
});

it('keeps a visible unbound aggregate as an explicit rejection until its canonical identity arrives',async()=>{
  const target=await render('collection');
  expect(target).toMatchObject({kind:'drop-exclusion',enabled:false});
  expect(resolveDropIntent({kind:'object',entityType:'artifact',entityId:'a'},target).status).toBe('ineligible');
});
