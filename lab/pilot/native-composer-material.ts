import { useLayoutEffect, useRef, type RefObject } from 'react';
import { mountWindowMaterialInteraction } from '../../lcos/huabu/apps/web/src/lcos/ui/materials/windowMaterialInteraction';
import './native-composer-material.css';

export interface NativeComposerMaterialOptions {
  readonly disabled?: boolean;
  readonly suppressed?: boolean;
}

/** The same original input bubble, never a wrapper, draft owner or task phase.
 * The caller composes its original Drop/reference ref with this DOM ref. */
export function useNativeComposerMaterial(
  surfaceRef: RefObject<HTMLDivElement | null>,
  options: NativeComposerMaterialOptions = {},
): void {
  const lifetime = useRef<{ host: HTMLDivElement; update(next: NativeComposerMaterialOptions): void; dispose(): void } | null>(null);
  useLayoutEffect(() => {
    const host = surfaceRef.current;
    if (lifetime.current?.host !== host) {
      lifetime.current?.dispose(); lifetime.current = null;
      if (host) lifetime.current = mountComposerMaterial(host);
    }
    lifetime.current?.update(options);
  });
  useLayoutEffect(() => () => { lifetime.current?.dispose(); lifetime.current = null; }, []);
}

function mountComposerMaterial(host: HTMLDivElement) {
  const doc = host.ownerDocument, win = doc.defaultView!;
  const material = 'data-lcos-native-composer-material', active = 'data-lcos-native-composer-material-active';
  const previous = new Map([material, active].map(name => [name, host.getAttribute(name)]));
  host.setAttribute(material, 'true');
  let options: NativeComposerMaterialOptions = {}, release: (() => void) | undefined, disposed = false;
  const inlineVisibility = (element: HTMLElement) => [element.style.display, element.style.visibility, element.style.opacity, element.style.contentVisibility].join('|');
  const ancestors: HTMLElement[] = [];
  for (let element: HTMLElement | null = host; element; element = element.parentElement) ancestors.push(element);
  const styles = new Map(ancestors.map(element => [element, inlineVisibility(element)]));
  const refresh = () => {
    if (disposed) return;
    const visible = host.isConnected && !doc.hidden && !host.closest('[hidden],[inert],[aria-hidden="true"]')
      && (host.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }) ?? true);
    const enabled = visible && !options.disabled && !options.suppressed;
    host.setAttribute(active, String(enabled));
    if (!enabled) { release?.(); release = undefined; }
    else if (!release) release = mountWindowMaterialInteraction(host);
  };
  const observer = typeof win.MutationObserver === 'function' ? new win.MutationObserver(records => {
    // Original damping writes only a custom property on style. Do not turn
    // those frames into repeated computed-visibility reads or another clock.
    let relevant = false;
    for (const record of records) {
      if (record.attributeName !== 'style') { relevant = true; continue; }
      const element = record.target as HTMLElement, next = inlineVisibility(element);
      if (styles.get(element) !== next) relevant = true;
      styles.set(element, next);
    }
    if (relevant) refresh();
  }) : null;
  for (const element of ancestors) observer?.observe(element, { attributes: true, attributeFilter: ['hidden','inert','aria-hidden','class','style'] });
  const resized = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(refresh) : null;
  resized?.observe(host);
  const visibility = () => refresh();
  const transition = (event: Event) => { if (event.target instanceof win.Element && event.target.contains(host)) refresh(); };
  doc.addEventListener('visibilitychange', visibility);
  doc.addEventListener('transitionend', transition); doc.addEventListener('animationend', transition);
  return {
    host,
    update(next: NativeComposerMaterialOptions) { options = next; refresh(); },
    dispose() {
      if (disposed) return; disposed = true;
      release?.(); release = undefined; observer?.disconnect(); resized?.disconnect();
      doc.removeEventListener('visibilitychange', visibility);
      doc.removeEventListener('transitionend', transition); doc.removeEventListener('animationend', transition);
      for (const [name, old] of previous) {
        if (name === material && host.getAttribute(name) !== 'true') continue;
        if (name === active && !['true','false'].includes(host.getAttribute(name) ?? '')) continue;
        if (old === null) host.removeAttribute(name); else host.setAttribute(name, old);
      }
    },
  };
}
