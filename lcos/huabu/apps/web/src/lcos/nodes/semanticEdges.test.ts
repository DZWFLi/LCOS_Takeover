import { beforeEach,afterEach,describe,it,expect,vi } from 'vitest';

import useCanvasStore from '@/store/canvasStore';

import { useLcosReferenceStore } from '../lcosReferenceState';
import { removeLcosSelection,reconnectSemanticEdge } from './semanticEdges';
const m=vi.hoisted(()=>({bindings:vi.fn(),remove:vi.fn(),get:vi.fn(),put:vi.fn(),resolve:vi.fn(),project:vi.fn(),notify:vi.fn(),list:vi.fn()}));
const host=vi.hoisted(()=>({projectId:'p-edge',bindings:{list:m.bindings},relationProjector:{deleteRelation:m.remove,reconcileRelationEdge:m.project},relations:{getRelation:m.get,putRelation:m.put,listRelations:m.list},resolveNode:m.resolve,notifyMutationSuccess:m.notify}));
vi.mock('../host/lcosHostState',()=>({useLcosHostStore:{getState:()=>({host})}}));
beforeEach(()=>{
  Object.values(m).forEach(fn=>fn.mockReset());m.list.mockResolvedValue([]);m.resolve.mockImplementation(async(id:string)=>({entityType:'artifact',entityId:`a-${id}`}));
  useCanvasStore.getState()._setStateNoAutosave({canvasId:'canvas-edge',nodes:['from','old','new'].map(id=>({id,type:'text',position:{x:0,y:0},data:{}})),edges:[{id:'edge-core',source:'from',target:'old'}]});
  useLcosReferenceStore.getState().reset();useLcosReferenceStore.getState().setProject('p-edge');
  ['from','old','new'].forEach(id=>useLcosReferenceStore.getState().registerNodeEntity(id,{entityType:'artifact',entityId:`a-${id}`}));
  m.bindings.mockResolvedValue([{projectId:'p-edge',canvasId:'canvas-edge',spatialKind:'edge',spatialId:'edge-core',entityType:'relation',entityId:'relation-real'}]);
  m.remove.mockResolvedValue(undefined);
});
afterEach(()=>useCanvasStore.getState()._setStateNoAutosave({canvasId:undefined}));
describe('project edge ownership',()=>{
  it('Delete dispatches the exact Relation owner and never calls native disconnect for a semantic edge',async()=>{
    const native=vi.spyOn(useCanvasStore.getState(),'disconnectEdges');await removeLcosSelection([],['edge-core']);
    expect(m.remove).toHaveBeenCalledWith('relation-real');expect(native).not.toHaveBeenCalled();native.mockRestore();
  });
  it('a failed Core delete preserves the real native edge and binding',async()=>{
    m.remove.mockRejectedValue(new Error('Core reply unknown'));await expect(removeLcosSelection([],['edge-core'])).rejects.toThrow('unknown');
    expect(useCanvasStore.getState().edges[0]?.id).toBe('edge-core');expect(m.notify).toHaveBeenCalled();
  });
  it('reconnect preserves kind/evidence/id and updates the existing canonical relation before projecting',async()=>{
    const relation={id:'relation-real',projectId:'p-edge',sourceEntityType:'artifact',sourceEntityId:'a-from',targetEntityType:'artifact',targetEntityId:'a-old',kind:'references',evidenceRefs:[{kind:'artifact',id:'proof'}],createdAt:'2026-09-01',updatedAt:'2026-09-01'};
    m.get.mockResolvedValue(relation);m.resolve.mockImplementation(async(id:string)=>({entityType:'artifact',entityId:`a-${id}`}));m.put.mockImplementation(async(_project:string,next:unknown)=>({relation:next}));
    await reconnectSemanticEdge('edge-core','from','new');
    expect(m.put.mock.calls[0]?.[1]).toEqual({...relation,targetEntityId:'a-new'});
    expect(m.put.mock.invocationCallOrder[0]).toBeLessThan(m.project.mock.invocationCallOrder[0] ?? Infinity);
    expect(m.project).toHaveBeenCalledWith(expect.objectContaining({id:'relation-real',kind:'references'}),'from','new');
  });
  it('does not mistake a committed relation awaiting its binding for a native-only edge',async()=>{
    m.bindings.mockResolvedValue([]);m.list.mockResolvedValue([{sourceEntityType:'artifact',sourceEntityId:'a-from',targetEntityType:'artifact',targetEntityId:'a-old'}]);
    await expect(removeLcosSelection([],['edge-core'])).rejects.toThrow('绑定尚未读回');expect(useCanvasStore.getState().edges).toHaveLength(1);
  });
  it('uses durable View endpoints for reconnect and for an additional View awaiting its edge binding',async()=>{
    m.resolve.mockImplementation(async(id:string)=>id==='from'?{entityType:'view',entityId:'extra-view'}:{entityType:'artifact',entityId:`a-${id}`});
    m.get.mockResolvedValue({id:'relation-real',projectId:'p-edge',sourceEntityType:'artifact',sourceEntityId:'a-from',targetEntityType:'artifact',targetEntityId:'a-old',kind:'references'});
    m.put.mockImplementation(async(_project:string,next:unknown)=>({relation:next}));
    await reconnectSemanticEdge('edge-core','from','new');
    expect(m.put.mock.calls[0]?.[1]).toMatchObject({sourceEntityType:'view',sourceEntityId:'extra-view',targetEntityId:'a-new'});
    m.bindings.mockResolvedValue([]);m.list.mockResolvedValue([{sourceEntityType:'view',sourceEntityId:'extra-view',targetEntityType:'artifact',targetEntityId:'a-old'}]);
    await expect(removeLcosSelection([],['edge-core'])).rejects.toThrow('绑定尚未读回');
    expect(useCanvasStore.getState().edges).toHaveLength(1);
  });
});
