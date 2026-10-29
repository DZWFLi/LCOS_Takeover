import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { LcosRailway } from './LcosRailway';
import { useLcosShellStore } from './lcosShellStore';
import { resolveDropIntent } from '../drop/dropIntentResolver';
import { useLcosDropStore } from '../lcosDropState';
import { navigationGraph, navigationPresentation } from '../navigation/navigationFixtures';
import { projectSpatialDestinations } from '../navigation/projectNavigationIndex';

import type { RailwaySnapshotV1 } from '@local-creative-os/contracts';
import type * as WebGen2 from '@local-creative-os/web-gen2';

const m = vi.hoisted(() => ({ rail: vi.fn(), save: vi.fn(), graph: vi.fn(), collections: vi.fn(), members: vi.fn(),
  presentations: vi.fn(), locate: vi.fn(), file: vi.fn(), receiver: vi.fn(), conversations: vi.fn(), apply:vi.fn(), geometry:vi.fn() }));
vi.mock('@local-creative-os/web-gen2', async original => ({ ...await original<typeof WebGen2>(), coreRequest: m.presentations,
  CoreRailwayClient: class { snapshot = m.rail; save = m.save; },
  CoreConversationClient: class { getReceiverBinding = m.receiver; listConnectedConversations = m.conversations; } }));
vi.mock('../app/lcosCoreClient', () => ({ createLcosCoreSession: () => ({ http: {}, projects: { getProjectGraph: m.graph,applyGraphMutations:m.apply },
  collections: { list: m.collections, members: m.members }, artifacts: { getFileRecordContent: m.file } }) }));
vi.mock('../collaboration/collaborationSessionStore', () => ({ useCollaborationSessionStore: (select: (value: unknown) => unknown) => select({ watchProjectChanges: () => () => {} }) }));
vi.mock('../collaboration/useCollaborationSession', () => ({ useCollaborationSession: () => undefined }));
vi.mock('../navigation/locateSpatialDestination', () => ({ locateSpatialDestination: m.locate }));
vi.mock('../navigation/railwayMemberGeometry', () => ({ readRailwayMemberGeometry: m.geometry }));
const roots: ReturnType<typeof createRoot>[] = [];
const spacesGraph = () => navigationGraph({ scopes: [
  { id: 'context', projectId: 'p', kind: 'context', name: '需求上下文' },
  { id: 'workflow', projectId: 'p', kind: 'workflow', name: '交付步骤' },
] });
const spaceCollections = [{ id: 'collection', projectId: 'p', title: '客户素材', createdAt: '', updatedAt: '' }];
const snapshot = (): RailwaySnapshotV1 => {
  // The existing admission policy requires explicit Core pins for Scope/Collection.
  // Tests of their receiver, rename and navigation use genuinely stored destinations.
  const destinations = projectSpatialDestinations('p', spacesGraph(), spaceCollections);
  return { schemaVersion: 1, projectId: 'p', migrationRequired: false,
    order: { schemaVersion: 1, projectId: 'p', orderedRefs: destinations.map(item => item.ref), version: 7, updatedAt: '' }, destinations, candidates: [] };
};
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // Happy DOM has no layout; native target registration intentionally rejects zero-sized nodes.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(24, 100, 36, 36));
  useLcosShellStore.setState({ projectId: 'p', activeSurface: 'main', activeWorkspaceId: null, windows: [], windowRegions: [] });
  m.rail.mockResolvedValue(snapshot()); m.graph.mockResolvedValue(spacesGraph());
  m.collections.mockResolvedValue(spaceCollections);
  m.members.mockResolvedValue({collection:{id:'collection',projectId:'p',title:'客户素材'},members:[],previews:[]});
  m.presentations.mockResolvedValue([]); m.receiver.mockResolvedValue({ activeReceiverId: null }); m.conversations.mockResolvedValue([]);
  m.locate.mockResolvedValue(true); m.file.mockResolvedValue(new Blob(['preview']));
  m.apply.mockResolvedValue({appliedOps:1,graphVersion:3});localStorage.clear();
  m.geometry.mockResolvedValue({geometry:[]});
});
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.replaceChildren(); useLcosDropStore.getState().reset(); vi.restoreAllMocks(); vi.resetAllMocks(); vi.unstubAllGlobals();localStorage.clear();
});
async function mount() {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host); roots.push(root);
  await act(async () => root.render(<LcosRailway projectId="p" surfaceByWorkspace={new Map()} ensureWorkspaceCanvas={async () => undefined}
    activateDestination={() => {}} mainCanvasId="main" onNavigateMain={async () => true} />));
  return host;
}
function button(label: string): HTMLButtonElement {
  const element = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!element) throw new Error(`Missing ${label}`); return element;
}
it('retains stored canonical spaces and their real membership receiver beside the creation entry', async () => {
  await mount();
  expect([...document.querySelectorAll('[data-lcos-railway-item]')].map(element => element.getAttribute('aria-label')).sort())
    .toEqual(['交付步骤','客户素材','需求上下文']);
  const targets = useLcosDropStore.getState().targets();
  const collection = targets.find(target => target.label === '客户素材');
  const context = targets.find(target => target.label === '需求上下文');
  expect(collection?.semantic).toEqual({ kind: 'collection-membership', collectionId: 'collection' });
  expect(context?.semantic).toEqual({ kind: 'spatial-membership', targetRef: { kind: 'context', id: 'context' } });
  if (!collection) throw new Error('Collection receiver missing');
  expect(resolveDropIntent({ kind: 'object', entityType: 'note', entityId: 'n' },collection).status).toBe('ready');
  expect(m.save).not.toHaveBeenCalled();
});
it('fresh-checks an unpinned spatial identity then locates Main instead of opening a technical Assembly', async () => {
  await mount(); await act(async () => button('需求上下文').click());
  expect(m.rail).toHaveBeenCalledTimes(2); expect(m.graph).toHaveBeenCalledTimes(2);
  expect(m.locate).toHaveBeenCalledWith('p',expect.objectContaining({ ref: { kind: 'spatial', projectId: 'p', entityType: 'scope', entityId: 'context' } }),
    expect.objectContaining({ mainCanvasId: 'main', onNavigateMain: expect.any(Function) }));
  expect(useLcosShellStore.getState().windows).toEqual([]); expect(m.save).not.toHaveBeenCalled();
});
it('rejects an entity removed after the Rail read without rebinding to a same-title Scope', async () => {
  await mount(); m.graph.mockResolvedValue(navigationGraph({ scopes: [{ id: 'replacement', projectId: 'p', kind: 'context', name: '需求上下文' }] }));
  const fresh = snapshot(); m.rail.mockResolvedValue({ ...fresh, destinations: fresh.destinations.filter(item => item.ref.kind !== 'spatial' || item.ref.entityId !== 'context') });
  await act(async () => button('需求上下文').click());
  expect(m.locate).not.toHaveBeenCalled(); expect(document.body.textContent).toContain('目的地已被移出导航');
  expect(m.save).not.toHaveBeenCalled();
});
it('Scope hover previews real saved membership using its exact historical view revision', async () => {
  vi.stubGlobal('IntersectionObserver',class {
    constructor(private readonly onChange: (entries: Array<{ isIntersecting: boolean }>) => void) {}
    observe() { this.onChange([{ isIntersecting: true }]); }
    disconnect() {}
  });
  m.graph.mockResolvedValue(navigationGraph({ scopes: [{ id: 'context', projectId: 'p', kind: 'context', name: '需求上下文' }],
    artifacts: [{ id: 'a', projectId: 'p', title: '原始参考', kind: 'image', availability: 'available', currentRevisionId: 'current' }],
    artifactViews: [{ id: 'view-old', artifactId: 'a', scopeId: 'elsewhere', revisionId: 'old' }],
    artifactRevisions: [{ id: 'old', artifactId: 'a', fileRecordId: 'old-file' },{ id: 'current', artifactId: 'a', fileRecordId: 'current-file' }],
    fileRecords: [{ id: 'old-file', availability: 'current', mimeType: 'image/png', size: 20 },{ id: 'current-file', availability: 'current', mimeType: 'image/png', size: 30 }],
  }));
  m.presentations.mockResolvedValue([navigationPresentation('context',['view-old'])]);
  m.geometry.mockImplementation((_session,_project,_owner,members) => Promise.resolve({canvasId:'original-canvas',geometry:members.map((member: {key:string}) => ({memberKey:member.key,nodeId:'actual-node',x:0,y:0,width:200,height:150}))}));
  await mount(); await act(async () => button('需求上下文').focus());
  expect(document.querySelector('[data-lcos-railway-scope-peek="context"]')).not.toBeNull();
  expect(document.querySelectorAll('[data-lcos-railway-map-member]')).toHaveLength(1);
  expect(document.body.textContent).toContain('1 个成员');
  expect(m.geometry).toHaveBeenCalledWith(expect.anything(),'p',{entityType:'scope',entityId:'context'},expect.arrayContaining([expect.objectContaining({entityType:'artifact',entityId:'a',artifactViewId:'view-old'})]),expect.any(AbortSignal),expect.anything());
  expect(m.file).not.toHaveBeenCalled();
});

it('grows into two columns and allows direct keyboard width changes without changing Core order',async()=>{
  const previous=window.innerHeight;Object.defineProperty(window,'innerHeight',{value:260,configurable:true});
  try{
    await mount();const rail=document.querySelector('[data-lcos-family="railway"]');
    expect(rail?.getAttribute('data-lcos-railway-columns')).toBe('2');
    const grip=document.querySelector<HTMLElement>('[data-lcos-railway-column-grip]');if(!grip)throw new Error('Column grip missing');
    await act(async()=>grip.dispatchEvent(new PointerEvent('pointerdown',{button:0,pointerId:7,clientX:24,bubbles:true,cancelable:true})));
    expect(document.activeElement).toBe(grip);
    await act(async()=>grip.dispatchEvent(new PointerEvent('pointerup',{button:0,pointerId:7,bubbles:true})));
    await act(async()=>grip.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true,cancelable:true})));
    expect(rail?.getAttribute('data-lcos-railway-columns')).toBe('1');
    await act(async()=>grip.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true})));
    expect(rail?.getAttribute('data-lcos-railway-columns')).toBe('2');expect(m.save).not.toHaveBeenCalled();
  }finally{Object.defineProperty(window,'innerHeight',{value:previous,configurable:true});}
});
it('inline Scope rename uses its real graph producer; Collection has no fake rename/delete controls',async()=>{
  await mount();await act(async()=>button('需求上下文').focus());
  await act(async()=>button('更名 需求上下文').click());
  const field=document.querySelector<HTMLInputElement>('[aria-label="空间名称"]');if(!field)throw new Error('Name editor missing');
  const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;if(!setter)throw new Error('Input setter missing');
  await act(async()=>{setter.call(field,'新的上下文');field.dispatchEvent(new Event('input',{bubbles:true}));});
  await act(async()=>document.querySelector('form[data-lcos-railway-rename]')?.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  expect(m.apply).toHaveBeenCalledWith('p',expect.objectContaining({ops:[expect.objectContaining({type:'upsert_scope',scope:expect.objectContaining({id:'context',name:'新的上下文'})})]}));
  await act(async()=>button('客户素材').focus());
  expect(document.querySelector('[aria-label="更名 客户素材"]')).toBeNull();
  expect(document.querySelector('[aria-label="移除现场 客户素材"]')).toBeNull();
});
it('hiding a navigation entry persists only presentation preference and retains its canonical entity',async()=>{
  await mount();await act(async()=>button('客户素材').focus());
  await act(async()=>button('空间操作 客户素材').click());
  await act(async()=>button('从导航隐藏 客户素材').click());
  expect(document.querySelector('[data-lcos-railway-item][aria-label="客户素材"]')).toBeNull();
  expect(m.apply).not.toHaveBeenCalled();expect(m.save).not.toHaveBeenCalled();
  await act(async()=>button('添加与创建').click());await act(async()=>button('显示在导航 客户素材').click());
  expect(document.querySelector('[data-lcos-railway-item][aria-label="客户素材"]')).not.toBeNull();
});
it('does not promote every unpinned Scope and Collection merely because the add entry exists', async () => {
  const current = snapshot(); m.rail.mockResolvedValue({ ...current, order: { ...current.order, orderedRefs: [] }, destinations: [] });
  await mount();
  expect(document.querySelectorAll('[data-lcos-railway-item]').length).toBe(0);
  expect(button('添加与创建')).toBeDefined();
  expect(m.save).not.toHaveBeenCalled();
});
