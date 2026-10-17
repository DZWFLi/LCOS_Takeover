// TapNow vendor-pkg-canvas-CI-o9b4X.js :: iX, h7/w7 buttons + 16px glyph groups.
// Commands/state are injected from the existing Milkdown instance, not Tiptap.
import { Bold, Heading1, Heading2, Heading3, Italic, List, ListOrdered, Minus, Type } from 'lucide-react';
import { Button } from '@/components/Common/Button';
import type { MilkdownBlockType, MilkdownFormattingState, MilkdownInlineMark } from '@/components/Milkdown/types';
import './tapnow-text-toolbar.css';

export function TapnowTextToolbarView({ formatting, disabled, onBlock, onMark }: {
  readonly formatting: MilkdownFormattingState;
  readonly disabled?: boolean;
  readonly onBlock: (type: MilkdownBlockType) => void;
  readonly onMark: (mark: MilkdownInlineMark) => void;
}): React.JSX.Element {
  return <div role="group" aria-label="文字快捷排版" className="lcos-tapnow-text-toolbar">
    <div>{([['heading-1', Heading1, '标题 1'], ['heading-2', Heading2, '标题 2'], ['heading-3', Heading3, '标题 3'], ['paragraph', Type, '正文']] as const)
      .map(([type, Icon, label]) => <Button key={type} variant="ghost" iconOnly disabled={disabled} title={label} aria-label={label}
        aria-pressed={formatting.blockType === type} onClick={() => onBlock(type)}><Icon size={16} /></Button>)}</div>
    <span role="separator" />
    <div>{([['bold', Bold, '加粗'], ['italic', Italic, '斜体']] as const).map(([mark, Icon, label]) =>
      <Button key={mark} variant="ghost" iconOnly disabled={disabled} title={label} aria-label={label}
        aria-pressed={formatting.activeMarks.has(mark)} onClick={() => onMark(mark)}><Icon size={16} /></Button>)}</div>
    <span role="separator" />
    <div>{([['bullet-list', List, '项目列表'], ['ordered-list', ListOrdered, '编号列表']] as const).map(([type, Icon, label]) =>
      <Button key={type} variant="ghost" iconOnly disabled={disabled} title={label} aria-label={label}
        aria-pressed={formatting.blockType === type} onClick={() => onBlock(type)}><Icon size={16} /></Button>)}</div>
    <span role="separator" />
    <Button variant="ghost" iconOnly disabled={disabled} title="分隔线" aria-label="分隔线" onClick={() => onBlock('divider')}><Minus size={16} /></Button>
  </div>;
}
