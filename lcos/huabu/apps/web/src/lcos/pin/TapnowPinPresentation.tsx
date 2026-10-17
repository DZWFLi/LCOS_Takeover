import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { clsx } from 'clsx';
import {
  Check,
  Download,
  File,
  FileText,
  Frame,
  Music,
  Pencil,
  Pin,
  Trash2,
  Video,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuItem,
} from '@/components/Common/DropdownMenu';
import { Tooltip } from '@/components/Common/Tooltip';
import { Modal } from '@/components/Common/Modal';
import { Button } from '@/components/Common/Button';
import { useLayerReturnFocus } from '../ui/spatial/useLayerReturnFocus';
import {
  createTapnowPinParts,
  type TapnowPinColor,
  type TapnowPinGroup,
} from '../ui/donor/tapnow-pin-parts.mjs';
import '../ui/nearfield/tapnow-pin.css';

interface MemberDisplay {
  id: string;
  label: string;
  kind: string;
  thumbnail?: string;
}
const DataContext = React.createContext<{
  colors: readonly TapnowPinColor[];
  members: readonly MemberDisplay[];
  onLocate: (id: string) => void;
  onRemove?: (id: string) => void;
}>({ colors: [], members: [], onLocate: () => {} });
const DropdownContext = React.createContext<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>({ open: false, onOpenChange: () => {} });
function DropdownRoot({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const slots = React.Children.toArray(children) as React.ReactElement<{
    children: React.ReactNode;
    className?: string;
  }>[];
  // The source supplies Tooltip(trigger) + content. Common DropdownMenu is the
  // sole overlay owner; source markup/items remain its children.
  return (
    <DropdownContext.Provider value={{ open, onOpenChange }}>
      <DropdownMenu
        open={open}
        onOpenChange={onOpenChange}
        dismissOnEscape={false}
        trigger={
          slots[0] as React.ReactElement<{
            onClick?: React.MouseEventHandler;
            'aria-expanded'?: boolean;
          }>
        }
        className="lcos-tapnow-pin-menu"
        offset={{ x: 0, y: 8 }}
      >
        {slots[1]}
      </DropdownMenu>
    </DropdownContext.Provider>
  );
}
function NativeTooltip({
  content,
  children,
  onClick,
}: {
  content?: React.ReactNode;
  children: React.ReactElement;
  onClick?: React.MouseEventHandler;
}) {
  const child = onClick
    ? React.cloneElement(children, {
        onClick,
      } as React.HTMLAttributes<HTMLElement>)
    : children;
  return <Tooltip content={content ?? ''}>{child}</Tooltip>;
}
function DropdownTrigger({ children }: { children: React.ReactElement }) {
  const dropdown = React.useContext(DropdownContext);
  return React.cloneElement(children, {
    'aria-expanded': dropdown.open,
    'aria-haspopup': 'menu',
  } as React.HTMLAttributes<HTMLElement>);
}
function DropdownContent({
  children,
  className,
  style,
  onEscapeKeyDown,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onEscapeKeyDown?: (event: React.KeyboardEvent) => void;
}) {
  const dropdown = React.useContext(DropdownContext);
  const focusReturn = useLayerReturnFocus(true);
  return (
    <div
      ref={focusReturn}
      data-slot="dropdown-menu-content"
      className={className}
      style={style}
      role="menu"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          onEscapeKeyDown?.(event);
          if (!event.defaultPrevented) {
            event.stopPropagation();
            dropdown.onOpenChange(false);
          }
        }
      }}
    >
      {children}
    </div>
  );
}
function MenuItem({
  onSelect,
  children,
  variant,
  ...props
}: {
  onSelect?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
  variant?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const dropdown = React.useContext(DropdownContext);
  const data = React.useContext(DataContext),
    id = (props as Record<string, unknown>)['data-lcos-pin-member-id'] as
      | string
      | undefined;
  const item = (
    <DropdownMenuItem
      {...props}
      data-tapnow-pin-destructive={variant === 'destructive' || undefined}
      onClick={(event) => {
        onSelect?.(event);
        if (!event.defaultPrevented) dropdown.onOpenChange(false);
      }}
    >
      {children}
    </DropdownMenuItem>
  );
  return id && data.onRemove ? (
    <div className="flex items-center gap-1">
      {item}
      <Button
        variant="ghost"
        size="sm"
        iconOnly
        aria-label={`从颜色组移除 ${data.members.find((member) => member.id === id)?.label ?? id}`}
        onClick={() => data.onRemove?.(id)}
      >
        <Trash2 size={14} />
      </Button>
    </div>
  ) : (
    item
  );
}
type Confirmation = {
  title: string;
  description: string;
  confirmButton: { label: string };
  cancelButton: { label: string };
  onConfirm: () => void;
};
let requestConfirmation: ((value: Confirmation) => void) | undefined;
export function TapnowPinConfirmationHost() {
  const [value, setValue] = React.useState<Confirmation>();
  React.useEffect(() => {
    requestConfirmation = setValue;
    return () => {
      requestConfirmation = undefined;
    };
  }, []);
  return value ? (
    <Modal isOpen onClose={() => setValue(undefined)} title={value.title}>
      <p>{value.description}</p>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => setValue(undefined)}>
          {value.cancelButton.label}
        </Button>
        <Button
          tone="danger"
          onClick={() => {
            value.onConfirm();
            setValue(undefined);
          }}
        >
          {value.confirmButton.label}
        </Button>
      </div>
    </Modal>
  ) : null;
}
const labels: Record<string, string> = {
  'canvas.pin.colors.red': '红色',
  'canvas.pin.colors.orange': '橙色',
  'canvas.pin.colors.yellow': '黄色',
  'canvas.pin.colors.green': '绿色',
  'canvas.pin.colors.blue': '蓝色',
  'canvas.pin.colors.purple': '紫色',
  'canvas.pin.colors.custom': '已有颜色',
  'canvas.pin.groupMenu.rename': '更名 {name}',
  'canvas.pin.groupMenu.renameInput': '颜色组名称',
  'canvas.pin.groupMenu.saveName': '保存名称',
  'canvas.pin.groupMenu.empty': '暂无成员',
  'canvas.pin.groupMenu.downloadAllNodes': '下载组内内容',
  'canvas.pin.groupMenu.removeAllNodes': '移出本颜色组',
  'canvas.pin.groupMenu.untitled': '未命名',
  'canvas.pin.bar.openGroup': '{name} · {count} 项',
  'canvas.pin.bar.groupCount': '{count} 项',
  'canvas.pin.confirm.removeAllNodes.title': '移出颜色组',
  'canvas.pin.confirm.removeAllNodes.message':
    '将 {count} 项移出「{name}」？原内容保留。',
  'canvas.pin.confirm.removeAllNodes.action': '移出颜色组',
  'canvas.pin.confirm.cancel': '取消',
};
const translate = (key: string, values: Record<string, unknown> = {}) =>
  (labels[key] ?? key).replace(/\{(\w+)\}/g, (_all, k: string) =>
    String(values[k] ?? ''),
  );
const Parts = createTapnowPinParts({
  React,
  jsxRuntime,
  classNames: clsx,
  Check,
  Pin,
  usePalette: () => {
    const data = React.useContext(DataContext);
    return [
      ...Parts.palette,
      ...data.colors.filter(
        (color) => !Parts.palette.some((source) => source.id === color.id),
      ),
    ];
  },
  translation: () => ({ t: translate }),
  useMembers: () => {
    const data = React.useContext(DataContext);
    return {
      nodeDisplays: data.members,
      locateNode: (id: string) => {
        data.onLocate(id);
        return true;
      },
    };
  },
  // Floating UI Tooltip owns actual hover/focus. These source interoperability
  // callbacks don't create a second tooltip state machine.
  useTooltip: () => ({
    tooltipOpen: undefined,
    triggerContainerRef: React.useRef(null),
    closeTooltip: () => {},
    handleTooltipOpenChange: () => {},
    markPointerInteraction: () => {},
    markKeyboardInteraction: () => {},
    handleCloseAutoFocus: () => {},
  }),
  DropdownRoot,
  Tooltip: NativeTooltip,
  DropdownTrigger,
  DropdownContent,
  MenuItem,
  MenuIcon: ({ children }: { children: React.ReactNode }) => (
    <span
      data-slot="dropdown-menu-icon"
      className="inline-flex size-5 shrink-0 items-center justify-center"
    >
      {children}
    </span>
  ),
  MenuSeparator: () => (
    <div role="separator" className="lcos-tapnow-pin-divider" />
  ),
  MenuGroup: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>,
  Confirm: { confirm: (value: Confirmation) => requestConfirmation?.(value) },
  CheckSave: Check,
  Edit: Pencil,
  Download,
  Trash: Trash2,
  Frame,
  Video,
  Audio: Music,
  Text: FileText,
  File,
});
export const TAPNOW_PIN_PALETTE = Parts.palette;
export const TapnowColorDot = Parts.ColorDot;
export function TapnowMultiPin({ colors }: { colors: readonly string[] }) {
  const palette = colors.map((hex) => ({
    id: hex.replace('#', '').toUpperCase(),
    hex,
    nameKey: 'canvas.pin.colors.custom',
  }));
  return (
    <DataContext.Provider
      value={{ colors: palette, members: [], onLocate: () => {} }}
    >
      <Parts.MultiPin pins={palette.map((color) => color.id)} />
    </DataContext.Provider>
  );
}
export function TapnowColorGroup({
  id,
  color,
  label,
  members,
  open,
  onOpenChange,
  onLocate,
  onRemove,
  onRemoveAll,
}: {
  id: string;
  color: string;
  label?: string;
  members: MemberDisplay[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLocate: (id: string) => void;
  onRemove: (id: string) => void;
  onRemoveAll: () => void;
}) {
  const group: TapnowPinGroup = {
    groupId: id,
    group: {
      id: color.replace('#', ''),
      hex: color,
      nameKey: 'canvas.pin.colors.custom',
    },
    nodeIds: members.map((item) => item.id),
    count: members.length,
  };
  return (
    <DataContext.Provider
      value={{ colors: [group.group], members, onLocate, onRemove }}
    >
      <span className="lcos-tapnow-pin-group">
        <Parts.GroupChip
          group={group}
          open={open}
          onOpenChange={onOpenChange}
          canDownload={false}
          onDownload={() => {}}
          onRemoveAllNodes={onRemoveAll}
          customName={label ?? color}
          onRename={() => {}}
          renameDisabled
        />
      </span>
    </DataContext.Provider>
  );
}
