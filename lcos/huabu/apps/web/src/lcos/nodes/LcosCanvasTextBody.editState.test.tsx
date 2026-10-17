import { describeProjectedEntity } from '@local-creative-os/web-gen2';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import useCanvasStore from '@/store/canvasStore';

import { useLcosReferenceStore } from '../lcosReferenceState';
import { LcosCanvasTextBody } from './LcosCanvasTextBody';

import type { CanvasTextSnapshot } from '@local-creative-os/web-gen2';
import type * as ReactI18next from 'react-i18next';

const m = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn() }));
vi.mock('react-i18next', async (importOriginal) => ({ ...await importOriginal<typeof ReactI18next>(), useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../app/lcosCoreClient', () => ({ createLcosCoreSession: () => ({ artifacts: { readCanvasText: m.read, saveCanvasText: m.save } }) }));
vi.mock('./useLcosDensity', () => ({ useLcosDensity: () => 'reading' }));
vi.mock('@/components/Milkdown', () => ({
  markdownEquals: (a: string, b: string) => a === b,
  MilkdownPreview: ({ markdown }: { markdown: string }) => <div>{markdown}</div>,
  MilkdownEditor: ({ markdown, editable, onChange }: { markdown: string; editable: boolean; onChange: (body: string) => void }) =>
    <button data-test-editor disabled={!editable} onClick={() => onChange('# Changed')}>{markdown}</button>,
}));
vi.mock('@/components/Milkdown/MilkdownFloatingToolbar', () => ({
  MilkdownFloatingToolbar: ({ disabled }: { disabled: boolean }) => <button data-test-format disabled={disabled}>format</button>,
}));

let root: Root, host: HTMLDivElement;
const snapshot: CanvasTextSnapshot = { projectId: 'project-edit', canvasId: 'canvas-edit', spatialId: 'text-edit',
  artifactId: 'artifact-edit', viewId: 'view-edit', revisionId: 'revision-edit', fileRecordId: 'file-edit', body: '# Original', title: 'Original' };
beforeEach(() => {
  m.read.mockReset(); m.save.mockReset(); m.read.mockResolvedValue(snapshot);
  useCanvasStore.setState({ canvasId: 'canvas-edit', nodes: [{ id: 'text-edit', type: 'text', position: { x: 0, y: 0 }, data: { content: snapshot.body } }], edges: [] });
  useLcosReferenceStore.getState().setProject('project-edit');
  useLcosReferenceStore.getState().resetNodeEntities();
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); useCanvasStore.setState({ canvasId: undefined }); });

it('formatting, body editing and save obey the same lock/saving/unknown state and keep the original payload', async () => {
  let rejectSave: (reason: Error) => void = () => { throw new Error('Save was not dispatched'); };
  m.save.mockImplementation(() => new Promise((_resolve, reject) => { rejectSave = reject; }));
  await act(async () => root.render(<LcosCanvasTextBody nodeId="text-edit" nodeType="text" data={{ content: snapshot.body }} />));
  act(() => host.querySelector('[data-lcos-inline-text]')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
  expect(host.querySelector<HTMLButtonElement>('[data-test-format]')?.disabled).toBe(false);
  act(() => useCanvasStore.setState((state) => ({ nodes: state.nodes.map((node) => ({ ...node, data: { ...node.data, locked: true } })) })));
  expect(host.querySelector<HTMLButtonElement>('[data-test-format]')?.disabled).toBe(true);
  expect(host.querySelector<HTMLButtonElement>('[data-test-editor]')?.disabled).toBe(true);
  act(() => useCanvasStore.setState((state) => ({ nodes: state.nodes.map((node) => ({ ...node, data: { ...node.data, locked: false } })) })));
  act(() => host.querySelector<HTMLButtonElement>('[data-test-editor]')?.click());
  const saveButton = [...host.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === '保存');
  await act(async () => saveButton?.click());
  expect(m.save).toHaveBeenCalledWith('project-edit', { canvasId: 'canvas-edit', spatialId: 'text-edit',
    artifactId: 'artifact-edit', expectedRevisionId: 'revision-edit', body: '# Changed' });
  expect(host.querySelector<HTMLButtonElement>('[data-test-format]')?.disabled).toBe(true);
  expect(host.querySelector<HTMLButtonElement>('[data-test-editor]')?.disabled).toBe(true);
  await act(async () => rejectSave(new Error('Reply unavailable')));
  expect(host.querySelector('[data-state="unknown"]')).not.toBeNull();
  expect(host.querySelector<HTMLButtonElement>('[data-test-format]')?.disabled).toBe(true);
  act(() => host.querySelector<HTMLButtonElement>('[data-test-editor]')?.click());
  expect(m.save).toHaveBeenCalledTimes(1);
  expect(host.textContent).toContain('# Changed');
});

it('a failed initial creation is recoverable on the same carrier and does not claim to be reading its body', async () => {
  useCanvasStore.getState()._setStateNoAutosave({nodes:[{id:'text-create-error',type:'text',position:{x:0,y:0},data:{}}]});
  await act(async()=>root.render(<LcosCanvasTextBody nodeId="text-create-error" nodeType="text" data={{content:'',lcosProjectTextCreating:false,lcosProjectTextCreateError:'Origin is not allowed.'}}/>));
  expect(m.read).not.toHaveBeenCalled();
  expect(host.querySelector('[data-lcos-inline-text]')?.getAttribute('data-state')).toBe('error');
  expect(host.textContent).toContain('核对原创建');expect(host.textContent).not.toContain('读取正文');
  expect(host.querySelector<HTMLButtonElement>('[data-lcos-text-face-mode="outline"]')?.disabled).toBe(true);
});

function bindSharedText(): void {
  useCanvasStore.setState({ canvasId: 'shared-display', nodes: [{ id: 'shared-text', type: 'text', position: { x: 0, y: 0 }, data: { content: snapshot.body } }] });
  useLcosReferenceStore.getState().setProject('shared-project');
  useLcosReferenceStore.getState().registerNodeEntity('shared-text', { entityType: 'artifact', entityId: 'artifact-edit',
    descriptor: describeProjectedEntity({ entityType: 'artifact', entityId: 'artifact-edit', title: 'Original', artifactKind: 'markdown',
      managed: true, currentRevisionId: 'revision-edit', presentedRevisionId: 'revision-edit', artifactViewId: 'view-edit',
      canvasTextEditable: true, canvasTextSourceAddress: { canvasId: 'owner-canvas', spatialId: 'owner-text', viewId: 'view-edit' } }) });
}

it('edits the same current material through its source carrier while retaining the visible scene and node', async () => {
  bindSharedText();
  const owner = { ...snapshot, projectId: 'shared-project', canvasId: 'owner-canvas', spatialId: 'owner-text' };
  m.read.mockResolvedValue(owner);
  m.save.mockResolvedValue({ ...owner, body: '# Changed', revisionId: 'revision-next', fileRecordId: 'file-next' });
  await act(async () => root.render(<LcosCanvasTextBody nodeId="shared-text" nodeType="text" data={{ content: snapshot.body }} />));
  expect(m.read).toHaveBeenCalledWith('shared-project', { canvasId: 'owner-canvas', spatialId: 'owner-text' }, expect.any(AbortSignal));
  act(() => host.querySelector('[data-lcos-inline-text]')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
  act(() => host.querySelector<HTMLButtonElement>('[data-test-editor]')?.click());
  await act(async () => [...host.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === '保存')?.click());
  expect(m.save).toHaveBeenCalledWith('shared-project', { canvasId: 'owner-canvas', spatialId: 'owner-text',
    body: '# Changed', expectedRevisionId: 'revision-edit', artifactId: 'artifact-edit' });
  expect(useCanvasStore.getState().canvasId).toBe('shared-display');
  expect(useCanvasStore.getState().nodes.map(node => ({ id: node.id, position: node.position }))).toEqual([{ id: 'shared-text', position: { x: 0, y: 0 } }]);
  expect(useLcosReferenceStore.getState().nodeEntityRefs.get('shared-text')?.descriptor?.canvasTextSourceAddress)
    .toEqual({ canvasId: 'owner-canvas', spatialId: 'owner-text', viewId: 'view-edit' });
});

it('a disappeared source carrier does not turn a shared View into a newly claimed replacement', async () => {
  bindSharedText(); m.read.mockResolvedValue(null);
  await act(async () => root.render(<LcosCanvasTextBody nodeId="shared-text" nodeType="text" data={{ content: snapshot.body }} />));
  expect(host.querySelector('[data-lcos-inline-text]')?.getAttribute('data-state')).toBe('error');
  expect(host.textContent).toContain('未另建正文');
  expect(m.save).not.toHaveBeenCalled();
});
