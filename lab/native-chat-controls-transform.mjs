// Extract controlled views from the installed owner. Domain readers and cloud
// mutations are deliberately outside these components, not stubbed as success.
import { nativeLightClassNames } from './native-light-theme-transform.mjs';

export function nativeChatControlledViews(program, source) {
  const walk = (node, visit) => {
    if (!node || typeof node.type !== 'string') return;
    visit(node);
    for (const [key, value] of Object.entries(node)) {
      if (['loc', 'tokens', 'comments'].includes(key)) continue;
      if (Array.isArray(value)) value.forEach(child => walk(child, visit)); else if (value?.type) walk(value, visit);
    }
  };
  const one = (root, predicate, label) => {
    const found = []; walk(root, node => { if (predicate(node)) found.push(node); });
    if (found.length !== 1) throw new Error(`Native chat controlled ${label} changed (${found.length}).`);
    return found[0];
  };
  const declaration = name => one(program, node => node.type === 'VariableDeclarator' && node.id?.name === name, name);
  const slice = node => source.slice(node.start, node.end);
  const property = (object, name) => object?.properties?.find(p => (p.key?.name ?? p.key?.value) === name);
  const props = call => call.arguments?.[1];
  const children = call => property(props(call), 'children')?.value;
  const call = (node, name) => node.type === 'CallExpression' && node.arguments?.[0]?.name === name;
  const original = name => declaration(name).init;
  const returned = fn => fn.body.body.findLast(node => node.type === 'ReturnStatement').argument;
  const edit = (root, changes) => {
    let text = slice(root), end = root.end;
    for (const change of changes.sort((a, b) => b.start - a.start || b.end - a.end)) {
      if (change.end > end) throw new Error('Native chat controlled edits overlap.');
      text = text.slice(0, change.start - root.start) + change.text + text.slice(change.end - root.start); end = change.start;
    }
    return text;
  };
  const change = (node, text) => ({ start: node.start, end: node.end, text });
  const addProps = (node, text) => ({ start: props(node).end - 1, end: props(node).end - 1, text: ',' + text });

  // wM owns both title/history menu state and focus suppression. xM is its
  // side-panel button; Rp owns the menu portal/keyboard/rename view.
  const side = original('xM');
  const sideButton = one(side, node => call(node, 'en'), 'side tooltip');
  const sideNativeButton = one(side, node => node.type === 'CallExpression' && node.arguments?.[0]?.value === 'button', 'side button');
  const sideCode = edit(side, [
    { start: side.params[0].end - 1, end: side.params[0].end - 1, text: ',label:LCOSLabel' },
    change(property(props(sideButton), 'content').value, 'LCOSLabel??d("chatAdapter.tooltips.sidePanel","Side panel")'),
    addProps(sideNativeButton, '"aria-label":LCOSLabel'),
  ]);

  const history = original('Rp'), historyRoot = returned(history), historyEdits = [];
  const historyContent = one(historyRoot, node => call(node, 'Io'), 'history content');
  const contentChildren = children(historyContent);
  // Keep the native create row and list. The donor's separate legacy store is
  // not a Core conversation archive and must never be mounted here.
  const secondary = contentChildren.elements[1];
  const newEntry = contentChildren.elements[0].consequent;
  const labelSpan = one(newEntry, node => node.type === 'CallExpression' && node.arguments?.[0]?.value === 'span', 'new entry label');
  historyEdits.push(change(children(labelSpan), 'LCOSNewLabel'));
  const assistantEntry = edit(newEntry, [
    change(property(props(newEntry), 'onClick').value, '()=>{LCOSAssistant();me()}'),
    change(children(labelSpan), '"画布助手"'),
  ]);
  historyEdits.push(change(secondary, `LCOSAssistant?${assistantEntry}:null`));
  const deleteButton = one(historyRoot, node => node.type === 'CallExpression'
    && property(props(node), 'aria-label')?.value?.value === 'delete conversation', 'history delete');
  historyEdits.push(change(deleteButton, `LCOSDelete?${slice(deleteButton)}:null`));
  const emptyLabel = one(historyRoot, node => node.type === 'CallExpression' && node.callee?.name === 'u'
    && node.arguments?.[0]?.value === 'chatAdapter.conversation.noHistory', 'empty history');
  historyEdits.push(change(emptyLabel, 'LCOSState==="error"?"暂时无法读取对话，请重新读取。":u("chatAdapter.conversation.noHistory")'));
  const actionRow = edit(newEntry, [
    change(property(props(newEntry), 'onClick').value, '()=>{action.onSelect();me()}'),
    change(children(labelSpan), 'action.label'),
    change(children(newEntry).elements[0], 'action.icon??null'),
    addProps(newEntry, 'disabled:action.disabled===true,"aria-label":action.label'),
    { start: newEntry.end - 1, end: newEntry.end - 1, text: ',action.id' },
  ]);
  historyEdits.push({ start: contentChildren.end - 1, end: contentChildren.end - 1,
    text: `,...LCOSActions.map(action=>${actionRow})` });
  historyEdits.push(addProps(historyContent, '"data-lcos-native-chat-history":true'));
  const historyRender = edit(historyRoot, historyEdits);
  const historyCode = `function LCOSNativeChatHistory({onSelectConversation:e,onConversationDeleted:t,onRenameConversation:n,
activeSessionId:s,open:r,onOpenChange:i,trigger:c,onNewConversation:l,align:d="start",entries:LCOSItems=[],
state:LCOSState="ready",actions:LCOSActions=[],onCanvasAssistant:LCOSAssistant,newConversationLabel:LCOSNewLabel="新建对话…",onDeleteConversation:LCOSDelete}){
const{t:u}=Ce(),m=r,[p,g]=a.useState(null),[X,W]=a.useState(null),[U,$]=a.useState(""),Q=a.useRef(""),G=a.useRef(false),[de,D]=a.useState({}),te=a.useRef(null),L=a.useRef(null);
const x=[],_=false,N=false,I=false,k=false,J=false,oe=s,ce=LCOSItems.find(row=>row.id===s)?.title,Ie=false,q=null,ke=null,be=()=>{},ee=()=>{},S=()=>{},
ot=LCOSItems.map(row=>({id:row.id,title:row.title,updated_at:row.updatedAt})),Qe=LCOSState==="loading",me=a.useCallback(()=>i(false),[i]);
a.useEffect(()=>{X&&te.current&&(te.current.focus(),te.current.select())},[X]);a.useEffect(()=>{r||W(null)},[r]);
const tt=row=>de[row.id]||(row.id===oe&&ce?.trim()?ce.trim():row.title||u("chatAdapter.conversation.untitled")),
Ge=(event,row)=>{event.preventDefault();event.stopPropagation();Q.current=tt(row);G.current=false;$(Q.current);W(row.id)},
at=()=>{G.current=true;W(null)},it=event=>{if(X)event.preventDefault()},
et=async()=>{if(G.current)return;G.current=true;const id=X,title=U.trim();W(null);if(!id||!title||title===Q.current||!n)return;
D(value=>({...value,[id]:title}));if(!await n(id,title))D(value=>{const{[id]:ignored,...rest}=value;return rest})},
Ye=async(event,id)=>{event.preventDefault();event.stopPropagation();if(p||!LCOSDelete)return;g(id);try{if(await LCOSDelete(id)!==false)t?.(id)}finally{g(null)}};
return ${historyRender};}
`;

  const header = original('wM'), headerEdits = [];
  headerEdits.push({ start: header.params[0].end - 1, end: header.params[0].end - 1,
    text: ',entries:LCOSItems=[],historyState:LCOSState="ready",actions:LCOSActions=[],onCanvasAssistant:LCOSAssistant,panelLabel:LCOSPanelLabel="查看任务",panelIcon:LCOSPanelIcon,newConversationLabel:LCOSNewLabel' });
  walk(header, node => {
    if (call(node, 'Rp')) { headerEdits.push(change(node.arguments[0], 'LCOSNativeChatHistory'));
      headerEdits.push(addProps(node, 'entries:LCOSItems,state:LCOSState,actions:LCOSActions,onCanvasAssistant:LCOSAssistant,newConversationLabel:LCOSNewLabel')); }
    if (call(node, 'xM')) { headerEdits.push(change(node.arguments[0], 'LCOSNativePanelButton'));
      headerEdits.push(addProps(node, 'label:LCOSPanelLabel,icon:LCOSPanelIcon')); }
    if (node.type === 'CallExpression' && node.arguments?.[0]?.value === 'button' && property(props(node), 'onClick')?.value?.name === 't')
      headerEdits.push(addProps(node, '"aria-label":"收起对话"'));
  });
  const headerRoot = returned(header); headerEdits.push(addProps(headerRoot, '"data-lcos-native-chat-header":true'));
  const titleTrigger = one(header, node => node.type === 'CallExpression' && node.arguments?.[0]?.value === 'button'
    && children(node)?.elements?.some(child => child?.arguments?.[0]?.value === 'span' && children(child)?.name === 'U'), 'title trigger');
  headerEdits.push(addProps(titleTrigger, '"aria-label":"选择对话","data-lcos-native-chat-title":true'));

  const menu = original('UT'), menuEdits = [];
  menuEdits.push(change(menu.params[0], '{actions:LCOSActions=[],label:LCOSLabel="更多操作"}'));
  const menuRow = one(menu, node => call(node, 'ln'), 'actions row');
  const rowIcon = children(menuRow).elements[0], rowLabel = children(menuRow).elements[1];
  const menuItem = edit(menuRow, [change(property(props(menuRow), 'onSelect').value, 'action.onSelect'),
    change(property(props(menuRow), 'variant').value, 'action.destructive?"destructive":undefined'),
    change(rowIcon, 'action.icon??null'), change(rowLabel, 'action.label'), addProps(menuRow, 'disabled:action.disabled===true'),
    { start: menuRow.end - 1, end: menuRow.end - 1, text: ',action.id' }]);
  menuEdits.push(change(menuRow, `LCOSActions.map(action=>${menuItem})`));
  const menuTooltip = one(menu, node => call(node, 'en'), 'actions tooltip');
  menuEdits.push(change(property(props(menuTooltip), 'content').value, 'LCOSLabel'));
  const menuButton = one(menu, node => node.type === 'CallExpression' && node.arguments?.[0]?.value === 'button', 'actions trigger');
  menuEdits.push(change(property(props(menuButton), 'aria-label').value, 'LCOSLabel'));

  // Ep is the donor's actual output-list view. Only the row projection changes:
  // Core Runs remain Runs, not fabricated workspace files or conversations.
  const list = original('Ep'), listEdits = [];
  listEdits.push(change(list.params[0], '{items:e=[],selectedId:t,onSelect:n,title:LCOSTitle="任务",state:LCOSState="ready",message:LCOSMessage,actions:LCOSActions=[]}'));
  const binding = name => one(list, node => node.type === 'VariableDeclarator' && node.id?.name === name, `list ${name}`);
  listEdits.push(change(binding('r').init, 'row=>row.title||"未命名任务"'), change(binding('i').init, 'e'), change(binding('c').init, '[]'),
    change(binding('u').init, 'FN'), change(binding('f').init, 'd.id===t'), change(binding('m').init, '"text-foreground/60"'));
  const listRow = one(list, node => node.type === 'CallExpression' && node.arguments?.[0]?.value === 'li', 'list row');
  listEdits.push(change(listRow.arguments[2], 'd.id'), addProps(listRow, '"data-lcos-native-run-list-item":d.id'));
  const listButton = one(listRow, node => node.type === 'CallExpression' && node.arguments?.[0]?.value === 'button', 'list row button');
  listEdits.push(change(property(props(listButton), 'onClick').value, '()=>n(d.id)'), addProps(listButton, '"aria-label":"打开任务 "+r(d),"data-run-status":d.runStatus,"data-dispatch-status":d.dispatchStatus'));
  const title = one(listRow, node => node.type === 'CallExpression' && node.arguments?.[0]?.value === 'span'
    && children(node)?.type === 'CallExpression' && children(node).callee?.name === 'r', 'list title');
  listEdits.push(change(title, `o.jsxs("span",{className:"min-w-0 flex-1 text-left",children:[${slice(title)},d.secondary?o.jsx("span",{className:"block text-[11px] leading-snug text-muted-foreground/60",children:d.secondary}):null]})`));
  const listReturn = returned(list), emptyTest = listReturn.test;
  listEdits.push(change(emptyTest, 'LCOSState!=="ready"||e.length===0'));
  walk(list, node => {
    if (node.type === 'ObjectProperty' && (node.key?.name ?? node.key?.value) === 'className' && node.value?.type === 'TemplateLiteral')
      for (const part of node.value.quasis) {
        const next = nativeLightClassNames(part.value.raw);
        if (next !== part.value.raw) listEdits.push(change(part, next));
      }
    if (node.type === 'CallExpression' && node.callee?.name === 's' && node.arguments?.[0]?.value === 'chatAdapter.artifactPanel.outputs')
      listEdits.push(change(node, 'o.jsxs("span",{className:"flex min-w-0 items-center justify-between gap-2",children:[LCOSTitle,LCOSActions.length?o.jsx(LCOSNativeActionsMenu,{actions:LCOSActions,label:"任务操作"}):null]})'));
    if (node.type === 'CallExpression' && node.callee?.name === 's' && node.arguments?.[0]?.value === 'chatAdapter.artifactPanel.noOutputs')
      listEdits.push(change(node, 'LCOSMessage??(LCOSState==="loading"?"正在读取任务…":LCOSState==="error"?"暂时无法读取任务，请重试。":"还没有任务。")'));
  });
  return `\nconst LCOSNativePanelButton=${sideCode};\n${historyCode}\nconst LCOSNativeChatHeader=${edit(header, headerEdits)};
const LCOSNativeActionsMenu=${edit(menu, menuEdits)};
const LCOSNativeTaskRows=${edit(list, listEdits)};
function LCOSNativeTaskList(props){return o.jsx("div",{className:"relative flex flex-1 flex-col overflow-hidden","data-lcos-native-task-list-view":true,children:o.jsx("div",{className:"flex min-h-0 flex-1 flex-col overflow-y-auto",children:o.jsx(LCOSNativeTaskRows,props)})})}
`;
}
