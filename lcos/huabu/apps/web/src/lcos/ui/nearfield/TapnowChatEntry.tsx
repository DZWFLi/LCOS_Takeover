import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { clsx } from 'clsx';
import { Button } from '@/components/Common/Button';
import { SpectralMaterial } from '../materials/SpectralMaterial';
import { createTapnowCollapsedChat } from './donor/tapnow-collapsed-chat.mjs';
import slow from './donor/motion-slow.webp';
import medium from './donor/motion-medium.webp';
import normal from './donor/motion-default.webp';
import './tapnow-chat-entry.css';
const EntryContext = React.createContext({ expanded: false });
function NativeButton({
  children,
  className,
  onClick,
  tooltip,
  disabled,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  tooltip?: string;
  disabled?: boolean;
}) {
  const { expanded } = React.useContext(EntryContext);
  return (
    <Button
      variant="ghost"
      size="lg"
      iconOnly
      data-lcos-native-chat-entry
      aria-label="画布助手"
      aria-expanded={expanded}
      title={tooltip}
      disabled={disabled}
      className={`lcos-tapnow-chat-hit ${className ?? ''}`}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
const OriginalEntry = createTapnowCollapsedChat({
  React,
  jsxRuntime,
  classNames: clsx,
  Button: NativeButton,
  assets: { slow, medium, default: normal },
});
export function TapnowChatEntry({
  expanded,
  onClick,
  disabled,
}: {
  readonly expanded: boolean;
  readonly onClick: () => void;
  readonly disabled?: boolean;
}) {
  return (
    <EntryContext.Provider value={{ expanded }}>
      <SpectralMaterial className="lcos-native-agent-entry">
        <OriginalEntry
          className="lcos-soft-underlight-surface"
          tooltip="画布助手"
          onClick={onClick}
          {...(disabled === undefined ? {} : { disabled })}
        />
      </SpectralMaterial>
    </EntryContext.Provider>
  );
}
