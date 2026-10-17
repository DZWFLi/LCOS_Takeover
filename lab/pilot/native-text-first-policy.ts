import {
  resolveStablePresentationDensity,
  type InteractionPhase,
  type PresentationDensity,
} from '../../lcos/apps/web-gen2/src/presentation/nodePresentation.ts';
import { SEMANTIC_ZOOM_CONFIG } from '../../lcos/huabu/apps/web/src/config/semanticZoom.ts';
import { finishPresentationDensity } from '../../lcos/huabu/apps/web/src/lcos/nodes/densityBudget.ts';
import { nativeTextWorldSize } from './native-text-policy.ts';
import type { NativeTextSavePending } from './native-text-save.ts';
import type { CanvasTextSnapshot } from '../../lcos/apps/web-gen2/src/backend/artifacts.ts';
import type { LcosNodeRefV1 } from './node-lifecycle.ts';

/** TapNow's original shared shell/resizer has a 250px minimum on both axes.
 * Keep leaf layout suggestions inside that native geometry, not overflowing it. */
export function nativeTextCarrierSize(size: { width: number; height: number }): { width: number; height: number } {
  return { width: Number.isFinite(size.width) ? Math.max(250, size.width) : 250,
    height: Number.isFinite(size.height) ? Math.max(250, size.height) : 250 };
}

/** Draft provenance must match the current occurrence as well as the material.
 * Sharing an Artifact+Revision between two canvases does not transfer a draft. */
export function canSaveNativeTextDraft(base: CanvasTextSnapshot, context: {
  projectId: string; canvasId: string; nodeId: string; reference: LcosNodeRefV1;
}): boolean {
  const ref = context.reference;
  return nativeTextSnapshotMatchesContext(base, context) && base.revisionId === ref.revisionId;
}

/** A save receipt may advance the revision; occurrence and material identity must still match. */
export function nativeTextSnapshotMatchesContext(snapshot: CanvasTextSnapshot, context: {
  projectId: string; canvasId: string; nodeId: string; reference: LcosNodeRefV1;
}): boolean {
  const ref = context.reference;
  return ref.entityType === 'artifact' && ref.entityId === ref.artifactId
    && typeof ref.artifactId === 'string' && ref.artifactId.trim().length > 0
    && typeof ref.artifactViewId === 'string' && ref.artifactViewId.trim().length > 0
    && snapshot.projectId === context.projectId && snapshot.canvasId === context.canvasId
    && snapshot.spatialId === context.nodeId && snapshot.artifactId === ref.artifactId
    && snapshot.viewId === ref.artifactViewId && typeof snapshot.revisionId === 'string'
    && snapshot.revisionId.trim().length > 0;
}

/** Save-port operations are recoverable only from the same native occurrence and Artifact. */
export function nativeTextPendingMatchesContext(operation: Pick<NativeTextSavePending,
  'canvasId' | 'nodeId' | 'artifactId'>, context: {
    canvasId: string; nodeId: string; reference: LcosNodeRefV1;
  }): boolean {
  const ref = context.reference;
  return ref.entityType === 'artifact' && ref.entityId === ref.artifactId
    && operation.canvasId === context.canvasId && operation.nodeId === context.nodeId
    && operation.artifactId === ref.artifactId;
}

export interface NativeTextDensityInput {
  /** Existing node dimensions take precedence over the node's measured/style fallbacks. */
  readonly worldWidth?: number;
  readonly worldHeight?: number;
  readonly node?: Readonly<Record<string, unknown>>;
  readonly zoom: number;
  readonly dpr: number;
  readonly phase: InteractionPhase;
  readonly previous?: PresentationDensity;
  readonly nodeCount: number;
}

/**
 * Resolve the native text node's display density from the existing screen-space
 * presentation owner, then apply the existing visible-node budget. This is a
 * render-only projection; it does not read or write Store/Core state.
 */
export function resolveNativeTextDensity(input: NativeTextDensityInput): PresentationDensity {
  const size = nativeTextWorldSize(input.node, input.worldWidth, input.worldHeight);
  // Keep every finite non-negative zoom, including small legitimate canvas zooms.
  const zoom = Number.isFinite(input.zoom) && input.zoom >= 0 ? input.zoom : 1;
  const dpr = Number.isFinite(input.dpr) && input.dpr > 0 ? input.dpr : 1;
  const resolved = resolveStablePresentationDensity({
    worldWidth: size.width,
    worldHeight: size.height,
    zoom,
    dpr,
    screenWidth: size.width * zoom,
    screenHeight: size.height * zoom,
    phase: input.phase,
  }, input.previous, SEMANTIC_ZOOM_CONFIG.hysteresis);

  return finishPresentationDensity(resolved, input.nodeCount, input.phase);
}

const SUMMARY_EXCERPT_CODE_POINTS = 160;

/** Display-only projection: full working/reading text remains byte-for-byte intact. */
export function deriveNativeTextReadingMarkdown(
  markdown: string,
  title: string,
  density: PresentationDensity,
): string {
  if (density === 'reading' || density === 'working') return markdown;
  if (density === 'mark') return title;

  const source = markdown.trim();
  const codePoints = Array.from(source);
  if (codePoints.length <= SUMMARY_EXCERPT_CODE_POINTS) return source;
  return `${codePoints.slice(0, SUMMARY_EXCERPT_CODE_POINTS).join('')}…`;
}
