// ADOPTED: user-provided tapnow_拆包_20260904.zip, canvas bundle yCe/DC.
// Same 284px sidebar, scrollable metadata group and independent footer slots.
// Adapter: host JSX/close button, controlled real fields, scoped LCOS palette.
import { PanelRightClose } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { TapnowSuccessStatus, TapnowFieldLabel } from './donor/TapnowPresentationParts';

import type { ReactNode } from 'react';

export interface ReaderMediaInfoField {
  readonly key: string;
  readonly label: string;
  readonly value: ReactNode;
  readonly hint?: string;
}

export function ReaderMediaInfoView({ fields, onClose, actions, description }: {
  readonly fields: readonly ReaderMediaInfoField[];
  readonly onClose: () => void;
  readonly actions?: ReactNode;
  readonly description?: { readonly label: string; readonly value: string };
}): React.JSX.Element {
  return <aside className="lcos-reader-media-info" aria-label="材料信息" data-lcos-reader-media-info>
    <button type="button" className="lcos-reader-info-close" aria-label="收起材料信息" onClick={onClose}>
      <PanelRightClose size={18} strokeWidth={1.33} aria-hidden />
    </button>
    <div className="lcos-reader-info-scroll">
      {description?.value && <ReaderMediaTextView key={description.value} {...description} />}
      <section className="lcos-reader-info-section">
        <TapnowFieldLabel label="材料信息" className="lcos-tapnow-info-field">
        <div className="lcos-reader-info-card">
          {fields.map(field => <div key={field.key} className="lcos-reader-info-field" title={field.hint}>
            <span className="lcos-reader-info-label">{field.label}：</span>
            <span className="lcos-reader-info-value">{field.value}</span>
          </div>)}
        </div>
        </TapnowFieldLabel>
      </section>
    </div>
    {actions && <div className="lcos-reader-info-actions">{actions}</div>}
  </aside>;
}

/** TapNow z$: heading/copy control, bounded scrollable text and honest copy state.
 * The owner supplies this version's real text; no prompt or generation state is invented. */
function ReaderMediaTextView({ label, value }: { readonly label: string; readonly value: string }): React.JSX.Element {
  const [status, setStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      clearTimeout(timer.current); setStatus('copied');
      timer.current = setTimeout(() => setStatus('idle'), 1500);
    } catch { setStatus('error'); }
  };
  return <section className="lcos-reader-info-text-section">
    <div className="lcos-reader-info-text-heading"><span>{label}</span>
      <button type="button" aria-label={`复制${label}`} onClick={() => void copy()}>复制</button></div>
    <div className="lcos-reader-info-text" tabIndex={0}>{value}</div>
    {status !== 'idle' && <span role="status" className="lcos-reader-info-copy-status">{status === 'copied' ? <TapnowSuccessStatus label="已复制" /> : '复制未成功，请重试'}</span>}
  </section>;
}
