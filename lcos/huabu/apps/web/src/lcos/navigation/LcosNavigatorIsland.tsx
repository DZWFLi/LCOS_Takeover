import { CoreSearchClient, HttpError } from '@local-creative-os/web-gen2';
import { ArrowRight, LoaderCircle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/Common/Button';
import { DropdownMenu, DropdownMenuItem } from '@/components/Common/DropdownMenu';
import { useCloseOnEscape } from '@/hooks/useCloseOnEscape';

import { locateSpatialDestination } from './locateSpatialDestination';
import { useNavigationHudSlot } from './NavigationHudSlot';
import { readProjectNavigationIndex, type ProjectNavigationIndex } from './projectNavigationIndex';
import { localProjectSearchHits, projectLocalSearchEntries, mergeProjectSearchHits, isLocalProjectSearchHit, type ProjectSearchVisibleHit, type LocalProjectSearchHit } from './projectSearchProjection';
import { useAvoidingHudPosition } from './useAvoidingHudPosition';
import { useHudViewport } from './useHudViewport';
import { createLcosCoreSession } from '../app/lcosCoreClient';
import { useLcosWorksiteNav } from '../app/useLcosWorksiteNav';
import { lcosHudEdgeOffsets } from '../shell/lcosHudPlacement';
import { useLcosShellStore, type LcosSurfaceKey } from '../shell/lcosShellStore';
import { LcosNavigatorIslandView } from '../ui/families';
import { lcosGlassStyle, lcosTokens } from '../ui/lcosTokens';
import { useLayerReturnFocus } from '../ui/spatial/useLayerReturnFocus';

import type { LcosNavigatorIslandState, LcosNavigatorPin } from '../ui/families';
import type { SearchHitVNext } from '@local-creative-os/contracts';

// One physical HUD slot. Search resolves identity; Where resolves complete spatial occurrences.

const SEARCH_REASON_LABELS: Readonly<Record<NonNullable<SearchHitVNext['matchReason']>, string>> = {
  title: '标题匹配',
  body: '正文匹配',
  ocr: '图片文字匹配',
  visual: '图像相似',
  semantic: '内容相关',
  source: '来源信息匹配',
  relation: '关联内容匹配',
  metadata: '内容匹配',
};

function searchReasonLabel(hit: ProjectSearchVisibleHit): string | undefined {
  return hit.matchReason === undefined ? undefined : SEARCH_REASON_LABELS[hit.matchReason];
}

function locationCountLabel(hit: ProjectSearchVisibleHit): string | undefined {
  const count = hit.locationCount;
  return typeof count === 'number' && Number.isSafeInteger(count) && count > 0 ? `出现在 ${count} 个位置` : undefined;
}

const SEARCH_ENTITY_NAME_FALLBACKS: Readonly<Record<SearchHitVNext['entityType'], string>> = {
  artifact: '项目材料',
  note: '项目笔记',
  conversation: '会话',
  resource: '资源',
  file: '文件',
};

function searchHitName(hit: ProjectSearchVisibleHit): string {
  if (isLocalProjectSearchHit(hit)) return hit.title;
  return hit.title?.trim() || hit.snippet?.trim() || SEARCH_ENTITY_NAME_FALLBACKS[hit.entityType];
}

function ReaderSearchReturnFocusLayer(): React.JSX.Element {
  const ref = useLayerReturnFocus(true);
  return <div ref={ref} data-lcos-reader-search-focus-return style={{ display: 'contents' }} />;
}

interface NavigatorIslandProps {
  readonly projectId: string;
  readonly canvasBySurface: Readonly<Partial<Record<LcosSurfaceKey, string>>>;
  readonly surfaceByWorkspace?: Readonly<Map<string, LcosSurfaceKey>>;
  readonly ensureCanvas: (surface: LcosSurfaceKey, force?: boolean) => Promise<string | undefined>;
  readonly pins?: readonly LcosNavigatorPin[];
  readonly onActivatePin?: (pin: LcosNavigatorPin) => void;
  readonly onCreatePin?: () => void;
  readonly createPinDisabled?: boolean;
  readonly pinRenderer?: (pin: LcosNavigatorPin) => React.ReactNode;
}
export function LcosNavigatorIsland(props: NavigatorIslandProps): React.JSX.Element {
  const { active, activate: activateHudSlot, close: closeHudSlot } = useNavigationHudSlot();
  const focus = active === 'search';
  const viewport = useHudViewport();
  const environment = useLcosShellStore((s) => s.windowEnvironment);
  const requestFocusWhere = useLcosShellStore((s) => s.requestFocusWhere);
  const openReader = useLcosShellStore((s) => s.openReader);
  const openWindow = useLcosShellStore((s) => s.openWindow);
  const windows = useLcosShellStore((s) => s.windows);
  const [query, setQuery] = useState('');
  const [remoteHits, setRemoteHits] = useState<readonly SearchHitVNext[]>([]);
  const [localIndex, setLocalIndex] = useState<ProjectNavigationIndex>();
  const [localLoading, setLocalLoading] = useState(false);
  const [localIssue, setLocalIssue] = useState<string>();
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [detail, setDetail] = useState<string>();
  const [activeIndex, setActiveIndex] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [retry, setRetry] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const [readerReturnTarget, setReaderReturnTarget] = useState<string>();
  const session = useMemo(() => createLcosCoreSession(), []);
  const search = useMemo(() => new CoreSearchClient(session.http), [session]);
  const { switchWorksite } = useLcosWorksiteNav({ projectId: props.projectId, canvasBySurface: props.canvasBySurface, ensureCanvas: props.ensureCanvas });
  const navigation = useRef<AbortController | null>(null);
  const abortNavigation = useCallback(() => { navigation.current?.abort(); },[]);
  const close = useCallback(() => { abortNavigation(); closeHudSlot('search'); setQuery(''); setRemoteHits([]); setTruncated(false); setState('idle'); setDetail(undefined); }, [closeHudSlot,abortNavigation]);
  const hits = useMemo(() => mergeProjectSearchHits(localProjectSearchHits(localIndex,props.projectId,query,props.canvasBySurface),remoteHits),
    [localIndex,props.projectId,query,props.canvasBySurface,remoteHits]);
  useCloseOnEscape(focus, close, { canvasBlank: true });
  const open = useCallback(() => {
    searchButtonRef.current?.focus();
    activateHudSlot('search'); setQuery(''); setActiveIndex(0);
  }, [activateHudSlot]);
  useEffect(() => { if (focus) inputRef.current?.focus(); }, [focus]);
  useEffect(() => { close(); return abortNavigation; }, [props.projectId, close,abortNavigation]);
  useEffect(() => {
    if (!focus) abortNavigation();
  },[focus,abortNavigation]);
  useEffect(() => {
    if (!focus) return;
    const controller = new AbortController();
    setLocalIndex(undefined); setLocalLoading(true); setLocalIssue(undefined);
    void readProjectNavigationIndex(session,props.projectId,controller.signal).then(index => {
      if (controller.signal.aborted) return;
      setLocalIndex(index); setLocalLoading(false); setLocalIssue(index.issues.length ? index.issues.join('；') : undefined);
    }).catch(reason => { if (!controller.signal.aborted) { setLocalLoading(false); setLocalIssue(reason instanceof Error ? reason.message : '项目空间读取失败'); } });
    return () => controller.abort();
  },[focus,session,props.projectId,retry]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.defaultPrevented) return;
      const target = event.target instanceof Element ? event.target : null;
      // An editor/reader owns its local Find command. Do not steal it.
      const editing = target?.closest('input,textarea,[contenteditable="true"],[data-lcos-reader],[data-lcos-reader-content]');
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f' && (!editing || target === inputRef.current)) {
        event.preventDefault(); open();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [close, focus, open]);
  useEffect(() => {
    const q = query.trim();
    if (!focus || !q) { setRemoteHits([]); setState('idle'); return; }
    let cancelled = false;
    setRemoteHits([]); setState('loading'); setDetail(undefined);
    const timer = window.setTimeout(() => {
      void search.searchProject(props.projectId, { query: q, limit: 50 }).then((result) => {
        if (cancelled) return;
        setRemoteHits(result.hits); setTruncated(result.truncated === true); setActiveIndex(0); setState('ready');
      }).catch((error: unknown) => {
        if (cancelled) return;
        setState('error'); setDetail(error instanceof HttpError ? error.message : String(error));
      });
    }, 220);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [focus, query, props.projectId, search, retry]);
  const locate = (hit: ProjectSearchVisibleHit): void => {
    close();
    requestFocusWhere({ reqId: crypto.randomUUID(), entityType: hit.entityType, entityId: hit.entityId, title: searchHitName(hit) });
  };
  const chooseLocal = async (hit: LocalProjectSearchHit): Promise<void> => {
    if (!hit.available) return;
    const controller = new AbortController(); navigation.current?.abort(); navigation.current = controller;
    try {
      const index = await readProjectNavigationIndex(session,props.projectId,controller.signal);
      const fresh = projectLocalSearchEntries(index,props.projectId,props.canvasBySurface)
        .find(item => item.entityType === hit.entityType && item.entityId === hit.entityId);
      if (!fresh?.available) throw new Error('原空间已变化，请重新搜索；不会进入别的目标。');
      const entered = fresh.worksite ? await switchWorksite(fresh.worksite.surface,{ canvasId: fresh.worksite.canvasId,
        ...(fresh.worksite.workspaceId ? { workspaceId: fresh.worksite.workspaceId } : {}) })
        : fresh.destination ? await locateSpatialDestination(props.projectId,fresh.destination,{ mainCanvasId: props.canvasBySurface.main,
          onNavigateMain: () => switchWorksite('main'), signal: controller.signal }) : false;
      if (controller.signal.aborted) return;
      if (!entered) throw new Error('原空间投影尚未就绪，可重新读取后定位。');
      close();
    } catch (reason) { if (!controller.signal.aborted) { setState('error'); setDetail(reason instanceof Error ? reason.message : '空间暂不可打开'); } }
  };
  const choose = (hit: ProjectSearchVisibleHit): void => {
    if (isLocalProjectSearchHit(hit)) { void chooseLocal(hit); return; }
    const title = searchHitName(hit);
    if (hit.entityType === 'artifact') {
      // Keep a live DOM opener for the Reader's existing close path.
      searchButtonRef.current?.focus();
      setReaderReturnTarget(hit.entityId);
      close();
      openReader(`阅读 · ${title}`, hit.entityId);
      return;
    }
    if (hit.entityType === 'conversation') {
      close();
      openWindow('conversation', `会话窗口 · ${title}`, hit.entityId);
      return;
    }
    locate(hit);
  };
  const hasSearchOpenedReader = readerReturnTarget !== undefined && windows.some((window) =>
    window.bodyKey === 'reader' && window.target === readerReturnTarget && window.readerRevisionId === undefined);
  useEffect(() => {
    if (readerReturnTarget !== undefined && !hasSearchOpenedReader) setReaderReturnTarget(undefined);
  }, [hasSearchOpenedReader, readerReturnTarget]);
  const pins = props.pins ?? [];
  const viewState: LcosNavigatorIslandState = focus && state === 'loading' ? 'loading'
    : focus && state === 'error' ? 'error' : focus ? '搜索' : pins.length > 0 ? '彩色标' : '静息';
  const offsets = lcosHudEdgeOffsets(environment ?? null, viewport);
  const width = Math.max(52, viewport.width - offsets.left - offsets.right);
  const pinSlotWidth = props.pinRenderer ? 36 : 44;
  const pinSlots = Math.max(0, Math.min(3, Math.floor((width - (focus ? 174 : 52)) / pinSlotWidth)));
  const moreVisible = pins.length > pinSlots || props.onCreatePin !== undefined;
  const visiblePinCount = Math.min(pins.length, moreVisible ? Math.max(0, pinSlots - 1) : pinSlots);
  const islandWidth = focus && state !== 'idle' ? Math.min(402, width)
    : Math.min(width, 52 + (focus ? 218 : 0) + (visiblePinCount + (moreVisible ? 1 : 0)) * pinSlotWidth);
  const placement = useAvoidingHudPosition({ x: (offsets.left + viewport.width - offsets.right) / 2,
    y: offsets.top, width: islandWidth, height: 48 }, { x: 'center' }, '[data-lcos-shell-project-cluster]');
  const activeHit = hits[activeIndex];
  const selectedHit = hits[activeIndex];
  const content = <>
    <LcosNavigatorIslandView state={viewState} expanded={focus} pins={pins} availableWidth={width}
      pinRenderer={props.pinRenderer}
      onActivatePin={props.onActivatePin} onCreatePin={props.onCreatePin} createPinDisabled={props.createPinDisabled}
      query={query} onQueryChange={setQuery} onToggleSearch={() => focus ? close() : open()}
      searchButtonRef={searchButtonRef} inputRef={inputRef} inputAriaControls="lcos-project-search-results"
      activeDescendant={focus && hits[activeIndex] ? `lcos-search-result-${activeIndex}` : undefined}
      onInputKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault(); const delta = event.key === 'ArrowDown' ? 1 : -1;
          setActiveIndex((current) => Math.max(0, Math.min(hits.length - 1, current + delta)));
        } else if (event.key === 'Enter' && selectedHit && (isLocalProjectSearchHit(selectedHit) || state === 'ready')) { event.preventDefault(); choose(selectedHit); }
      }} />
    {focus && query.trim() && <div data-lcos-navigator-results id="lcos-project-search-results"
      className="mt-2 max-h-[50vh] overflow-y-auto rounded-xl p-2" style={{ ...lcosGlassStyle, width: Math.min(402, width) }}>
      {state === 'loading' && <div role="status" className="flex items-center gap-2 px-3 py-2 text-sm"><LoaderCircle size={16} className="lcos-static-pulse" />正在搜索…</div>}
      {state === 'error' && <div role="alert" className="px-3 py-2 text-sm" style={{ color: lcosTokens.color.danger }}>搜索失败{detail ? `：${detail}` : ''}<button className="ml-2 underline" onClick={() => setRetry((value) => value + 1)}>重试</button></div>}
      {(state === 'ready' || hits.length > 0) && <>
        <div role="listbox" aria-label="项目搜索结果">
          {hits.length === 0 && !localLoading && <div role="status" className="px-3 py-2 text-sm">没有匹配的对象</div>}
          {hits.map((hit, index) => {
            const title = searchHitName(hit);
            return <button key={`${hit.entityType}:${hit.entityId}`} id={`lcos-search-result-${index}`} type="button"
              role="option" aria-selected={activeIndex === index} onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(hit)}
              data-lcos-search-entity-type={hit.entityType} disabled={isLocalProjectSearchHit(hit) && !hit.available}
              className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left"
              style={{ background: activeIndex === index ? lcosTokens.color.raised : undefined }}>
              <span className="min-w-0"><span className="block truncate text-sm font-medium">{title}</span>
                {hit.snippet && hit.snippet !== title && <span className="block truncate text-xs" style={{ color: lcosTokens.color.muted }}>{hit.snippet}</span>}
                {isLocalProjectSearchHit(hit) && hit.reason && <span className="block text-xs">{hit.reason}</span>}
                {(searchReasonLabel(hit) || locationCountLabel(hit)) && <span data-lcos-search-result-context className="mt-0.5 flex min-w-0 flex-wrap gap-x-2 text-[11px]" style={{ color: lcosTokens.color.muted }}>
                  {searchReasonLabel(hit) && <span data-lcos-search-match-reason>{searchReasonLabel(hit)}</span>}
                  {locationCountLabel(hit) && <span data-lcos-search-location-count>{locationCountLabel(hit)}</span>}
                </span>}
              </span><ArrowRight size={16} aria-hidden />
            </button>;
          })}
        </div>
        {activeHit && <div data-lcos-search-secondary-actions className="mt-1 flex justify-end">
          <DropdownMenu align="bottom-right"
            trigger={<Button variant="ghost" tone="neutral" data-lcos-search-locate-trigger>查找位置</Button>}>
            <DropdownMenuItem onClick={() => locate(activeHit)}>在画布中定位“{searchHitName(activeHit)}”</DropdownMenuItem>
          </DropdownMenu>
        </div>}
        {truncated && <p className="px-3 py-2 text-xs" style={{ color: lcosTokens.color.muted }}>还有匹配结果；补充关键词可缩小范围。</p>}
      </>}
      {localLoading && <p role="status" className="px-3 py-2 text-xs">正在读取项目空间…</p>}
      {localIssue && <p role="status" className="px-3 py-2 text-xs">{localIssue}；材料搜索仍可使用。<button type="button" onClick={() => setRetry(value => value + 1)}>重试</button></p>}
    </div>}
  </>;
  return <div ref={placement.ref} data-lcos-navigator-island className="pointer-events-auto fixed z-40"
    style={{ top: placement.rect.y, left: placement.rect.x, maxWidth: width, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
    {content}
    {readerReturnTarget !== undefined && <ReaderSearchReturnFocusLayer />}
  </div>;
}
