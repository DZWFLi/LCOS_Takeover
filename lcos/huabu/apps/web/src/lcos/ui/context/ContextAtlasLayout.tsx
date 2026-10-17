import './context-spatial.css';
import type { ReactNode } from 'react';

/** Layout only. ContextAtlasView retains presence and the existing close action. */
export function ContextAtlasLayout({header, children}: {
  readonly header: ReactNode;
  readonly children: ReactNode;
}): React.JSX.Element {
  return <div className="lcos-atlas-light-curtain-inner">
    <div className="lcos-atlas-light-curtain-head">{header}</div>
    {children}
  </div>;
}
