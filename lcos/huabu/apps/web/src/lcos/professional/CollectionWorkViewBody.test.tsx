import { act, type ButtonHTMLAttributes } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CollectionWorkViewBody } from './CollectionWorkViewBody';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  members: vi.fn(),
  watch: vi.fn(),
  openReader: vi.fn(),
  openWindow: vi.fn(),
  onProjectChanged: undefined as undefined | (() => void),
  feedback: null as null | { originalIntent: { intent: { kind: string; collectionId: string } }; receipt: { status: string; transactionId: string; projectId: string } },
}));
vi.mock('../app/lcosCoreClient', () => ({
  createLcosCoreSession: () => ({
    collections: { members: mocks.members },
    artifacts: { getFileRecordContent: vi.fn() },
  }),
}));
vi.mock('../collaboration/collaborationSessionStore', () => ({
  useCollaborationSessionStore: (select: (value: unknown) => unknown) => select({ watchProjectChanges: mocks.watch }),
}));
vi.mock('../lcosDropState', () => ({
  useLcosDropStore: (select: (value: unknown) => unknown) => select({ feedback: mocks.feedback }),
}));
vi.mock('../shell/lcosShellStore', () => ({
  useLcosShellStore: { getState: () => ({ projectId: 'project-a', openReader: mocks.openReader, openWindow: mocks.openWindow }) },
}));
vi.mock('../nodes/CollectionMemberPreview', () => ({
  CollectionMemberPreview: ({ member }: { member: { label: string } }) => <span data-test-member-preview>{member.label}</span>,
}));
vi.mock('../ui/primitives/LcosButton', () => ({
  LcosButton: ({ children, appearance: _appearance, variant: _variant, size: _size, ...props }:
    ButtonHTMLAttributes<HTMLButtonElement> & { appearance?: string; variant?: string; size?: string }) =>
    <button {...props}>{children}</button>,
}));

const makeSnapshot = (names: string[]) => ({
  collection: { id: 'collection-a', projectId: 'project-a', title: '参考集合', createdAt: '', updatedAt: '' },
  members: names.map((_, i) => ({collectionId:'collection-a',memberRef:{type:'artifact',id:`a${i}`},relationId:`r${i}`,addedAt:''})),
  previews: names.map((label, i) => ({ type:'artifact', id:`a${i}`, label, kind:'image', availability:'available' })),
});

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  mocks.members.mockReset(); mocks.watch.mockReset(); mocks.openReader.mockReset(); mocks.openWindow.mockReset();
  mocks.feedback = null;
  mocks.watch.mockImplementation((_project: string, callback: () => void) => {
    mocks.onProjectChanged = callback;
    return () => { mocks.onProjectChanged = undefined; };
  });
  mocks.members.mockResolvedValue(makeSnapshot(['海报']));
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

async function render() {
  await act(async () => root.render(<CollectionWorkViewBody projectId="project-a" collectionId="collection-a" sourceWindowId="collection-window" />));
  await vi.waitFor(() => expect(host.querySelectorAll('[data-lcos-collection-member]')).toHaveLength(1));
}

describe('Collection Work View, real parent window ownership', () => {
  it('reuses the existing member-preview renderer and returns Reader to its exact Collection window', async () => {
    await render();
    expect(host.querySelector('[data-test-member-preview]')?.textContent).toBe('海报');
    await act(async () => host.querySelector<HTMLButtonElement>('[data-lcos-collection-member] button')?.click());
    expect(mocks.openReader).toHaveBeenCalledWith('阅读 · 海报', 'a0', { returnToWindowId: 'collection-window' });
  });

  it('reads fresh Core membership when the existing project watcher fires', async () => {
    await render();
    mocks.members.mockResolvedValue(makeSnapshot(['海报', '分镜']));
    await act(async () => { mocks.onProjectChanged?.(); });
    await vi.waitFor(() => expect(host.querySelectorAll('[data-lcos-collection-member]')).toHaveLength(2));
    expect(host.textContent).toContain('分镜');
  });

  it('honors confirmed local Collection Drop invalidation rather than inventing a membership', async () => {
    await render();
    mocks.members.mockResolvedValue(makeSnapshot(['海报', '分镜']));
    mocks.feedback = { originalIntent: { intent: { kind:'collection-membership', collectionId:'collection-a' } },
      receipt: { status:'success', transactionId:'tx-collection', projectId:'project-a' } };
    await act(async () => root.render(<CollectionWorkViewBody projectId="project-a" collectionId="collection-a" sourceWindowId="collection-window" />));
    await vi.waitFor(() => expect(host.querySelectorAll('[data-lcos-collection-member]')).toHaveLength(2));
    expect(mocks.members).toHaveBeenCalledTimes(2);
    expect([...host.querySelectorAll('button')].some(button => button.textContent === '重试读取')).toBe(false);
  });

  it('offers a manual retry after a read failure', async () => {
    mocks.members.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(makeSnapshot(['海报']));
    await act(async () => root.render(<CollectionWorkViewBody projectId="project-a" collectionId="collection-a" />));
    await vi.waitFor(() => expect(host.querySelector('[role="alert"]')?.textContent).toContain('offline'));
    await act(async () => [...host.querySelectorAll<HTMLButtonElement>('button')].find(el=>el.textContent==='重试读取')?.click());
    await vi.waitFor(() => expect(host.querySelectorAll('[data-lcos-collection-member]')).toHaveLength(1));
    expect(mocks.members).toHaveBeenCalledTimes(2);
  });
});
