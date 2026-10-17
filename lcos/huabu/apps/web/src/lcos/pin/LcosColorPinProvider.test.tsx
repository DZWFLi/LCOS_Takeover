import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

import { LcosColorPinProvider, useLcosColorPins, type LcosColorPinProjectionV1 } from './LcosColorPinProvider';

import type * as WebGen2 from '@local-creative-os/web-gen2';

const mocks = vi.hoisted(() => ({
  snapshot: vi.fn(),
  assign: vi.fn(),
  removeMembership: vi.fn(),
  graph: vi.fn(),
  conversations: vi.fn(),
  resolveTarget: vi.fn(),
  event: undefined as undefined | (() => void),
  unsubscribe: vi.fn(),
}));

vi.mock('@local-creative-os/web-gen2', async (importOriginal) => {
  const actual = await importOriginal<typeof WebGen2>();
  return {
    ...actual,
    CoreCollaborationClient: class {
      subscribe(_projectId: string, _conversationId: string, listener: () => void) {
        mocks.event = listener;
        return mocks.unsubscribe;
      }
    },
  };
});

vi.mock('../app/lcosCoreClient', () => ({
  createLcosCoreSession: () => ({
    http: {},
    colorPins: {
      snapshot: mocks.snapshot,
      assign: mocks.assign,
      removeMembership: mocks.removeMembership,
    },
    projects: { getProjectGraph: mocks.graph },
    conversations: { listConnectedConversations: mocks.conversations },
    navigation: { resolveTarget: mocks.resolveTarget },
  }),
}));

const at = '2026-09-20T00:00:00.000Z';
const blue = { id: 'blue', projectId: 'p', color: '#3366FF', createdAt: at, updatedAt: at };
const membership = {
  id: 'member-a', projectId: 'p', colorPinId: 'blue',
  targetRef: { projectId: 'p', kind: 'entity' as const, id: 'artifact-a' },
  createdAt: at, updatedAt: at,
};

let latest: LcosColorPinProjectionV1 | undefined;
function Probe(): null {
  latest = useLcosColorPins();
  return null;
}

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve = (_value: T): void => undefined;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

afterEach(() => {
  latest = undefined;
  mocks.snapshot.mockReset();
  mocks.assign.mockReset();
  mocks.removeMembership.mockReset();
  mocks.graph.mockReset();
  mocks.conversations.mockReset();
  mocks.resolveTarget.mockReset();
  mocks.unsubscribe.mockReset();
  mocks.event = undefined;
  document.body.replaceChildren();
});

it('owns one project projection, derives entity/view identity, and refetches on project invalidation', async () => {
  mocks.snapshot.mockResolvedValue({ definitions: [blue], memberships: [membership] });
  mocks.graph.mockResolvedValue({
    artifacts: [{ id: 'artifact-a', title: 'Brief', projectId: 'p' }],
    artifactViews: [{ id: 'view-a', artifactId: 'artifact-a' }],
    scopes: [{ id: 'scope-root', projectId: 'p', kind: 'root' }],
    workspaces: [{ id: 'workspace-a', projectId: 'p', scopeId: 'scope-root' }],
  });
  mocks.conversations.mockResolvedValue([]);

  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<LcosColorPinProvider projectId="p"><Probe /></LcosColorPinProvider>));
    expect(latest?.status).toBe('ready');
    expect(latest?.usedDefinitions.map((definition) => definition.id)).toEqual(['blue']);
    expect(latest?.targetIdentity({ projectId: 'p', kind: 'entity', id: 'artifact-a' })).toMatchObject({ entityType: 'artifact', entityId: 'artifact-a' });
    expect(latest?.targetIdentity({ projectId: 'p', kind: 'view', id: 'view-a' })).toMatchObject({ entityType: 'artifact', entityId: 'artifact-a' });

    await act(async () => { mocks.event?.(); });
    expect(mocks.snapshot).toHaveBeenCalledTimes(2);
  } finally {
    await act(async () => root.unmount());
  }
  expect(mocks.unsubscribe).toHaveBeenCalledOnce();
});

it('applies server receipts and keeps the prior projection when mutation fails', async () => {
  mocks.snapshot.mockResolvedValue({ definitions: [], memberships: [] });
  mocks.graph.mockResolvedValue({ artifacts: [], artifactViews: [], scopes: [], workspaces: [] });
  mocks.conversations.mockResolvedValue([]);
  mocks.assign.mockResolvedValue({ definition: blue, membership, changeSetId: 'change-set-a' });
  mocks.removeMembership.mockRejectedValue(new Error('offline'));

  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<LcosColorPinProvider projectId="p"><Probe /></LcosColorPinProvider>));
    await act(async () => latest?.assignMembership(membership.targetRef, blue.color));
    expect(latest?.snapshot.memberships).toEqual([membership]);
    expect(latest?.message).toContain('change-s');

    let failure: unknown;
    await act(async () => {
      try {
        await latest?.removeMembership(membership.id);
      } catch (error) {
        failure = error;
      }
    });
    expect(failure).toBeInstanceOf(Error);
    expect(latest?.snapshot.memberships).toEqual([membership]);
    expect(latest?.message).toContain('移除失败');
  } finally {
    await act(async () => root.unmount());
  }
});

it('drops late project reads and mutations after a project switch', async () => {
  const lateRead = deferred<{ definitions: (typeof blue)[]; memberships: (typeof membership)[] }>();
  const lateAssign = deferred<{ definition: typeof blue; membership: typeof membership; changeSetId: string }>();
  mocks.snapshot.mockImplementation((projectId: string) => projectId === 'p'
    ? lateRead.promise
    : Promise.resolve({ definitions: [], memberships: [] }));
  mocks.graph.mockImplementation((projectId: string) => Promise.resolve({
    projectId, artifacts: [], artifactViews: [], scopes: [], workspaces: [],
  }));
  mocks.conversations.mockResolvedValue([]);
  mocks.assign.mockReturnValue(lateAssign.promise);

  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<LcosColorPinProvider projectId="p"><Probe /></LcosColorPinProvider>));
    const pendingMutation = latest?.assignMembership(membership.targetRef, blue.color);
    await act(async () => root.render(<LcosColorPinProvider projectId="q"><Probe /></LcosColorPinProvider>));
    expect(latest?.projectId).toBe('q');
    expect(latest?.snapshot.memberships).toEqual([]);

    await act(async () => {
      lateRead.resolve({ definitions: [blue], memberships: [membership] });
      lateAssign.resolve({ definition: blue, membership, changeSetId: 'old-project-change' });
      await pendingMutation;
      await Promise.resolve();
    });
    expect(latest?.projectId).toBe('q');
    expect(latest?.snapshot).toEqual({ definitions: [], memberships: [] });
    expect(latest?.message).toBeUndefined();
    expect(latest?.busy).toBe(false);
  } finally {
    await act(async () => root.unmount());
  }
});

it('publishes active color highlights without recreating the authoring dismiss callback', async () => {
  mocks.snapshot.mockResolvedValue({ definitions: [blue], memberships: [membership] });
  mocks.graph.mockResolvedValue({ artifacts: [], artifactViews: [], scopes: [], workspaces: [] });
  mocks.conversations.mockResolvedValue([]);
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<LcosColorPinProvider projectId="p"><Probe /></LcosColorPinProvider>));
    const dismiss = latest?.closeAuthoring;
    await act(async () => latest?.openAuthoring({ targetRef: membership.targetRef, label: 'Brief' }));
    expect(latest?.authoringTarget?.targetRef).toEqual(membership.targetRef);
    expect(latest?.closeAuthoring).toBe(dismiss);
    await act(async () => latest?.setActiveDefinition('blue'));
    expect(latest?.activeDefinitionId).toBe('blue');
    expect(latest?.closeAuthoring).toBe(dismiss);
    await act(async () => latest?.refresh());
    expect(latest?.authoringTarget?.label).toBe('Brief');
    expect(latest?.activeDefinitionId).toBe('blue');
    expect(latest?.closeAuthoring).toBe(dismiss);
    await act(async () => root.render(<LcosColorPinProvider projectId="q"><Probe /></LcosColorPinProvider>));
    expect(latest?.activeDefinitionId).toBeUndefined();
    expect(latest?.authoringTarget).toBeUndefined();
  } finally { await act(async () => root.unmount()); }
});
