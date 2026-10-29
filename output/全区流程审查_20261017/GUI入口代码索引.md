# GUI 入口代码索引

自动扫描范围：lab 与 LCOS 副本 TSX/JSX；不是运行通过声明。

## lab/decompiled/index-readable.js

- L29431: `return p2.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = w$a, p2.createPortal = function (C, E) {`
- L29435: `}, p2.createRoot = function (C, E) {`
- L117520: `return s ? N7e.createPortal(v.jsx($a.div, {`
- L237182: `return a ? N7e.createPortal(w.createElement(J9e.div, To({}, r, {`
- L238859: `H.detail?.originalEvent?.target?.closest('[data-user-menu-flyout], [role="dialog"], [role="alertdialog"], [role="menu"]') && H.preventDefault();`
- L238862: `H.detail?.originalEvent?.target?.closest('[data-user-menu-flyout], [role="dialog"], [role="alertdialog"], [role="menu"]') && H.preventDefault();`
- L244636: `return o ? Au.createPortal(v.jsx(kba, {`
- L245169: `}), c.isSelected && s.valueNode && !s.valueNodeHasChildren ? Au.createPortal(o.children, s.valueNode) : null]`
- L247964: `return NW.createRoot = t.createRoot, NW.hydrateRoot = t.hydrateRoot, NW;`
- L300707: `return n ? Au.createPortal(u, n) : u;`
- L329325: `}), u && e && (c === t.id || f || p) && Au.createPortal(v.jsx("div", {`
- L443997: `return Au.createPortal(v.jsxs("div", {`
- L446129: `return Au.createPortal(v.jsxs(v.Fragment, {`
- L451251: `tos.createRoot(n).render(v.jsx("main", {`

## lab/native-material-peek-transform.mjs

- L1: `export const nativeMaterialPeekSource = 'lcos/huabu/apps/web/src/lcos/navigation/RailwayPeek.tsx';`
- L7: `['export function RailwayPeek({ canvasId }: { readonly canvasId: string }): React.JSX.Element {',`
- L8: `'export function RailwayPeek({ canvasId, nativeScene, highlightNodeId }: { readonly canvasId: string; readonly nativeScene: GetSpacePreviewSceneResponse; readonly highlightNodeId?: string }): React.JSX.Element {'],`

## lab/native-outline-transform.mjs

- L6: `const mindMapRelativePath = 'lcos/huabu/apps/web/src/lcos/nodes/text/MindMapEditor.tsx';`
- L73: `* Rewire the copied Gen1-derived MindMapEditor to one mount-scoped source-map`
- L77: `assertInput(source, sourcePath, mindMapRelativePath, 'MindMapEditor');`
- L96: `], 'MindMapEditor');`

## lab/native-react-dom.js

- L2: `export const { createPortal, flushSync, preconnect, prefetchDNS, preinit, preload, version } = ReactDOM;`

## lab/native-saved-context-transform.mjs

- L8: `export const nativeSavedContextAtlasSource = 'lcos/huabu/apps/web/src/lcos/surfaces/context/ContextAtlasStage.tsx';`
- L15: `throw new Error('Native Saved Context transform requires the real copied ContextAtlasStage sourcePath.');`
- L96: `&& node.name?.text === 'ContextAtlasStage'), 'ContextAtlasStage function');`

## lab/native-text-source-transforms.mjs

- L12: `'lcos/huabu/apps/web/src/lcos/nodes/text/MindMapEditor.tsx': transformNativeOutlineEditor,`

## lab/pilot/native-assembly-ui.tsx

- L216: `if (!coreDetail) return <NativePreview detail={detail} onApply={onApply} />;`
- L259: `<NativePreview key={JSON.stringify([current.projectId, ready.item.entityRef.id, ready.item.presentedRevisionId])} detail={ready.detail} lcosActions={actions} />`

## lab/pilot/native-collection-ui.tsx

- L431: `shell.openWindow('collection', \`集合 · ${parsed.title}\`, parsed.reference.collectionId);`

## lab/pilot/native-library-contexts.tsx

- L537: `return <NativePreview detail={detail} contentVariant="content" bodySlot={body} metaSlot={<div className="flex flex-col gap-0.5">`

## lab/pilot/native-material-rail-ui.tsx

- L2: `import { RailwayPeek } from '../../lcos/huabu/apps/web/src/lcos/navigation/RailwayPeek';`
- L86: `<div className="native-material-scene"><RailwayPeek canvasId={location.canvasId} nativeScene={ready.scene} highlightNodeId={location.nodeId} /></div>`
- L87: `<div className="native-material-peek-preview" data-native-material-peek-file={location.fileRecordId}><NativePreview detail={ready.detail} /></div>`

## lab/pilot/native-pile-ui.tsx

- L370: `if (!target) return <NativeRenderer {...nativeProps} />`
- L385: `<NativeRenderer {...renderedProps} />`
- L389: `<NativeToolbar nodeId={nodeId} nodeTitle={String(title ?? '')} tools={tools} scaleMode="inherit" />`

## lab/pilot/native-professional-host.tsx

- L3: `import { createPortal } from 'react-dom';`
- L6: `import { ProfessionalWindowStage } from '../../lcos/huabu/apps/web/src/lcos/professional/ProfessionalWindowStage.tsx';`
- L68: `* in the original React tree. ProfessionalWindowStage remains the sole window`
- L170: `{createPortal(<ProfessionalWindowStage projectId={projectId} />, document.body)}`

## lab/pilot/native-saved-context-host.tsx

- L3: `import { createPortal } from 'react-dom';`
- L11: `import { ContextAtlasStage } from '../../lcos/huabu/apps/web/src/lcos/surfaces/context/ContextAtlasStage.tsx';`
- L106: `return createPortal(<div data-lcos-native-saved-context-host data-source-canvas-id={canvasId}>`
- L108: `{model.status === 'ready' ? <ContextAtlasStage key={\`${projectId}:${canvasId}\`}`

## lab/pilot/native-task-route.ts

- L44: `return [...documentRef.querySelectorAll<HTMLElement>('[role="dialog"][data-state="open"], [role="menu"][data-state="open"], [role="listbox"][data-state="open"], [data-radix-popper-content-wrapper], details[open]')]`

## lab/pilot/native-text-first-ui.tsx

- L9: `import { MindMapEditor } from '../../lcos/huabu/apps/web/src/lcos/nodes/text/MindMapEditor';`
- L241: `<NativeToolbar nodeId={props.nodeId} nodeTitle={title} tools={tools} scaleMode="inherit" />`
- L246: `{activeEditor && <MindMapEditor title={activeEditor.base.title} outline={activeEditor.base.body} disabled={!!currentPending || props.editable !== true}`

## lab/pilot/native-workflow-host.css

- L1: `/* Screen-space host only. WorkflowHandView and TaskCard retain the donor CSS. */`

## lab/pilot/native-workflow-host.tsx

- L3: `import { createPortal } from 'react-dom';`
- L12: `import { WorkflowHandView } from '../../lcos/huabu/apps/web/src/lcos/ui/workflow/WorkflowHandView.tsx';`
- L28: `/** Keep the host mounted while false so WorkflowHandView can complete its original exit presence. */`
- L162: `return createPortal(<div data-lcos-native-workflow-host data-source-canvas-id={canvasId} data-open={open ? 'true' : 'false'}`
- L164: `<WorkflowHandView open={open} onClose={onClose} nativeAssemblyDropActive={nativeAssemblyDropActive} header={<>`
- L181: `</WorkflowHandView>`

## lab/pilot/surface-core-facade.ts

- L820: `{ id: 'saved-context-atlas', owner: 'Existing ContextAtlasStage / NativeContextReferencePort / Core Assembly Presentation membership',`
- L824: `{ id: 'workflow-method-hand', owner: 'Existing WorkflowHandView / WorkflowCardPool / Workflow Presentation / original Composer draft',`

## lab/pilot/ui.tsx

- L2: `import{createRoot}from'react-dom/client';`
- L73: `createRoot(document.getElementById('root')!).render(<App/>);`

## lab/surface-dock-transform.mjs

- L10: `// createPortal) is exported as hD. The test checks this source relationship.`
- L242: `+ ',createPortal:LCOSReactDOM.createPortal'`

## lab/surface-dock-ui.js

- L203: `react, runtime, createPortal, currentCanvasId, onSelect, disabled = false,`
- L288: `if (typeof createPortal !== 'function' || !globalThis.document?.body) return null;`
- L289: `return createPortal(dock, globalThis.document.body);`

## lcos/huabu/apps/docs/src/components/Search.tsx

- L6: `import { createPortal } from 'react-dom';`
- L134: `createPortal(`
- L146: `role="dialog"`

## lcos/huabu/apps/web/src/components/Common/CanvasFloatingPopover.focus.test.tsx

- L2: `import { createRoot, type Root } from 'react-dom/client';`
- L47: `const root = createRoot(host); roots.push(root);`
- L67: `const root = createRoot(host); roots.push(root);`

## lcos/huabu/apps/web/src/components/Common/FloatingToolbar.test.tsx

- L4: `import { createRoot, type Root } from 'react-dom/client';`
- L16: `const root = createRoot(container);`

## lcos/huabu/apps/web/src/components/Common/Modal.tsx

- L12: `import { createPortal } from 'react-dom';`
- L123: `return createPortal(`
- L137: `role="dialog"`

## lcos/huabu/apps/web/src/components/Common/Popover.test.tsx

- L4: `import { createRoot, type Root } from 'react-dom/client';`
- L25: `root = createRoot(container);`
- L48: `root = createRoot(container); const capture = vi.fn();`
- L57: `root = createRoot(container);`

## lcos/huabu/apps/web/src/components/Common/Popover.tsx

- L19: `import { createPortal } from 'react-dom';`
- L135: `* - Renders children via \`createPortal\` (to \`document.body\` by default).`
- L237: `// nested Popover) typically use a \`createPortal\` to \`document.body\`,`
- L245: `// happens within any open \`[role="dialog"]\` or any element that`
- L247: `// panels set \`role="dialog"\` so this covers them automatically.`
- L251: `const dialogsAtOpen = new Set(document.querySelectorAll('[role="dialog"]'));`
- L261: `const dialog = target.closest('[role="dialog"]');`
- L329: `return createPortal(panel, portalContainer);`

## lcos/huabu/apps/web/src/components/Common/SplitSelect.test.tsx

- L4: `import { createRoot, type Root } from 'react-dom/client';`
- L25: `root = createRoot(container);`
- L51: `root = createRoot(container);`

## lcos/huabu/apps/web/src/components/Common/TextInput.test.tsx

- L4: `import { createRoot, type Root } from 'react-dom/client';`
- L23: `root = createRoot(container);`

## lcos/huabu/apps/web/src/components/Common/Toast.test.tsx

- L4: `import { createRoot, type Root } from 'react-dom/client';`
- L27: `root = createRoot(container);`

## lcos/huabu/apps/web/src/components/Common/Toast.tsx

- L6: `import { createPortal } from 'react-dom';`
- L316: `return createPortal(`

## lcos/huabu/apps/web/src/components/Common/ToolbarPopover.test.tsx

- L2: `import { createRoot, type Root } from 'react-dom/client';`
- L11: `const dialog = (label: string) => document.querySelector(\`[role="dialog"][aria-label="${label}"]\`);`
- L30: `host = document.createElement('div'); document.body.append(host); root = createRoot(host);`

## lcos/huabu/apps/web/src/components/Messages/AIMessage/PermissionCard.test.tsx

- L5: `import { createRoot, type Root } from 'react-dom/client';`
- L58: `root = createRoot(container);`

## lcos/huabu/apps/web/src/components/Messages/MessageList.test.tsx

- L5: `import { createRoot, type Root } from 'react-dom/client';`
- L69: `root = createRoot(container);`

## lcos/huabu/apps/web/src/components/Milkdown/MilkdownFloatingToolbar.tsx

- L36: `import { createPortal } from 'react-dom';`
- L454: `? createPortal(`
- L626: `? createPortal(`
- L685: `? createPortal(`
- L747: `return createPortal(`

## lcos/huabu/apps/web/src/components/Milkdown/__tests__/asyncLifecycle.test.tsx

- L6: `import { createRoot, type Root } from 'react-dom/client';`
- L25: `host = document.createElement('div'); document.body.append(host); root = createRoot(host);`

## lcos/huabu/apps/web/src/components/Milkdown/__tests__/previewAccessibility.test.tsx

- L7: `import { createRoot, type Root } from 'react-dom/client';`
- L29: `root = createRoot(container);`

## lcos/huabu/apps/web/src/components/Nodes/AiSummaryBanner.test.tsx

- L5: `import { createRoot, type Root } from 'react-dom/client';`
- L35: `root = createRoot(container);`

## lcos/huabu/apps/web/src/components/Nodes/canvasRef/CanvasRefNode.test.tsx

- L2: `import { createRoot, type Root } from 'react-dom/client';`
- L16: `beforeEach(() => { mocks.navigate.mockClear(); host = document.createElement('div'); document.body.append(host); root = createRoot(host); });`

## lcos/huabu/apps/web/src/components/Nodes/frame/InstructionFrameBadge.test.tsx

- L5: `import { createRoot } from 'react-dom/client';`
- L30: `const root = createRoot(container);`

## lcos/huabu/apps/web/src/components/Nodes/image/ImagePreview.test.tsx

- L5: `import { createRoot, type Root } from 'react-dom/client';`
- L33: `root = createRoot(container);`

## lcos/huabu/apps/web/src/components/Nodes/image/ImagePreview.tsx

- L5: `import { createPortal } from 'react-dom';`
- L88: `? createPortal(headerActions, headerSlotEl)`

## lcos/huabu/apps/web/src/components/Nodes/MissingFileBanner.test.tsx

- L5: `import { createRoot, type Root } from 'react-dom/client';`
- L28: `root = createRoot(container);`

## lcos/huabu/apps/web/src/components/Nodes/NodeConnectAffordance.behavior.test.tsx

- L2: `import { createRoot, type Root } from 'react-dom/client';`
- L44: `const mountedRoot = createRoot(container);`

## lcos/huabu/apps/web/src/components/Nodes/NodeConnectAffordance.tsx

- L18: `import { createPortal } from 'react-dom';`
- L473: `return createPortal(`
- L521: `return createPortal(`

## lcos/huabu/apps/web/src/components/Nodes/NodeTakeoverLayer.tsx

- L6: `import { createPortal } from 'react-dom';`
- L130: `return createPortal(`

## lcos/huabu/apps/web/src/components/Nodes/NodeWrapper.lcosLod.test.tsx

- L2: `import { createRoot, type Root } from 'react-dom/client';`
- L121: `const root = createRoot(container);`

## lcos/huabu/apps/web/src/components/Nodes/NodeWrapper.tsx

- L20: `import { createPortal } from 'react-dom';`
- L152: `return createPortal(`

## lcos/huabu/apps/web/src/components/Nodes/note/NoteNode.lcosBody.test.tsx

- L2: `import { createRoot } from 'react-dom/client';`
- L27: `const root = createRoot(host);`

## lcos/huabu/apps/web/src/components/Nodes/note/NotePreview.tsx

- L35: `import { createPortal } from 'react-dom';`
- L590: `? createPortal(toggleButton, headerSlotEl)`

## lcos/huabu/apps/web/src/components/Nodes/office/OfficePreview.tsx

- L6: `import { createPortal } from 'react-dom';`
- L71: `? createPortal(headerActions, headerSlotEl)`

## lcos/huabu/apps/web/src/components/Nodes/pdf/PDFPreview.tsx

- L14: `import { createPortal } from 'react-dom';`
- L615: `{headerSlotEl ? createPortal(headerActions, headerSlotEl) : null}`

## lcos/huabu/apps/web/src/components/Nodes/pdf/usePdfDocumentLifecycle.test.tsx

- L5: `import { createRoot, type Root } from 'react-dom/client';`
- L43: `root = createRoot(container);`

## lcos/huabu/apps/web/src/components/Nodes/question/QuestionTakeoverMark.test.tsx

- L5: `import { createRoot, type Root } from 'react-dom/client';`
- L83: `root = createRoot(container);`
- L111: `root = createRoot(container);`

## lcos/huabu/apps/web/src/components/Nodes/shared/TextNodeBody.test.tsx

- L16: `import { createRoot, type Root } from 'react-dom/client';`
- L139: `root = createRoot(container);`

## lcos/huabu/apps/web/src/components/Nodes/sketch/SketchSizePicker.tsx

- L12: `import { createPortal } from 'react-dom';`
- L97: `? createPortal(`

## lcos/huabu/apps/web/src/components/Nodes/spacePreview/SpacePreviewViewport.test.tsx

- L5: `import { createRoot, type Root } from 'react-dom/client';`
- L58: `root = createRoot(container);`

## lcos/huabu/apps/web/src/components/Nodes/text/TextNode.test.tsx

- L2: `import { createRoot } from 'react-dom/client';`
- L36: `const roots: ReturnType<typeof createRoot>[] = [];`
- L52: `const root = createRoot(container);`

## lcos/huabu/apps/web/src/components/Nodes/web/useInteractiveViewBridge.test.tsx

- L5: `import { createRoot } from 'react-dom/client';`
- L119: `let root: ReturnType<typeof createRoot>;`
- L137: `root = createRoot(container);`

## lcos/huabu/apps/web/src/components/Nodes/web/WebPreview.tsx

- L6: `import { createPortal } from 'react-dom';`
- L416: `? createPortal(headerActions, headerSlotEl)`

## lcos/huabu/apps/web/src/components/Panels/Canvas/CanvasToolbar.test.tsx

- L5: `import { createRoot, type Root } from 'react-dom/client';`
- L96: `root = createRoot(container);`

## lcos/huabu/apps/web/src/components/Panels/Canvas/MoveSelectionModal.test.tsx

- L5: `import { createRoot, type Root } from 'react-dom/client';`
- L68: `root = createRoot(container);`
- L95: `root = createRoot(container);`
- L136: `root = createRoot(container);`

## lcos/huabu/apps/web/src/components/Panels/Canvas/MultiSelectResizer.tsx

- L6: `import { createPortal } from 'react-dom';`
- L438: `return createPortal(overlay, domNode);`

## lcos/huabu/apps/web/src/components/Panels/Canvas/SelectionOutlines.tsx

- L6: `import { createPortal } from 'react-dom';`
- L150: `return createPortal(<>{outlines}</>, domNode);`

## lcos/huabu/apps/web/src/components/Panels/CanvasLayerPanel/MissingNodesSummary.test.tsx

- L5: `import { createRoot, type Root } from 'react-dom/client';`
- L30: `root = createRoot(container);`

## lcos/huabu/apps/web/src/components/Panels/ChatPanel/AcpSessionSelectors.test.tsx

- L5: `import { createRoot, type Root } from 'react-dom/client';`
- L124: `root = createRoot(container);`
- L169: `root = createRoot(container);`
- L215: `root = createRoot(container);`
- L254: `root = createRoot(container);`
- L359: `root = createRoot(container);`

## lcos/huabu/apps/web/src/components/Panels/ChatPanel/agentMenu.test.tsx

- L5: `import { createRoot, type Root } from 'react-dom/client';`
- L78: `root = createRoot(container);`

## lcos/huabu/apps/web/src/components/Panels/ChatPanel/ChatInput.test.tsx

- L5: `import { createRoot, type Root } from 'react-dom/client';`
- L103: `root = createRoot(container);`
- L153: `root = createRoot(container);`
- L198: `root = createRoot(container);`
- L314: `root = createRoot(container);`
- L378: `root = createRoot(container);`

## lcos/huabu/apps/web/src/components/Panels/ChatPanel/ThreadChatInput.test.tsx

- L5: `import { createRoot, type Root } from 'react-dom/client';`
- L63: `root = createRoot(container);`

## lcos/huabu/apps/web/src/components/Panels/ExpandedNodePanel/ExpandedNodePanel.test.tsx

- L5: `import { createRoot, type Root } from 'react-dom/client';`
- L118: `root = createRoot(container);`

## lcos/huabu/apps/web/src/components/Panels/ExpandedNodePanel/ExpandedNodePanel.tsx

- L423: `// \`PreviewHeaderSlot\` context + \`createPortal\` to render their own`

## lcos/huabu/apps/web/src/components/Panels/ExpandedNodePanel/InPreviewSearchBar.test.tsx

- L5: `import { createRoot, type Root } from 'react-dom/client';`
- L33: `root = createRoot(container);`

## lcos/huabu/apps/web/src/components/Panels/Header/AppMenu.test.tsx

- L5: `import { createRoot, type Root } from 'react-dom/client';`
- L104: `root = createRoot(container);`
- L122: `root = createRoot(container);`

## lcos/huabu/apps/web/src/components/Panels/PreviewWorkspace/PreviewGroup.test.tsx

- L5: `import { createRoot, type Root } from 'react-dom/client';`
- L153: `root = createRoot(container);`

## lcos/huabu/apps/web/src/components/Panels/PreviewWorkspace/PreviewWorkspace.test.tsx

- L14: `import { createRoot, type Root } from 'react-dom/client';`
- L123: `root = createRoot(container);`
- L210: `root = createRoot(container);`
- L223: `root = createRoot(container);`
- L587: `root = createRoot(container);`
- L1132: `root = createRoot(container);`
- L1169: `root = createRoot(container);`

## lcos/huabu/apps/web/src/components/Panels/PreviewWorkspace/PreviewWorkspace.tsx

- L36: `import { createPortal } from 'react-dom';`
- L123: `return createPortal(`

## lcos/huabu/apps/web/src/components/Panels/PreviewWorkspace/PreviewWorkspacePanel.tsx

- L71: `target.closest('[role="dialog"], [role="menu"], [role="combobox"]')`
- L75: `if (document.querySelector('[role="dialog"], [role="menu"]')) return;`

## lcos/huabu/apps/web/src/components/Panels/SidebarPanel.test.tsx

- L5: `import { createRoot, type Root } from 'react-dom/client';`
- L28: `root = createRoot(container);`

## lcos/huabu/apps/web/src/components/Settings/agent-team/AgentProfileEditor.test.tsx

- L5: `import { createRoot, type Root } from 'react-dom/client';`
- L131: `root = createRoot(container);`
- L152: `root = createRoot(container);`

## lcos/huabu/apps/web/src/components/Settings/agent-team/AgentTeamConfigs.test.tsx

- L4: `import { createRoot, type Root } from 'react-dom/client';`
- L68: `root = createRoot(container);`
- L107: `root = createRoot(container);`
- L165: `root = createRoot(container);`
- L219: `root = createRoot(container);`

## lcos/huabu/apps/web/src/components/Settings/agent-team/PersistedAgentIconPicker.test.tsx

- L5: `import { createRoot, type Root } from 'react-dom/client';`
- L69: `root = createRoot(container);`
- L105: `root = createRoot(container);`

## lcos/huabu/apps/web/src/components/Settings/agent-team/ProfileFormFooter.tsx

- L5: `import { createPortal } from 'react-dom';`
- L29: `return target ? createPortal(footer, target) : footer;`

## lcos/huabu/apps/web/src/components/Settings/agent-team/useDetectedClis.test.tsx

- L5: `import { createRoot, type Root } from 'react-dom/client';`
- L55: `root = createRoot(container);`

## lcos/huabu/apps/web/src/components/Settings/Common/ApiKeyRow.test.tsx

- L4: `import { createRoot, type Root } from 'react-dom/client';`
- L31: `root = createRoot(container);`

## lcos/huabu/apps/web/src/components/Settings/sections/OAuthDeviceCodePrompt.test.tsx

- L5: `import { createRoot, type Root } from 'react-dom/client';`
- L30: `root = createRoot(container);`

## lcos/huabu/apps/web/src/components/Settings/SettingsModal.escape.test.tsx

- L2: `import { createRoot } from 'react-dom/client';`
- L22: `function Nested() { useCloseOnEscape(true, m.nestedClose); return <div role="dialog" aria-modal="true" />; }`
- L26: `const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);`
- L35: `const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);`

## lcos/huabu/apps/web/src/components/Settings/SettingsModal.tsx

- L165: `role="dialog"`

## lcos/huabu/apps/web/src/components/Settings/utils.test.tsx

- L5: `import { createRoot, type Root } from 'react-dom/client';`
- L37: `root = createRoot(container);`

## lcos/huabu/apps/web/src/components/WorkspaceGate.test.tsx

- L2: `import { createRoot, type Root } from 'react-dom/client';`
- L25: `const root = createRoot(container);`

## lcos/huabu/apps/web/src/hooks/chatSessionIsolation.test.tsx

- L23: `import { createRoot, type Root } from 'react-dom/client';`
- L201: `root = createRoot(container);`

## lcos/huabu/apps/web/src/hooks/shortcuts/useCanvasShortcuts.lcosPresentation.test.tsx

- L3: `import { createRoot, type Root } from 'react-dom/client';`
- L13: `import { MindMapEditor } from '../../lcos/nodes/text/MindMapEditor';`
- L39: `host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);`
- L90: `const extra = document.createElement('div'); document.body.appendChild(extra); const editorRoot = createRoot(extra);`
- L91: `act(() => editorRoot.render(<MindMapEditor title="Map" outline={'- Branch\n  - Child'} onCancel={() => undefined} onSave={async () => true} />));`

## lcos/huabu/apps/web/src/hooks/useAcpSessionMeta.test.tsx

- L5: `import { createRoot, type Root } from 'react-dom/client';`
- L65: `root = createRoot(container);`

## lcos/huabu/apps/web/src/hooks/useAcpSlashCommands.test.tsx

- L5: `import { createRoot, type Root } from 'react-dom/client';`
- L49: `root = createRoot(container);`

## lcos/huabu/apps/web/src/hooks/useBuiltinThreadSettings.test.tsx

- L5: `import { createRoot, type Root } from 'react-dom/client';`
- L109: `root = createRoot(container);`
- L130: `root = createRoot(container);`
- L150: `root = createRoot(container);`
- L177: `root = createRoot(container);`
- L209: `root = createRoot(container);`

## lcos/huabu/apps/web/src/hooks/useChatHistory.test.tsx

- L14: `import { createRoot, type Root } from 'react-dom/client';`
- L121: `root = createRoot(container);`

## lcos/huabu/apps/web/src/hooks/useCloseOnEscape.canvasBlank.test.tsx

- L2: `import { createRoot } from 'react-dom/client';`
- L20: `async function fixture(run: (host: HTMLDivElement, root: ReturnType<typeof createRoot>, pane: HTMLDivElement) => Promise<void>) {`
- L22: `document.body.append(host, pane); const root = createRoot(host);`

## lcos/huabu/apps/web/src/hooks/useCloseOnEscape.test.tsx

- L2: `import { createRoot, type Root } from 'react-dom/client';`
- L18: `rootA = createRoot(host.appendChild(document.createElement('div')));`
- L19: `rootB = createRoot(host.appendChild(document.createElement('div')));`

## lcos/huabu/apps/web/src/hooks/useGlobalSearchHotkey.test.tsx

- L5: `import { createRoot, type Root } from 'react-dom/client';`
- L52: `root = createRoot(container);`

## lcos/huabu/apps/web/src/hooks/usePreviewScrollMemory.test.tsx

- L7: `import { createRoot, type Root } from 'react-dom/client';`
- L63: `root = createRoot(host);`
- L83: `root = createRoot(host);`
- L112: `root = createRoot(host);`
- L142: `root = createRoot(host);`
- L175: `root = createRoot(host);`

## lcos/huabu/apps/web/src/lcos/app/LcosProjectRoute.workspace.test.tsx

- L2: `import { createRoot } from 'react-dom/client';`
- L24: `const roots: ReturnType<typeof createRoot>[] = [];`
- L26: `function render(props = {}) { const root = createRoot(document.createElement('div')); roots.push(root); act(() => root.render(<LcosProjectRoute {...props} />)); }`

## lcos/huabu/apps/web/src/lcos/app/useLcosCanvasBinding.test.tsx

- L8: `import { createRoot } from 'react-dom/client';`
- L36: `const root = createRoot(host);`

## lcos/huabu/apps/web/src/lcos/app/useLcosWorksite.created.test.tsx

- L2: `import { createRoot } from 'react-dom/client';`
- L18: `const roots: ReturnType<typeof createRoot>[] = [];`
- L38: `const root = createRoot(document.createElement('div')); roots.push(root);`

## lcos/huabu/apps/web/src/lcos/app/useLcosWorksiteNav.test.tsx

- L2: `import { createRoot } from 'react-dom/client';`
- L23: `const roots: ReturnType<typeof createRoot>[] = [];`
- L38: `const root = createRoot(document.createElement('div'));`
- L65: `const root = createRoot(document.createElement('div')); roots.push(root);`
- L83: `const root = createRoot(document.createElement('div')); roots.push(root);`
- L96: `const root = createRoot(document.createElement('div')); roots.push(root);`
- L109: `const root = createRoot(document.createElement('div')); roots.push(root);`

## lcos/huabu/apps/web/src/lcos/collaboration/NativeConversationProjectEntry.test.tsx

- L2: `import { createRoot, type Root } from 'react-dom/client';`
- L43: `host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);`

## lcos/huabu/apps/web/src/lcos/collaboration/NativeConversationProjectEntry.tsx

- L143: `useLcosShellStore.getState().openWindow('conversation', linked.connectedConversation.label, destinationId);`
- L183: `onClick={() => { useLcosShellStore.getState().openWindow('conversation', targets.find((target) => target.id === targetId)?.label ?? '项目会话', targetId); setOpen(false); }}>打开会话与产出</Button>}`

## lcos/huabu/apps/web/src/lcos/composer/ComposerReferencePicker.test.tsx

- L2: `import { createRoot } from 'react-dom/client';`
- L10: `const roots: ReturnType<typeof createRoot>[] = [];`
- L34: `const root = createRoot(host);`
- L62: `const root = createRoot(host);`

## lcos/huabu/apps/web/src/lcos/composer/LcosComposerHost.dropLifecycle.test.tsx

- L2: `import { createRoot,type Root } from 'react-dom/client';`
- L23: `beforeEach(()=>{host=document.createElement('div');document.body.append(host);root=createRoot(host);`

## lcos/huabu/apps/web/src/lcos/composer/LcosComposerHost.materialIngress.test.tsx

- L2: `import { createRoot, type Root } from 'react-dom/client';`
- L23: `host=document.createElement('div');document.body.append(host);root=createRoot(host);`

## lcos/huabu/apps/web/src/lcos/composer/LcosComposerHost.referenceOperations.test.tsx

- L2: `import { createRoot, type Root } from 'react-dom/client';`
- L68: `host = document.createElement('div'); document.body.append(host); root = createRoot(host);`

## lcos/huabu/apps/web/src/lcos/composer/LcosComposerHost.references.test.tsx

- L2: `import { createRoot } from 'react-dom/client';`
- L10: `const roots: ReturnType<typeof createRoot>[] = [];`
- L28: `const root = createRoot(host);`
- L47: `const host = document.createElement('div'); document.body.append(host); const root = createRoot(host); roots.push(root);`
- L63: `const host = document.createElement('div'); document.body.append(host); const root = createRoot(host); roots.push(root);`
- L81: `const host = document.createElement('div'); document.body.append(host); const root = createRoot(host); roots.push(root);`
- L101: `const root = createRoot(host); roots.push(root);`

## lcos/huabu/apps/web/src/lcos/composer/LcosComposerHost.submission.test.tsx

- L4: `import { createRoot, type Root } from 'react-dom/client';`
- L36: `el = document.createElement('div'); document.body.append(el); root = createRoot(el);`

## lcos/huabu/apps/web/src/lcos/composer/LcosComposerHost.tsx

- L223: `shell.openReader(title, artifactId, { revisionId, composerOriginKey: inputKey });`
- L592: `useLcosShellStore.getState().openWindow('conversation', '核对会话记录', retainedSend.input.conversationId);`
- L670: `? { label: '查看任务', onClick: () => useLcosShellStore.getState().openWindow('run-review', '任务', createdRun.runId) }`
- L676: `? { label: '查看会话连接', onClick: () => useLcosShellStore.getState().openWindow(`

## lcos/huabu/apps/web/src/lcos/composer/useComposerContinuation.test.tsx

- L2: `import { createRoot } from 'react-dom/client';`
- L23: `let root: ReturnType<typeof createRoot> | undefined;`
- L44: `root = createRoot(host);`
- L108: `const host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);`

## lcos/huabu/apps/web/src/lcos/dev/LcosFamiliesGalleryPage.tsx

- L204: `<Section id="ProfessionalWindowChrome" figma="统一 / ProfessionalWindowChrome 5387:331 · 布局 浮动/停靠/分组" note="生产 caller：lcos/professional/ProfessionalWindowStage.tsx">`
- L243: `<Section id="Collection" figma="集合 / 上下文跨视图 5333:96 · 组织×呈现；工作流跨视图 5334:46" note="生产 caller：lcos/surfaces/context/ContextAtlasStage.tsx（目前只到 总览）">`

## lcos/huabu/apps/web/src/lcos/drop/LcosDropReceipt.tsx

- L3: `import { createPortal } from 'react-dom';`
- L93: `return createPortal(<section ref={panel} data-lcos-drop-receipt data-status={busy ? 'committing' : receipt?.status}`

## lcos/huabu/apps/web/src/lcos/host/CanvasHostBoundary.test.tsx

- L2: `import { createRoot, type Root } from 'react-dom/client';`
- L18: `host=document.createElement('div'); document.body.append(host); root=createRoot(host); });`

## lcos/huabu/apps/web/src/lcos/LcosArtifactNode.test.tsx

- L12: `import { createRoot, type Root } from 'react-dom/client';`
- L23: `// React 19 act() environment flag — createRoot + act without this flag`
- L53: `const root = createRoot(container);`

## lcos/huabu/apps/web/src/lcos/LcosDropPreview.test.tsx

- L4: `import { createRoot, type Root } from 'react-dom/client';`
- L25: `const root = createRoot(container);`

## lcos/huabu/apps/web/src/lcos/LcosDropPreview.tsx

- L3: `import { createPortal } from 'react-dom';`
- L128: `return createPortal(<>`

## lcos/huabu/apps/web/src/lcos/LcosHostOverlay.receipt.test.tsx

- L2: `import { createRoot, type Root } from 'react-dom/client';`
- L46: `container = document.createElement('div'); document.body.append(container); root = createRoot(container);`

## lcos/huabu/apps/web/src/lcos/LcosHostOverlay.test.tsx

- L4: `import { createRoot, type Root } from 'react-dom/client';`
- L24: `const root = createRoot(container);`

## lcos/huabu/apps/web/src/lcos/navigation/GlythStateActions.test.tsx

- L3: `import { createRoot, type Root } from 'react-dom/client';`
- L70: `host = document.createElement('div'); document.body.append(host); root = createRoot(host);`

## lcos/huabu/apps/web/src/lcos/navigation/LcosActionArc.tsx

- L291: `if (runId) shell.openWindow('run-review', \`任务 · ${ref.descriptor?.title ?? title}\`, runId);`
- L293: `else if (node.type === 'canvasRef' || node.type === 'spacePreview') shell.openWindow('portal-preview', \`入口 · ${title}\`, target, 'canvas', {workspaceId: ref?.entityType === 'workspace' ? ref.entityId : portalDropTargetForCanvas(portalContext,target)?.workspaceI`
- L295: `shell.openWindow('conversation', \`会话窗口 · ${title}\`, ref.entityId);`
- L297: `shell.openReader(\`阅读 · ${title}\`, ref.entityId, {`
- L310: `shell.openWindow('conversation', \`会话窗口 · ${title}\`, ref.entityId);`
- L361: `shell.openWindow('native-preview', \`大视图 · ${title}\`, nodeId);`
- L533: `role="dialog" aria-label={inspector === 'size' ? '调整节点尺寸' : '选择节点强调色'}`

## lcos/huabu/apps/web/src/lcos/navigation/LcosActionLauncher.test.tsx

- L2: `import { createRoot } from 'react-dom/client';`
- L10: `const roots: ReturnType<typeof createRoot>[] = [];`
- L14: `const host = document.createElement('div'); document.body.append(host); const root = createRoot(host); roots.push(root);`

## lcos/huabu/apps/web/src/lcos/navigation/LcosActionLauncher.tsx

- L2: `import { createPortal } from 'react-dom';`
- L36: `return createPortal(<div ref={layer} data-lcos-action-launcher className="fixed inset-0 z-[100] flex items-start justify-center pt-[14vh]">`
- L38: `<section role="dialog" aria-modal="true" aria-label="查找操作" className="relative flex w-[min(520px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl p-3"`

## lcos/huabu/apps/web/src/lcos/navigation/LcosFocusWhere.test.tsx

- L2: `import { createRoot } from 'react-dom/client';`
- L24: `const roots: ReturnType<typeof createRoot>[] = [];`
- L29: `const mounted = new Map<HTMLElement, ReturnType<typeof createRoot>>();`
- L38: `const container = document.createElement('div'); document.body.append(container); const root = createRoot(container); roots.push(root);`

## lcos/huabu/apps/web/src/lcos/navigation/LcosFocusWhere.tsx

- L138: `return <div ref={placement.ref} data-lcos-focus-where data-open="true" role="dialog" aria-label="对象位置"`

## lcos/huabu/apps/web/src/lcos/navigation/LcosLocatorCluster.test.tsx

- L2: `import {createRoot} from 'react-dom/client';`
- L9: `const roots:ReturnType<typeof createRoot>[]=[];`
- L14: `const locate=vi.fn();const host=document.createElement('div');document.body.append(host);const root=createRoot(host);roots.push(root);`

## lcos/huabu/apps/web/src/lcos/navigation/LcosMiniMapNode.test.tsx

- L2: `import {createRoot} from 'react-dom/client';`
- L15: `const roots:ReturnType<typeof createRoot>[]=[];`
- L28: `const host=document.createElement('div');document.body.append(host);const root=createRoot(host);roots.push(root);`
- L40: `const host=document.createElement('div');document.body.append(host);const root=createRoot(host);roots.push(root);`

## lcos/huabu/apps/web/src/lcos/navigation/LcosMultiSelectToolbar.remove.test.tsx

- L2: `import { createRoot, type Root } from 'react-dom/client';`
- L23: `host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);act(()=>root.render(<LcosMultiSelectToolbar/>));`

## lcos/huabu/apps/web/src/lcos/navigation/LcosMultiSelectToolbar.test.tsx

- L3: `import { createRoot, type Root } from 'react-dom/client';`
- L48: `host = document.createElement('div'); document.body.append(host); root = createRoot(host);`

## lcos/huabu/apps/web/src/lcos/navigation/LcosNavigatorIsland.test.tsx

- L2: `import { createRoot } from 'react-dom/client';`
- L27: `const roots: ReturnType<typeof createRoot>[] = [];`
- L33: `const mounted = new Map<HTMLElement, { root: ReturnType<typeof createRoot>; tree: React.JSX.Element }>();`
- L40: `const root = createRoot(container); roots.push(root);`

## lcos/huabu/apps/web/src/lcos/navigation/LcosNavigatorIsland.tsx

- L185: `openReader(\`阅读 · ${title}\`, hit.entityId);`
- L190: `openWindow('conversation', \`会话窗口 · ${title}\`, hit.entityId);`

## lcos/huabu/apps/web/src/lcos/navigation/LcosPersistentLocatorOverlay.test.tsx

- L3: `import { createRoot } from 'react-dom/client';`
- L17: `const roots: ReturnType<typeof createRoot>[] = [];`
- L23: `const container = document.createElement('div'); document.body.append(container); const root = createRoot(container); roots.push(root);`

## lcos/huabu/apps/web/src/lcos/navigation/LcosSpatialCursorMark.test.tsx

- L1: `import { createRoot, type Root } from 'react-dom/client';`
- L11: `host=document.createElement('div');document.body.append(host);root=createRoot(host);`

## lcos/huabu/apps/web/src/lcos/navigation/LcosSpatialNavigator.test.tsx

- L2: `import { createRoot, type Root } from 'react-dom/client';`
- L46: `root = createRoot(host);`

## lcos/huabu/apps/web/src/lcos/navigation/NavigatorGeometry.test.tsx

- L2: `import { createRoot } from 'react-dom/client';`
- L6: `const roots: ReturnType<typeof createRoot>[] = [];`
- L9: `const container = document.createElement('div'); document.body.append(container); const root = createRoot(container); roots.push(root);`
- L23: `const container = document.createElement('div'); const root = createRoot(container); roots.push(root);`

## lcos/huabu/apps/web/src/lcos/navigation/RailwayCollectionPeek.test.tsx

- L2: `import { createRoot, type Root } from 'react-dom/client';`
- L44: `host = document.createElement('div'); document.body.append(host); root = createRoot(host);`

## lcos/huabu/apps/web/src/lcos/navigation/RailwayDestinationSidebar.test.tsx

- L2: `import { createRoot, type Root } from 'react-dom/client';`
- L24: `root = createRoot(host);`

## lcos/huabu/apps/web/src/lcos/navigation/RailwayPeek.test.tsx

- L2: `import { createRoot } from 'react-dom/client';`
- L4: `import { RailwayPeek } from './RailwayPeek';`
- L8: `const roots: ReturnType<typeof createRoot>[] = [];`
- L13: `const host = document.createElement('div'); const root = createRoot(host); roots.push(root);`
- L14: `await act(async () => root.render(<RailwayPeek canvasId="canvas-a" />));`
- L22: `const host = document.createElement('div'); const root = createRoot(host); roots.push(root);`
- L23: `await act(async () => root.render(<RailwayPeek canvasId="canvas-a" />));`

## lcos/huabu/apps/web/src/lcos/navigation/RailwayPeek.tsx

- L6: `export function RailwayPeek({ canvasId }: { readonly canvasId: string }): React.JSX.Element {`

## lcos/huabu/apps/web/src/lcos/navigation/RailwayScopePeek.test.tsx

- L2: `import { createRoot,type Root } from 'react-dom/client';`
- L27: `host=document.createElement('div');document.body.append(host);root=createRoot(host);});`

## lcos/huabu/apps/web/src/lcos/navigation/useAvoidingHudPosition.test.tsx

- L3: `import { createRoot, type Root } from 'react-dom/client';`
- L27: `const el = document.createElement('div'); document.body.append(el); root = createRoot(el);`
- L46: `const el = document.createElement('div'); document.body.append(el); root = createRoot(el);`
- L64: `const el = document.createElement('div'); document.body.append(el); root = createRoot(el);`
- L71: `const el = document.createElement('div'); document.body.append(el); root = createRoot(el);`

## lcos/huabu/apps/web/src/lcos/navigation/__fixtures__/Nav12LocatorFixture.tsx

- L4: `import { createRoot } from 'react-dom/client';`
- L73: `const root = createRoot(document.getElementById('root')!);`

## lcos/huabu/apps/web/src/lcos/navigation/__fixtures__/RailwayReadFixture.tsx

- L3: `import { createRoot } from 'react-dom/client';`
- L16: `if(import.meta.env.DEV){const el=document.getElementById('root');if(el){const root=createRoot(el);root.render(<Fixture/>);import.meta.hot?.dispose(()=>root.unmount());}}`

## lcos/huabu/apps/web/src/lcos/nodes/BoundNodeLoadingBody.test.tsx

- L3: `import { createRoot, type Root } from 'react-dom/client';`
- L13: `host = document.createElement('div'); document.body.append(host); root = createRoot(host); });`

## lcos/huabu/apps/web/src/lcos/nodes/CanvasNodeRenameEntry.test.tsx

- L2: `import { createRoot, type Root } from 'react-dom/client';`
- L18: `const mount=document.createElement('div');host.appendChild(mount);root=createRoot(mount);`

## lcos/huabu/apps/web/src/lcos/nodes/CollectionMemberPreview.test.tsx

- L3: `import { createRoot, type Root } from 'react-dom/client';`
- L21: `host = document.createElement('div'); document.body.append(host); root = createRoot(host);`

## lcos/huabu/apps/web/src/lcos/nodes/CollectionMembersMenu.test.tsx

- L2: `import { createRoot } from 'react-dom/client';`
- L12: `const root = createRoot(host);`
- L34: `const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);`

## lcos/huabu/apps/web/src/lcos/nodes/CollectionMembersMenu.tsx

- L79: `<section role="dialog" aria-label={\`${title}的成员\`} data-lcos-collection-members-panel onPointerDown={(e) => e.stopPropagation()}`

## lcos/huabu/apps/web/src/lcos/nodes/creation/GlythCreationSlot.test.tsx

- L2: `import { createRoot, type Root } from 'react-dom/client';`
- L79: `root = createRoot(host);`

## lcos/huabu/apps/web/src/lcos/nodes/creation/LcosCanvasCreationMenu.test.tsx

- L3: `import { createRoot, type Root } from 'react-dom/client';`
- L33: `host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);`

## lcos/huabu/apps/web/src/lcos/nodes/creation/LcosCanvasCreationMenu.tsx

- L5: `import { createPortal } from 'react-dom';`
- L42: `{host && open && !blocked && createPortal(<div className="lcos-canvas-creation-popover" data-lcos-canvas-creation data-floating-chrome>`

## lcos/huabu/apps/web/src/lcos/nodes/ExecutionNodeBody.tsx

- L36: `if (runId) useLcosShellStore.getState().openWindow('run-review', \`任务 · ${facts?.title ?? '运行'}\`, runId);`

## lcos/huabu/apps/web/src/lcos/nodes/GlythNodeBody.tsx

- L100: `useLcosShellStore.getState().openWindow('conversation', \`会话窗口 · ${title}\`, ref.entityId);`

## lcos/huabu/apps/web/src/lcos/nodes/LcosCanvasTextBody.editState.test.tsx

- L3: `import { createRoot, type Root } from 'react-dom/client';`
- L36: `host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);`

## lcos/huabu/apps/web/src/lcos/nodes/LcosSpeciesBodies.tsx

- L586: `shell.openReader(\`阅读 · ${title}\`, ref.entityId, {`

## lcos/huabu/apps/web/src/lcos/nodes/NodeColorPinMarkers.test.tsx

- L2: `import { createRoot, type Root } from 'react-dom/client';`
- L37: `host = document.createElement('div'); document.body.append(host); root = createRoot(host);`

## lcos/huabu/apps/web/src/lcos/nodes/NodeMaterialCaller.test.tsx

- L3: `import { createRoot, type Root } from 'react-dom/client';`
- L39: `host = document.createElement('div'); document.body.append(host); root = createRoot(host);`

## lcos/huabu/apps/web/src/lcos/nodes/nodeMembershipDropTarget.test.tsx

- L4: `import { createRoot,type Root } from 'react-dom/client';`
- L26: `beforeEach(()=>{host=document.createElement('div');document.body.append(host);root=createRoot(host);`

## lcos/huabu/apps/web/src/lcos/nodes/NodeReferenceMarker.test.tsx

- L2: `import { createRoot, type Root } from 'react-dom/client';`
- L9: `host = document.createElement('div'); document.body.append(host); root = createRoot(host); });`

## lcos/huabu/apps/web/src/lcos/nodes/PortalNodeBody.test.tsx

- L2: `import { createRoot, type Root } from 'react-dom/client';`
- L26: `host = document.createElement('div'); document.body.append(host); root = createRoot(host);`

## lcos/huabu/apps/web/src/lcos/nodes/PortalNodeBody.tsx

- L84: `useLcosShellStore.getState().openWindow('portal-preview', \`入口 · ${title}\`, target, 'canvas', {workspaceId:pinnedWorkspaceId ?? resolvedTarget?.workspaceId,sourceNodeId:input.nodeId});`

## lcos/huabu/apps/web/src/lcos/nodes/source/DocumentSourceBehavior.test.tsx

- L2: `import { createRoot, type Root } from 'react-dom/client';`
- L11: `beforeEach(() => { read.mockReset(); host = document.createElement('div'); document.body.append(host); root = createRoot(host); });`

## lcos/huabu/apps/web/src/lcos/nodes/source/PdfSourcePreview.test.tsx

- L2: `import { createRoot, type Root } from 'react-dom/client';`
- L13: `beforeEach(() => { host = document.createElement('div'); document.body.append(host); root = createRoot(host); });`

## lcos/huabu/apps/web/src/lcos/nodes/source/SourceMediaBehavior.test.tsx

- L2: `import { createRoot, type Root } from 'react-dom/client';`
- L13: `beforeEach(() => { webPreview.mockReset(); host = document.createElement('div'); document.body.append(host); root = createRoot(host); });`

## lcos/huabu/apps/web/src/lcos/nodes/text/LcosTextFaces.test.tsx

- L3: `import { createRoot, type Root } from 'react-dom/client';`
- L18: `host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);`

## lcos/huabu/apps/web/src/lcos/nodes/text/LcosTextFaces.tsx

- L11: `import { MindMapEditor } from './MindMapEditor';`
- L158: `{editingMap && onSaveText && <MindMapEditor title={title} outline={markdown} disabled={disabled} onCancel={() => setEditingMap(false)}`

## lcos/huabu/apps/web/src/lcos/nodes/text/MindMapEditor.test.tsx

- L2: `import { createRoot, type Root } from 'react-dom/client';`
- L5: `import { MindMapEditor } from './MindMapEditor';`
- L14: `host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);`
- L15: `act(() => root.render(<MindMapEditor title="中文根" outline={'- 分支\n  - 子孙\n- 同级'} onSave={save} onCancel={cancel}/>));`
- L39: `expect(document.querySelector('[role="dialog"]')?.textContent).toContain('草稿仍保留');`

## lcos/huabu/apps/web/src/lcos/nodes/text/MindMapEditor.tsx

- L4: `import { createPortal } from 'react-dom'`
- L102: `export function MindMapEditor({ title, outline, disabled = false, onCancel, onSave }: Props) {`
- L239: `return createPortal(<>`
- L241: `<div className="inline-note-editor immersive mindmap-editor" role="dialog" aria-modal="true" aria-label="编辑大纲导图" data-lcos-map-editor`

## lcos/huabu/apps/web/src/lcos/nodes/WorkflowNodeEntry.test.tsx

- L2: `import { createRoot } from 'react-dom/client';`
- L17: `const root = createRoot(host), enter = vi.fn();`

## lcos/huabu/apps/web/src/lcos/pin/ColorPinHud.test.tsx

- L2: `import { createRoot } from 'react-dom/client';`
- L164: `const root = createRoot(host);`
- L211: `const root = createRoot(host);`
- L267: `const root = createRoot(host);`
- L319: `const root = createRoot(host);`
- L349: `expect(document.querySelector('[role="dialog"]')).not.toBeNull();`
- L354: `'[role="dialog"] button',`
- L366: `'[role="dialog"] button',`

## lcos/huabu/apps/web/src/lcos/pin/ColorPinHud.tsx

- L104: `'[data-slot="dropdown-menu-content"],[role="dialog"]',`
- L273: `openWindow('conversation', '会话', conversationId);`

## lcos/huabu/apps/web/src/lcos/pin/ColorPinMemberPreview.test.tsx

- L2: `import { createRoot } from 'react-dom/client';`
- L27: `const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);`

## lcos/huabu/apps/web/src/lcos/pin/LcosColorPinProvider.test.tsx

- L2: `import { createRoot } from 'react-dom/client';`
- L91: `const root = createRoot(host);`
- L115: `const root = createRoot(host);`
- L151: `const root = createRoot(host);`
- L179: `const root = createRoot(host);`

## lcos/huabu/apps/web/src/lcos/professional/ArchiveBody.test.tsx

- L2: `import { createRoot, type Root } from 'react-dom/client';`
- L66: `root = createRoot(host);`

## lcos/huabu/apps/web/src/lcos/professional/ArchiveBody.tsx

- L195: `onClick={() => openReader(artifact.title, String(artifact.id))}`

## lcos/huabu/apps/web/src/lcos/professional/ArtifactReaderBody.test.tsx

- L5: `import { createRoot, type Root } from 'react-dom/client';`
- L142: `const root = createRoot(container);`

## lcos/huabu/apps/web/src/lcos/professional/ArtifactReturnSection.test.tsx

- L4: `import { createRoot, type Root } from 'react-dom/client';`
- L75: `const root = createRoot(container);`
- L166: `useLcosShellStore.getState().openWindow('conversation', '会话', 'c-1');`

## lcos/huabu/apps/web/src/lcos/professional/ArtifactReturnSection.tsx

- L166: `shell.openReader(\`阅读 · ${review.title}\`, review.artifactId!, { revisionId: review.draftRevisionId!,`

## lcos/huabu/apps/web/src/lcos/professional/AssemblyBody.lifecycle.test.tsx

- L2: `import { createRoot, type Root } from 'react-dom/client';`
- L225: `root = createRoot(host);`

## lcos/huabu/apps/web/src/lcos/professional/AssemblyBody.tsx

- L827: `if (workspace.canvasId) { openWindow('portal-preview', \`预览现场 · ${workspace.name}\`, workspace.canvasId, 'canvas', {workspaceId:String(workspace.id)}); }`
- L837: `if (destination.bodyKey === 'reader') useLcosShellStore.getState().openReader(\`${destination.label} · ${item.title}\`, destination.target,`
- L842: `openWindow(destination.bodyKey, \`${destination.label} · ${item.title}\`, destination.target, destination.targetKind,`
- L902: `onClick={() => openWindow('archive', '归档')}><Archive size={15} aria-hidden />查看归档</LcosButton> : null}`
- L973: `{item.resolvedArtifactId && item.resolvedProjectId === projectId ? <LcosButton appearance="oreo" variant="ghost" onClick={() => { if (item.resolvedArtifactId) useLcosShellStore.getState().openReader(title, item.resolvedArtifactId,`

## lcos/huabu/apps/web/src/lcos/professional/AssemblyBody.workflow.test.tsx

- L3: `import { createRoot } from 'react-dom/client';`
- L17: `const roots: ReturnType<typeof createRoot>[] = [];`
- L41: `const host = document.createElement('div'); document.body.append(host); const root = createRoot(host); roots.push(root);`

## lcos/huabu/apps/web/src/lcos/professional/CollectionWorkViewBody.test.tsx

- L2: `import { createRoot, type Root } from 'react-dom/client';`
- L57: `host = document.createElement('div'); document.body.append(host); root = createRoot(host);`

## lcos/huabu/apps/web/src/lcos/professional/CollectionWorkViewBody.tsx

- L109: `shell.openReader(\`阅读 · ${row.label}\`, row.ref.id,`
- L113: `shell.openWindow('conversation', \`会话 · ${row.label}\`, row.ref.id);`
- L116: `shell.openWindow('run-review', \`任务 · ${row.label}\`, row.ref.id);`
- L119: `shell.openWindow('collection', \`集合 · ${row.label}\`, row.ref.id);`

## lcos/huabu/apps/web/src/lcos/professional/ConversationContinuationControls.test.tsx

- L2: `import { createRoot, type Root } from 'react-dom/client';`
- L87: `const root = createRoot(el); roots.push(root);`

## lcos/huabu/apps/web/src/lcos/professional/ConversationContinuationControls.tsx

- L177: `<button type="button" data-lcos-open-request-status onClick={() => useLcosShellStore.getState().openWindow('conversation', '会话请求', conversationId)}>查看原请求</button>`
- L190: `onClick={() => useLcosShellStore.getState().openWindow('conversation', '会话恢复', conversationId)}>`

## lcos/huabu/apps/web/src/lcos/professional/ConversationWorkViewBody.test.tsx

- L2: `import { createRoot, type Root } from 'react-dom/client';`
- L147: `const root = createRoot(container);`
- L189: `const root = createRoot(host);`

## lcos/huabu/apps/web/src/lcos/professional/ConversationWorkViewBody.tsx

- L276: `useLcosShellStore.getState().openReader(\`阅读 · ${title}\`, artifactId,`

## lcos/huabu/apps/web/src/lcos/professional/NativeWorkspaceBody.test.tsx

- L2: `import { createRoot } from 'react-dom/client';`
- L20: `const root = createRoot(host);`

## lcos/huabu/apps/web/src/lcos/professional/NativeWorkspaceBody.tsx

- L10: `* ProfessionalWindowStage remains the sole outer window/geometry owner. */`

## lcos/huabu/apps/web/src/lcos/professional/PortalPreviewBody.test.tsx

- L2: `import { createRoot, type Root } from 'react-dom/client';`
- L28: `host = document.createElement('div'); document.body.append(host); root = createRoot(host);`

## lcos/huabu/apps/web/src/lcos/professional/ProfessionalWindowStage.test.tsx

- L2: `import { createRoot, type Root } from 'react-dom/client';`
- L8: `import { ProfessionalWindowStage } from './ProfessionalWindowStage';`
- L79: `host = document.createElement('div'); document.body.append(host); root = createRoot(host);`
- L101: `if (withConversationOwner) store.openWindow('conversation', '施工纪律', 'conversation-a');`
- L114: `if (withIndependentReader) store.openReader('无关材料', 'artifact-independent');`
- L146: `store.openReader('独立材料 Reader', 'artifact-independent');`
- L147: `store.openWindow('assembly', '独立 Assembly');`
- L149: `store.openReader('Reader · 本次引用', 'artifact-composer-reader', {`
- L254: `store.openWindow('reader', '材料 A', 'artifact-a');`
- L255: `store.openWindow('reader', '材料 B', 'artifact-b');`
- L256: `await act(async () => root.render(<ProfessionalWindowStage projectId="p" />));`
- L275: `useLcosShellStore.getState().openReader('阅读 · 指定版本', 'artifact-target', {`
- L279: `await act(async () => root.render(<ProfessionalWindowStage projectId="p" />));`
- L291: `store.openReader('材料 A', 'artifact-a', {`
- L296: `await act(async () => root.render(<ProfessionalWindowStage projectId="p" />));`
- L306: `store.openReader('材料 A', 'artifact-a', {`
- L320: `await act(async () => root.render(<ProfessionalWindowStage projectId="p" />));`
- L332: `await act(async () => root.render(<ProfessionalWindowStage projectId="p" />));`
- L347: `await act(async () => root.render(<ProfessionalWindowStage projectId="p" />));`
- L356: `await act(async () => root.render(<ProfessionalWindowStage projectId="p" />));`
- L366: `await act(async () => root.render(<ProfessionalWindowStage projectId="p" />));`
- L381: `await act(async () => root.render(<ProfessionalWindowStage projectId="p" />));`
- L399: `await act(async () => root.render(<ProfessionalWindowStage projectId="other-project" />));`
- L411: `store.openWindow('conversation', '会话', 'conversation-a');`
- L414: `await act(async () => root.render(<ProfessionalWindowStage projectId="p" />));`
- L424: `store.openWindow('conversation', '会话 B', 'b');`
- L426: `await act(async () => root.render(<ProfessionalWindowStage projectId="p" />));`
- L433: `store.openWindow('portal-preview', '入口', 'canvas-target', 'canvas', {workspaceId:'workspace-target',sourceNodeId:'portal-node'});`
- L436: `<ProfessionalWindowStage`
- L455: `store.openWindow('reader', '材料 A', 'artifact-a');`
- L456: `store.openWindow('reader', '材料 B', 'artifact-b');`
- L458: `await act(async () => root.render(<ProfessionalWindowStage projectId="p" />));`
- L477: `useLcosShellStore.getState().openReader('材料 A', 'artifact-a');`
- L479: `await act(async () => root.render(<ProfessionalWindowStage projectId="p" />));`
- L489: `store.openReader('材料 A', 'artifact-a');`
- L490: `store.openReader('材料 B', 'artifact-b');`
- L494: `await act(async () => root.render(<ProfessionalWindowStage projectId="p" />));`
- L508: `store.openReader('材料 A', 'artifact-a', { revisionId: 'revision-a' });`
- L509: `store.openReader('材料 B', 'artifact-b', { revisionId: 'revision-b' });`
- L513: `await act(async () => root.render(<ProfessionalWindowStage projectId="p" />));`
- L529: `store.openWindow('reader', '材料 A', 'artifact-a');`
- L533: `await act(async () => root.render(<ProfessionalWindowStage projectId="p" />));`
- L555: `useLcosShellStore.getState().openWindow('reader', '材料', 'a');`
- L556: `await act(async () => root.render(<ProfessionalWindowStage projectId="p" />));`
- L568: `useLcosShellStore.getState().openWindow('assembly', '装配');`
- L569: `await act(async () => root.render(<ProfessionalWindowStage projectId="p" />));`
- L584: `useLcosShellStore.getState().openWindow('assembly', '装配');`
- L585: `await act(async () => root.render(<ProfessionalWindowStage projectId="p" />));`
- L602: `store.openWindow('assembly', '装配');`
- L603: `await act(async () => root.render(<ProfessionalWindowStage projectId="p" />));`
- L616: `await act(async () => root.render(<ProfessionalWindowStage projectId="p" />));`
- L627: `await act(async () => root.render(<ProfessionalWindowStage projectId="p" />));`
- L638: `await act(async () => root.render(<ProfessionalWindowStage projectId="p" />));`
- L647: `await act(async () => root.render(<ProfessionalWindowStage projectId="p" />));`
- L658: `await act(async () => root.render(<ProfessionalWindowStage projectId="p" />));`
- L668: `useLcosShellStore.getState().openWindow('reader', '材料', 'a');`
- L669: `await act(async () => root.render(<ProfessionalWindowStage projectId="p" />));`
- L678: `store.openReader('材料 A', 'artifact-a');`
- L679: `store.openReader('材料 A2', 'artifact-a2');`
- L681: `store.openReader('材料 B', 'artifact-b');`
- L694: `await act(async () => root.render(<ProfessionalWindowStage projectId="p" />));`
- L712: `store.openWindow('reader', '材料 A', 'artifact-a');`
- L716: `await act(async () => root.render(<ProfessionalWindowStage projectId="p" />));`
- L729: `useLcosShellStore.getState().openReader('历史版本', 'artifact-a', { revisionId: 'old' });`
- L730: `await act(async () => root.render(<ProfessionalWindowStage projectId="p" />));`
- L737: `store.openReader('A', 'artifact-a'); store.openReader('B', 'artifact-b');`
- L741: `await act(async () => root.render(<ProfessionalWindowStage projectId="p" />));`
- L760: `store.openReader('A', 'artifact-a', { revisionId: 'revision-a' });`
- L761: `store.openReader('B', 'artifact-b', { revisionId: 'revision-b' });`
- L766: `await act(async () => root.render(<ProfessionalWindowStage projectId="p" />));`
- L800: `store.openReader('A', 'artifact-a', { revisionId: 'revision-a' });`
- L801: `store.openReader('B', 'artifact-b', { revisionId: 'revision-b' });`
- L808: `await act(async () => root.render(<ProfessionalWindowStage projectId="p" />));`
- L829: `store.openReader('A', 'artifact-a', { revisionId: 'revision-a' });`
- L830: `store.openReader('B', 'artifact-b', { revisionId: 'revision-b' });`
- L836: `await act(async () => root.render(<ProfessionalWindowStage projectId="p" />));`
- L855: `shell.openReader('引用材料', 'artifact-a', { composerOriginKey: origin });`

## lcos/huabu/apps/web/src/lcos/professional/ProfessionalWindowStage.tsx

- L1: `// ProfessionalWindowStage — route-level 专业窗口舞台（Figma window 5388:27165 / Chrome 5387:331）。`
- L73: `export interface ProfessionalWindowStageProps {`
- L152: `export function ProfessionalWindowStage({ projectId, resolvePortalTarget, onOpenPortalTarget }: ProfessionalWindowStageProps): React.JSX.Element {`

## lcos/huabu/apps/web/src/lcos/professional/ReaderLineageActions.test.tsx

- L3: `import { createRoot } from 'react-dom/client';`
- L11: `const roots: ReturnType<typeof createRoot>[] = [];`
- L15: `useLcosShellStore.getState().openReader('当前摘取材料', 'derived', { revisionId: 'derived-old' });`
- L28: `const host = document.createElement('div'); document.body.append(host); const root = createRoot(host); roots.push(root);`

## lcos/huabu/apps/web/src/lcos/professional/ReaderLineageActions.tsx

- L44: `shell.openReader(\`来源 · ${fresh.title}\`, fresh.artifactId, { revisionId: fresh.revisionId,`

## lcos/huabu/apps/web/src/lcos/professional/ReaderSourceActions.test.tsx

- L2: `import { createRoot } from 'react-dom/client';`
- L8: `const roots: ReturnType<typeof createRoot>[] = [];`
- L13: `const host = document.createElement('div'); document.body.append(host); const root = createRoot(host); roots.push(root);`

## lcos/huabu/apps/web/src/lcos/professional/RecoverySection.test.tsx

- L2: `import { createRoot } from 'react-dom/client';`
- L25: `const host=document.createElement('div');document.body.append(host);const root=createRoot(host);`

## lcos/huabu/apps/web/src/lcos/professional/RetainedReaderBody.tsx

- L2: `import { createPortal } from 'react-dom';`
- L34: `return createPortal(`

## lcos/huabu/apps/web/src/lcos/professional/RuntimeDoctorBody.test.tsx

- L2: `import { createRoot, type Root } from 'react-dom/client';`
- L13: `container = document.createElement('div'); document.body.append(container); root = createRoot(container);`

## lcos/huabu/apps/web/src/lcos/professional/RunWorkViewBody.test.tsx

- L2: `import { createRoot, type Root } from 'react-dom/client';`
- L31: `host = document.createElement('div'); document.body.append(host); root = createRoot(host);`

## lcos/huabu/apps/web/src/lcos/professional/RunWorkViewBody.tsx

- L97: `shell.openReader('结果材料', artifactId, { ...(revisionId ? { revisionId } : {}),`
- L138: `<LcosButton appearance="oreo" variant="secondary" type="button" onClick={() => openReader(String(item.targetArtifactId), item.draftRevisionId === undefined ? undefined : String(item.draftRevisionId))}>查看材料</LcosButton>`
- L144: `{nextRunId && <LcosButton appearance="oreo" variant="secondary" type="button" onClick={() => useLcosShellStore.getState().openWindow('run-review', '重试任务', nextRunId)}>打开重试任务</LcosButton>}`

## lcos/huabu/apps/web/src/lcos/professional/useWarehouseBrowse.test.tsx

- L2: `import { createRoot } from 'react-dom/client';`
- L18: `let root = createRoot(host);`
- L23: `afterEach(async () => { await act(async () => root.unmount()); root = createRoot(host); });`

## lcos/huabu/apps/web/src/lcos/professional/WaitingInputSection.test.tsx

- L2: `import { createRoot } from 'react-dom/client';`
- L15: `const host = document.createElement('div'); const root = createRoot(host);`
- L28: `const host = document.createElement('div'); const root = createRoot(host);`

## lcos/huabu/apps/web/src/lcos/shell/LcosCanvasCapabilities.test.tsx

- L2: `import { createRoot, type Root } from 'react-dom/client';`
- L29: `host = document.createElement('div'); document.body.append(host); root = createRoot(host);`
- L76: `await act(async () => useLcosShellStore.getState().openReader('正文', 'material-a'));`

## lcos/huabu/apps/web/src/lcos/shell/LcosCanvasCapabilities.tsx

- L27: `shell.openWindow('native-workspace', '画布助手与预览');`
- L53: `{ id: 'runtime-doctor', title: '运行诊断', keywords: '诊断 连接恢复 doctor runtime', run: () => useLcosShellStore.getState().openWindow('runtime-doctor','运行诊断') },`
- L54: `{ id: 'archive', title: '查看项目归档', keywords: 'archive 历史 归档', run: () => useLcosShellStore.getState().openWindow('archive','项目归档') },`
- L71: `run:()=>useLcosShellStore.getState().openReader(\`阅读 · ${selectedRef.descriptor?.title??selectedRef.displayLabel??'当前材料'}\`,selectedRef.entityId,`

## lcos/huabu/apps/web/src/lcos/shell/LcosProjectShell.project.test.tsx

- L2: `import { createRoot } from 'react-dom/client';`
- L24: `vi.mock('../professional/ProfessionalWindowStage', () => ({ ProfessionalWindowStage: ({ projectId }: { projectId: string }) => {`
- L34: `shell.openWindow('reader', 'A', 'artifact-a');`
- L38: `const root = createRoot(host);`
- L71: `const root = createRoot(host);`
- L101: `const root = createRoot(host);`

## lcos/huabu/apps/web/src/lcos/shell/LcosProjectShell.tsx

- L28: `import { ProfessionalWindowStage } from '../professional/ProfessionalWindowStage';`
- L314: `<ProfessionalWindowStage`

## lcos/huabu/apps/web/src/lcos/shell/LcosProjectSystemMenu.test.tsx

- L2: `import { createRoot, type Root } from 'react-dom/client';`
- L21: `root = createRoot(host);`

## lcos/huabu/apps/web/src/lcos/shell/LcosProjectSystemMenu.tsx

- L44: `<div ref={panel} role="dialog" aria-label="项目菜单" className="lcos-system-panel lcos-project-system-menu">`
- L49: `<button type="button" className="lcos-system-row" onClick={() => { close(); useLcosShellStore.getState().openWindow('runtime-doctor', '运行诊断'); }}>`

## lcos/huabu/apps/web/src/lcos/shell/LcosRailway.keyboard.test.tsx

- L3: `import { createRoot } from 'react-dom/client';`
- L25: `vi.mock('../navigation/RailwayPeek',()=>({RailwayPeek:()=><div>预览测试端口</div>}));`
- L26: `const roots:ReturnType<typeof createRoot>[]=[];`
- L39: `async function mount(activateDestination:(destination:RailwayDestinationV1)=>Promise<void>|void=()=>{},ensureWorkspaceCanvas:(workspaceId:string)=>Promise<string|undefined>=async()=>undefined){const host=document.createElement('div');document.body.append(host)`

## lcos/huabu/apps/web/src/lcos/shell/LcosRailway.projectSpaces.test.tsx

- L2: `import { createRoot } from 'react-dom/client';`
- L26: `const roots: ReturnType<typeof createRoot>[] = [];`
- L57: `const host = document.createElement('div'); document.body.append(host); const root = createRoot(host); roots.push(root);`

## lcos/huabu/apps/web/src/lcos/shell/LcosRailway.tsx

- L34: `import { RailwayPeek } from '../navigation/RailwayPeek';`
- L320: `openWindow('conversation',\`会话窗口 · ${target.label}\`,target.ref.connectedConversationId);`
- L548: `<div data-lcos-railway-overflow data-lcos-railway-receive-map={receiveOverflowOpen||undefined} role="dialog" aria-label={receiveOverflowOpen?'更多可接收空间':'更多项目空间'}`
- L570: `onClick={()=>openWindow('conversation',\`会话窗口 · ${receiver.label}\`,receiver.id)}>`
- L600: `<section role="dialog" data-popover-dismiss-ignore={focused!==undefined||undefined} aria-label={addOpen?'添加与创建':\`${focused?.label} 目的地预览\`}`
- L622: `{focused.canvasId&&focused.available ? <RailwayPeek canvasId={focused.canvasId}/>`

## lcos/huabu/apps/web/src/lcos/shell/LcosSurfaceDock.drop.test.tsx

- L2: `import { createRoot } from 'react-dom/client';`
- L23: `const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);`

## lcos/huabu/apps/web/src/lcos/shell/LcosWorksiteStage.test.tsx

- L2: `import { createRoot } from 'react-dom/client';`
- L57: `const root = createRoot(host);`
- L78: `const root = createRoot(host);`

## lcos/huabu/apps/web/src/lcos/shell/RailwayCreateContextForm.test.tsx

- L2: `import { createRoot, type Root } from 'react-dom/client';`
- L25: `root = createRoot(host);`

## lcos/huabu/apps/web/src/lcos/surfaces/context/ContextAtlasDropCard.test.tsx

- L2: `import { createRoot } from 'react-dom/client';`
- L14: `const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);`
- L50: `const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);`

## lcos/huabu/apps/web/src/lcos/surfaces/context/ContextAtlasStage.request.test.tsx

- L2: `import { createRoot } from 'react-dom/client';`
- L5: `import { ContextAtlasStage } from './ContextAtlasStage';`
- L95: `const root = createRoot(host);`
- L97: `<ContextAtlasStage`
- L113: `describe('ContextAtlasStage warehouse ownership', () => {`
- L334: `<ContextAtlasStage`
- L374: `<ContextAtlasStage`
- L441: `const root = createRoot(host);`

## lcos/huabu/apps/web/src/lcos/surfaces/context/ContextAtlasStage.tsx

- L1: `// ContextAtlasStage — Context 现场强表征（Figma atlas 5388:24294 / 集合 5333:96 六变体）。`
- L42: `export interface ContextAtlasStageProps {`
- L54: `export function ContextAtlasStage({ projectId, workspaces, currentContextId, mode = 'context', onClose, onEnterSurface, onReadMember }: ContextAtlasStageProps): React.JSX.Element {`

## lcos/huabu/apps/web/src/lcos/surfaces/context/ContextWorksite.navigation.test.tsx

- L2: `import { createRoot, type Root } from 'react-dom/client';`
- L24: `vi.mock('./ContextAtlasStage', () => ({ ContextAtlasStage: ({ onEnterSurface }: { onEnterSurface: (item: WarehouseItemV1) => boolean | Promise<boolean> }) => <button data-atlas-enter onClick={() => { void Promise.resolve(onEnterSurface(m.item)).then(m.entered)`
- L32: `const root = createRoot(el); roots.push(root);`

## lcos/huabu/apps/web/src/lcos/surfaces/context/ContextWorksite.tsx

- L9: `import { ContextAtlasStage } from './ContextAtlasStage';`
- L143: `<ContextAtlasStage`

## lcos/huabu/apps/web/src/lcos/surfaces/context/TemporalPreviewOutlines.tsx

- L3: `import { createPortal } from 'react-dom';`
- L39: `return createPortal(<>{previewNodes.map((node) => {`

## lcos/huabu/apps/web/src/lcos/surfaces/context/TemporalRail.continuity.test.tsx

- L2: `import { createRoot, type Root } from 'react-dom/client';`
- L42: `host = document.createElement('div'); document.body.append(host); root = createRoot(host);`

## lcos/huabu/apps/web/src/lcos/surfaces/context/TemporalRail.request.test.tsx

- L2: `import { createRoot } from 'react-dom/client';`
- L15: `const host = document.createElement('div'); const root = createRoot(host);`
- L27: `const host = document.createElement('div'); const root = createRoot(host);`

## lcos/huabu/apps/web/src/lcos/surfaces/main/MainCollectionAtlas.test.tsx

- L3: `import { createRoot } from 'react-dom/client';`
- L22: `vi.mock('../context/ContextAtlasStage', () => ({ ContextAtlasStage: ({ mode, onEnterSurface, onReadMember }: { mode: string; onEnterSurface: (item: WarehouseItemV1) => boolean; onReadMember?: (collectionId: string, member: never) => void }) => <div data-mode={`
- L27: `const roots: ReturnType<typeof createRoot>[] = [];`
- L38: `const host = document.createElement('div'); document.body.append(host); const root = createRoot(host); roots.push(root);`
- L50: `const host = document.createElement('div'); document.body.append(host); const root = createRoot(host); roots.push(root);`
- L57: `const host = document.createElement('div'); document.body.append(host); const root = createRoot(host); roots.push(root);`
- L68: `const host = document.createElement('div'); document.body.append(host); const root = createRoot(host); roots.push(root);`

## lcos/huabu/apps/web/src/lcos/surfaces/main/MainCollectionAtlas.tsx

- L7: `import { ContextAtlasStage } from '../context/ContextAtlasStage';`
- L41: `shell.openReader(member.label, member.id, Object.keys(options).length > 0 ? options : undefined);`
- L43: `return <ContextAtlasStage mode="main-collections" projectId={projectId} workspaces={[]}`

## lcos/huabu/apps/web/src/lcos/surfaces/workflow/WorkflowCardPool.navigation.test.tsx

- L2: `import { createRoot, type Root } from 'react-dom/client';`
- L90: `const el = document.createElement('div'); document.body.append(el); const root = createRoot(el); roots.push(root);`
- L96: `const el = document.createElement('div'); document.body.append(el); const root = createRoot(el); roots.push(root);`

## lcos/huabu/apps/web/src/lcos/surfaces/workflow/WorkflowWorksite.tsx

- L16: `import { WorkflowHandView } from '../../ui/workflow/WorkflowHandView';`
- L52: `<WorkflowHandView key={projectId} open={open} onClose={onClose} nativeAssemblyDropActive={nativeAssemblyDropActive} header={<>`
- L59: `</WorkflowHandView>`

## lcos/huabu/apps/web/src/lcos/ui/families/lcosFamilies.test.tsx

- L5: `import { createRoot, type Root } from 'react-dom/client';`
- L25: `const root = createRoot(container);`

## lcos/huabu/apps/web/src/lcos/ui/families/LcosRailwayView.receive.test.tsx

- L2: `import { createRoot } from 'react-dom/client';`
- L9: `const root = createRoot(host);`

## lcos/huabu/apps/web/src/lcos/ui/families/LcosSurfaceDockView.test.tsx

- L2: `import { createRoot, type Root } from 'react-dom/client';`
- L15: `host = document.createElement('div'); document.body.append(host); root = createRoot(host);`

## lcos/huabu/apps/web/src/lcos/ui/families/LcosWindowChrome.tsx

- L8: `// body 不拥有窗口位置：拓扑（浮动/停靠/分组）由 ProfessionalWindowStage 决定，本组件只呈现顶栏。`

## lcos/huabu/apps/web/src/lcos/ui/glyth/GlythBodyView.test.tsx

- L2: `import { createRoot } from 'react-dom/client';`
- L16: `const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);`
- L31: `const host = document.createElement('div'); const root = createRoot(host);`

## lcos/huabu/apps/web/src/lcos/ui/nearfield/LcosActionOrbView.test.tsx

- L2: `import { createRoot } from 'react-dom/client';`
- L12: `const root = createRoot(host);`
- L35: `const root = createRoot(host);`

## lcos/huabu/apps/web/src/lcos/ui/nearfield/LcosComposerView.test.tsx

- L2: `import { createRoot } from 'react-dom/client';`
- L26: `root = createRoot(host);`

## lcos/huabu/apps/web/src/lcos/ui/primitives/LcosControls.test.tsx

- L3: `import { createRoot } from 'react-dom/client';`
- L18: `root = createRoot(host);`

## lcos/huabu/apps/web/src/lcos/ui/primitives/LcosInlinePeek.tsx

- L49: `const modal = document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]');`

## lcos/huabu/apps/web/src/lcos/ui/professional/AssemblyItemView.primaryAction.test.tsx

- L2: `import { createRoot, type Root } from 'react-dom/client';`
- L13: `root = createRoot(host);`

## lcos/huabu/apps/web/src/lcos/ui/professional/PackageDisclosure.test.tsx

- L2: `import { createRoot, type Root } from 'react-dom/client';`
- L7: `beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); host = document.createElement('div'); document.body.append(host); root = createRoot(host); });`

## lcos/huabu/apps/web/src/lcos/ui/professional/ProfessionalViews.test.tsx

- L2: `import { createRoot } from 'react-dom/client';`
- L15: `const mounted: { root: ReturnType<typeof createRoot>; host: HTMLDivElement }[] = [];`
- L19: `const root = createRoot(host);`

## lcos/huabu/apps/web/src/lcos/ui/professional/ReaderContentTabsView.test.tsx

- L3: `import { createRoot } from 'react-dom/client';`
- L19: `root = createRoot(host);`

## lcos/huabu/apps/web/src/lcos/ui/professional/ReaderFormatContent.test.tsx

- L2: `import { createRoot } from 'react-dom/client';`
- L15: `const roots: ReturnType<typeof createRoot>[] = [];`
- L19: `const root = createRoot(host); roots.push(root); const ready = vi.fn();`

## lcos/huabu/apps/web/src/lcos/ui/professional/ReaderMediaInfoView.test.tsx

- L2: `import { createRoot, type Root } from 'react-dom/client';`
- L11: `host = document.createElement('div'); document.body.append(host); root = createRoot(host);`

## lcos/huabu/apps/web/src/lcos/ui/professional/ReaderPdfView.test.tsx

- L2: `import { createRoot } from 'react-dom/client';`
- L28: `const roots: ReturnType<typeof createRoot>[] = [];`
- L35: `const host = document.createElement('div'); document.body.append(host); const root = createRoot(host); roots.push(root); const ready = vi.fn(), retry = vi.fn();`

## lcos/huabu/apps/web/src/lcos/ui/professional/ReaderPptxView.test.tsx

- L2: `import { createRoot } from 'react-dom/client';`
- L9: `const roots: ReturnType<typeof createRoot>[] = [];`
- L13: `const root = createRoot(host); roots.push(root);`

## lcos/huabu/apps/web/src/lcos/ui/professional/ReaderScrollProgress.test.tsx

- L2: `import { createRoot, type Root } from 'react-dom/client';`
- L26: `root = createRoot(host);`

## lcos/huabu/apps/web/src/lcos/ui/professional/ReaderTextFeatures.test.tsx

- L2: `import { createRoot, type Root } from 'react-dom/client';`
- L14: `host = document.createElement('div'); document.body.append(host); root = createRoot(host);`

## lcos/huabu/apps/web/src/lcos/ui/professional/TapnowComponentActions.test.tsx

- L2: `import { createRoot, type Root } from 'react-dom/client';`
- L8: `beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true); host=document.createElement('div'); document.body.append(host); root=createRoot(host); });`

## lcos/huabu/apps/web/src/lcos/ui/source/ImageSourceView.test.tsx

- L2: `import { createRoot, type Root } from 'react-dom/client';`
- L7: `beforeEach(() => { host = document.createElement('div'); document.body.append(host); root = createRoot(host); });`

## lcos/huabu/apps/web/src/lcos/ui/source/SourceViews.test.tsx

- L2: `import { createRoot } from 'react-dom/client';`
- L14: `const root = createRoot(host);`
- L30: `const host = document.createElement('div'); const root = createRoot(host);`
- L39: `const host = document.createElement('div'); const root = createRoot(host);`

## lcos/huabu/apps/web/src/lcos/ui/spatial/Stage6Presentation.test.tsx

- L4: `import { createRoot } from 'react-dom/client';`
- L28: `root = createRoot(host);`

## lcos/huabu/apps/web/src/lcos/ui/spatial/useLayerReturnFocus.test.tsx

- L2: `import { createRoot, type Root } from 'react-dom/client';`
- L11: `document.body.append(opener, host); opener.focus(); root = createRoot(host);`

## lcos/huabu/apps/web/src/lcos/ui/stage4PresentationContracts.test.tsx

- L2: `import { createRoot } from 'react-dom/client';`
- L13: `const root = createRoot(host);`

## lcos/huabu/apps/web/src/lcos/ui/workflow/WorkflowHandView.tsx

- L10: `export interface WorkflowHandViewProps {`
- L18: `function HandLayer({ header, children, onClose, nativeAssemblyDropActive = false }: Omit<WorkflowHandViewProps, 'open'>): React.JSX.Element {`
- L49: `export function WorkflowHandView({ open, header, children, onClose, nativeAssemblyDropActive = false }: WorkflowHandViewProps): React.JSX.Element {`

## lcos/huabu/apps/web/src/lcos/ui/workflow/WorkflowTaskCardView.test.tsx

- L2: `import { createRoot } from 'react-dom/client';`
- L25: `root = createRoot(host);`

## lcos/huabu/apps/web/src/lcos/useLcosCanvasProps.project.test.tsx

- L2: `import { createRoot, type Root } from 'react-dom/client';`
- L168: `root = createRoot(host);`
- L197: `root = createRoot(host);`
- L219: `host = document.createElement('div'); root = createRoot(host);`
- L234: `useLcosReferenceStore.getState().setProject('project-a'); host = document.createElement('div'); root = createRoot(host);`
- L250: `host = document.createElement('div'); root = createRoot(host);`

## lcos/huabu/apps/web/src/main.tsx

- L35: `const root = ReactDOM.createRoot(rootElement);`

## lcos/huabu/apps/web/src/pages/CanvasListPage.test.tsx

- L5: `import { createRoot, type Root } from 'react-dom/client';`
- L99: `root = createRoot(container);`

## lcos/huabu/apps/web/src/pages/CanvasPage/CanvasPage.test.tsx

- L6: `import { createRoot } from 'react-dom/client';`
- L66: `const roots: ReturnType<typeof createRoot>[] = [];`
- L87: `const root = createRoot(host);`

## lcos/huabu/apps/web/src/pages/CanvasPage/MainLayout.test.tsx

- L5: `import { createRoot, type Root } from 'react-dom/client';`
- L68: `root = createRoot(container);`

## lcos/scripts/e2e/gui-stage7/scene.tsx

- L5: `import { createRoot } from 'react-dom/client';`
- L8: `import { WorkflowHandView } from '/src/lcos/ui/workflow/WorkflowHandView';`
- L50: `{pane==='hand' ? <WorkflowHandView open={hand} header={<><span>工作流</span><button className="lcos-workflow-hand-close" aria-label="收回手牌" onClick={()=>setHand(false)}>×</button></>}>`
- L52: `</WorkflowHandView> : null}`
- L57: `createRoot(document.getElementById('root')!).render(<StrictMode><Scene/></StrictMode>);`
