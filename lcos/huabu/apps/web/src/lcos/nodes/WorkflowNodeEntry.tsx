import type { Workspace } from '@local-creative-os/domain';

/** Actual ready workspaces, without a second destination chooser. */
export function WorkflowNodeEntry({ title, targets, onEnter, surface = 'workflow' }: {
  readonly title: string;
  readonly targets: readonly Workspace[];
  readonly onEnter: (workspace: Workspace) => void;
  readonly surface?: 'context' | 'workflow';
}): React.JSX.Element | null {
  const ready = targets.filter((workspace) => workspace.canvasId !== undefined);
  if (!ready.length) return null;
  if (ready.length === 1) {
    const target = ready[0];
    if (!target) return null;
    return <button type="button" aria-label={`进入 ${surface === 'context' ? 'Context' : 'Workflow'} · ${title}`} title={`进入 ${target.name || String(target.id)}`}
      className="nodrag nopan" onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => { event.stopPropagation(); onEnter(target); }}>↗</button>;
  }
  return <div role="group" aria-label={`${title}的真实工作现场`} data-lcos-workflow-node-entries="multiple"
    style={{ display: 'grid', gap: 4, width: 204 }}>
    {ready.map((workspace) => <button type="button" key={String(workspace.id)} className="nodrag nopan"
      aria-label={`进入 ${workspace.name || String(workspace.id)}`}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => { event.stopPropagation(); onEnter(workspace); }}>
      ↗ {workspace.name || String(workspace.id)}
    </button>)}
  </div>;
}
