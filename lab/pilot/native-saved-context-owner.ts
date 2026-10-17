export interface NativeSavedContextOwnerIdentity {
  readonly projectId: string;
  readonly canvasId: string | null;
  readonly rfInstance: object | null;
}

/**
 * Keep an async Saved Context action bound to the exact original Canvas owner.
 * The generation comes from the action's existing React effect lifecycle, so a
 * committed A → B → A scene switch still invalidates work started in A.
 */
export function isNativeSavedContextOwnerCurrent(
  captured: NativeSavedContextOwnerIdentity,
  current: NativeSavedContextOwnerIdentity,
  nativeHostApi: object | null | undefined,
  capturedGeneration: number,
  currentGeneration: number,
): boolean {
  return capturedGeneration === currentGeneration
    && captured.projectId.trim().length > 0
    && captured.projectId === current.projectId
    && typeof captured.canvasId === 'string'
    && captured.canvasId.trim().length > 0
    && captured.canvasId === current.canvasId
    && captured.rfInstance !== null
    && captured.rfInstance === current.rfInstance
    && captured.rfInstance === nativeHostApi;
}
