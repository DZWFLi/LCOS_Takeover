import { HttpClient } from '@local-creative-os/web-gen2';
import { beforeEach, expect, it, vi } from 'vitest';

import { receiveCanvasMaterialDrop } from './materialTransferIngress';
import { navigationGraph } from '../navigation/navigationFixtures';

const m = vi.hoisted(() => ({
  shell: { projectId: 'p', activeWorkspaceId: 'w', activeSurface: 'context', requestLocate: vi.fn() },
  canvas: { canvasId: 'context-canvas' }, graph: vi.fn(), imported: vi.fn(), text: vi.fn(),
  refresh: vi.fn(), notice: vi.fn(), membership: vi.fn(), http: undefined as unknown,
}));
vi.mock('@/components/Common/Toast', () => ({ toast: m.notice }));
vi.mock('@/store/canvasStore', () => ({ default: { getState: () => m.canvas } }));
vi.mock('../shell/lcosShellStore', () => ({ useLcosShellStore: { getState: () => m.shell } }));
vi.mock('../lcosReferenceState', () => ({ useLcosReferenceStore: { getState: () => ({ requestNodeBindingRefresh: m.refresh, nodeEntityRefs: new Map() }) } }));
vi.mock('../app/lcosCoreClient', () => ({ createLcosCoreSession: () => ({ http: m.http,
  projects: { getProjectGraph: m.graph }, artifacts: { importCopiedFile: m.imported, createTextArtifact: m.text },
}) }));

const siteGraph = navigationGraph({ scopes: [{ id: 'scope-context', projectId: 'p', kind: 'context' }],
  workspaces: [{ id: 'w', projectId: 'p', scopeId: 'scope-context', canvasId: 'context-canvas' }] });
function receipt(name: string, reused = false) {
  return { artifact: { id: `artifact-${name}`, projectId: 'p' }, revision: { id: `revision-${name}`, artifactId: `artifact-${name}` },
    view: { id: `view-${name}`, artifactId: `artifact-${name}` }, reused };
}
function transfer(files: File[], data: Record<string, string> = {}) {
  return { types: [...Object.keys(data), ...(files.length ? ['Files'] : [])], files, items: [],
    getData: (kind: string) => data[kind] ?? '' } as unknown as DataTransfer;
}
beforeEach(() => {
  vi.clearAllMocks();
  m.shell.projectId = 'p'; m.shell.activeWorkspaceId = 'w'; m.canvas.canvasId = 'context-canvas';
  m.graph.mockReset().mockResolvedValue(siteGraph);
  m.imported.mockReset().mockImplementation(async (_project: string, input: {file: File}) => receipt(input.file.name));
  m.text.mockReset().mockResolvedValue({artifactId:'text-artifact',revisionId:'text-revision',viewId:'text-view'});
  m.membership.mockReset().mockImplementation(async (_url: string, body: {viewIds: string[]}) => body.viewIds.map(artifactViewId =>
    ({workspaceId:'w',artifactViewId,addedBy:'import',addedAt:'2026-10-13T00:00:00Z'})));
  m.http = new HttpClient({ baseUrl: 'http://core', fetch: async (url, init) => {
    const value = await m.membership(String(url), JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ok:true,value}), {status:200});
  } });
});

it('imports each file through the original producer and adds its exact View to the addressed Context/Workflow workspace', async () => {
  const files = [new File(['a'], 'one.txt'), new File(['b'], 'two.png')];
  expect(receiveCanvasMaterialDrop('p', transfer(files), {x:24,y:48})).toBe(true);
  await vi.waitFor(() => expect(m.notice).toHaveBeenCalled());
  expect(m.imported).toHaveBeenCalledTimes(2);
  expect(m.imported.mock.calls[0]?.[1]).toMatchObject({file:files[0],scopeId:'scope-context',position:{x:24,y:48}});
  expect(m.imported.mock.calls[1]?.[1]).toMatchObject({file:files[1],scopeId:'scope-context',position:{x:52,y:76}});
  expect(m.membership.mock.calls).toEqual([
    ['http://core/workspaces/w/members',{viewIds:['view-one.txt'],addedBy:'import'}],
    ['http://core/workspaces/w/members',{viewIds:['view-two.png'],addedBy:'import'}],
  ]);
  expect(m.refresh).toHaveBeenCalledOnce();
  expect(m.notice).toHaveBeenCalledWith('已加入 2 份项目材料，原文件保留。');
});

it('keeps prior successful files visible when a later import fails', async () => {
  m.imported.mockResolvedValueOnce(receipt('one')).mockRejectedValueOnce(new Error('第二个文件读取失败'));
  receiveCanvasMaterialDrop('p', transfer([new File(['a'],'one'),new File(['b'],'two')]), {x:0,y:0});
  await vi.waitFor(() => expect(m.notice).toHaveBeenCalled());
  expect(m.refresh).toHaveBeenCalledOnce(); expect(m.membership).toHaveBeenCalledOnce();
  expect(m.notice.mock.calls[0]?.[0]).toContain('已保存 1 份材料');
  expect(m.notice.mock.calls[0]?.[0]).toContain('第二个文件读取失败');
});

it('does not report saved bytes as an arrived file when the workspace receipt does not contain its View', async () => {
  m.membership.mockResolvedValue([]);
  receiveCanvasMaterialDrop('p',transfer([new File(['a'],'one')]),{x:0,y:0});
  await vi.waitFor(() => expect(m.notice).toHaveBeenCalled());
  expect(m.notice.mock.calls[0]?.[0]).toContain('材料显示尚未确认');
  expect(m.refresh).toHaveBeenCalledOnce(); expect(m.imported).toHaveBeenCalledOnce();
});

it('does not start any import if navigation changes while the original destination is being read', async () => {
  let finish!: (value: typeof siteGraph) => void;
  m.graph.mockImplementationOnce(() => new Promise(resolve=>{finish=resolve;}));
  receiveCanvasMaterialDrop('p',transfer([new File(['a'],'one')]),{x:0,y:0});
  m.shell.activeWorkspaceId = 'new-site'; finish(siteGraph);
  await new Promise(resolve=>setTimeout(resolve,0));
  expect(m.imported).not.toHaveBeenCalled(); expect(m.membership).not.toHaveBeenCalled();
  expect(m.notice).not.toHaveBeenCalled();
});

it('finishes only the already committed file in its original site when navigation changes during upload', async () => {
  let finish!: (value: ReturnType<typeof receipt>) => void;
  m.imported.mockImplementationOnce(() => new Promise(resolve=>{finish=resolve;}));
  receiveCanvasMaterialDrop('p',transfer([new File(['a'],'one'),new File(['b'],'two')]),{x:0,y:0});
  await vi.waitFor(()=>expect(m.imported).toHaveBeenCalledOnce());
  m.shell.activeWorkspaceId='new-site'; m.canvas.canvasId='new-canvas'; finish(receipt('one'));
  await vi.waitFor(()=>expect(m.membership).toHaveBeenCalledOnce());
  expect(m.membership.mock.calls[0]?.[0]).toBe('http://core/workspaces/w/members');
  expect(m.imported).toHaveBeenCalledOnce(); expect(m.refresh).not.toHaveBeenCalled();
  expect(m.notice).not.toHaveBeenCalled();
});

it('keeps an unknown or foreign import receipt from creating a membership in the current site', async () => {
  m.imported.mockResolvedValue({...receipt('one'),artifact:{id:'foreign',projectId:'other-project'}});
  receiveCanvasMaterialDrop('p',transfer([new File(['a'],'one')]),{x:0,y:0});
  await vi.waitFor(()=>expect(m.notice).toHaveBeenCalled());
  expect(m.membership).not.toHaveBeenCalled();
  expect(m.notice.mock.calls[0]?.[0]).toContain('回执尚未确认');
});

it('claims invalid material transfers without converting their accompanying text into a second native import', () => {
  expect(receiveCanvasMaterialDrop('p',transfer([],{'application/x-lcos-material-transfer':'broken','text/plain':'fallback'}),{x:0,y:0})).toBe(true);
  expect(m.imported).not.toHaveBeenCalled(); expect(m.text).not.toHaveBeenCalled();
  expect(m.notice).toHaveBeenCalledWith('这块摘取材料无法识别，原件保留。',{tone:'danger'});
});

it('stores ordinary external text through the existing project producer instead of making an unbound native note', async () => {
  const body='  文件阅读摘录\n第二行保持原样。  ';
  expect(receiveCanvasMaterialDrop('p',transfer([],{'text/plain':body}),{x:30,y:60})).toBe(true);
  await vi.waitFor(()=>expect(m.notice).toHaveBeenCalled());
  expect(m.text).toHaveBeenCalledExactlyOnceWith('p',expect.objectContaining({body,scopeId:'scope-context',workspaceId:'w',x:30,y:60}));
  expect(m.imported).not.toHaveBeenCalled();
  expect(m.refresh).toHaveBeenCalledOnce();
});

it('accepts real clipboard File items without requiring a populated FileList', async () => {
  const image = new File(['image-bytes'],'clipboard.png',{type:'image/png'});
  const data = transfer([]);
  Object.assign(data,{types:['Files'],items:[{kind:'file',getAsFile:()=>image}]});
  expect(receiveCanvasMaterialDrop('p',data,{x:10,y:20})).toBe(true);
  await vi.waitFor(()=>expect(m.notice).toHaveBeenCalled());
  expect(m.imported).toHaveBeenCalledOnce();
  expect(m.imported.mock.calls[0]?.[1].file).toBe(image);
});

it('does not manufacture text from an unreadable OS file drag', () => {
  const data = transfer([],{'text/plain':'file:///E:/folder'});
  Object.assign(data,{types:['Files','text/plain'],items:[{kind:'file',getAsFile:()=>null}]});
  expect(receiveCanvasMaterialDrop('p',data,{x:0,y:0})).toBe(false);
  expect(m.text).not.toHaveBeenCalled(); expect(m.imported).not.toHaveBeenCalled();
});
