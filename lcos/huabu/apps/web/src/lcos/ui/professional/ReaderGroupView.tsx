import { ReaderContentTabsView } from './ReaderContentTabsView';

import type { ReaderContentTabsViewProps } from './ReaderContentTabsView';
import type { ReactNode } from 'react';

import './professional-reading.css';

export interface ReaderGroupPresentation {
  readonly id: string;
  readonly label: string;
  readonly content: ReactNode;
  /** Existing window/group owner supplies the real tabs and actions, if any. */
  readonly tabs?: ReactNode;
  /** Explicit descriptor seam; legacy opaque tabs keep priority and are never parsed. */
  readonly contentTabs?: ReaderContentTabsViewProps;
  readonly footer?: ReactNode;
}

export interface ReaderGroupViewProps {
  readonly groups: readonly ReaderGroupPresentation[];
  readonly presentation: 'split' | 'single';
  readonly activeGroupId: string;
  /** In single-group mode the owner provides its existing group selector. */
  readonly groupSelector?: ReactNode;
}

/**
 * Figma 5388:27475 group body only. No window, tab state, resize or navigation owner.
 * Based on GEN1 WorkbenchFrame's named content/side slots, not its legacy Run model.
 */
export function ReaderGroupView({
  groups,
  presentation,
  activeGroupId,
  groupSelector,
}: ReaderGroupViewProps): React.JSX.Element {
  return (
    <div className="lcos-reader-groups" data-reader-group-layout={presentation}>
      {presentation === 'single' && groupSelector !== undefined ? (
        <div className="lcos-reader-group-selector">{groupSelector}</div>
      ) : null}
      <div className="lcos-reader-group-columns">
        {groups.map((group, index) => (
          <section
            key={group.id}
            data-reader-group-index={index}
            data-reader-group-id={group.id}
            aria-label={group.label}
            hidden={presentation === 'single' && group.id !== activeGroupId}
            className="lcos-reader-group"
          >
            {group.tabs !== undefined ? (
              <div className="lcos-reader-group-tabs">{group.tabs}</div>
            ) : group.contentTabs !== undefined ? (
              <div className="lcos-reader-group-tabs">
                <ReaderContentTabsView {...group.contentTabs} />
              </div>
            ) : null}
            <div className="lcos-reader-group-content">{group.content}</div>
            {group.footer === undefined ? null : <footer className="lcos-reader-group-footer">{group.footer}</footer>}
          </section>
        ))}
      </div>
    </div>
  );
}
