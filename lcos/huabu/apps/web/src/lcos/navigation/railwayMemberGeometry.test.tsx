import { describe,expect,it,vi,beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ list:vi.fn(),scene:vi.fn(),canvas:{canvasId:'canvas-current',nodes:[] as Array<{
  id:string;position:{x:number;y:number};measured?:{width:number;height:number};parentId?:string;hidden?:boolean;
}>}, references:{projectId:'p',bindingCanvasId:'canvas-current',bindingIdentitiesReady:true,
  nodeEntityRefs:new Map<string,{entityType:'artifact'|'collection';entityId:string}>()} }));
vi.mock('@local-creative-os/web-gen2',()=>({SqliteBindingStore:class {list=mocks.list;}}));
vi.mock('@/api/canvas',()=>({getSpacePreviewScene:mocks.scene}));
vi.mock('@/store/canvasStore',()=>({default:{getState:()=>mocks.canvas}}));
vi.mock('../lcosReferenceState',()=>({useLcosReferenceStore:{getState:()=>mocks.references}}));

import { railwayMemberBindingMatches,railwayMemberMapCanvas,readRailwayMemberGeometry } from './railwayMemberGeometry';
import { railwayMemberMapLayout } from './RailwayMemberMap';

import type { RailwayMapMember } from './RailwayMemberMap';
import type { LcosCoreSession } from '../app/lcosCoreClient';
import type { ProjectGraphSnapshot } from '@local-creative-os/contracts';
import type { ProjectionBinding } from '@local-creative-os/web-gen2';

const member=(id:string):RailwayMapMember=>({key:id,entityType:'artifact',entityId:id,label:id,kind:'image',availability:'available'});
const binding=(canvasId:string,spatialId:string,entityType:ProjectionBinding['entityType'],entityId:string):ProjectionBinding=>({
  projectId:'p',canvasId,spatialId,entityType,entityId,spatialKind:'node',
});
const session={http:{},projects:{getProjectGraph:vi.fn()}} as unknown as Pick<LcosCoreSession,'http'|'projects'>;
beforeEach(()=>{mocks.list.mockReset();mocks.scene.mockReset();mocks.canvas.canvasId='canvas-current';mocks.canvas.nodes=[];
  mocks.references.bindingCanvasId='canvas-current';mocks.references.projectId='p';mocks.references.nodeEntityRefs.clear();});

describe('single-owner Railway geometry',()=>{
  it('keeps actual spatial order and size, limits objects to twelve, and never fills invalid coordinates',()=>{
    const input=Array.from({length:13},(_,i)=>({memberKey:String(i),nodeId:String(i),x:i*100,y:i%2*500,width:40+i,height:70}));
    const layout=railwayMemberMapLayout(input);
    expect(layout.placed).toHaveLength(12);expect(layout.overflow).toBe(1);
    const [first,second] = layout.placed;
    if (!first || !second) throw new Error('Expected two real placements');
    expect(second.left).toBeGreaterThan(first.left);
    expect(second.top).toBeGreaterThan(first.top);
    expect(railwayMemberMapLayout([{memberKey:'invalid',nodeId:'invalid',x:NaN,y:0,width:40,height:70}]).placed).toEqual([]);
  });
  it('chooses one owner canvas, excludes other projects, and respects explicit view identity',()=>{
    const refs=[binding('canvas-a','owner','collection','c'),binding('canvas-b','b1','artifact','a'),
      {...binding('canvas-foreign','bad','collection','c'),projectId:'other'},binding('canvas-a','a1','artifact','a')];
    expect(railwayMemberMapCanvas('p',{entityType:'collection',entityId:'c'},[member('a')],refs,'canvas-b')).toBe('canvas-a');
    expect(railwayMemberBindingMatches({...member('a'),artifactViewId:'view-exact'},{entityType:'view',entityId:'view-exact'})).toBe(true);
    expect(railwayMemberBindingMatches({...member('a'),artifactViewId:'view-exact'},{entityType:'view',entityId:'view-other'})).toBe(false);
  });
  it('uses live parent-aware Huabu geometry rather than a stale preview snapshot',async()=>{
    mocks.references.nodeEntityRefs.set('owner',{entityType:'collection',entityId:'c'});
    mocks.references.nodeEntityRefs.set('child',{entityType:'artifact',entityId:'a'});
    mocks.canvas.nodes=[{id:'parent',position:{x:700,y:200},measured:{width:500,height:500}},
      {id:'child',parentId:'parent',position:{x:30,y:50},measured:{width:80,height:90}}];
    mocks.list.mockResolvedValue([binding('canvas-current','old','artifact','a')]);
    mocks.scene.mockResolvedValue({canvasId:'canvas-current',title:'现场',nodes:[{id:'child',x:0,y:0,width:999,height:999}],truncated:{nodes:false}});
    const result=await readRailwayMemberGeometry(session,'p',{entityType:'collection',entityId:'c'},[member('a')],new AbortController().signal);
    expect(result.geometry).toMatchObject([{nodeId:'child',x:730,y:250,width:80,height:90}]);
    expect(result.geometry).toHaveLength(1);
  });
  it('uses only one remote canvas and leaves unprojected members unplaced',async()=>{
    mocks.references.projectId='another';
    mocks.list.mockResolvedValue([binding('canvas-a','owner','collection','c'),binding('canvas-a','a','artifact','a'),binding('canvas-b','b','artifact','b')]);
    mocks.scene.mockResolvedValue({canvasId:'canvas-a',title:'远端',nodes:[{id:'a',x:400,y:50,width:60,height:70}],truncated:{nodes:false}});
    const result=await readRailwayMemberGeometry(session,'p',{entityType:'collection',entityId:'c'},[member('a'),member('b')],new AbortController().signal);
    expect(mocks.scene).toHaveBeenCalledWith('canvas-a');expect(result.geometry.map(item=>item.memberKey)).toEqual(['a']);
  });
  it('resolves view-only production bindings through real Core artifactViews and rejects ambiguous occurrences',async()=>{
    mocks.references.projectId='another';
    mocks.list.mockResolvedValue([binding('canvas-a','owner','collection','c'),binding('canvas-a','view-node','view','view-a')]);
    mocks.scene.mockResolvedValue({canvasId:'canvas-a',title:'Main',nodes:[{id:'view-node',x:120,y:240,width:90,height:80}],truncated:{nodes:false}});
    const graph={project:{id:'p'},artifactViews:[{id:'view-a',artifactId:'a'},{id:'view-b',artifactId:'a'}]} as unknown as ProjectGraphSnapshot;
    const result=await readRailwayMemberGeometry(session,'p',{entityType:'collection',entityId:'c'},[member('a')],new AbortController().signal,graph);
    expect(result.geometry).toMatchObject([{memberKey:'a',nodeId:'view-node',x:120,y:240}]);
    mocks.list.mockResolvedValue([binding('canvas-a','owner','collection','c'),binding('canvas-a','first','view','view-a'),binding('canvas-a','second','view','view-b')]);
    expect((await readRailwayMemberGeometry(session,'p',{entityType:'collection',entityId:'c'},[member('a')],new AbortController().signal,graph)).geometry).toEqual([]);
  });
  it('reports read failure without inventing a layout and ignores a cancelled read',async()=>{
    mocks.references.projectId='another';mocks.list.mockRejectedValue(new Error('offline'));
    expect(await readRailwayMemberGeometry(session,'p',{entityType:'collection',entityId:'c'},[member('a')],new AbortController().signal))
      .toEqual({geometry:[],issue:'成员投影索引暂不可读取'});
    const controller=new AbortController();controller.abort();
    await expect(readRailwayMemberGeometry(session,'p',{entityType:'collection',entityId:'c'},[member('a')],controller.signal)).rejects.toMatchObject({name:'AbortError'});
  });
});
