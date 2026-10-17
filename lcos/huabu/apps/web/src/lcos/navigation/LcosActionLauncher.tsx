import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useCloseOnEscape } from '@/hooks/useCloseOnEscape';

import { ACTION_LAUNCHER_KEYS, moveLauncherSelection, rankLauncherActions } from './actionLauncher';
import { lcosGlassStyle, lcosTokens } from '../ui/lcosTokens';
import { useLayerReturnFocus } from '../ui/spatial/useLayerReturnFocus';

import type { LcosLauncherAction } from './actionLauncher';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

function LauncherPanel({ actions, close, executeAction }: { readonly actions: readonly LcosLauncherAction[];
  readonly close: () => void; readonly executeAction: (id: string) => void }): React.JSX.Element {
  const [query,setQuery] = useState('');
  const [active,setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const layer = useLayerReturnFocus(true);
  const id = useId();
  const matches = rankLauncherActions(actions,query);
  const selected = Math.min(active,Math.max(0,matches.length-1));
  useCloseOnEscape(true,close,{ canvasBlank: true });
  useEffect(() => { input.current?.focus({ preventScroll: true }); },[]);
  const execute = (index: number): void => {
    const action = matches[index]; if (!action) return;
    close(); executeAction(action.id);
  };
  const handleKeys = (event: ReactKeyboardEvent<HTMLElement>): void => {
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    if (event.key === ACTION_LAUNCHER_KEYS.previous || event.key === ACTION_LAUNCHER_KEYS.next) {
      event.preventDefault(); setActive(moveLauncherSelection(selected,matches.length,event.key === ACTION_LAUNCHER_KEYS.previous ? -1 : 1));
    } else if (event.key === ACTION_LAUNCHER_KEYS.execute && !(event.target instanceof HTMLButtonElement)) {
      event.preventDefault(); execute(selected);
    }
  };
  return createPortal(<div ref={layer} data-lcos-action-launcher className="fixed inset-0 z-[100] flex items-start justify-center pt-[14vh]">
    <button type="button" className="absolute inset-0 cursor-default border-0 bg-black/5" aria-label="返回画布" onClick={close} />
    <section role="dialog" aria-modal="true" aria-label="查找操作" className="relative flex w-[min(520px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl p-3"
      style={lcosGlassStyle}>
      <input ref={input} value={query} placeholder="你想做什么？" aria-label="查找操作" aria-controls={id}
        aria-activedescendant={matches[selected] ? `${id}-${selected}` : undefined}
        onKeyDown={handleKeys}
        className="min-h-11 rounded-lg border-0 bg-transparent px-3 text-sm outline-none"
        onChange={event => { setQuery(event.currentTarget.value); setActive(0); }} />
      <div role="listbox" aria-label="可用操作" id={id} className="max-h-[50vh] overflow-y-auto">
        {matches.map((action,index) => <button key={action.id} id={`${id}-${index}`} type="button" role="option"
          aria-selected={index === selected} data-lcos-launcher-action={action.id}
          onKeyDown={handleKeys}
          onMouseEnter={() => setActive(index)} onClick={() => execute(index)}
          className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm"
          style={{ background: index === selected ? lcosTokens.color.raised : undefined }}>
          <span>{action.title}</span>{action.hint && <small style={{ color: lcosTokens.color.muted }}>{action.hint}</small>}
        </button>)}
        {!matches.length && <p role="status" className="px-3 py-4 text-sm">没有匹配的可用操作</p>}
      </div>
      <footer className="flex gap-4 px-3 pt-3 text-xs" style={{ color: lcosTokens.color.muted }}><span>↑↓ 选择</span><span>Enter 执行</span><span>Esc 返回</span></footer>
    </section>
  </div>,document.body);
}

/** One Ctrl/Cmd+K owner, matching G1's global action command even in a text
 * field. Actual entries are provided fresh by the existing capability owner. */
export function LcosActionLauncher({ projectId, readActions }: {
  readonly projectId: string; readonly readActions: () => readonly LcosLauncherAction[];
}): React.JSX.Element | null {
  const [open,setOpen] = useState(false);
  const reader = useRef(readActions); reader.current = readActions;
  useEffect(() => {
    const key = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.repeat
        || (!event.ctrlKey && !event.metaKey) || event.key.toLocaleLowerCase() !== ACTION_LAUNCHER_KEYS.open) return;
      if (document.querySelector('[aria-modal="true"]') && !open) return;
      event.preventDefault(); setOpen(true);
    };
    window.addEventListener('keydown',key);
    return () => window.removeEventListener('keydown',key);
  },[open]);
  useEffect(() => { setOpen(false); },[projectId]);
  return open ? <LauncherPanel actions={reader.current()} close={() => setOpen(false)}
    executeAction={id => reader.current().find(action => action.id === id)?.run()} /> : null;
}
