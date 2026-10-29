/** DOM portal bridge only; the existing Railway popover owns visibility. */
export const CREATION_HOST_CHANGED = 'lcos-creation-host-changed';
export const CREATION_FINISHED = 'lcos-creation-finished';
export function announceCreationHost(element: HTMLElement | null): void {
  document.dispatchEvent(
    new CustomEvent(CREATION_HOST_CHANGED, { detail: element }),
  );
}
