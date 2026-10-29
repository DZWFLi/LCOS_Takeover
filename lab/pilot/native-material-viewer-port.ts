import type { NativeTextSourceLocator } from './native-text-location';

/** A transient address for the shipped media viewer, never a material or window store. */
export interface NativeMaterialViewRequest {
  readonly projectId: string;
  readonly artifactId: string;
  readonly revisionId?: string;
  readonly artifactViewId?: string;
  readonly nodeId?: string;
  readonly sourceCanvasId?: string;
  readonly title?: string;
  readonly composerOriginKey?: string;
  readonly returnId?: string;
  readonly sourceLocator?: NativeTextSourceLocator;
  readonly legacyReturnWindowId?: string;
  readonly editMode?: 'mindmap';
}

export const nativeMaterialViewEvent = 'lcos-native-open-material';
let mountedOwners = 0;
export function nativeMaterialViewerAvailable(): boolean { return mountedOwners > 0; }
export function registerNativeMaterialViewerOwner(): () => void {
  mountedOwners += 1; let active = true;
  return () => { if (active) { active = false; mountedOwners -= 1; } };
}
export function requestNativeMaterialView(target: NativeMaterialViewRequest): void {
  if (!target || typeof target.projectId !== 'string' || !target.projectId.trim()
    || typeof target.artifactId !== 'string' || !target.artifactId.trim()
    || ['revisionId', 'artifactViewId', 'nodeId', 'sourceCanvasId', 'composerOriginKey', 'returnId', 'legacyReturnWindowId'].some(key => {
      const value = target[key as keyof NativeMaterialViewRequest];
      return value !== undefined && (typeof value !== 'string' || !value.trim());
    }) || target.editMode !== undefined && target.editMode !== 'mindmap') throw new Error('这份材料的阅读地址暂未确认。');
  window.dispatchEvent(new CustomEvent(nativeMaterialViewEvent, { detail: { ...target } }));
}
