import { act } from 'react';
import { createRoot,type Root } from 'react-dom/client';
import { beforeEach,afterEach,expect,it,vi } from 'vitest';

const mocks=vi.hoisted(()=>({read:vi.fn(),geometry:vi.fn()}));
vi.mock('../app/lcosCoreClient',()=>({createLcosCoreSession:()=>({http:{}})}));
vi.mock('./semanticNavigationLocations',()=>({readSemanticNavigationLocations:mocks.read}));
vi.mock('./railwayMemberGeometry',()=>({readRailwayMemberGeometry:mocks.geometry}));
import { RailwayScopePeek } from './RailwayScopePeek';

import type { ProjectNavigationIndex } from './projectNavigationIndex';
import type { RailwayDestinationV1 } from '@local-creative-os/contracts';

globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let root:Root;let host:HTMLDivElement;
const index={graph:{project:{id:'p'},scopes:[],notes:[],artifactViews:[],artifactRevisions:[],fileRecords:[],
  artifacts:[{id:'a',title:'实际材料',kind:'image',availability:'missing'}],workspaces:[{id:'related',scopeId:'scope-a'},{id:'unrelated',scopeId:'other'}]},
  collections:[],destinations:[],issues:[]} as unknown as ProjectNavigationIndex;
const destination=(id:string):RailwayDestinationV1=>({key:id,label:id,ref:{kind:'worksite',projectId:'p',worksiteId:id},
  workspaceId:id,role:'worksite',available:true,accepts:[]});
const result=(scopeId:string)=>({locations:[{entityType:'scope',entityId:scopeId,members:[{entityType:'artifact',entityId:'a'}],unresolvedViewIds:['missing-view']}],issues:[]});
async function render(scopeId='scope-a',refreshKey='before') {
  await act(async()=>root.render(<RailwayScopePeek projectId="p" scopeId={scopeId} index={index} refreshKey={refreshKey}
    worksiteDestinations={[destination('related'),destination('unrelated')]} onOpenWorksite={()=>undefined}/>));
}
beforeEach(()=>{mocks.read.mockReset();mocks.geometry.mockReset();mocks.geometry.mockResolvedValue({geometry:[]});
  host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
it('keeps missing geometry and unresolved references honest, retains only scope-related existing worksite entries',async()=>{
  mocks.read.mockResolvedValue(result('scope-a'));await render();
  expect(host.querySelectorAll('[data-lcos-railway-map-member]')).toHaveLength(0);
  expect(host.textContent).toContain('暂无成员空间布局数据');expect(host.textContent).toContain('2 个成员');
  expect(host.textContent).toContain('1 项引用暂不可解析');expect(host.textContent).toContain('部分原材料已缺失');
  expect(host.querySelector('[data-lcos-railway-scope-worksites]')?.textContent).toBe('related');
});
it('reads the same scope membership and geometry again after a receipt refresh',async()=>{
  mocks.read.mockResolvedValue(result('scope-a'));await render();await render('scope-a','receipt-new');
  expect(mocks.read).toHaveBeenCalledTimes(2);expect(mocks.geometry).toHaveBeenCalledTimes(2);
});
it('never publishes an old scope completion after identity changes',async()=>{
  let resolveOld!:(value:ReturnType<typeof result>)=>void;
  mocks.read.mockImplementation((_session:unknown,_project:string)=>Promise.resolve(result(_project)));
  mocks.read.mockReturnValueOnce(new Promise(resolve=>{resolveOld=resolve;})).mockResolvedValueOnce({locations:[],issues:[]});
  await render('scope-a');await render('scope-new');
  await act(async()=>resolveOld(result('scope-a')));
  expect(host.textContent).toContain('尚未保存成员');expect(host.textContent).not.toContain('2 个成员');
});
it('reports membership failure without manufacturing an empty-success map',async()=>{
  mocks.read.mockRejectedValue(new Error('Core读取失败'));await render();
  expect(host.textContent).toContain('Core读取失败');expect(host.textContent).not.toContain('尚未保存成员');
  expect(mocks.geometry).not.toHaveBeenCalled();
});
