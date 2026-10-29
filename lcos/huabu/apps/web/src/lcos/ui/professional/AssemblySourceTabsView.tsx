import { LcosButton } from '../primitives/LcosButton';
import './professional-assembly.css';

import type { ReactNode } from 'react';
export interface AssemblySourceTabPresentation<Key extends string> {
  readonly key: Key;
  readonly label: string;
  readonly disabled?: boolean;
}

export interface AssemblySourceTabsViewProps<Key extends string> {
  readonly items: readonly AssemblySourceTabPresentation<Key>[];
  readonly value: Key;
  readonly onSelect: (key: Key) => void;
  readonly context?: ReactNode;
}

/** Reuses GEN1 Source Bay's four-channel navigation pattern, not its old fetching/state. */
export function AssemblySourceTabsView<Key extends string>({
  items,
  value,
  onSelect,
  context,
}: AssemblySourceTabsViewProps<Key>): React.JSX.Element {
  return (
    <div data-lcos-assembly-source-tabs className="lcos-assembly-source-tabs" aria-label="装配来源">
      <div className="lcos-assembly-source-buttons" role="group" aria-label="材料来源">
        {items.map((item) => (
          <LcosButton
            appearance="oreo"
            variant="ghost"
            key={item.key}
            type="button"
            data-lcos-assembly-source-tab={item.key}
            aria-pressed={value === item.key}
            disabled={item.disabled}
            onClick={() => onSelect(item.key)}
          >
            {item.label}
          </LcosButton>
        ))}
      </div>
      {context === undefined ? null : <div className="lcos-assembly-target-context">{context}</div>}
    </div>
  );
}
