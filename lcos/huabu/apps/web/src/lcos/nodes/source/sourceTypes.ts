import type { LcosVisualFamily, PresentationDensity } from '@local-creative-os/web-gen2';

export interface SourceMorphologyProps {
  readonly nodeId?: string;
  readonly projectId?: string;
  readonly fileRecordId?: string;
  readonly mimeType?: string;
  readonly artifactKind?: string;
  readonly family: LcosVisualFamily;
  readonly title: string;
  readonly secondary?: string;
  readonly preview?: string;
  readonly mediaSrc?: string;
  /** A reused old carrier may expose the registered URL without a native web preview port. */
  readonly webPreviewAvailable?: boolean;
  readonly durationSec?: number;
  readonly density: PresentationDensity;
  /** Host projection scale; readability only, never resolves a separate density. */
  readonly zoom?: number;
  readonly worldWidth?: number;
  readonly worldHeight?: number;
}
