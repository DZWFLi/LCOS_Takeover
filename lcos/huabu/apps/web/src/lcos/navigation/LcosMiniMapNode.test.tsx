import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,expect,it,vi} from 'vitest';

import {LcosMiniMapNode,miniMapSpecies} from './LcosMiniMapNode';

import type {MiniMapNodeProps} from '@xyflow/react';

const m=vi.hoisted(()=>({canvasId:'current',request:{canvasId:'current',nodeIds:['node'],status:'projected'},
  ref:{entityType:'scope',descriptor:{artifactKind:'workflow'}} as {entityType:string;descriptor:{artifactKind:string;mimeType?:string;sourceKind?:string}}}));
vi.mock('@xyflow/react',()=>({useReactFlow:()=>({getNode:()=>({type:'lcos'})})}));
vi.mock('@/store/canvasStore',()=>({default:(select:(state:unknown)=>unknown)=>select({canvasId:m.canvasId})}));
vi.mock('../lcosReferenceState',()=>({useLcosReferenceStore:(select:(state:unknown)=>unknown)=>select({nodeEntityRefs:new Map([['node',m.ref]])})}));
vi.mock('../shell/lcosShellStore',()=>({useLcosShellStore:(select:(state:unknown)=>unknown)=>select({locateRequest:m.request})}));
const roots:ReturnType<typeof createRoot>[]=[];
afterEach(()=>{for(const root of roots.splice(0))act(()=>root.unmount());document.body.replaceChildren();m.canvasId='current';m.ref={entityType:'scope',descriptor:{artifactKind:'workflow'}};});
it('distinguishes real canonical and native species without guessing from titles',()=>{
  expect(miniMapSpecies({entityType:'scope',artifactKind:'workflow'})).toBe('workflow');
  expect(miniMapSpecies({entityType:'collection'})).toBe('collection');
  expect(miniMapSpecies({entityType:'artifact',mimeType:'audio/mpeg'})).toBe('audio');
  expect(miniMapSpecies({nodeType:'frame'})).toBe('frame');
  expect(miniMapSpecies({nodeType:'image'})).toBe('image');
  expect(miniMapSpecies({entityType:'artifact',artifactKind:'other',mimeType:'text/plain'})).toBe('text');
});

it('reads canonical descriptor MIME and URL kind when the outer reference has no format fields',async()=>{
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);roots.push(root);
  const props={id:'node',x:10,y:20,width:70,height:50,selected:false} as MiniMapNodeProps;
  const view=()=> <svg><LcosMiniMapNode {...props}/></svg>;
  m.ref={entityType:'artifact',descriptor:{artifactKind:'other',mimeType:'audio/wav'}};
  await act(async()=>root.render(view()));
  expect(host.querySelector('[data-lcos-minimap-node]')?.getAttribute('data-lcos-minimap-species')).toBe('audio');
  m.ref={entityType:'artifact',descriptor:{artifactKind:'markdown',mimeType:'text/markdown',sourceKind:'url'}};
  await act(async()=>root.render(view()));
  expect(host.querySelector('[data-lcos-minimap-node]')?.getAttribute('data-lcos-minimap-species')).toBe('web');
});
it('uses native minimap coordinates and the same live request, rejecting another canvas beacon',async()=>{
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);roots.push(root);
  const props={id:'node',x:10,y:20,width:70,height:50,selected:false} as MiniMapNodeProps;
  const view=()=> <svg><LcosMiniMapNode {...props}/></svg>;
  await act(async()=>root.render(view()));
  const node=host.querySelector('[data-lcos-minimap-node="node"]');expect(node?.getAttribute('transform')).toBe('translate(10,20)');
  expect(node?.getAttribute('data-lcos-minimap-species')).toBe('workflow');expect(node?.getAttribute('data-lcos-minimap-beacon')).toBe('true');
  m.canvasId='another';await act(async()=>root.render(view()));
  expect(host.querySelector('[data-lcos-minimap-beacon]')).toBeNull();
});
