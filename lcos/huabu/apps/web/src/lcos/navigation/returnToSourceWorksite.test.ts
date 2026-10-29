import { beforeEach, expect, it, vi } from 'vitest';

import { returnToSourceWorksite } from './returnToSourceWorksite';

import type { LcosChildReturn } from '../shell/lcosShellStore';
const m = vi.hoisted(() => ({ transition: null as null | { id: string; canvasId: string; kind: string; targetViewport?: object },
 canvas: { canvasId: 'child', nodes: [{id:'source-node'}], setViewport: vi.fn(), selectNodes: vi.fn(), switchCanvas: vi.fn() },
 clear:vi.fn(), navigate:vi.fn(), wait:vi.fn(), animate:vi.fn() }));
vi.mock('@/store/canvasStore',()=>({default:{getState:()=>m.canvas}}));
vi.mock('../shell/lcosShellStore',()=>({useLcosShellStore:{getState:()=>({worksiteCameraTransition:m.transition,
 requestWorksiteCameraTransition:(value:object)=>{m.transition={...value,id:'return'} as typeof m.transition;return 'return';},
 consumeWorksiteCameraTransition:(id:string)=>{if(m.transition?.id===id)m.transition=null;},clearChildNavigation:m.clear})}}));
vi.mock('./worksiteCameraTransition',()=>({animateCurrentWorksiteCamera:m.animate}));
vi.mock('./waitForProjectedEntity',()=>({waitForProjectedEntity:m.wait}));
const context: LcosChildReturn = {projectId:'p',sourceSurface:'context',sourceWasChild:true,sourceWorkspaceId:'origin',sourceCanvasId:'source',selectedNodeIds:['source-node']};
beforeEach(()=>{vi.clearAllMocks();m.transition=null;m.canvas.canvasId='child';m.animate.mockResolvedValue(undefined);m.canvas.switchCanvas.mockImplementation(async()=>{m.canvas.canvasId='source';return true;});});
it('commits return and releases the intent even for legacy history without a captured viewport',async()=>{
 expect(await returnToSourceWorksite({projectId:'p',context,navigate:m.navigate})).toBe(true);
 expect(m.canvas.selectNodes).toHaveBeenCalledWith(['source-node']);expect(m.clear).toHaveBeenCalledOnce();
 expect(m.navigate).toHaveBeenCalledWith('/projects/p/context?workspaceId=origin',{replace:true});expect(m.transition).toBeNull();
});
it('retains history and rejects when the original source fails loading',async()=>{
 m.canvas.switchCanvas.mockResolvedValue(false);await expect(returnToSourceWorksite({projectId:'p',context,navigate:m.navigate})).rejects.toThrow('来源现场');
 expect(m.clear).not.toHaveBeenCalled();expect(m.navigate).not.toHaveBeenCalled();expect(m.transition).toBeNull();
});
it('late source response after a newer root request cannot select nodes or route',async()=>{
 let finish!:(v:boolean)=>void;m.canvas.switchCanvas.mockImplementation(()=>new Promise<boolean>(r=>{finish=r;}));
 const pending=returnToSourceWorksite({projectId:'p',context,navigate:m.navigate});await vi.waitFor(()=>expect(finish).toBeTypeOf('function'));
 m.transition=null;finish(true);expect(await pending).toBe(false);expect(m.navigate).not.toHaveBeenCalled();expect(m.clear).not.toHaveBeenCalled();expect(m.canvas.selectNodes).not.toHaveBeenCalled();
});
it('late projection binding after cancellation cannot steal the new root selection or route',async()=>{
 let finish!:(id:string)=>void;m.wait.mockImplementation(()=>new Promise<string>(r=>{finish=r;}));
 const pending=returnToSourceWorksite({projectId:'p',context:{...context,sourceEntityRefs:[{nodeId:'rebuilt',entityType:'note',entityId:'n'}]},navigate:m.navigate});
 await vi.waitFor(()=>expect(finish).toBeTypeOf('function'));m.transition={id:'newer',kind:'enter-settle',canvasId:'root'};m.canvas.canvasId='root';finish('new-node');
 expect(await pending).toBe(false);expect(m.navigate).not.toHaveBeenCalled();expect(m.canvas.selectNodes).not.toHaveBeenCalled();expect(m.transition.id).toBe('newer');
});
