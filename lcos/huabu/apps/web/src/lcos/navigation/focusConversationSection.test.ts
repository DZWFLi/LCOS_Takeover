import { afterEach, expect, it, vi } from 'vitest';
import { focusConversationSection } from './focusConversationSection';
let cancel: (() => void) | undefined;
afterEach(() => { cancel?.(); cancel = undefined; document.body.innerHTML = ''; vi.useRealTimers(); });
const view = (target: string): HTMLElement => {
  const body = document.createElement('div'); body.dataset.lcosWindowBody = 'conversation'; body.dataset.lcosWindowTarget = target;
  body.scrollTo = vi.fn(); document.body.append(body); return body;
};
it('focuses the real answer control in the requested WorkView only, without scrolling the canvas', () => {
  const other = view('other'); other.innerHTML = '<section data-lcos-waiting-input><textarea></textarea></section>';
  const body = view('wanted'); body.innerHTML = '<section data-lcos-waiting-input><textarea></textarea></section>';
  cancel = focusConversationSection('wanted', 'answer-input');
  expect(document.activeElement).toBe(body.querySelector('textarea'));
  expect(body.scrollTo).toHaveBeenCalledOnce(); expect(other.scrollTo).not.toHaveBeenCalled();
});
it('waits through lazy/loading sections and focuses once the real review action arrives', async () => {
  const body = view('wanted'); body.innerHTML = '<section data-lcos-artifact-return>载入中</section>';
  cancel = focusConversationSection('wanted', 'review-result'); expect(body.scrollTo).not.toHaveBeenCalled();
  body.querySelector('section')!.innerHTML = '<button>采纳</button>';
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(document.activeElement).toBe(body.querySelector('button')); expect(body.scrollTo).toHaveBeenCalledOnce();
});
it('cancels focus when the caller is gone, so a later unrelated render cannot steal focus', async () => {
  const body = view('wanted'); cancel = focusConversationSection('wanted', 'answer-input'); cancel();
  body.innerHTML = '<section data-lcos-waiting-input><textarea></textarea></section>';
  await new Promise((resolve) => setTimeout(resolve, 0)); expect(body.scrollTo).not.toHaveBeenCalled();
});
it('moves keyboard focus to the actual timeline for progress without fabricating a progress value', () => {
  const body = view('wanted'); body.innerHTML = '<section data-lcos-conversation-timeline>真实事件</section>';
  cancel = focusConversationSection('wanted', 'view-progress');
  expect(document.activeElement).toBe(body.querySelector('section')); expect(body.scrollTo).toHaveBeenCalledOnce();
});
