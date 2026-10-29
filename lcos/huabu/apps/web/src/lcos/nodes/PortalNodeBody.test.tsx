import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { PortalNodeBody } from './PortalNodeBody';
import { resolveDropIntent } from '../drop/dropIntentResolver';
import { PortalDropWorkspaceProvider } from '../drop/PortalDropWorkspaceContext';
import { useLcosDropStore } from '../lcosDropState';
import { useLcosReferenceStore } from '../lcosReferenceState';
import { useLcosShellStore } from '../shell/lcosShellStore';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const state = vi.hoisted(() => ({ canvasId:'source-canvas',viewport:{x:0,y:0,zoom:1},nodes: [{ id: 'portal-1', data:{},selected: true }] }));
vi.mock('@/store/spacePreviewSceneCache',()=>({useSpacePreviewScene:()=>({scene:null,stale:false,error:null,retry:()=>{}})}));
vi.mock('@/store/canvasStore', () => ({ default: (select: (value: typeof state) => unknown) => select(state) }));
vi.mock('./useLcosDensity', () => ({ useLcosDensity: () => 'reading' }));
vi.mock('./LcosSpeciesBodies', () => ({ SPECIES_ACCENT: { portal: '#888888' }, LcosSpeciesBodyContent: () => null }));
let host: HTMLDivElement;
let root: Root;
beforeEach(async () => {
  useLcosShellStore.getState().clear();
  useLcosDropStore.getState().reset();
  useLcosReferenceStore.getState().resetNodeEntities();
  state.nodes = [{ id: 'portal-1', data:{},selected: true }];
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<PortalDropWorkspaceProvider projectId="p" workspaces={[{ id: 'workspace-child', name: '资料现场', canvasId: 'child-canvas',preferredSurface:'context' }]}>
    <PortalNodeBody nodeId="portal-1" nodeType="canvasRef" data={{ targetCanvasId: 'child-canvas', label: '资料入口' }} />
  </PortalDropWorkspaceProvider>));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); useLcosDropStore.getState().reset(); useLcosReferenceStore.getState().resetNodeEntities(); });
async function enter(target: EventTarget = window) {
  await act(async () => { target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); });
}
it('selected Enter and double click resolve the same typed preview without duplicating windows', async () => {
  await enter();
  expect(useLcosShellStore.getState().windows).toHaveLength(1);
  expect(useLcosShellStore.getState().windows[0]).toMatchObject({ bodyKey: 'portal-preview', target: 'child-canvas', targetKind: 'canvas',portalWorkspaceId:'workspace-child',portalSourceNodeId:'portal-1' });
  const body = host.querySelector('[data-lcos-portal-body]');
  if (!body) throw new Error('Portal body missing');
  await act(async () => { body.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
  expect(useLcosShellStore.getState().windows).toHaveLength(1);
});
it('does not steal Enter from text input or the Composer', async () => {
  const input = document.createElement('input'); host.append(input);
  await enter(input);
  expect(useLcosShellStore.getState().windows).toHaveLength(0);
  useLcosShellStore.setState({ composerOpen: true });
  await enter();
  expect(useLcosShellStore.getState().windows).toHaveLength(0);
});
it('does not open a portal on multi selection', async () => {
  state.nodes.push({ id: 'other', data:{},selected: true });
  await act(async () => root.render(<PortalNodeBody nodeId="portal-1" nodeType="canvasRef" data={{ targetCanvasId: 'child-canvas' }} />));
  await enter();
  expect(useLcosShellStore.getState().windows).toHaveLength(0);
});

it('registers Portal as a receive target only when its canvas resolves to one real workspace', () => {
  const target = useLcosDropStore.getState().targets().find((entry) => entry.targetId === 'portal:portal-1');
  expect(target).toMatchObject({
    kind: 'portal-receive', enabled: true, label: '入口 · 资料入口 → 资料现场',
    semantic: { kind: 'portal-receive', targetRef: { kind: 'workspace', id: 'workspace-child' } },
  });
});

it('keeps an ambiguous Portal visible as an ineligible receiver instead of guessing a workspace', async () => {
  await act(async () => root.render(<PortalDropWorkspaceProvider projectId="p" workspaces={[
    { id: 'workspace-a', name: '现场 A', canvasId: 'child-canvas',preferredSurface:'context' },
    { id: 'workspace-b', name: '现场 B', canvasId: 'child-canvas',preferredSurface:'context' },
  ]}>
    <PortalNodeBody nodeId="portal-1" nodeType="canvasRef" data={{ targetCanvasId: 'child-canvas', label: '资料入口' }} />
  </PortalDropWorkspaceProvider>));
  const target = useLcosDropStore.getState().targets().find((entry) => entry.targetId === 'portal:portal-1');
  expect(target?.enabled).toBe(false);
  if (!target) throw new Error('Portal target missing');
  expect(resolveDropIntent({ kind: 'object', entityType: 'note', entityId: 'note-1' }, target).status).toBe('ineligible');
});

it('Core Workspace references on an existing neutral note carrier reuse Portal navigation and reject a stale raw target', async () => {
  await act(async () => {
    useLcosReferenceStore.setState({ nodeEntityRefs: new Map([['portal-1', { entityType: 'workspace', entityId: 'workspace-original' }]]) });
    root.render(<PortalDropWorkspaceProvider projectId="p" workspaces={[
      { id: 'workspace-original', name: '原现场', canvasId: 'original-canvas', preferredSurface: 'main' },
      { id: 'workspace-wrong', name: '错误旧地址', canvasId: 'stale-canvas', preferredSurface: 'context' },
    ]}><PortalNodeBody nodeId="portal-1" nodeType="note" data={{ targetCanvasId: 'stale-canvas', label: '原现场入口' }} /></PortalDropWorkspaceProvider>);
  });
  expect(useLcosDropStore.getState().targets().find(target => target.targetId === 'portal:portal-1')).toMatchObject({
    enabled: true, semantic: { targetRef: { kind: 'workspace', id: 'workspace-original' }, canvasId: 'original-canvas' },
  });
  await enter();
  expect(useLcosShellStore.getState().windows[0]).toMatchObject({ bodyKey: 'portal-preview', target: 'original-canvas', portalWorkspaceId: 'workspace-original' });
});

it('a bound Workspace without a real canvas stays unavailable and never uses a stale raw canvas', async () => {
  await act(async () => {
    useLcosReferenceStore.setState({ nodeEntityRefs: new Map([['portal-1', { entityType: 'workspace', entityId: 'workspace-unready' }]]) });
    root.render(<PortalDropWorkspaceProvider projectId="p" workspaces={[
      { id: 'workspace-unready', name: '未就绪原现场', preferredSurface: 'workflow' },
      { id: 'workspace-wrong', name: '旧地址', canvasId: 'stale-canvas', preferredSurface: 'main' },
    ]}><PortalNodeBody nodeId="portal-1" nodeType="note" data={{ targetCanvasId: 'stale-canvas' }} /></PortalDropWorkspaceProvider>);
  });
  const target = useLcosDropStore.getState().targets().find(target => target.targetId === 'portal:portal-1');
  expect(target?.enabled).toBe(false);
  expect(target?.semantic).toEqual({ kind: 'portal-receive' });
});
