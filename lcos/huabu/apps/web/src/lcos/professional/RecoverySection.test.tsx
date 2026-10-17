import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

import { RecoverySection } from './RecoverySection';

import type { ContinuationRecoveryProjectionV1 } from '@local-creative-os/contracts';
import type { CoreCollaborationClient } from '@local-creative-os/web-gen2';

it('uses the real recover_external action on the existing operation and prevents concurrent recovery', async () => {
  const operation: ContinuationRecoveryProjectionV1 = {
    schemaVersion:1, operationId:'op-existing',projectId:'p',connectedConversationId:'c',
    mode:'continue_existing',contextInheritance:'inherit',checkout:'shared',provider:'test',
    status:'outcome_unknown',steps:{external_create:'outcome_unknown',core_bind:'not_started',attach:'not_started',projection:'not_started'},
    cancel:'none',revision:4,allowedActions:[{action:'recover_external',requiresFreshRead:true},{action:'reconcile',requiresFreshRead:true}],
    createdAt:'2026-09-26T00:00:00Z',updatedAt:'2026-09-26T00:00:00Z',
  };
  const fresh = { ...operation, revision: 5 };
  const receipt = { ok: true as const, receipt: { schemaVersion: 1 as const, command: 'recover' as const,
    continuationOperationId: operation.operationId, acceptedAt: '2026-10-08T00:00:00Z' } };
  let finish!: (result: typeof receipt)=>void;
  const recover=vi.fn(()=>new Promise<typeof receipt>((resolve)=>{finish=resolve;}));
  const readDiagnostics=vi.fn(async () => ({ schemaVersion: 1, conversationId: 'c', connected: true, operations: [fresh] })); const onRefreshed=vi.fn();
  const client={recover,readDiagnostics} as unknown as CoreCollaborationClient;
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
  try {
    await act(async()=>root.render(<RecoverySection collaboration={client} projectId="p" operations={[operation]} onRefreshed={onRefreshed}/>));
    const button=host.querySelector<HTMLButtonElement>('[data-lcos-recovery-action="recover_external"]');
    expect(button?.textContent).toBe('恢复会话');
    await act(async()=>button?.click());
    expect(readDiagnostics).toHaveBeenCalledExactlyOnceWith('p', 'c', expect.any(AbortSignal));
    expect(recover).toHaveBeenCalledWith('p',{continuationOperationId:'op-existing',action:'recover_external',expectedRevision:5}, expect.any(AbortSignal));
    expect(host.querySelector<HTMLButtonElement>('[data-lcos-recovery-action="reconcile"]')?.disabled).toBe(true);
    await act(async()=>button?.click());expect(recover).toHaveBeenCalledTimes(1);
    await act(async()=>finish(receipt));expect(onRefreshed).toHaveBeenCalledWith(fresh);
    expect(readDiagnostics).toHaveBeenCalledTimes(1);
  } finally {act(()=>root.unmount());host.remove();}
});
