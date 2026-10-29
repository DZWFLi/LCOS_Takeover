import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';

type PlacementSource = { kind: 'collection'; collectionId: string }
  | { kind: 'material'; artifactId: string; revisionId: string; fileRecordId: string; artifactViewId?: string };
type AddressInput = { projectId: string; canvasId: string; workspaceId: string; source: PlacementSource };
type Operation = { readonly readOnly: boolean };
export type NativeLibraryPlacementAttempt = { readonly address: string; readonly operation: Operation;
  readonly status: 'pending' | 'unconfirmed' };
export interface NativeLibraryPlacementStore {
  getState(): { lcosPlacementAttempts?: readonly NativeLibraryPlacementAttempt[]; [key: string]: unknown };
  setState(update: (state: ReturnType<NativeLibraryPlacementStore['getState']>) => Partial<ReturnType<NativeLibraryPlacementStore['getState']>>): void;
  subscribe(listener: () => void): () => void;
}

// Transient operation state belongs to the original Library's existing store.
// It is neither spatial truth nor a second store, persistent ledger or queue.
const LibraryPlacementContext = createContext<NativeLibraryPlacementStore | null>(null);
export function NativeLibraryPlacementProvider({ store, children }: { store: NativeLibraryPlacementStore; children: ReactNode }) {
  return <LibraryPlacementContext.Provider value={store}>{children}</LibraryPlacementContext.Provider>;
}
export function useNativeLibraryPlacementStore() { return useContext(LibraryPlacementContext); }
export function nativeLibraryPlacementAddress(input: AddressInput): string {
  const source = input.source;
  return JSON.stringify([input.projectId, input.canvasId, input.workspaceId, source.kind,
    ...(source.kind === 'collection' ? [source.collectionId]
      : [source.artifactId, source.revisionId, source.fileRecordId, source.artifactViewId ?? null])]);
}
export function readNativeLibraryPlacementAttempt(store: NativeLibraryPlacementStore | null, address: string | null) {
  return address ? store?.getState().lcosPlacementAttempts?.find(value => value.address === address) ?? null : null;
}
const noopSubscribe = () => () => {};
export function useNativeLibraryPlacementAttempt(store: NativeLibraryPlacementStore | null, address: string | null) {
  return useSyncExternalStore(store?.subscribe ?? noopSubscribe,
    () => readNativeLibraryPlacementAttempt(store, address), () => null);
}
export function beginNativeLibraryPlacementAttempt(store: NativeLibraryPlacementStore | null, address: string | null, readOnly: boolean): Operation | null {
  if (!store || !address) return null;
  let operation: Operation | null = null;
  store.setState(state => {
    const entries = state.lcosPlacementAttempts ?? [], previous = entries.find(value => value.address === address);
    if (previous?.status === 'pending') return state;
    operation = { readOnly: readOnly || previous?.status === 'unconfirmed' };
    return { lcosPlacementAttempts: [...entries.filter(value => value.address !== address), { address, operation, status: 'pending' }] };
  });
  return operation;
}
export function settleNativeLibraryPlacementAttempt(store: NativeLibraryPlacementStore | null, address: string | null,
  operation: Operation, status: 'placed' | 'already-present' | 'unconfirmed' | 'rejected') {
  if (!store || !address) return;
  store.setState(state => {
    const entries = state.lcosPlacementAttempts ?? [], current = entries.find(value => value.address === address);
    if (current?.operation !== operation) return state;
    const rest = entries.filter(value => value.address !== address);
    return { lcosPlacementAttempts: status === 'unconfirmed' || status === 'rejected' && operation.readOnly
      ? [...rest, { ...current, status: 'unconfirmed' }] : rest };
  });
}
