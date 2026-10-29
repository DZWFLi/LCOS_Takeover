import { expect, it } from 'vitest';

import { isComposerEntryKey } from './LcosComposerEntryKeys';
import { isContentComposeClick, nodeSupportsNearfieldInput } from './nodeComposerEntry';

import type { Node } from '@xyflow/react';
const image: Node = { id: 'image', type: 'image', position: { x: 0, y: 0 }, data: {} };
it('matches mature content eligibility without turning every spatial node into input', () => {
  expect(nodeSupportsNearfieldInput(image)).toBe(true);
  expect(nodeSupportsNearfieldInput({ ...image, type: 'frame' })).toBe(false);
  expect(nodeSupportsNearfieldInput({ ...image, type: 'note' }, { entityType: 'collection', entityId: 'c' })).toBe(false);
  expect(nodeSupportsNearfieldInput({ ...image, type: 'note' }, { entityType: 'conversation', entityId: 'real-session' })).toBe(true);
});
it('stable content clicks retain native drag/multiselect/control ownership', () => {
  const target = document.createElement('div'); document.body.append(target);
  const event = new MouseEvent('click', { bubbles: true, button: 0, detail: 1 });
  target.dispatchEvent(event);
  Object.defineProperty(event, 'target', { value: target });
  expect(isContentComposeClick(event, image, [image])).toBe(true);
  expect(isContentComposeClick(event, image, [image, { ...image, id: 'other' }])).toBe(false);
  expect(isContentComposeClick(event, { ...image, dragging: true }, [image])).toBe(false);
  expect(isContentComposeClick(event, { ...image, resizing: true }, [image])).toBe(false);
  const button = document.createElement('button'); target.append(button);
  const control = new MouseEvent('click', { bubbles: true, button: 0, detail: 1 }); button.dispatchEvent(control);
  Object.defineProperty(control, 'target', { value: button });
  expect(isContentComposeClick(control, image, [image])).toBe(false);
  target.remove();
});
it('C does not steal text entry, copying, IME or modifier selection', () => {
  expect(isComposerEntryKey(new KeyboardEvent('keydown', { key: 'c' }))).toBe(true);
  expect(isComposerEntryKey(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true }))).toBe(false);
  expect(isComposerEntryKey(new KeyboardEvent('keydown', { key: 'c', isComposing: true }))).toBe(false);
  const input = document.createElement('input'); document.body.append(input);
  const event = new KeyboardEvent('keydown', { key: 'c' }); input.dispatchEvent(event);
  Object.defineProperty(event, 'target', { value: input });
  expect(isComposerEntryKey(event)).toBe(false); input.remove();
});
