import type { MaterialSourceV1 } from '../ui/professional/donor/Gen1TextTransfer';
import type { ProjectGraphSnapshot } from '@local-creative-os/contracts';

export interface ReaderLineageEntry {
  readonly relationId: string; readonly artifactId: string; readonly title: string;
  readonly revisionId?: string; readonly locator?: MaterialSourceV1['locator']; readonly unavailableReason?: string;
}
export function readerSourceLocator(anchor?: string): MaterialSourceV1['locator'] | undefined {
  if (!anchor) return;
  const page = /^pdf:p([1-9]\d*)$/.exec(anchor), slide = /^pptx:s([1-9]\d*)$/.exec(anchor);
  const value = page?.[1] ?? slide?.[1];
  if (value && Number.isSafeInteger(Number(value))) return page ? { kind: 'page', pageNumber: Number(value), label: `第 ${value} 页` }
    : { kind: 'slide', slideNumber: Number(value), label: `第 ${value} 页` };
  const lines = /^text:l([1-9]\d*)-l([1-9]\d*)$/.exec(anchor);
  if (lines && Number.isSafeInteger(Number(lines[1])) && Number.isSafeInteger(Number(lines[2])) && Number(lines[2]) >= Number(lines[1]))
    return { kind: 'lines', start: Number(lines[1]) - 1, end: Number(lines[2]) - 1, label: `第 ${lines[1]}–${lines[2]} 行` };
  return anchor.startsWith('section:') && anchor.slice(8).trim() ? { kind: 'selection', label: anchor.slice(8) } : undefined;
}

/** Only canonical reference provenance of this Artifact; no path/Current heuristics. */
export function readerLineageEntries(projectId: string, artifactId: string, graph: ProjectGraphSnapshot): readonly ReaderLineageEntry[] {
  if (String(graph.project.id) !== projectId) throw new Error('来源项目尚未核对，现有阅读保留。');
  return graph.relations.filter(relation => String(relation.projectId) === projectId && relation.kind === 'reference'
    && relation.sourceEntityType === 'artifact' && relation.sourceEntityId === artifactId && relation.targetEntityType === 'artifact')
    .flatMap(relation => (relation.evidenceRefs ?? []).filter(evidence => evidence.kind === 'artifact' && evidence.id === relation.targetEntityId).map(evidence => {
      const original = graph.artifacts.find(artifact => String(artifact.id) === evidence.id && String(artifact.projectId) === projectId);
      const revision = graph.artifactRevisions.find(item => String(item.id) === evidence.revisionId && String(item.artifactId) === evidence.id);
      const file = revision ? graph.fileRecords.find(item => item.id === revision.fileRecordId) : undefined;
      const locator = readerSourceLocator(evidence.sourceAnchor);
      const unavailableReason = !original ? '来源材料或其项目已缺失，现有阅读保留。' : !evidence.revisionId ? '来源没有记录具体版本，未改用当前版本。'
        : !revision || !file ? '所记录的来源版本已缺失，未改用当前版本。'
          : evidence.sourceAnchor && !locator ? '所记录的来源位置不可识别，未跳到其它位置。' : undefined;
      return { relationId: String(relation.id), artifactId: evidence.id, title: original?.title ?? evidence.label ?? '来源材料',
        ...(evidence.revisionId ? { revisionId: evidence.revisionId } : {}), ...(locator ? { locator } : {}), ...(unavailableReason ? { unavailableReason } : {}) };
    }));
}
