import { act,createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, expect, it, vi } from 'vitest';

import { useCanvasShortcuts } from '@/hooks/shortcuts/useCanvasShortcuts';
import useCanvasStore from '@/store/canvasStore';

import { duplicateLcosSelection, pasteLcosClipboard } from './artifactClipboard';
import { useLcosReferenceStore } from '../lcosReferenceState';

import type { CopiedArtifactView } from './additionalArtifactView';

const m=vi.hoisted(()=>({bindings:vi.fn(),create:vi.fn(),snapshot:vi.fn()}));
vi.mock('../host/lcosHostState',()=>({useLcosHostStore:{getState:()=>({host:{bindings:{list:m.bindings}}})}}));
vi.mock('./additionalArtifactView',()=>({createAdditionalArtifactView:m.create,snapshotCopiedArtifactView:m.snapshot}));
const copy:CopiedArtifactView={projectId:'project',sourceNodeId:'source',reference:{entityType:'artifact',entityId:'artifact',artifactViewId:'view',revisionId:'old'},position:{x:10,y:20},size:{width:244,height:150}};
beforeEach(()=>{
 m.bindings.mockReset();m.create.mockReset();m.snapshot.mockReset();m.bindings.mockResolvedValue([]);m.create.mockResolvedValue('new-view-node');m.snapshot.mockReturnValue(copy);
 useCanvasStore.getState()._setStateNoAutosave({canvasId:'canvas',nodes:[{id:'source',type:'text',position:{x:10,y:20},data:{},selected:true}],edges:[]});
 useLcosReferenceStore.getState().reset();useLcosReferenceStore.getState().setProject('project');
 useLcosReferenceStore.getState().beginNodeBindingRead('project','canvas');
 useLcosReferenceStore.getState().applyNodeBindings('project','canvas',[],'ready');
});
it('does not mistake a projected node awaiting its binding census for permission to clone it natively',async()=>{
 useLcosReferenceStore.getState().beginNodeBindingRead('project','canvas');
 // First census has not settled; partial metadata must not authorize native copy.
 useLcosReferenceStore.setState({bindingIdentitiesReady:false});
 const native=vi.spyOn(useCanvasStore.getState(),'pasteNodes');
 try{await expect(duplicateLcosSelection()).rejects.toThrow('身份仍在读取');expect(native).not.toHaveBeenCalled();expect(m.create).not.toHaveBeenCalled();}finally{native.mockRestore();}
});
it('Ctrl D of an Artifact invokes the real View producer and cannot fall through to a native clone',async()=>{
 useLcosReferenceStore.getState().registerNodeEntity('source',{entityType:'artifact',entityId:'artifact'});
 const native=vi.spyOn(useCanvasStore.getState(),'pasteNodes');
 try{await duplicateLcosSelection();expect(m.create).toHaveBeenCalledWith(copy,{x:34,y:44});expect(native).not.toHaveBeenCalled();}finally{native.mockRestore();}
});
it('the mounted canvas Ctrl D shortcut reaches the same additional View owner',async()=>{
 useLcosReferenceStore.getState().registerNodeEntity('source',{entityType:'artifact',entityId:'artifact'});
 const Owner=()=>{useCanvasShortcuts({rfInstanceRef:{current:null},mousePositionRef:{current:{x:0,y:0}}},{chromeMode:'lcos'});return null;};
 const mount=document.createElement('div');document.body.appendChild(mount);const root=createRoot(mount);
 try{act(()=>root.render(createElement(Owner)));await act(async()=>{window.dispatchEvent(new KeyboardEvent('keydown',{key:'d',ctrlKey:true,bubbles:true,cancelable:true}));await new Promise(resolve=>setTimeout(resolve,0));});
 expect(m.create).toHaveBeenCalledWith(copy,{x:34,y:44});}finally{act(()=>root.unmount());mount.remove();}
});
it('serialized copy/paste retains the exact copied revision even when current foreground facts have changed',async()=>{
 const native=vi.spyOn(useCanvasStore.getState(),'pasteNodes');
 try{await pasteLcosClipboard(JSON.stringify({__lcos_artifact_views__:[copy]}),{nodes:[],edges:[],srcCanvasId:'canvas'},{x:500,y:600});
 expect(m.create).toHaveBeenCalledWith(expect.objectContaining({reference:copy.reference}),{x:500,y:600});expect(native).not.toHaveBeenCalled();}finally{native.mockRestore();}
});
it('an older native payload containing a known Core node fails honestly instead of losing its identity',async()=>{
 m.bindings.mockResolvedValue([{canvasId:'canvas',spatialKind:'node',spatialId:'source',entityType:'artifact',entityId:'artifact'}]);
 const native=vi.spyOn(useCanvasStore.getState(),'pasteNodes');
 try{await expect(pasteLcosClipboard(null,{nodes:[{id:'source'}],edges:[],srcCanvasId:'canvas'},{x:500,y:600})).rejects.toThrow('未克隆成无身份节点');expect(native).not.toHaveBeenCalled();}finally{native.mockRestore();}
});
it('cross project and mixed bound/native copies cannot silently produce a partially native group',async()=>{
 await expect(pasteLcosClipboard(JSON.stringify({__lcos_artifact_views__:[{...copy,projectId:'other'}]}),{nodes:[],edges:[]},{x:500,y:600})).rejects.toThrow('跨项目');expect(m.create).not.toHaveBeenCalled();
 useCanvasStore.getState()._setStateNoAutosave({nodes:[...useCanvasStore.getState().nodes,{id:'native',type:'text',position:{x:0,y:0},data:{},selected:true}]});
 useLcosReferenceStore.getState().registerNodeEntity('source',{entityType:'artifact',entityId:'artifact'});
 await expect(duplicateLcosSelection()).rejects.toThrow('分别复制');expect(m.create).not.toHaveBeenCalled();
});
