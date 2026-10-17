import { Children, Fragment, cloneElement, createContext, isValidElement, useCallback, useContext, useLayoutEffect, useRef } from 'react';
import { ArrowUp, AtSign, Paperclip, X } from 'lucide-react';
import type { ButtonHTMLAttributes, ComponentType, HTMLAttributes, JSX, ReactNode, Ref } from 'react';
import { LcosIconButton } from '../../lcos/huabu/apps/web/src/lcos/ui/primitives/LcosIconButton';
import type { ComposerVisualAction, LcosComposerViewProps } from '../../lcos/huabu/apps/web/src/lcos/ui/nearfield/composerViewTypes';
import './native-composer-view.css';

type Slot = { children?: ReactNode };
type NativeButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;
export interface NativeComposerParts {
  Frame: ComponentType<{ references?: ReactNode; editor?: ReactNode; actions?: ReactNode;
    feedback?: ReactNode; options?: ReactNode; heading?: ReactNode; disabled?: boolean; className?: string;
    surfaceProps?: HTMLAttributes<HTMLDivElement> & { ref?: Ref<HTMLDivElement> | undefined;
      'data-lcos-composer-reference-surface'?: boolean | undefined; 'data-drop-active'?: boolean | undefined } }>;
  EditorFrame: ComponentType<Slot>;
  ToolbarFrame: ComponentType<{ start?: ReactNode; end?: ReactNode }>;
  ReferenceFrame: ComponentType<Slot>;
  Button: ComponentType<NativeButtonProps>;
}
const NativeComposerContext = createContext<NativeComposerParts | null>(null);

/** Other inline Chatbox leaves reuse the same original native controls. */
export function useNativeComposerParts(): NativeComposerParts | null { return useContext(NativeComposerContext); }

/** Same provider and source-overridden View share one bundled module identity. */
export function NativeComposerProvider({ parts, children }: { parts: NativeComposerParts; children?: ReactNode }): JSX.Element {
  return <NativeComposerContext.Provider value={parts}>{children}</NativeComposerContext.Provider>;
}

/** Only replace known presentational buttons. Preserve every caller handler,
 * native file/picker child, pointer-down caret capture, and nested fragment. */
function nativeControls(children: ReactNode, Button: NativeComposerParts['Button']): ReactNode {
  return Children.map(children, child => {
    if (!isValidElement<Record<string, unknown>>(child)) return child;
    if (child.type === Fragment) return cloneElement(child, {}, nativeControls(child.props.children as ReactNode, Button));
    if (child.type !== LcosIconButton) return child;
    const { appearance: _appearance, variant: _variant, className: _className,
      shape: _shape, size: _size, floating: _floating, children: content, ...props } = child.props;
    return <Button {...props as NativeButtonProps} className="native-composer-tool">{content as ReactNode}</Button>;
  });
}

function actionProps(action: ComposerVisualAction): NativeButtonProps {
  return { type: 'button', disabled: action.disabled, title: action.disabledReason ?? action.label,
    'aria-label': action.label, 'aria-pressed': action.pressed, onClick: action.onClick };
}

/** Controlled leaf only. No draft/store/fetch/session or submit implementation.
 * Container geometry comes from the real TapNow Bl/Gy/FM/Dy renderers. */
export function LcosComposerView(props: LcosComposerViewProps): JSX.Element {
  const parts = useContext(NativeComposerContext);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const setEditorRef = useCallback((editor: HTMLTextAreaElement | null) => {
    editorRef.current = editor;
    if (typeof props.textareaRef === 'function') return props.textareaRef(editor);
    if (props.textareaRef) props.textareaRef.current = editor;
  }, [props.textareaRef]);
  const fitEditor = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.style.height = '0px';
    editor.style.height = `${Math.max(48, Math.min(100, editor.scrollHeight))}px`;
    editor.style.overflowY = editor.scrollHeight > 100 ? 'auto' : 'hidden';
  }, []);
  useLayoutEffect(fitEditor, [fitEditor, props.text, props.presentation]);
  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor || typeof ResizeObserver !== 'function') return;
    let width = editor.clientWidth;
    const observer = new ResizeObserver(() => {
      if (editor.clientWidth === width) return;
      width = editor.clientWidth; fitEditor();
    });
    observer.observe(editor);
    return () => observer.disconnect();
  }, [fitEditor]);

  if (!parts) return <div role="alert">输入界面暂时不可用，请重新打开对话。{props.feedback}</div>;
  const { Frame, EditorFrame, ToolbarFrame, ReferenceFrame, Button } = parts;
  const busy = ['resolving', 'sending', 'reconciling'].includes(props.state);
  const references = props.references.length > 0 ? <ReferenceFrame>
    <div role="list" aria-label="本次显式引用" className="native-composer-references">
      {props.references.map((item, index) => <div key={item.key} role="listitem" className="native-composer-reference"
        data-lcos-composer-ref data-reference-key={item.key} data-reference-order={index + 1}
        data-unavailable={item.unavailableReason ? true : undefined}
        title={[item.tooltip, item.versionLabel, item.unavailableReason].filter(Boolean).join(' · ') || item.label}>
        {item.onOpen ? <Button className="native-composer-reference-open" onClick={item.onOpen}
          aria-label={`查看引用 ${item.label}${item.versionLabel ? ` · ${item.versionLabel}` : ''}`}>
          {item.thumbnailSrc ? <img src={item.thumbnailSrc} alt="" loading="lazy" /> : item.icon ?? <Paperclip size={13} aria-hidden />}
          <span>{item.label}</span>
        </Button> : <span className="native-composer-reference-label">
          {item.thumbnailSrc ? <img src={item.thumbnailSrc} alt="" loading="lazy" /> : item.icon ?? <Paperclip size={13} aria-hidden />}
          <span>{item.label}</span>
        </span>}
        {item.unavailableReason && <span role="img" aria-label={`引用不可用：${item.unavailableReason}`}>!</span>}
        {item.onRemove && <Button className="native-composer-reference-remove" onClick={item.onRemove}
          aria-label={`移除引用 ${item.label}`}><X size={11} aria-hidden /></Button>}
      </div>)}
    </div>
  </ReferenceFrame> : undefined;

  return <div data-lcos-composer data-lcos-composer-target={props.targetId}
    data-presentation={props.presentation} data-ui-state={props.state} aria-busy={busy}>
      <Frame className="native-composer-view" references={references}
        surfaceProps={{ ref: props.referenceSurfaceRef, 'data-lcos-composer-reference-surface': true,
          'data-drop-active': props.referenceDropActive || undefined,
          onDragOver: props.onMaterialDragOver, onDrop: props.onMaterialDrop, onPaste: props.onMaterialPaste }}
        heading={props.presentation === 'nearfield' ? <div className="native-composer-heading">
          {props.identity}
          {props.receiverAction ? <Button {...actionProps(props.receiverAction)} className="native-composer-title">{props.title}</Button>
            : <span className="native-composer-title" title={props.title}>{props.title}</span>}
          <Button aria-label="关闭 Composer" onClick={props.onClose}><X size={14} aria-hidden /></Button>
        </div> : props.receiverAction ? <Button {...actionProps(props.receiverAction)} className="native-composer-title">{props.title}</Button> : undefined}
        editor={<EditorFrame>
          <textarea ref={setEditorRef} data-lcos-composer-input className="native-composer-input"
            value={props.text} onChange={props.onTextChange} onSelect={props.onSelect}
            onKeyDown={props.onKeyDown} readOnly={props.readOnly} rows={2}
            placeholder={props.placeholder ?? '想一起完成什么？'} aria-label="Composer 输入" />
        </EditorFrame>}
        actions={<ToolbarFrame start={<>
          {props.attachAction && <Button {...actionProps(props.attachAction)} className="native-composer-tool">
            {props.attachAction.icon ?? <Paperclip size={16} aria-hidden />}
          </Button>}
          {nativeControls(props.referencePicker, Button)}
          {props.referencePicker === undefined && props.referencePickAction
            && <Button {...actionProps(props.referencePickAction)} className="native-composer-tool"><AtSign size={16} aria-hidden /></Button>}
        </>} end={<Button disabled={!props.canSubmit} aria-label="提交" title={props.submitTitle}
          className="native-composer-submit" onClick={props.onSubmit}><ArrowUp size={18} aria-hidden /></Button>} />}
        options={props.continuationControls !== undefined ? <div className="native-composer-options">{props.continuationControls}</div> : undefined}
        feedback={props.feedback != null || props.feedbackAction ? <div className="native-composer-feedback" aria-live="polite">
          {props.feedback}
          {props.feedbackAction && <Button {...actionProps(props.feedbackAction)} className="native-composer-recovery">{props.feedbackAction.label}</Button>}
        </div> : undefined}
      />
  </div>;
}
