import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

import { WorkflowNodeEntry } from './WorkflowNodeEntry';

import type { Workspace } from '@local-creative-os/domain';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const workspace = (id: string, canvasId?: string): Workspace => ({ id: id as Workspace['id'], name: id,
  scopeId: 'workflow-scope' as Workspace['scopeId'], projectId: 'p' as Workspace['projectId'], intent: null,
  viewport: { x: 0, y: 0, zoom: 1 }, focusedViewIds: [], visibleLayers: ['core'],
  contextPolicy: 'selection-only', updatedAt: '2026-10-08T00:00:00Z', ...(canvasId ? { canvasId } : {}) });

it.each([1, 2])('shows %i ready target addresses directly and never shows a destination dropdown', (count) => {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host), enter = vi.fn();
  const ready = Array.from({ length: count }, (_, i) => workspace(`实际现场${i}`, `canvas-${i}`));
  try {
    act(() => root.render(<WorkflowNodeEntry title="流程" targets={[workspace('未就绪'), ...ready]} onEnter={enter} />));
    expect(host.querySelectorAll('button')).toHaveLength(count);
    expect(host.querySelector('[aria-haspopup]')).toBeNull();
    expect(host.textContent).not.toContain('未就绪');
    const button = host.querySelector<HTMLButtonElement>('button');
    if (count > 1) expect(button?.textContent).toContain('实际现场0');
    act(() => button?.click());
    expect(enter).toHaveBeenCalledExactlyOnceWith(ready[0]);
  } finally { act(() => root.unmount()); host.remove(); }
});
