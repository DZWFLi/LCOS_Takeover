// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * Dismiss an open overlay (popover, picker, menu) with the Escape key.
 *
 * Overlays that can only be dismissed by clicking a backdrop are
 * unreachable for keyboard users, so every backdrop-dismissible surface
 * pairs its outside-click handler with this hook. Propagation is stopped
 * so Escape dismisses the overlay without also reaching the canvas,
 * where it would clear the selection.
 */

import { useEffect, useRef } from 'react';

interface EscapeDismissEntry {
  readonly id: symbol;
  close: () => void;
  canvasBlank: () => boolean;
}

const dismissStack: EscapeDismissEntry[] = [];
let listenerInstalled = false;
let blankTap: { id: symbol; pointerId: number; x: number; y: number; moved: boolean; released: boolean } | null = null;

function isCanvasBlank(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest('.react-flow__pane') !== null) return true;
  const node = target.closest('.react-flow__node');
  // A Frame's empty interior is also a canvas background. Content nodes and
  // its actual label/control surfaces remain ordinary object interactions.
  return node?.classList.contains('react-flow__node-frame') === true
    && !target.closest('button, input, textarea, select, a[href], [role="button"], [contenteditable="true"], .react-flow__handle')
    && target.textContent?.trim() === '';
}
function observeBlankPointerDown(event: PointerEvent): void {
  blankTap = null;
  const top = dismissStack.at(-1);
  if (event.defaultPrevented || event.button !== 0 || !isCanvasBlank(event.target) || !top?.canvasBlank()) return;
  blankTap = { id: top.id, pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false, released: false };
}
function observeBlankPointerMove(event: PointerEvent): void {
  if (blankTap?.pointerId === event.pointerId
    && Math.hypot(event.clientX - blankTap.x, event.clientY - blankTap.y) > 4) blankTap.moved = true;
}
function observeBlankPointerUp(event: PointerEvent): void {
  if (blankTap?.pointerId === event.pointerId) blankTap.released = true;
}
function cancelBlankTap(): void { blankTap = null; }
function dismissOnBlankClick(event: MouseEvent): void {
  const tap = blankTap; blankTap = null;
  const top = dismissStack.at(-1);
  if (event.defaultPrevented || event.button !== 0 || !tap?.released || tap.moved || tap.id !== top?.id
    || !isCanvasBlank(event.target) || !top.canvasBlank()) return;
  // Let Canvas still handle its ordinary deselection. This observer neither
  // captures the pointer nor becomes a second drag/selection owner.
  top.close();
}

function dispatchEscape(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing || event.keyCode === 229) return;
  // Fullscreen is above the application overlay stack. One Escape leaves
  // fullscreen; a later Escape may dismiss the Reader or its parent window.
  if (document.fullscreenElement) {
    event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
    void document.exitFullscreen().catch(() => { /* Keep the Reader open on a denied exit. */ });
    return;
  }
  const topmost = dismissStack.at(-1);
  if (topmost === undefined) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  topmost.close();
}

function registerEscapeDismiss(entry: EscapeDismissEntry): () => void {
  dismissStack.push(entry);
  if (!listenerInstalled) {
    document.addEventListener('keydown', dispatchEscape);
    document.addEventListener('pointerdown', observeBlankPointerDown, true);
    document.addEventListener('pointermove', observeBlankPointerMove, true);
    document.addEventListener('pointerup', observeBlankPointerUp, true);
    document.addEventListener('pointercancel', cancelBlankTap, true);
    document.addEventListener('click', dismissOnBlankClick, true);
    window.addEventListener('blur', cancelBlankTap);
    listenerInstalled = true;
  }
  return () => {
    const index = dismissStack.findIndex((candidate) => candidate.id === entry.id);
    if (index >= 0) dismissStack.splice(index, 1);
    if (dismissStack.length === 0 && listenerInstalled) {
      document.removeEventListener('keydown', dispatchEscape);
      document.removeEventListener('pointerdown', observeBlankPointerDown, true);
      document.removeEventListener('pointermove', observeBlankPointerMove, true);
      document.removeEventListener('pointerup', observeBlankPointerUp, true);
      document.removeEventListener('pointercancel', cancelBlankTap, true);
      document.removeEventListener('click', dismissOnBlankClick, true);
      window.removeEventListener('blur', cancelBlankTap);
      blankTap = null;
      listenerInstalled = false;
    }
  };
}

export function useCloseOnEscape(isOpen: boolean, onClose: () => void,
  options?: { readonly canvasBlank?: boolean | (() => boolean) }) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const blankRef = useRef(options?.canvasBlank);
  blankRef.current = options?.canvasBlank;

  useEffect(() => {
    if (!isOpen) return;
    return registerEscapeDismiss({ id: Symbol('escape-dismiss'), close: () => onCloseRef.current(),
      canvasBlank: () => typeof blankRef.current === 'function' ? blankRef.current() : blankRef.current === true });
  }, [isOpen]);
}
