import { LcosButton } from '../primitives/LcosButton';
import './professional-assembly.css';

import type { ReactNode } from 'react';
export interface AssemblyReceiptPresentation {
  readonly tone: string;
  readonly headline: string;
  readonly lines: readonly { readonly key: string; readonly tone: string; readonly label: string; readonly detail?: string; readonly changeSetId?: string }[];
}
/** Read the existing per-item result; a skipped or unsupported source never turns green. */
export function AssemblyReceiptView({ summary, onClose, notice }: {
  readonly summary: AssemblyReceiptPresentation;
  readonly onClose: () => void;
  readonly notice?: ReactNode;
}): React.JSX.Element {
  return <section className="lcos-assembly-receipt" data-lcos-assembly-receipt data-lcos-assembly-outcome={summary.tone}>
    <header><strong role="status" aria-live="polite">{summary.headline}</strong>
      <LcosButton appearance="oreo" variant="ghost" onClick={onClose} aria-label="收起装配回执">收起</LcosButton></header>
    {notice}
    <details><summary>查看 {summary.lines.length} 项结果</summary><ul>{summary.lines.map((line) => <li key={line.key}
      data-lcos-assembly-outcome-line={line.tone}><span>{line.label}{line.detail ? ` · ${line.detail}` : ''}</span>
      {line.changeSetId ? <small title={line.changeSetId}>已记录变更 {line.changeSetId.slice(0, 8)}</small> : null}</li>)}</ul></details>
  </section>;
}
