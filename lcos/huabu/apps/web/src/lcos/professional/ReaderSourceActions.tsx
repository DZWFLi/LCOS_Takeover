import { useEffect, useRef, useState } from 'react';

import type { CoreArtifactClient } from '@local-creative-os/web-gen2';

/** GEN1 open/reveal source controls: canonical Artifact source, never a pretend old-revision editor. */
export function ReaderSourceActions({ client, artifactId, historical = false }: {
  readonly client: Pick<CoreArtifactClient, 'artifactSourcePath' | 'openArtifactSource' | 'revealArtifactSource'>;
  readonly artifactId: string;
  readonly historical?: boolean;
}): React.JSX.Element | null {
  const [source, setSource] = useState<Awaited<ReturnType<CoreArtifactClient['artifactSourcePath']>>>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const actionRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setSource(undefined); setError(undefined); setNote(undefined); setBusy(false);
    void client.artifactSourcePath(artifactId, controller.signal).then(value => {
      if (!controller.signal.aborted) setSource(value);
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '原文件地址暂未读到');
    });
    return () => { controller.abort(); actionRequest.current?.abort(); actionRequest.current = null; };
  }, [artifactId, attempt, client]);
  const ready = source?.exists === true && !source.isUrl && Boolean(source.path);
  const originalUrl = source?.isUrl && /^https?:\/\//i.test(source.path) ? source.path : undefined;
  const action = async (kind: 'open' | 'reveal'): Promise<void> => {
    if (!ready || actionRequest.current) return;
    const request = new AbortController(); actionRequest.current = request;
    setBusy(true); setNote(undefined);
    try {
      const result = kind === 'open' ? await client.openArtifactSource(artifactId, request.signal) : await client.revealArtifactSource(artifactId, request.signal);
      if (request.signal.aborted) return;
      if (kind === 'open' ? 'opened' in result && result.opened : 'revealed' in result && result.revealed)
        setNote(kind === 'open' ? '已交给系统打开原文件。' : '已请求在文件夹中显示原文件。');
      else setNote('系统未确认此操作，请重试。');
    } catch (reason: unknown) { if (!request.signal.aborted) setNote(reason instanceof Error ? reason.message : '原文件操作未完成。'); }
    finally { if (actionRequest.current === request) { actionRequest.current = null; setBusy(false); } }
  };
  // A created text material has no external file. The existing lookup resolves
  // that internally; it must not turn into two unusable file-operation controls.
  if (!error && (!source || !source.path) && !note) return null;
  return <div data-lcos-reader-original-source className="flex flex-wrap items-center gap-2 text-[11px]">
    {ready && <><button type="button" data-lcos-reader-open-original disabled={busy} onClick={() => { void action('open'); }} title={source?.path}>打开原文件</button>
    <button type="button" data-lcos-reader-reveal-original disabled={busy} onClick={() => { void action('reveal'); }} title={source?.path}>在文件夹中显示</button></>}
    {originalUrl && <a href={originalUrl} target="_blank" rel="noopener noreferrer" data-lcos-reader-open-url>打开来源链接</a>}
    {historical && ready && <span>历史版本在此窗口阅读；系统打开登记的源文件。</span>}
    {error ? <span role="status">原文件地址读取失败 · {error} <button type="button" onClick={() => setAttempt(value => value + 1)}>重读地址</button></span>
      : source && !ready && !originalUrl ? <span>{source.isUrl ? '这是链接来源，当前没有可打开的本地原文件。' : '原文件暂时找不到；阅读版本保留。'}</span> : null}
    {note && <span role="status">{note}</span>}
  </div>;
}
