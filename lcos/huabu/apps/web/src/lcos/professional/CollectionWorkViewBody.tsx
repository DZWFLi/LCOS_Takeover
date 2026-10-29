import { useEffect, useMemo, useState } from 'react';
import { collectionPreviewMembers } from '@local-creative-os/web-gen2';
import type { CollectionMemberPreview as CoreMemberPreview } from '@local-creative-os/web-gen2';

import { createLcosCoreSession } from '../app/lcosCoreClient';
import { useCollaborationSessionStore } from '../collaboration/collaborationSessionStore';
import { useLcosDropStore } from '../lcosDropState';
import { CollectionMemberPreview } from '../nodes/CollectionMemberPreview';
import { useLcosShellStore } from '../shell/lcosShellStore';
import { LcosButton } from '../ui/primitives/LcosButton';
import { ReaderMediaResultsView } from '../ui/professional/ReaderMediaResultsView';
import { lcosTokens } from '../ui/lcosTokens';
import { collectionMembershipRefreshTransaction } from './collectionRefreshIntent';

import '../nodes/collection-preview.css';
import './collection-work-view.css';

type MemberRef = {
  readonly type: 'artifact' | 'note' | 'collection' | 'scope' | 'workspace' | 'conversation' | 'run';
  readonly id: string;
};

type MemberRow = {
  readonly ref: MemberRef;
  readonly label: string;
  readonly availability: CoreMemberPreview['availability'];
  readonly preview: CoreMemberPreview;
};

const fallbackLabel: Readonly<Record<MemberRef['type'], string>> = {
  artifact: '材料',
  note: '笔记',
  collection: '集合',
  scope: '空间',
  workspace: '工作现场',
  conversation: '会话',
  run: '任务',
};

/**
 * Read-only projection of canonical Collection membership. No extra storage,
 * synthetic child canvas or semantic write owner. The window itself owns the
 * return location for a Reader opened from a collection member.
 */
export function CollectionWorkViewBody({
  projectId,
  collectionId,
  sourceWindowId,
}: {
  readonly projectId: string;
  readonly collectionId?: string;
  readonly sourceWindowId?: string;
}): React.JSX.Element {
  const session = useMemo(() => createLcosCoreSession(), []);
  const watchProjectChanges = useCollaborationSessionStore((state) => state.watchProjectChanges);
  const dropFeedback = useLcosDropStore((state) => state.feedback);
  const [reloadKey, setReloadKey] = useState(0);
  const [rows, setRows] = useState<readonly MemberRow[]>([]);
  const [title, setTitle] = useState('集合');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string>();
  const [galleryOpen, setGalleryOpen] = useState(false);
  const imageRows = rows.filter(row => row.preview.kind === 'image' && row.availability === 'available');

  const refreshTransactionId = collectionMembershipRefreshTransaction(dropFeedback, projectId, collectionId);
  // Core project invalidation remains the shared subscription owner. For local
  // Drop completion the exact, confirmed receipt provides immediate readback.
  useEffect(() => watchProjectChanges(projectId, () => setReloadKey((key) => key + 1)), [projectId, watchProjectChanges]);
  useEffect(() => {
    if (refreshTransactionId !== undefined) setReloadKey((key) => key + 1);
  }, [refreshTransactionId]);

  useEffect(() => {
    if (!collectionId) {
      setRows([]);
      setStatus('error');
      setError('集合身份缺失。');
      return;
    }
    const controller = new AbortController();
    setStatus('loading');
    setError(undefined);
    void session.collections.members(projectId, collectionId, controller.signal)
      .then((snapshot) => {
        if (controller.signal.aborted) return;
        setTitle(snapshot.collection.title);
        const previews = collectionPreviewMembers(snapshot);
        setRows(previews.map((preview) => ({
          ref: { type: preview.type, id: preview.id },
          label: preview.label?.trim() || fallbackLabel[preview.type],
          availability: preview.availability,
          preview,
        })));
        setStatus('ready');
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setStatus('error');
        setError(reason instanceof Error ? reason.message : '集合读取失败。');
      });
    return () => controller.abort();
  }, [collectionId, projectId, reloadKey, session]);

  const open = (row: MemberRow): void => {
    const shell = useLcosShellStore.getState();
    if (shell.projectId !== projectId || status !== 'ready' || row.availability === 'missing') return;
    switch (row.ref.type) {
      case 'artifact':
        shell.openReader(`阅读 · ${row.label}`, row.ref.id,
          sourceWindowId === undefined ? undefined : { returnToWindowId: sourceWindowId });
        return;
      case 'conversation':
        shell.openWindow('conversation', `会话 · ${row.label}`, row.ref.id);
        return;
      case 'run':
        shell.openWindow('run-review', `任务 · ${row.label}`, row.ref.id);
        return;
      case 'collection':
        shell.openWindow('collection', `集合 · ${row.label}`, row.ref.id);
        return;
      default:
        return;
    }
  };

  return (
    <section data-lcos-collection-work-view={collectionId} aria-busy={status === 'loading' || undefined}
      className="flex h-full min-h-0 flex-col"
      style={{ background: lcosTokens.color.canvas, color: lcosTokens.color.text }}>
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3"
        style={{ borderColor: lcosTokens.color.borderSubtle }}>
        <div className="min-w-0">
          <strong className="block truncate text-sm">{title}</strong>
          <small style={{ color: lcosTokens.color.muted }}>
            {status === 'ready' ? `${rows.length} 个成员` : status === 'loading' ? '正在核对集合成员…' : '集合读取未完成'}
          </small>
        </div>
        {imageRows.length > 0 && <LcosButton appearance="oreo" variant="ghost" size="sm" aria-pressed={galleryOpen}
          onClick={() => setGalleryOpen(value => !value)}>{galleryOpen ? '返回成员' : `图片浏览（${imageRows.length}）`}</LcosButton>}
        {status === 'error' && <LcosButton appearance="oreo" variant="secondary" size="sm"
          disabled={!collectionId}
          onClick={() => setReloadKey((key) => key + 1)}>
          重试读取
        </LcosButton>}
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-3" data-lcos-collection-work-list>
        {status === 'loading' && rows.length === 0 && <p role="status" className="p-3 text-sm">正在读取集合内容…</p>}
        {status === 'error' && <p role="alert" className="p-3 text-sm" style={{ color: lcosTokens.color.danger }}>{error}</p>}
        {status === 'ready' && rows.length === 0 && <p role="status" className="p-3 text-sm"
          style={{ color: lcosTokens.color.muted }}>这个集合暂时为空。</p>}
        {status === 'ready' && galleryOpen && <ReaderMediaResultsView items={imageRows.map(row => ({
          id: row.ref.id, title: row.label, onOpen: () => open(row),
          preview: <CollectionMemberPreview projectId={projectId} member={row.preview} client={session.artifacts} />,
          thumbnail: <CollectionMemberPreview projectId={projectId} member={row.preview} client={session.artifacts} fit="cover" />,
        }))} />}
        {status !== 'error' && !galleryOpen && rows.map((row) => {
          const canOpen = status === 'ready' && row.availability !== 'missing'
            && (row.ref.type === 'artifact' || row.ref.type === 'conversation'
              || row.ref.type === 'run' || row.ref.type === 'collection');
          return (
            <div key={`${row.ref.type}:${row.ref.id}`}
              data-lcos-collection-member={row.ref.type}
              data-lcos-collection-work-item
              className="flex min-h-16 items-center justify-between gap-3 rounded-xl px-3 py-2"
              style={{ background: lcosTokens.color.surface }}>
              <div data-lcos-collection-work-thumbnail>
                <CollectionMemberPreview projectId={projectId} member={row.preview}
                  client={session.artifacts} />
              </div>
              <div className="min-w-0 flex-1">
                <strong className="block truncate text-sm">{row.label}</strong>
                <small style={{ color: lcosTokens.color.muted }}>
                  {fallbackLabel[row.ref.type]}{row.availability !== 'available' ? ` · ${row.availability}` : ''}
                </small>
              </div>
              {canOpen && <LcosButton appearance="oreo" variant="secondary" onClick={() => open(row)}>打开</LcosButton>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
