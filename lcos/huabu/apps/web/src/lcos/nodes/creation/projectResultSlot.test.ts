import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import useCanvasStore from '@/store/canvasStore';

import { createProjectResultSlot } from './projectResultSlot';
import { useLcosReferenceStore } from '../../lcosReferenceState';
import { useLcosShellStore } from '../../shell/lcosShellStore';
const m=vi.hoisted(()=>({workspaces:vi.fn(),create:vi.fn()}));
vi.mock('../../app/lcosCoreClient',()=>({createLcosCoreSession:()=>({projects:{getWorkspaces:m.workspaces},assembly:{createResultSlot:m.create}})}));
beforeEach(()=>{
  m.workspaces.mockReset();m.create.mockReset();
  useCanvasStore.getState()._setStateNoAutosave({canvasId:'canvas-slot',nodes:[],edges:[]});
  useLcosReferenceStore.getState().reset();useLcosReferenceStore.getState().setProject('p-slot');
  useLcosShellStore.setState({projectId:'p-slot',activeWorkspaceId:'workspace-slot'});
  m.workspaces.mockResolvedValue([{id:'workspace-slot',canvasId:'canvas-slot',scopeId:'scope-slot'}]);
});
afterEach(()=>useCanvasStore.getState()._setStateNoAutosave({canvasId:undefined}));
const input={projectId:'p-slot',canvasId:'canvas-slot',workspaceId:'workspace-slot',position:{x:120,y:80}};
describe('blank result producer to actual projection',()=>{
  it('uses current scope and selects only the reconciled slot occurrence',async()=>{
    m.create.mockImplementation(async()=>{
      useCanvasStore.getState()._setStateNoAutosave({nodes:[{id:'real-slot',type:'note',position:{x:120,y:80},data:{lcosPresentationHidden:true}}]});
      useLcosReferenceStore.getState().registerNodeEntity('real-slot',{entityType:'result-slot',entityId:'slot-1'});
      return {projectId:'p-slot',scopeId:'scope-slot',id:'slot-1'};
    });
    expect(await createProjectResultSlot(input)).toEqual({nodeId:'real-slot'});
    expect(m.create).toHaveBeenCalledWith('p-slot',{scopeId:'scope-slot',workspaceId:'workspace-slot',x:120,y:80,width:220,height:128});
    expect(useCanvasStore.getState().nodes).toHaveLength(1);
    expect(useCanvasStore.getState().nodes[0]).toMatchObject({selected:true,data:{lcosPresentationHidden:false}});
  });
  it('does not send a guessed scope when the scene changes during the identity read',async()=>{
    m.workspaces.mockImplementation(async()=>{useLcosShellStore.setState({activeWorkspaceId:'other'});return [{id:'workspace-slot',canvasId:'canvas-slot',scopeId:'scope-slot'}];});
    await expect(createProjectResultSlot(input)).rejects.toThrow('身份未确认');expect(m.create).not.toHaveBeenCalled();
  });
});
