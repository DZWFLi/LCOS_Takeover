import { parseOriginalDonorScript } from './agent-node-transform.mjs';
const marker = '/* lcos-native-workflow-templates */';
const imports = ['LCOSUseNativeWorkflowTemplates','LCOSUseNativeWorkflowGallery','LCOSNativeWorkflowPreview','LCOSUseNativeWorkflowRailSide','LCOSUseNativeWorkflowRailOwner','LCOSUseNativeWorkflowGalleryOwner','LCOSNativeWorkflowRetainsPopover'];
function walk(node, visit) { if (!node?.type) return; visit(node); for (const [key, value] of Object.entries(node)) {
  if (['loc','tokens','comments'].includes(key)) continue; if (Array.isArray(value)) value.forEach(child => walk(child, visit)); else if (value?.type) walk(value, visit);
} }
const prop = (node, name) => node?.properties?.find(item => (item.key?.name ?? item.key?.value) === name);
function one(root, test, label) { const found = []; walk(root, node => { if (test(node)) found.push(node); }); if (found.length !== 1) throw new Error(`Original method ${label} changed: ${found.length}`); return found[0]; }
export function transformNativeWorkflowTemplatesScript(filename, source) {
  if (filename.split(/[\\/]/).pop() === 'index-BAQXnPag.js' && !source.includes(marker)) {
    const program = parseOriginalDonorScript(source, filename);
    const imageURL = one(program, node => node.type === 'FunctionDeclaration' && node.id?.name === 'Cx', 'image URL');
    const start = imageURL.body.start + 1;
    source = source.slice(0, start) + 'if(typeof t==="string"&&/^(data:|blob:)/i.test(t))return t;' + source.slice(start) + '\n' + marker;
    parseOriginalDonorScript(source, filename); return source;
  }
  if (filename.split(/[\\/]/).pop() !== 'page-Da_DfwiK.js' || source.includes(marker)) return source;
  const program = parseOriginalDonorScript(source, filename), edits = [], text = node => source.slice(node.start, node.end);
  const replace = (node, value) => edits.push({ start: node.start, end: node.end, text: value });
  const append = (node, value) => edits.push({ start: node.end - 1, end: node.end - 1, text: ',' + value });
  const owner = name => one(program, node => node.type === 'VariableDeclarator' && node.id?.name === name, name);
  const call = (root, name) => one(root, node => node.type === 'CallExpression' && node.callee?.name === name, name);
  const jsx = (root, name) => one(root, node => node.type === 'CallExpression' && node.arguments?.[0]?.name === name, name);
  const rail = owner('hH');
  edits.push({start:rail.init.body.start+1,end:rail.init.body.start+1,text:'const methodNavigation=LCOSUseNativeWorkflowGalleryOwner(template=>{m(template);u(true)});'});
  replace(call(rail, 'op'), 'LCOSUseNativeWorkflowTemplates()');
  replace(call(rail, 'mp'), '({})');
  const apply = one(rail, node => node.type === 'VariableDeclarator' && node.id?.name === 'w', 'apply');
  replace(apply.init, 'C=>i.apply(C,()=>{u(false);m(null);t?.()},message=>se.error(message))');
  const list = jsx(rail, 'uD').arguments[1];
  append(prop(list, 'config').value, 'tabs:[{key:"public",label:"项目方法"}],onSearch:i.search,error:i.error,onRetry:i.refreshPublicTemplates');
  replace(prop(prop(list, 'config').value, 'emptyMessage').value, '"还没有保存的方法"');
  const gallery = jsx(rail, 'gp').arguments[1];
  append(gallery, 'useDataSource:LCOSUseNativeWorkflowGallery,localMethods:true,onApplyCancelled:i.cancel,navigationResume:methodNavigation.resume,onMaterialUse:()=>{u(false);m(null);t?.()}');
  const closeGallery = prop(gallery, 'onClose').value;
  edits.push({ start: closeGallery.body.start + 1, end: closeGallery.body.start + 1, text: 'i.cancel();methodNavigation.clear();' });
  for(const name of ['onItemPreview','onMoreClick']){
    const entry=prop(jsx(rail,'uD').arguments[1],name)?.value;
    const callback=entry?.type==='Identifier'?one(rail,node=>node.type==='VariableDeclarator'&&node.id?.name===entry.name,name).init:entry;
    edits.push({start:callback.body.start+1,end:callback.body.start+1,text:'methodNavigation.clear();'});
  }
  replace(prop(gallery, 'defaultActiveCategory').value, '"all"');
  // Preserve the original create affordance, explicitly unavailable until its
  // own Core method creation flow is connected. Never send to the vendor API.
  replace(prop(gallery, 'onCreate').value, 'undefined');
  const dock = owner('fH');
  edits.push({ start: dock.init.body.start + 1, end: dock.init.body.start + 1, text: 'const[methodOpen,setMethodOpen]=l.useState(false),methodSide=LCOSUseNativeWorkflowRailSide();LCOSUseNativeWorkflowRailOwner(()=>setMethodOpen(true));' });
  const popover = one(dock, node => node.type === 'CallExpression' && node.arguments?.[0]?.name === 'pr'
    && text(node).includes('WORKFLOW_PANEL'), 'template popover').arguments[1];
  append(popover, 'open:methodOpen,avoidCollisions:true,collisionPadding:14');
  replace(prop(popover, 'side').value, 'methodSide');
  const openChange = prop(popover, 'onOpenChange').value;
  edits.push({ start: openChange.body.start + 1, end: openChange.body.start + 1, text: 'if(!Ee&&(LCOSNativeWorkflowRetainsPopover()||document.querySelector("[data-native-workflow-gallery]")))return;setMethodOpen(Ee);' });
  append(jsx(dock, 'hH').arguments[1], 'onClosePopover:()=>setMethodOpen(false)');
  replace(prop(popover, 'contentClassName').value, '"lcos-native-method-popover w-[500px] p-0"');

  const listOwner = owner('uD'), tabs = prop(jsx(listOwner, 'A1').arguments[1], 'tabs');
  replace(tabs.value, `t.tabs??(${text(tabs.value)})`);
  const listReturn = one(listOwner, node => node.type === 'ReturnStatement' && node.argument?.callee?.property?.name === 'jsxs', 'list return');
  edits.push({ start: listReturn.start, end: listReturn.start, text: 'l.useEffect(()=>{t.onSearch?.(D)},[D,t.onSearch]);' });
  const listChildren = prop(listReturn.argument.arguments[1], 'children').value;
  edits.push({ start: listChildren.start + 1, end: listChildren.start + 1, text: 't.error&&r.jsxs("div",{"data-native-workflow-status":true,role:"status",children:[r.jsx("span",{children:t.error}),r.jsx(st,{variant:"ghost",onClick:t.onRetry,children:"重新读取"})]}),' });
  const empty = one(listOwner, node => node.type === 'LogicalExpression' && node.operator === '&&' && text(node.left) === 'q.length===0', 'empty row');
  replace(empty.left, 'q.length===0&&!t.error');
  const cardProps = jsx(listOwner, 'C2').arguments[1];
  replace(prop(cardProps, 'labelAlwaysVisible').value, 'i==="asset"||!!t.tabs');
  const searchInput = jsx(listOwner, 'kn').arguments[1];
  replace(prop(searchInput, 'placeholder').value, `t.tabs?"搜索项目方法…":${text(prop(searchInput,'placeholder').value)}`);

  const galleryOwner = owner('gp');
  append(galleryOwner.init.params[0], 'useDataSource:methodDataSource=tD,localMethods:localMethods=false,onApplyCancelled:cancelMethod,navigationResume:methodResume,onMaterialUse:useMethodMaterial');
  replace(call(galleryOwner, 'tD').callee, 'methodDataSource');
  const galleryData = one(galleryOwner, node => node.type === 'VariableDeclarator' && node.init?.callee?.name === 'tD', 'gallery source');
  append(galleryData.id, 'error:methodError,refresh:methodRefresh,columnCount:methodColumns,isReading:methodReading,readMaterial:readMethodMaterial,enterWorkspace:enterMethodWorkspace');
  append(galleryData.init.arguments[0], 'onClose:t,onMaterialUse:useMethodMaterial');
  const reset=one(galleryOwner,node=>node.type==='CallExpression'&&node.callee?.property?.name==='useEffect'&&text(node).includes('m("")'),'gallery opening reset');
  replace(reset.arguments[0].body,'{e&&(y(i||null),m(methodResume?.query??""),p(methodResume?.query??""),(methodResume?.category||h)&&w(methodResume?.category||h))}');
  append(reset.arguments[1],'methodResume');
  append(jsx(galleryOwner,'ln').arguments[1], 'modal:!localMethods||!methodReading');
  append(jsx(galleryOwner,'cn').arguments[1], 'showOverlay:!localMethods||!methodReading,style:localMethods&&methodReading?{visibility:"hidden",pointerEvents:"none"}:undefined,onInteractOutside:event=>{if(localMethods&&methodReading)event.preventDefault()}');
  const handle = one(galleryOwner, node => node.type === 'VariableDeclarator' && node.id?.name === 'J', 'gallery apply');
  edits.push({ start: handle.init.body.start + 1, end: handle.init.body.start + 1, text: 'if(Z?.lcos_method){await n(Z);return;}' });
  append(jsx(galleryOwner, 'cn').arguments[1], '"data-native-workflow-gallery":localMethods||undefined,"data-native-workflow-reading":localMethods&&methodReading||undefined');
  append(jsx(galleryOwner, 'aD').arguments[1], 'localMethods:localMethods');
  append(jsx(galleryOwner,'sD').arguments[1], 'onReadMaterial:readMethodMaterial,onEnterWorkspace:enterMethodWorkspace');
  replace(prop(jsx(galleryOwner, 'sD').arguments[1], 'onBack').value, '()=>{cancelMethod?.();y(null)}');
  const panel = jsx(galleryOwner, 'iD');
  const panelSource = text(panel).replace('columnCount:6', 'columnCount:localMethods?methodColumns:6');
  replace(panel, `(methodError?r.jsxs("div",{"data-native-workflow-status":true,role:"status",children:[r.jsx("span",{children:methodError}),r.jsx(st,{onClick:methodRefresh,children:"重新读取"})]}):${panelSource})`);
  const creation = one(galleryOwner, node => node.type === 'LogicalExpression' && node.left?.name === 'd' && node.right?.arguments?.[0]?.name === 'st', 'create button');
  replace(creation, `(localMethods?r.jsx(st,{disabled:true,title:"方法创建尚未接入；已有方法可查看和取用",className:"ml-2",children:"创建"}):${text(creation)})`);
  const galleryList = one(galleryOwner, node => node.type === 'CallExpression' && node.arguments?.[0]?.type === 'MemberExpression' && node.arguments[0].object?.name === 'mt', 'gallery list');
  append(galleryList.arguments[1], 'style:localMethods&&x?{pointerEvents:"none",visibility:"hidden"}:undefined,"aria-hidden":localMethods&&!!x');
  // Original categories stay in the same sidebar, backed by actual local scope.
  const categories = owner('aD'); append(categories.init.params[0], 'localMethods:localMethods=false');
  const categoriesReturn = one(categories, node => node.type === 'ReturnStatement', 'categories return');
  append(categoriesReturn.argument.arguments[1], '"data-native-workflow-categories":localMethods||undefined');
  const nav = one(categories, node => node.type === 'CallExpression' && node.arguments?.[0]?.value === 'nav', 'categories nav');
  const children = prop(nav.arguments[1], 'children');
  replace(children.value, `localMethods?c.map(category=>r.jsx(gl,{category,isActive:e===category.id,onClick:()=>t(category.id)},category.id)):(${text(children.value)})`);

  const detail = owner('sD');
  append(detail.init.params[0], 'onReadMaterial:readMethodMaterial,onEnterWorkspace:enterMethodWorkspace');
  const detailReturn = one(detail, node => node.type === 'ReturnStatement' && node.argument?.callee?.property?.name === 'jsxs', 'detail return');
  append(detailReturn.argument.arguments[1], '"data-native-workflow-detail":e.lcos_method?true:undefined');
  const media = one(detail, node => node.type === 'ConditionalExpression' && node.test?.name === 'y', 'media slot');
  for(const [className,attribute] of [['flex-1 flex-col items-center justify-center p-6','data-native-method-detail-body'],['flex gap-8 max-w-[900px] pt-3','data-native-method-layout'],['flex-1 flex flex-col min-w-[300px] h-[400px]','data-native-method-summary']]){
    const box=one(detail,node=>node.type==='ObjectExpression'&&prop(node,'className')?.value?.value===className,attribute);append(box,`"${attribute}":!!e.lcos_method`);
  }
  const mediaBox=one(detail,node=>node.type==='ObjectExpression'&&prop(node,'children')?.value===media,'media parent');append(mediaBox,'"data-native-method-media":!!e.lcos_method');
  replace(media, `e.lcos_method?r.jsx(LCOSNativeWorkflowPreview,{key:e.id,template:e,onReadMaterial:readMethodMaterial,onEnterWorkspace:enterMethodWorkspace,Button:st}):(${text(media)})`);
  const back = jsx(detail, 'v1').arguments[1]; append(back, '"aria-label":"返回方法列表"');
  const take = jsx(detail, 'st').arguments[1]; append(take, 'disabled:p||!!e.lcos_method&&e.lcos_method.draft.status!=="ready"');
  const label = one(detail, node => node.type === 'CallExpression' && node.arguments?.[0]?.value === 'templateGallery.apply', 'apply label');
  replace(label, `e.lcos_method?"加入当前输入":${text(label)}`);
  for (const edit of edits.sort((a,b) => b.start - a.start)) source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  source = `import {${imports.join(',')}} from "/lcos/agent-ui.js";\n` + source + '\n' + marker;
  parseOriginalDonorScript(source, filename); return source;
}
