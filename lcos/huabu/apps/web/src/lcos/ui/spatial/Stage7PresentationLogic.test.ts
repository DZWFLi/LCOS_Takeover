import { describe, expect, it } from 'vitest';

import { PRESENTATION_EXIT, PRESENTATION_SPRING, presentationPose } from './presentationMotion';
import { filterWorkflowTitles } from '../workflow/filterWorkflowTitles';

describe('Stage7 donor presentation inputs', () => {
  it.each([
    [false, false, false, 0, 1], [false, true, false, -8, 1.025],
    [false, true, true, 0, 1], [true, true, false, 0, 1],
    [true, false, false, 0, 1], [true, true, true, 0, 1],
  ] as const)('reduced=%s focused=%s disabled=%s', (reduced, focused, disabled, y, scale) => {
    expect(presentationPose(reduced, focused, disabled)).toEqual({ opacity: 1, y, scale });
  });
  it('preserves the GEN1 spring', () => {
    expect(PRESENTATION_SPRING).toEqual({ type: 'spring', stiffness: 400, damping: 25 });
  });
  it('keeps exit finite', () => {
    expect(PRESENTATION_EXIT).toEqual({ duration: 0.2, ease: 'easeOut' });
  });
});

describe('restored workflow title filter', () => {
  const items = [{ id: 'a', title: '山野研究' }, { id: 'b', title: 'Workflow Review' }, { id: 'c', title: '山野主视觉' }, { id: 'd', title: null }, { id: 'e' }];
  it('retains original list for an empty query', () => expect(filterWorkflowTitles(items, '   ')).toBe(items));
  it('matches Chinese titles', () => expect(filterWorkflowTitles(items, '山野').map(x => x.id)).toEqual(['a', 'c']));
  it('matches case insensitively', () => expect(filterWorkflowTitles(items, 'review')[0]).toBe(items[1]));
  it('trims input', () => expect(filterWorkflowTitles(items, ' Review ')[0]).toBe(items[1]));
  it('ignores missing titles', () => expect(filterWorkflowTitles(items, 'unknown')).toEqual([]));
  it('retains selected object identity', () => {
    expect(filterWorkflowTitles(items, '山野')[0]).toBe(items[0]);
    expect(items).toHaveLength(5);
  });
});
