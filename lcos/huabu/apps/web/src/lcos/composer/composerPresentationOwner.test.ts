import { describe, expect, it } from 'vitest';
import { composerHasAssemblyJourney, composerHasVisibleWindowOwner } from './composerPresentationOwner';
import { composerInputKey } from './composerInputJourney';
import { visibleWindowIdsForStage } from '../professional/professionalStageVisibility';
import { createWindowRegion, splitRegionGroup } from '../shell/windowRegionTopology';
import type { LcosComposerTarget, LcosWindow } from '../shell/lcosShellStore';

const target: LcosComposerTarget = { nodeId: 'node-a', title: '材料', anchor: { x: 10, y: 20, width: 30, height: 40 } };
const windows: LcosWindow[] = [
  { id: 'reader', bodyKey: 'reader', title: '阅读', target: 'artifact-a', active: false },
  { id: 'assembly', bodyKey: 'assembly', title: '装配', active: false },
  { id: 'chat', bodyKey: 'conversation', title: '会话', target: 'conversation-a', active: true },
];
describe('visible Composer owner', () => {
  it('keeps a single split region readable on narrow screens without changing its groups', () => {
    const region = splitRegionGroup(createWindowRegion('split', ['reader', 'chat'], 'chat'), 'chat', 'vertical');
    const pair = windows.filter((window) => window.id !== 'assembly');
    expect(visibleWindowIdsForStage(pair, [region], { x: 0, y: 0, width: 390, height: 844 }))
      .toEqual({ compact: true, windowIds: ['chat'] });
    expect(visibleWindowIdsForStage(pair, [region], { x: 0, y: 0, width: 1440, height: 900 }))
      .toEqual({ compact: false, windowIds: ['reader', 'chat'] });
    expect(region.groups).toHaveLength(2);
  });
  it('uses the resized split window width even on a wide desktop', () => {
    const region = { ...splitRegionGroup(createWindowRegion('split', ['reader', 'chat'], 'chat'), 'chat', 'vertical'),
      rect: { x: 200, y: 100, width: 500, height: 600 } };
    expect(visibleWindowIdsForStage(windows.filter((window) => window.id !== 'assembly'), [region],
      { x: 0, y: 0, width: 1440, height: 900 }).compact).toBe(true);
  });
  it('keeps node-local input reachable with an unrelated Reader or Assembly open', () => {
    expect(composerHasVisibleWindowOwner(target, windows, ['reader'])).toBe(false);
    expect(composerHasVisibleWindowOwner(target, windows, ['assembly'])).toBe(false);
  });
  it('suppresses the canvas copy only for the visible owner of the same receiver', () => {
    const intent = { ...target, receiverConversationId: 'conversation-a' };
    expect(composerHasVisibleWindowOwner(intent, windows, ['chat'])).toBe(true);
    expect(composerHasVisibleWindowOwner(intent, windows, ['reader'])).toBe(false);
    expect(composerHasVisibleWindowOwner({ ...intent, receiverConversationId: 'conversation-b' }, windows, ['chat'])).toBe(false);
  });
  it('leaves legacy Assembly intent in the nearfield rather than mounting a second input', () => {
    const intent = { ...target, nodeId: 'assembly:artifact:a', receiverConversationId: 'conversation-a' };
    expect(composerHasVisibleWindowOwner(intent, windows, ['assembly'])).toBe(false);
    expect(composerHasVisibleWindowOwner(intent, windows, ['chat'])).toBe(false);
  });
  it('keeps only the original input while its material-picking bay is visible', () => {
    const bay = { ...windows[1]!, composerOriginKey: composerInputKey(target) };
    expect(composerHasAssemblyJourney(target, [bay], ['assembly'])).toBe(true);
    expect(composerHasVisibleWindowOwner(target, [bay], ['assembly'])).toBe(false);
    expect(composerHasAssemblyJourney({ ...target, nodeId: 'other' }, [bay], ['assembly'])).toBe(false);
    expect(composerHasAssemblyJourney(target, [bay], [])).toBe(false);
  });
  it('does not suppress Workflow Composer for a conversation clipped out by compact Stage visibility', () => {
    const intent = { ...target, nodeId: 'workflow:flow-a', receiverConversationId: 'conversation-a' };
    const visible = visibleWindowIdsForStage(windows, [
      createWindowRegion('chat-region', ['chat'], 'chat'),
      createWindowRegion('reader-region', ['reader'], 'reader'),
    ], { x: 0, y: 0, width: 800, height: 700 });
    expect(visible.compact).toBe(true);
    expect(visible.windowIds).toEqual(['chat']);
    expect(composerHasVisibleWindowOwner(intent, windows, visible.windowIds)).toBe(true);

    const hiddenConversation = visibleWindowIdsForStage(windows.map((window) => ({
      ...window,
      active: window.id === 'reader',
    })), [
      createWindowRegion('chat-region', ['chat'], 'chat'),
      createWindowRegion('reader-region', ['reader'], 'reader'),
    ], { x: 0, y: 0, width: 800, height: 700 });
    expect(hiddenConversation.windowIds).toEqual(['reader']);
    expect(composerHasVisibleWindowOwner(intent, windows, hiddenConversation.windowIds)).toBe(false);
  });
});
