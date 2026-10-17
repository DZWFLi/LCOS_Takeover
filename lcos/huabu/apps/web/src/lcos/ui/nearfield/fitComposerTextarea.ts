/** GEN1 UnifiedExecutionComposer useLayoutEffect sizing body, lifted as a testable DOM function.
 * 60px = Figma 5388:333 editor; 80px = existing LCOS bounded editor. No draft or submit owner.
 */
export function fitComposerTextarea(textarea: HTMLTextAreaElement): void {
  const minHeight = 60;
  const maxHeight = 80;
  textarea.style.height = '0px';
  const nextHeight = Math.min(maxHeight, Math.max(minHeight, textarea.scrollHeight));
  textarea.style.height = `${nextHeight}px`;
  textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
}
