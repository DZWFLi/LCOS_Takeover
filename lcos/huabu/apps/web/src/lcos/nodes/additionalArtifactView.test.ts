import { beforeEach, describe, expect, it, vi } from 'vitest';

import useCanvasStore from '@/store/canvasStore';

import { createAdditionalArtifactView } from './additionalArtifactView';
import { useLcosReferenceStore } from '../lcosReferenceState';

import type { CopiedArtifactView } from './additionalArtifactView';

const m=vi.hoisted(()=>({graph:vi.fn(),put:vi.fn(),project:vi.fn(),notify:vi.fn(),wait:vi.fn(),workspace:'workspace'}));
const host=vi.hoisted(()=>({projectId:'project',projects:{getProjectGraph:m.graph},artifacts:{putArtifactView:m.put},nodeProjector:{projectEntity:m.project},notifyMutationSuccess:m.notify}));
vi.mock('../host/lcosHostState',()=>({useLcosHostStore:{getState:()=>({host})}}));
vi.mock('../shell/lcosShellStore',()=>({useLcosShellStore:{getState:()=>({projectId:'project',activeWorkspaceId:m.workspace})}}));
vi.mock('../navigation/waitForProjectedEntity',()=>({waitForProjectedEntity:m.wait}));
const graph={workspaces:[{id:'workspace',canvasId:'canvas',scopeId:'scope'}],artifacts:[{id:'artifact',projectId:'project',kind:'markdown',title:'Actual title',managed:true,currentRevisionId:'current'}],
 artifactViews:[{id:'original',artifactId:'artifact',revisionId:'old',scopeId:'scope',position:{x:1,y:2},size:{width:244,height:150},referenceKind:'primary',displayMode:'card',collapsed:false}],
 artifactRevisions:[{id:'old',artifactId:'artifact',fileRecordId:'old-file',status:'superseded'},{id:'current',artifactId:'artifact',fileRecordId:'current-file',status:'current'}],
 fileRecords:[{id:'old-file',projectId:'project',mimeType:'text/plain'}]};
const copy:CopiedArtifactView={projectId:'project',sourceNodeId:'source',reference:{entityType:'artifact',entityId:'artifact',artifactViewId:'original',revisionId:'old'},position:{x:1,y:2},size:{width:555,height:182},textFace:'mindmap'};
beforeEach(()=>{
 for(const value of Object.values(m))if(typeof value==='function')value.mockReset();m.workspace='workspace';
 m.graph.mockResolvedValue(graph);m.put.mockImplementation(async(_id:string,view:unknown)=>view);m.project.mockResolvedValue({spatialId:'additional-node'});m.wait.mockResolvedValue('additional-node');
 useLcosReferenceStore.getState().reset();useLcosReferenceStore.getState().setProject('project');
 useCanvasStore.getState()._setStateNoAutosave({canvasId:'canvas',nodes:[{id:'additional-node',type:'text',position:{x:0,y:0},data:{}}],edges:[]});
});
describe('existing ArtifactView producer and exact additional projection',()=>{
 it('persists an explicit View before projecting its identity, keeps the copied old revision, and waits for the exact visible occurrence',async()=>{
  expect(await createAdditionalArtifactView(copy,{x:31,y:32})).toBe('additional-node');
  expect(m.put.mock.calls[0]?.[1]).toMatchObject({artifactId:'artifact',scopeId:'scope',revisionId:'old',referenceKind:'explicit_additional',size:copy.size});
  expect(m.project.mock.calls[0]?.[0]).toMatchObject({entityType:'view',entityId:m.put.mock.calls[0]?.[1].id,fileRecordId:'old-file',currentRevisionId:'old'});
  expect(m.put.mock.invocationCallOrder[0]).toBeLessThan(m.project.mock.invocationCallOrder[0]??Infinity);
  expect(m.wait).toHaveBeenCalledWith(expect.objectContaining({entityType:'artifact',entityId:'artifact',nodeId:'additional-node'}));
  expect(useLcosReferenceStore.getState().nodeEntityRefs.get('additional-node')).toMatchObject({entityType:'artifact',entityId:'artifact',descriptor:{artifactViewReferenceKind:'explicit_additional',presentedRevisionId:'old',currentRevisionId:'current',fileRecordId:'old-file'}});
  expect(useCanvasStore.getState().nodes[0]?.data.lcosTextViewMode).toBe('mindmap');
 });
 it('rejects a missing copied revision before any producer mutation instead of copying Current',async()=>{
  await expect(createAdditionalArtifactView({...copy,reference:{...copy.reference,revisionId:'missing'}},{x:31,y:32})).rejects.toThrow('未改用 Current');
  expect(m.put).not.toHaveBeenCalled();expect(m.project).not.toHaveBeenCalled();
 });
 it('does not project into another workspace after a confirmed canonical View creation',async()=>{
  m.put.mockImplementation(async(_id:string,view:unknown)=>{m.workspace='other';return view;});
  expect(await createAdditionalArtifactView(copy,{x:31,y:32})).toBeUndefined();expect(m.project).not.toHaveBeenCalled();expect(m.notify).toHaveBeenCalled();
 });
 it('preserves a real partial producer failure and asks the existing reconciler to recover; never reports a native clone',async()=>{
  m.project.mockRejectedValue(new Error('RFS unavailable'));
  await expect(createAdditionalArtifactView(copy,{x:31,y:32})).rejects.toThrow('RFS unavailable');
  expect(m.put).toHaveBeenCalledOnce();expect(m.notify).toHaveBeenCalled();expect(m.wait).not.toHaveBeenCalled();
 });
});
