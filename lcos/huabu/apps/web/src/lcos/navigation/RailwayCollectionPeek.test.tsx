import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ members: vi.fn() }));
vi.mock('../app/lcosCoreClient', () => ({
  createLcosCoreSession: () => ({ collections: { members: mocks.members }, artifacts: {} }),
}));
vi.mock('./railwayMemberGeometry', () => ({
  readRailwayMemberGeometry: async (_session: unknown,_projectId: string,_owner: unknown,
    members: readonly {key:string}[]) => ({ canvasId:'canvas-real',canvasLabel:'真实现场',geometry:members.map((member,index) => ({
      memberKey:member.key,nodeId:`node-${index}`,x:index*100,y:index%2*200,width:80,height:120,
    })) }),
}));

import { RailwayCollectionPeek } from './RailwayCollectionPeek';

it('re-reads the same open collection after a receipt/event refresh and displays the new real members', async () => {
  mocks.members.mockResolvedValueOnce(snapshot('receipt-collection', ['原成员']))
    .mockResolvedValueOnce(snapshot('receipt-collection', ['原成员', '新收下的成员']));
  await act(async () => root.render(<RailwayCollectionPeek projectId="project-1" collectionId="receipt-collection" refreshKey="before" />));
  expect(host.textContent).toContain('1 个成员');
  await act(async () => root.render(<RailwayCollectionPeek projectId="project-1" collectionId="receipt-collection" refreshKey="receipt-after" />));
  expect(mocks.members).toHaveBeenCalledTimes(2);
  expect(host.textContent).toContain('新收下的成员');
  expect(host.textContent).toContain('2 个成员');
});

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let host: HTMLDivElement;
const snapshot = (id: string, labels: readonly string[]) => ({
  collection: { id, projectId: 'project-1', title: `集合 ${id}`, createdAt: '', updatedAt: '' },
  members: labels.map((_, i) => ({ collectionId: id,
    memberRef: { type: 'artifact' as const, id: `${id}-artifact-${i}` }, relationId: `relation-${i}`, addedAt: '' })),
  previews: labels.map((label, i) => ({ type: 'artifact' as const, id: `${id}-artifact-${i}`, label,
    kind: 'image' as const, availability: 'available' as const })),
});
async function render(collectionId: string) {
  await act(async () => root.render(<RailwayCollectionPeek projectId="project-1" collectionId={collectionId} />));
}
beforeEach(() => {
  mocks.members.mockReset();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

it('renders true spatial members, bounded to twelve, with a truthful total', async () => {
  mocks.members.mockResolvedValue(snapshot('collection-a', Array.from({length:13},(_,index)=>`成员${index}`)));
  await render('collection-a');
  await vi.waitFor(() => expect(host.querySelectorAll('[data-lcos-railway-map-member]')).toHaveLength(12));
  expect(host.textContent).toContain('13 个成员');
  expect(host.textContent).toContain('另有 1 项');
  expect(host.querySelector('[data-lcos-railway-map-member*="collection-a-artifact-12"]')).toBeNull();
  expect(mocks.members).toHaveBeenCalledWith('project-1', 'collection-a', expect.any(AbortSignal));
});

it('does not expose previous collection content when the bookmark changes while a request is pending', async () => {
  let resolveOld!: (value: ReturnType<typeof snapshot>) => void;
  mocks.members.mockImplementation((_projectId: string, collectionId: string) =>
    collectionId === 'old' ? new Promise((resolve) => { resolveOld = resolve; }) : Promise.resolve(snapshot('new', ['新成员'])));
  await render('old');
  await render('new');
  expect(host.textContent).toContain('新成员');
  await act(async () => resolveOld(snapshot('old', ['过期成员'])));
  expect(host.textContent).not.toContain('过期成员');
  expect(host.querySelector('[data-lcos-railway-map-member*="new-artifact-0"]')).not.toBeNull();
});

it('shows genuine failure and retries exactly once on explicit action', async () => {
  mocks.members.mockRejectedValueOnce(new Error('Core offline'))
    .mockResolvedValueOnce(snapshot('collection-a', ['恢复成员']));
  await render('collection-a');
  expect(host.textContent).toContain('Core offline');
  const retry = host.querySelector<HTMLButtonElement>('button');
  expect(retry?.textContent).toBe('重试');
  await act(async () => retry?.click());
  expect(mocks.members).toHaveBeenCalledTimes(2);
  expect(host.textContent).toContain('恢复成员');
});
