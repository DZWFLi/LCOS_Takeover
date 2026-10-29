import { useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore, type ComponentType, type KeyboardEvent } from 'react';
import { ArrowLeft, ArrowUpRight, Check, ChevronRight, LoaderCircle, MapPin, Pin, PinOff, RefreshCw, Search, X } from 'lucide-react';
import { navigationDirectorySnapshot, subscribeNavigationDirectory, setNavigationDirectoryOpen, refreshNavigationDirectory,
  setNavigationDirectoryQuery, setNavigationDirectoryScroll, selectNavigationDirectoryMarker, removeNavigationDirectoryMarker,
  verifyNavigationDirectoryPending, backNavigationDirectoryPlaces } from './native-navigation-directory-state';
import useCanvasStore from './native-canvas-port';
import { nativeNavigationRecords } from './native-navigation-markers';
import { nativeNavigationSnapshot, subscribeNativeNavigation } from './native-navigation-state';
import { useLcosShellStore } from '../../lcos/huabu/apps/web/src/lcos/shell/lcosShellStore';
import './native-navigation-directory.css';

type DirectoryState = ReturnType<typeof navigationDirectorySnapshot>;
type DirectoryRow = DirectoryState['rows'][number];
type DirectoryPlace = DirectoryRow['candidates'][number];
export type NativeNavigationDirectoryEntryProps = {
  canvasId: string; disabled?: boolean; NativeButton: ComponentType<any>; NativePopover: ComponentType<any>;
};
const statusLabel = { ready: '', missing: '目标不可用', unplaced: '尚未显示', unavailable: '暂不可用' } as const;
const text = (value: unknown, fallback = '') => typeof value === 'string' && value.trim() ? value : fallback;
const titleOf = (row: DirectoryRow) => text(row.title, '已固定目标');
const placeLabel = (place: DirectoryPlace) => {
  const value = place as DirectoryPlace & { label?: string; title?: string; workspace?: { name?: string } };
  return text(value.label, text(value.workspace?.name, text(value.title, '已有现场')));
};
const placeTrail = (place: DirectoryPlace) => {
  const trail = (place as DirectoryPlace & { scopeTrail?: readonly { name?: string }[] }).scopeTrail;
  return Array.isArray(trail) ? trail.map(row => text(row.name)).filter(Boolean).join(' / ') : '';
};

function DirectoryRemove({ row, disabled, onRemove }: { row: DirectoryRow; disabled: boolean; onRemove(id: string, button: HTMLButtonElement): void }) {
  return <button type="button" className="native-navigation-directory-remove" disabled={disabled}
    data-native-navigation-directory-remove={row.marker.id} aria-label={`取消固定 ${titleOf(row)}`} title="取消固定"
    onClick={event => onRemove(row.marker.id, event.currentTarget)}><PinOff size={14} aria-hidden="true" /></button>;
}

/** The original gs/pr own the trigger and Popover. This leaf only supplies
 * canonical rows and their existing actions; it owns no route or second window. */
export function LCOSNativeNavigationDirectoryEntry({ canvasId, disabled = false, NativeButton, NativePopover }: NativeNavigationDirectoryEntryProps) {
  const state = useSyncExternalStore(subscribeNavigationDirectory, navigationDirectorySnapshot, navigationDirectorySnapshot);
  const navigation = useSyncExternalStore(subscribeNativeNavigation, nativeNavigationSnapshot, nativeNavigationSnapshot);
  const currentCanvasId = useCanvasStore(value => value.canvasId), currentApi = useCanvasStore(value => value.rfInstance);
  const currentProjectId = useLcosShellStore(value => value.projectId);
  const matchingScene = !!state.scene && state.scene.canvasId === canvasId && currentCanvasId === canvasId
    && state.scene.projectId === currentProjectId && state.scene.api === currentApi;
  const open = matchingScene && state.open;
  const rows = matchingScene ? state.rows : [];
  const selected = state.selectedMarkerId ? rows.find(row => row.marker.id === state.selectedMarkerId) : undefined;
  const query = text(state.query).trim().toLocaleLowerCase();
  const filtered = useMemo(() => !query ? rows : rows.filter(row =>
    [row.title, row.kindLabel, row.originLabel, row.detail].some(value => text(value).toLocaleLowerCase().includes(query))), [rows, query]);
  const listRef = useRef<HTMLDivElement>(null), searchRef = useRef<HTMLInputElement>(null), triggerRef = useRef<HTMLSpanElement>(null);
  const focusOnOpen = useRef(false), lastPlaceMarker = useRef<string | undefined>(undefined);
  const contentRef = useRef<HTMLElement>(null), removeFocus = useRef<(() => void) | null>(null);
  const navigationDisabled = disabled || !!state.busy || state.status === 'loading';
  const mutationDisabled = navigationDisabled || state.pending;
  const selectedId = selected?.marker.id;

  useEffect(() => {
    if (!open) { focusOnOpen.current = false; return; }
    if (state.status !== 'ready' || selectedId || focusOnOpen.current) return;
    focusOnOpen.current = true;
    const frame = requestAnimationFrame(() => { if (!selectedId) searchRef.current?.focus({ preventScroll: true }); });
    return () => cancelAnimationFrame(frame);
  }, [open, selectedId, state.status]);
  useLayoutEffect(() => {
    if (!open || !listRef.current || selectedId) return;
    listRef.current.scrollTop = Number.isFinite(state.scroll) ? Math.max(0, state.scroll) : 0;
    // The selection page is the same Popover. Returning restores the old list
    // and its exact row focus, rather than opening another overlay.
    const previous = lastPlaceMarker.current;
    if (previous) {
      lastPlaceMarker.current = undefined;
      const row = [...listRef.current.querySelectorAll<HTMLElement>('[data-native-navigation-directory-row]')]
        .find(element => element.dataset.nativeNavigationDirectoryRow === previous);
      row?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
    }
  }, [open, selectedId, state.query, state.status]);
  useEffect(() => { if (selectedId) lastPlaceMarker.current = selectedId; }, [selectedId]);

  useEffect(() => () => removeFocus.current?.(), [open, canvasId, currentApi, currentProjectId]);
  const remove = (id: string, button: HTMLButtonElement) => {
    removeFocus.current?.();
    const scene = state.scene, content = contentRef.current;
    if (!open || !matchingScene || !scene || !content?.isConnected || document.activeElement !== button) {
      void removeNavigationDirectoryMarker(id); return;
    }
    let cancelled = false, frame: number | undefined;
    const cancel = () => {
      cancelled = true;
      document.removeEventListener('focusin', moved, true); document.removeEventListener('pointerdown', moved, true);
      if (frame !== undefined) cancelAnimationFrame(frame);
      if (removeFocus.current === cancel) removeFocus.current = null;
    };
    const moved = (event: Event) => {
      if (event.type === 'focusin' && (event.target === document.body || event.target === document.documentElement)) return;
      if (event.target instanceof Node && !button.contains(event.target)) cancel();
    };
    removeFocus.current = cancel;
    document.addEventListener('focusin', moved, true); document.addEventListener('pointerdown', moved, true);
    void removeNavigationDirectoryMarker(id).finally(() => {
      if (cancelled) return;
      frame = requestAnimationFrame(() => {
        frame = undefined;
        const latest = navigationDirectorySnapshot(), canvas = useCanvasStore.getState();
        const same = latest.open && latest.scene?.projectId === scene.projectId && latest.scene.canvasId === scene.canvasId
          && latest.scene.api === scene.api && useLcosShellStore.getState().projectId === scene.projectId
          && canvas.canvasId === scene.canvasId && canvas.rfInstance === scene.api;
        if (same && contentRef.current === content && content.isConnected
          && (document.activeElement === document.body || document.activeElement === document.documentElement)) {
          // A surviving failed action keeps its own retry focus. A removed row
          // hands focus to the original search in this same Popover.
          const remaining = [...content.querySelectorAll<HTMLButtonElement>('[data-native-navigation-directory-remove]')]
            .find(element => element.dataset.nativeNavigationDirectoryRemove === id && !element.disabled);
          const fallback = content.querySelector<HTMLButtonElement>('[data-native-navigation-directory-read-retry]:not(:disabled)')
            ?? content.querySelector<HTMLButtonElement>('.native-navigation-directory-header button[aria-label="重新读取固定目标"]:not(:disabled), .native-navigation-directory-header button[aria-label="关闭固定目录"]:not(:disabled)');
          (remaining ?? searchRef.current ?? fallback)?.focus({ preventScroll: true });
        }
        cancel();
      });
    });
  };
  const close = () => setNavigationDirectoryOpen(canvasId, false);
  const escape = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape') return;
    // Keep the original Popover's Escape dismissal. Its trigger wraps gs in a
    // div; restoring the actual button makes keyboard return unambiguous.
    requestAnimationFrame(() => triggerRef.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true }));
  };
  const navigationMatches = navigation.scene?.canvasId === canvasId && currentCanvasId === canvasId
    && navigation.scene.projectId === currentProjectId && navigation.scene.api === currentApi;
  const canonicalMarkers = navigationMatches && navigation.facts ? nativeNavigationRecords(navigation.facts) : undefined;
  const canonicalIds = new Set(canonicalMarkers?.map(row => row.id));
  const fallbackCount = navigationMatches ? new Set(navigation.unplacedMarkerIds?.filter(id => canonicalIds.has(id))).size : 0;
  const incomplete = navigationMatches && navigation.layoutIncomplete;
  // Closing the directory must not turn known fixed records into a zero badge.
  const count = canonicalMarkers ? canonicalIds.size : rows.length;
  const label = `已固定目标${count ? `，${count} 项` : ''}${fallbackCount ? `；${fallbackCount} 项图钉在目录中` : ''}`;

  useLayoutEffect(() => {
    // Original gs/br intentionally accepts a finite prop set. Preserve that
    // real button; attach only this entry's semantics within its exact ref.
    const buttons = triggerRef.current?.querySelectorAll<HTMLButtonElement>('button');
    if (buttons?.length !== 1) return;
    const button = buttons[0]!, owned = {
      'data-native-navigation-directory-trigger': 'true', 'aria-label': label,
      'aria-haspopup': 'dialog', 'aria-expanded': String(open), title: label,
    };
    const previous = new Map(Object.keys(owned).map(name => [name, button.getAttribute(name)]));
    for (const [name, value] of Object.entries(owned)) if (button.getAttribute(name) !== value) button.setAttribute(name, value);
    return () => {
      for (const [name, value] of Object.entries(owned)) {
        // Do not undo another owner's later change or modify a replacement.
        if (button.getAttribute(name) !== value) continue;
        const prior = previous.get(name);
        if (prior === null || prior === undefined) button.removeAttribute(name); else button.setAttribute(name, prior);
      }
    };
  }, [canvasId, NativeButton, label, open]);

  const trigger = <span className="native-navigation-directory-entry" data-native-navigation-directory-entry ref={triggerRef}>
    <NativeButton type="button" shape="circle" className="native-navigation-directory-trigger" disabled={disabled || !canvasId}
      >
      <Pin size={18} strokeWidth={1.7} aria-hidden="true" />
      {count > 0 ? <span className="native-navigation-directory-count" aria-hidden="true">{count > 99 ? '99+' : count}</span> : null}
    </NativeButton>
  </span>;

  const content = <section ref={contentRef} className="native-navigation-directory" data-native-navigation-directory aria-label="已固定目标" aria-busy={!!state.busy || state.status === 'loading'} onKeyDown={escape}>
    <header className="native-navigation-directory-header">
      {state.selectedMarkerId ? <button type="button" className="native-navigation-directory-icon-action" aria-label="返回固定目录" title="返回固定目录"
        data-native-navigation-directory-back onClick={() => backNavigationDirectoryPlaces()}><ArrowLeft size={16} aria-hidden="true" /></button> : <Pin size={15} aria-hidden="true" />}
      <strong>{state.selectedMarkerId ? selected ? titleOf(selected) : '选择位置' : '已固定目标'}</strong>
      {state.busy ? <LoaderCircle size={14} className="native-navigation-directory-spinner" aria-label="正在处理" /> : null}
      {!state.pending && state.status !== 'error' ? <button type="button" className="native-navigation-directory-icon-action" aria-label="重新读取固定目标" title="重新读取" disabled={!!state.busy || disabled}
        onClick={() => { void refreshNavigationDirectory(); }}><RefreshCw size={14} aria-hidden="true" /></button> : null}
      <button type="button" className="native-navigation-directory-icon-action" aria-label="关闭固定目录" title="关闭" onClick={close}><X size={15} aria-hidden="true" /></button>
    </header>
    {fallbackCount > 0 || incomplete ? <div className="native-navigation-directory-layout-notice" data-native-navigation-directory-layout-notice role="status">
      {fallbackCount > 0 ? `${fallbackCount} 项图钉暂收在目录，可在这里查看。` : '部分图钉暂未显示，可在目录查看固定目标。'}
    </div> : null}
    {state.pending ? <div className="native-navigation-directory-pending" role="status">
      <span>{state.status === 'error' ? '固定结果待核对，未重复提交。' : text(state.error, '固定结果待核对，未重复提交。')}</span><button type="button" disabled={!!state.busy || disabled} data-native-navigation-directory-verify
        onClick={() => { void verifyNavigationDirectoryPending(); }}>核对结果</button>
    </div> : null}
    {!state.pending && state.status !== 'error' && state.error ? <div className="native-navigation-directory-operation-error" role="alert">{text(state.error)}</div> : null}
    {state.status === 'error' ? <div className="native-navigation-directory-state" role="alert">
      <span>{text(state.error, '固定目标暂时无法读取，请重试。')}</span>
      {!state.pending ? <button type="button" disabled={!!state.busy || disabled} aria-label="重新读取固定目标" data-native-navigation-directory-read-retry onClick={() => { void refreshNavigationDirectory(); }}>重新读取</button> : null}
    </div> : state.status === 'loading' ? <div className="native-navigation-directory-state" role="status"><LoaderCircle size={16} className="native-navigation-directory-spinner" aria-hidden="true" /><span>正在读取已固定目标…</span></div>
    : state.selectedMarkerId ? selected ? <>
      <div className="native-navigation-directory-subheading"><span>选择已有位置</span><span>{selected.partial ? `已读取 ${selected.candidates.length} 处` : `${selected.candidates.length} 处`}</span></div>
      {selected.partial ? <div className="native-navigation-directory-partial" data-native-navigation-directory-partial role="status">{text(selected.detail, '部分位置暂时读不到，已读取的位置仍可前往。')}</div> : null}
      <div className="native-navigation-directory-list" data-native-navigation-directory-places={selected.marker.id}>
        {selected.candidates.length ? <ul>{selected.candidates.map((place, index) => {
          const trail = placeTrail(place), name = placeLabel(place), current = place.canvasId === canvasId;
          return <li key={`${place.canvasId}:${place.nodeId ?? ''}:${place.workspaceId ?? ''}:${index}`}>
            <button type="button" className="native-navigation-directory-place" disabled={navigationDisabled}
              data-native-navigation-directory-place={index} aria-label={`前往 ${name}`}
              onClick={() => { void selectNavigationDirectoryMarker(selected.marker.id, place); }}>
              <MapPin size={16} aria-hidden="true" /><span className="native-navigation-directory-copy"><span className="native-navigation-directory-title" title={name}>{name}</span>
                {trail ? <span className="native-navigation-directory-subtitle" title={trail}>{trail}</span> : null}</span>
              {current ? <span className="native-navigation-directory-current"><Check size={12} aria-hidden="true" />当前</span> : <ArrowUpRight size={14} aria-hidden="true" />}
            </button>
          </li>;
        })}</ul> : <div className="native-navigation-directory-state"><span>{text(selected.detail, '暂时没有可前往的位置，原固定记录保留。')}</span></div>}
      </div>
      <div className="native-navigation-directory-selected-footer"><span>{text(selected.kindLabel, '固定目标')}</span><DirectoryRemove row={selected} disabled={mutationDisabled} onRemove={remove} /></div>
    </> : <div className="native-navigation-directory-state" role="status">固定记录已变化，请返回目录核对。</div>
    : <>
      <label className="native-navigation-directory-search"><Search size={14} aria-hidden="true" />
        <input ref={searchRef} type="search" aria-label="搜索固定目标" placeholder="搜索名称或现场" value={state.query}
          onChange={event => { setNavigationDirectoryQuery(event.currentTarget.value); setNavigationDirectoryScroll(0); }} />
      </label>
      <div ref={listRef} className="native-navigation-directory-list" data-native-navigation-directory-list
        onScroll={event => setNavigationDirectoryScroll(event.currentTarget.scrollTop)}>
        {filtered.length ? <ul>{filtered.map(row => {
          const title = titleOf(row), available = row.status === 'ready', subtitle = [text(row.kindLabel), text(row.originLabel)].filter(Boolean).join(' · ');
          return <li key={row.marker.id} className="native-navigation-directory-row" data-native-navigation-directory-row={row.marker.id} data-status={row.status}>
            <button type="button" className="native-navigation-directory-row-main" disabled={!available || navigationDisabled}
              aria-label={available ? row.candidates.length > 1 ? `查看 ${title} 的位置` : `前往 ${title}` : `${title}，${statusLabel[row.status]}`}
              onClick={() => { void selectNavigationDirectoryMarker(row.marker.id); }}>
              <Pin size={15} aria-hidden="true" /><span className="native-navigation-directory-copy"><span className="native-navigation-directory-title" title={title}>{title}</span>
                {subtitle ? <span className="native-navigation-directory-subtitle" title={subtitle}>{subtitle}</span> : null}
                {(!available || row.partial) && row.detail ? <span className="native-navigation-directory-detail" data-native-navigation-directory-partial={row.partial || undefined}>{row.detail}</span> : null}</span>
              {available ? <ChevronRight size={14} aria-hidden="true" /> : <span className="native-navigation-directory-status">{statusLabel[row.status]}</span>}
            </button><DirectoryRemove row={row} disabled={mutationDisabled} onRemove={remove} />
          </li>;
        })}</ul> : <div className="native-navigation-directory-state" role="status">
          <span>{query ? '没有匹配的固定目标。' : '还没有固定目标。'}</span>
          {query ? <button type="button" onClick={() => { setNavigationDirectoryQuery(''); setNavigationDirectoryScroll(0); }}>清除搜索</button>
            : <p>在节点「更多」中选择「固定到导航」。</p>}
        </div>}
      </div>
      <footer className="native-navigation-directory-footer">{query ? `${filtered.length} / ${count} 个固定目标` : `${count} 个固定目标`}</footer>
    </>}
  </section>;
  return <NativePopover trigger="click" open={open} onOpenChange={(value: boolean) => { if (!value || !disabled) setNavigationDirectoryOpen(canvasId, value); }}
    side="top" align="end" sideOffset={10} collisionPadding={12} avoidCollisions contentClassName="native-navigation-directory-popover" content={content}>{trigger}</NativePopover>;
}
