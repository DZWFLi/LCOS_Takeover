import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { createLcosCoreSession } from '../app/lcosCoreClient';
import { LcosButton } from '../ui/primitives/LcosButton';
import { useLayerReturnFocus } from '../ui/spatial/useLayerReturnFocus';
import '../ui/families/project-system.css';

import type { HealthStatus } from '@local-creative-os/contracts';

export function validCoreHealth(value: unknown): value is HealthStatus {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Partial<HealthStatus>;
  return row.status === 'ok' && row.service === 'local-core' && typeof row.version === 'string'
    && row.version.trim().length > 0 && ['read_only_phase_1a', 'phase_2_lite', 'phase_2_5'].includes(row.mode ?? '');
}

/** Figma 5287:1568. Only existing /health evidence; no guessed host/Agent health or repair. */
export function RuntimeDoctorBody({ onClose }: { readonly onClose: () => void }): React.JSX.Element {
  const layer = useLayerReturnFocus(true);
  const detailsTrigger = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => { layer.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true }); }, [layer]);
  const session = useMemo(() => createLcosCoreSession(), []);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'offline' | 'unknown'>('loading');
  const [details, setDetails] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const request = useRef<AbortController | null>(null);
  const read = useCallback((): void => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setStatus('loading'); setHealth(null); setCopyStatus('');
    void session.health.getHealth(controller.signal).then((value) => {
      if (controller.signal.aborted) return;
      if (!validCoreHealth(value)) { setStatus('unknown'); return; }
      setHealth(value); setStatus('ready');
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      const code = typeof error === 'object' && error !== null ? (error as { status?: number }).status : undefined;
      setStatus(code === 0 || (typeof code === 'number' && code >= 500) ? 'offline' : 'unknown');
    });
  }, [session]);
  useEffect(() => { read(); return () => request.current?.abort(); }, [read]);
  const summary = ({ loading: '正在检查本机服务', ready: '本机服务可连接', offline: '暂时无法连接本机服务', unknown: '暂时无法确认连接状态' })[status];
  const copy = async (): Promise<void> => {
    if (!health) return;
    const sourceRequest = request.current;
    try {
      // Explicit allowlist excludes URLs, tokens, paths, transcripts and raw errors.
      await navigator.clipboard.writeText(JSON.stringify({ service: health.service, status: health.status, version: health.version, mode: health.mode }, null, 2));
      if (request.current === sourceRequest && !sourceRequest?.signal.aborted) setCopyStatus('已复制');
    } catch { if (request.current === sourceRequest && !sourceRequest?.signal.aborted) setCopyStatus('复制失败，请重试'); }
  };
  return <section ref={layer} onKeyDownCapture={(event) => {
    if (event.key === 'Escape' && details) { event.preventDefault(); event.stopPropagation(); setDetails(false); detailsTrigger.current?.focus({ preventScroll: true }); }
  }} className="lcos-system-panel lcos-doctor-body" data-lcos-runtime-doctor data-read-state={status}>
    <header><h3>运行诊断</h3><LcosButton appearance="oreo" variant="secondary" onClick={onClose}>关闭</LcosButton></header>
    <p className="lcos-system-secondary" role="status">{details ? '诊断证据' : summary}</p>
    <p className="lcos-system-description">{details ? '仅展示服务、状态、版本与运行模式，不包含凭证和会话内容。' : '这里只检查本机服务连接，协作者与任务状态需分别确认。'}</p>
    <hr />
    <button className="lcos-system-row" type="button" disabled={status === 'loading'} onClick={read} title="重新读取本机连接状态">
      <span>本机服务</span><small>{health ? `版本 ${health.version}` : '只读检查，不会重启或重新发送任务'}</small>
    </button>
    <div className="lcos-system-row"><span>外部连接</span><small>尚无独立连接证据</small></div>
    <LcosButton ref={detailsTrigger} appearance="oreo" variant="secondary" aria-expanded={details} onClick={() => setDetails((value) => !value)}>{details ? '收起详情' : '查看详情'}</LcosButton>
    {details && <div className="lcos-system-details">
      {health ? <><dl><dt>服务</dt><dd>{health.service}</dd><dt>版本</dt><dd>{health.version}</dd><dt>运行模式</dt><dd>{health.mode}</dd></dl>
        <LcosButton appearance="oreo" variant="secondary" onClick={() => void copy()}>复制诊断摘要</LcosButton><span role="status">{copyStatus}</span></> : <p>本次尚未取得可用的诊断数据。</p>}
    </div>}
  </section>;
}
