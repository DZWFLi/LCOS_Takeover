import { parseOriginalDonorScript as parse } from './agent-node-transform.mjs';
import { LCOSNativeFileUploadReceipt } from './native-file-upload-receipt.mjs';

const target = 'course-api-base-url-CifxI1ia.js';
const imports = 'import{LCOSHasNativeFileMarker,LCOSNativeFileTextOwner,LCOSNativeFileTextBodySlot,LCOSUseNativeFileCopy}from"/lcos/agent-ui.js";\n';
const marker = '\n/* LCOS file content in original Text frame */';
const pageTarget = 'page-Da_DfwiK.js';
const pageExports = ['LCOSNativeFileUploadTypes', 'LCOSNativeFileUploadAccept', 'LCOSNativeFileUploadValidate',
  'LCOSNativeFileUploadCanRead', 'LCOSNativeFileUploadCanTransfer', 'LCOSNativeFileUploadNode',
  'LCOSNativeFileUploadScene', 'LCOSNativeFileUploadCurrent', 'LCOSNativeFileLibraryChoose', 'LCOSNativeFileLibraryInput', 'LCOSNativeFileUploadEventOwned'];
const pageImport = `import{${pageExports.join(',')}}from"/lcos/agent-ui.js";\n`;
const pageMarker = '\n/* LCOS files through original upload owner */';
const indexTarget = 'index-BAQXnPag.js';
const indexMarker = '\n/* LCOS original upload completion receipt */\n';
const indexHelper = indexMarker + LCOSNativeFileUploadReceipt.toString() + '\n';
const prop = (node, name) => node?.properties?.find(value => (value.key?.name ?? value.key?.value) === name)?.value;
function walk(node, visit) {
  if (!node?.type) return; visit(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(child => walk(child, visit));
    else if (value?.type) walk(value, visit);
  }
}
function find(root, test, label) { const out = []; walk(root, value => { if (test(value)) out.push(value); });
  if (out.length !== 1) throw new Error(`Native file ${label} seam changed (${out.length}).`); return out[0]; }
const jsx = (value, name) => value.type === 'CallExpression' && value.callee?.object?.name === 'a'
  && value.callee?.property?.name === 'jsx' && value.arguments[0]?.name === name;
function edit(source, edits) {
  for (const item of edits.sort((a, b) => b.start - a.start)) source = source.slice(0, item.start) + item.text + source.slice(item.end);
  return source;
}

/** Run after nativeFirstText + nativeTextActions. A file changes only the
 * original child/DOM-free owner and edit policy; r4/wr/n4 and every original
 * action remain. Nothing reads binary bytes into the native Text editor. */
export function transformNativeFileUploadScript(filename, source) {
  if (filename.split(/[\\/]/).pop() === indexTarget) return transformNativeFileUploadCompletionScript(filename, source);
  if (filename.split(/[\\/]/).pop() === pageTarget) return transformNativeFileUploadIngressScript(filename, source);
  if (filename.split(/[\\/]/).pop() !== target) return source;
  if (source.endsWith(marker)) return source;
  const ast = parse(source, filename), edits = [], code = node => source.slice(node.start, node.end);
  for (const name of ['r4', 's4']) {
    const renderer = find(ast, value => value.type === 'VariableDeclarator' && value.id?.name === name, name);
    const slot = find(renderer, value => jsx(value, 'LCOSNativeTextBodySlot'), name + ' existing body');
    const owner = find(renderer, value => jsx(value, 'LCOSNativeTextNodeOwner'), name + ' existing owner');
    const data = prop(slot.arguments[1], 'data'), editable = prop(slot.arguments[1], 'editable');
    if (data?.type !== 'Identifier' || editable?.type !== 'Identifier') throw new Error('Native file node props changed.');
    const policy = find(renderer, value => value.type === 'VariableDeclarator' && value.id?.name === editable.name,
      name + ' original edit policy');
    edits.push({ start: policy.init.start, end: policy.init.end, text: `(${code(policy.init)})&&!LCOSHasNativeFileMarker(${data.name})` });
    edits.push({ start: owner.arguments[0].start, end: owner.arguments[0].end, text: 'LCOSNativeFileTextOwner' });
    edits.push({ start: owner.arguments[1].start + 1, end: owner.arguments[1].start + 1, text: 'OriginalOwner:LCOSNativeTextNodeOwner,' });
    edits.push({ start: slot.arguments[0].start, end: slot.arguments[0].end, text: 'LCOSNativeFileTextBodySlot' });
    edits.push({ start: slot.arguments[1].start + 1, end: slot.arguments[1].start + 1, text: 'OriginalBodySlot:LCOSNativeTextBodySlot,' });
  }
  // Non-primary View carriers also stay PURE, never the generative s4/JU path.
  const router = find(ast, value => value.type === 'VariableDeclarator' && value.id?.name === 'o4', 'original Text router');
  const mode = find(router, value => value.type === 'VariableDeclarator' && value.id?.name === 't', 'original mode value');
  edits.push({ start: mode.init.start, end: mode.init.end, text: `LCOSHasNativeFileMarker(e.data)?Ck.PURE:(${code(mode.init)})` });
  const copy = find(ast, value => value.type === 'VariableDeclarator' && value.id?.name === 'iBe', 'original text tools');
  edits.push({ start: copy.init.body.start + 1, end: copy.init.body.start + 1, text: 'const __lcosFileCopy=LCOSUseNativeFileCopy(e,r);' });
  const copyButton = find(copy, value => jsx(value, 'sO'), 'original clipboard control');
  const value = prop(copyButton.arguments[1], 'value'), label = prop(copyButton.arguments[1], 'defaultText');
  edits.push({ start: value.start, end: value.end, text: '__lcosFileCopy.value' });
  edits.push({ start: label.start, end: label.end, text: `__lcosFileCopy.label??(${code(label)})` });
  const memo = find(copy, value => value.type === 'CallExpression' && value.callee?.property?.name === 'useMemo', 'original tools memo');
  edits.push({ start: memo.arguments[1].end - 1, end: memo.arguments[1].end - 1, text: ',__lcosFileCopy.value,__lcosFileCopy.label' });
  const result = imports + edit(source, edits) + marker;
  parse(result, filename); return result;
}

export function restoreNativeFileUploadScriptForComparison(filename, source) {
  if (filename.split(/[\\/]/).pop() === indexTarget) return restoreNativeFileUploadCompletionScriptForComparison(filename, source);
  if (filename.split(/[\\/]/).pop() === pageTarget) return restoreNativeFileUploadIngressScriptForComparison(filename, source);
  if (filename.split(/[\\/]/).pop() !== target) return source;
  if (!source.endsWith(marker)) throw new Error('Native file transform marker missing.');
  const ast = parse(source, filename), edits = [], code = node => source.slice(node.start, node.end);
  for (const name of ['r4', 's4']) {
    const renderer = find(ast, value => value.type === 'VariableDeclarator' && value.id?.name === name, name);
    const slot = find(renderer, value => jsx(value, 'LCOSNativeFileTextBodySlot'), name + ' body');
    const owner = find(renderer, value => jsx(value, 'LCOSNativeFileTextOwner'), name + ' owner');
    const editable = prop(slot.arguments[1], 'editable');
    const policy = find(renderer, value => value.type === 'VariableDeclarator' && value.id?.name === editable.name, name + ' policy');
    if (policy.init.type !== 'LogicalExpression' || policy.init.operator !== '&&'
      || policy.init.right?.argument?.callee?.name !== 'LCOSHasNativeFileMarker') throw new Error('Native file edit policy changed.');
    edits.push({ start: policy.init.start, end: policy.init.end, text: code(policy.init.left) });
    for (const [call, name, property] of [[owner, 'LCOSNativeTextNodeOwner', 'OriginalOwner'], [slot, 'LCOSNativeTextBodySlot', 'OriginalBodySlot']]) {
      const first = call.arguments[1].properties[0];
      if ((first.key?.name ?? first.key?.value) !== property || first.value?.name !== name) throw new Error('Native file original fallback changed.');
      edits.push({ start: call.arguments[0].start, end: call.arguments[0].end, text: name });
      edits.push({ start: first.start, end: first.end + 1, text: '' });
    }
  }
  const router = find(ast, value => value.type === 'VariableDeclarator' && value.id?.name === 'o4', 'router');
  const mode = find(router, value => value.type === 'VariableDeclarator' && value.id?.name === 't', 'mode');
  if (mode.init.type !== 'ConditionalExpression' || mode.init.test?.callee?.name !== 'LCOSHasNativeFileMarker') throw new Error('Native file Pure route changed.');
  edits.push({ start: mode.init.start, end: mode.init.end, text: code(mode.init.alternate) });
  const copy = find(ast, value => value.type === 'VariableDeclarator' && value.id?.name === 'iBe', 'tools');
  const capture = find(copy, value => value.type === 'VariableDeclaration' && value.declarations[0]?.id?.name === '__lcosFileCopy', 'copy props');
  edits.push({ start: capture.start, end: capture.end, text: '' });
  const copyButton = find(copy, value => jsx(value, 'sO'), 'clipboard');
  const value = prop(copyButton.arguments[1], 'value'), label = prop(copyButton.arguments[1], 'defaultText');
  if (value?.object?.name !== '__lcosFileCopy' || label?.type !== 'LogicalExpression' || label.operator !== '??') throw new Error('Native file clipboard slot changed.');
  edits.push({ start: value.start, end: value.end, text: 'r' });
  edits.push({ start: label.start, end: label.end, text: code(label.right) });
  const memo = find(copy, value => value.type === 'CallExpression' && value.callee?.property?.name === 'useMemo', 'tools memo');
  const extra = memo.arguments[1].elements.slice(-2);
  if (extra.some(value => value.object?.name !== '__lcosFileCopy')) throw new Error('Native file clipboard memo changed.');
  edits.push({ start: extra[0].start - 1, end: extra[1].end, text: '' });
  return edit(source, edits).replace(imports, '').slice(0, -marker.length);
}

/** Existing _E/EO/Tor remain the upload/queue/transfer owners. Extend the
 * exact browser admission and successful result factory, not the router. */
export function transformNativeFileUploadIngressScript(filename, source) {
  if (filename.split(/[\\/]/).pop() !== pageTarget) return source;
  if (source.endsWith(pageMarker)) return source;
  const ast = parse(source, filename), edits = [], code = node => source.slice(node.start, node.end);
  const declaration = name => find(ast, value => ['FunctionDeclaration', 'VariableDeclarator'].includes(value.type)
    && value.id?.name === name, name);
  const call = (root, name, label = name) => find(root, value => value.type === 'CallExpression' && value.callee?.name === name, label);
  const wrap = (node, text) => edits.push({ start: node.start, end: node.end, text });
  const types = find(declaration('Sb'), value => value.type === 'ReturnStatement', 'original type list').argument;
  wrap(types, `LCOSNativeFileUploadTypes(e,(${code(types)}))`);
  const validation = call(declaration('n7'), 'Ij');
  wrap(validation, `LCOSNativeFileUploadValidate(o,t,()=>${code(validation)})`);
  const node = call(declaration('J9'), 'Z9');
  wrap(node, `LCOSNativeFileUploadNode(i,o,c,fi,()=>${code(node)})`);
  const upload = declaration('_E');
  const accepts = []; walk(upload, value => { if (value.type === 'CallExpression' && value.callee?.name === 'tx') accepts.push(value); });
  if (accepts.length !== 2) throw new Error('Native file original picker/diagnostic accept count changed.');
  for (const accept of accepts) wrap(accept, `LCOSNativeFileUploadAccept(${code(accept.arguments[0])},${code(accept)})`);
  const handler = find(upload, value => value.type === 'VariableDeclarator' && value.id?.name === 'o'
    && value.init?.callee?.property?.name === 'useCallback', 'original handleFileSelect').init.arguments[0];
  edits.push({ start: handler.body.start + 1, end: handler.body.start + 1, text: 'const __lcosFileScene=LCOSNativeFileUploadScene();' });
  const alive = find(handler, value => value.type === 'IfStatement' && value.test?.type === 'SequenceExpression'
    && value.test.expressions.at(-1)?.type === 'UnaryExpression'
    && value.test.expressions.at(-1).argument?.object?.name === 'i'
    && value.test.expressions.at(-1).argument.property?.name === 'current', 'original mounted guard');
  wrap(alive.test, `(${code(alive.test)})||!LCOSNativeFileUploadCurrent(__lcosFileScene)`);
  const global = declaration('c7');
  for (const name of ['f', 'm', 'g', 'p', 'x']) {
    const callback = find(global, value => value.type === 'VariableDeclarator' && value.id?.name === name
      && value.init?.callee?.property?.name === 'useCallback', 'original global file ' + name).init.arguments[0];
    edits.push({ start: callback.body.start + 1, end: callback.body.start + 1,
      text: 'if(LCOSNativeFileUploadEventOwned(y)){c(!1);return;}' });
  }
  const paste = call(global, 'ul', 'original media paste predicate');
  wrap(paste, `LCOSNativeFileUploadCanRead(${code(paste.arguments[0])},()=>${code(paste)})`);
  const filter = find(global, value => value.type === 'CallExpression' && value.callee?.property?.name === 'filter'
    && value.arguments[0]?.name === 'ul', 'original media drop filter');
  wrap(filter.arguments[0], '__lcosFile=>LCOSNativeFileUploadCanRead(__lcosFile,()=>ul(__lcosFile))');
  const transfers = []; walk(global, value => { if (value.type === 'CallExpression' && value.callee?.name === 'rx') transfers.push(value); });
  if (transfers.length !== 2) throw new Error('Native file original drag admission count changed.');
  for (const transfer of transfers) wrap(transfer, `LCOSNativeFileUploadCanTransfer(${code(transfer.arguments[0])},()=>${code(transfer)})`);
  const library = declaration('jF');
  const choose = find(library, value => value.type === 'VariableDeclarator' && value.id?.name === 'Ee'
    && value.init?.callee?.property?.name === 'useCallback', 'original Library upload choice').init.arguments[0];
  const input = find(library, value => value.type === 'VariableDeclarator' && value.id?.name === 'jt'
    && value.init?.callee?.property?.name === 'useCallback', 'original Library input callback').init.arguments[0];
  edits.push({ start: choose.body.start + 1, end: choose.body.start + 1,
    text: 'if(LCOSNativeFileLibraryChoose(xe,fe,y,wt,se,$e.SPACE_TYPE_PRIVATE))return;' });
  edits.push({ start: input.body.start + 1, end: input.body.start + 1,
    text: 'if(await LCOSNativeFileLibraryInput(oe,xe,fe,{uploadFiles:We,libraryStore:wt,fetchFolderAssets:N,notice:se}))return;' });
  const hidden = find(library, value => value.type === 'CallExpression' && value.arguments[0]?.value === 'input'
    && prop(value.arguments[1], 'onChange')?.name === 'jt', 'original Library hidden file input');
  const acceptValue = prop(hidden.arguments[1], 'accept');
  if (acceptValue?.value !== 'image/*,video/*,audio/*') throw new Error('Native file Library original accept changed.');
  wrap(acceptValue, `LCOSNativeFileUploadAccept(["text"],${code(acceptValue)})`);
  const result = pageImport + edit(source, edits) + pageMarker; parse(result, filename); return result;
}

export function restoreNativeFileUploadIngressScriptForComparison(filename, source) {
  if (filename.split(/[\\/]/).pop() !== pageTarget) return source;
  if (!source.endsWith(pageMarker)) throw new Error('Native upload ingress marker missing.');
  const ast = parse(source, filename), edits = [], code = node => source.slice(node.start, node.end);
  const calls = []; walk(ast, value => { if (value.type === 'CallExpression' && pageExports.includes(value.callee?.name)) calls.push(value); });
  const removeStatements = new Set();
  for (const call of calls) {
    const name = call.callee.name;
    if (['LCOSNativeFileLibraryChoose', 'LCOSNativeFileLibraryInput'].includes(name)) {
      const statement = find(ast, value => value.type === 'IfStatement' && (value.test === call || value.test?.argument === call), name);
      edits.push({ start: statement.start, end: statement.end, text: '' }); continue;
    }
    if (name === 'LCOSNativeFileUploadScene') {
      const statement = find(ast, value => value.type === 'VariableDeclaration' && value.declarations[0]?.init === call, 'capture');
      edits.push({ start: statement.start, end: statement.end, text: '' }); continue;
    }
    if (name === 'LCOSNativeFileUploadEventOwned') {
      const statement = find(ast, value => value.type === 'IfStatement' && value.test === call, 'semantic target guard');
      edits.push({ start: statement.start, end: statement.end, text: '' }); continue;
    }
    if (name === 'LCOSNativeFileUploadCurrent') {
      const guard = find(ast, value => value.type === 'LogicalExpression' && value.right?.argument === call, 'scene guard');
      edits.push({ start: guard.start, end: guard.end, text: code(guard.left) }); continue;
    }
    if (name === 'LCOSNativeFileUploadCanRead' && call.arguments[0]?.name === '__lcosFile') {
      const arrow = find(ast, value => value.type === 'ArrowFunctionExpression' && value.body === call, 'drop filter');
      edits.push({ start: arrow.start, end: arrow.end, text: 'ul' }); continue;
    }
    const original = name === 'LCOSNativeFileUploadTypes' || name === 'LCOSNativeFileUploadAccept'
      ? call.arguments[1] : call.arguments.at(-1)?.body;
    if (!original) throw new Error('Native upload original fallback missing.');
    edits.push({ start: call.start, end: call.end, text: code(original) });
  }
  const restored = edit(source, edits).replace(pageImport, '').slice(0, -pageMarker.length);
  parse(restored, filename); return restored;
}

export function transformNativeFileUploadCompletionScript(filename, source) {
  if (filename.split(/[\\/]/).pop() !== indexTarget) return source;
  if (source.endsWith(indexHelper)) return source;
  const ast = parse(source, filename), edits = [], code = value => source.slice(value.start, value.end);
  const client = find(ast, value => value.type === 'ClassDeclaration' && value.id?.name === 'Jir', 'original upload client');
  const complete = find(client, value => value.type === 'ClassMethod' && value.key?.name === 'completeUpload', 'completeUpload');
  const statement = find(complete, value => value.type === 'ExpressionStatement' && value.expression?.type === 'AwaitExpression', 'original completion request');
  if (complete.body.body.length !== 1) throw new Error('Native upload completion client changed.');
  edits.push({ start: statement.start, end: statement.start, text: 'return ' });
  const uploader = find(ast, value => value.type === 'ClassDeclaration' && value.id?.name === 'Mor', 'original uploader');
  const upload = find(uploader, value => value.type === 'ClassMethod' && value.key?.name === 'upload', 'original upload method');
  edits.push({ start: upload.body.start + 1, end: upload.body.start + 1, text: 'let __lcosCompletedReceipt;' });
  const completeCall = find(upload, value => value.type === 'AwaitExpression' && value.argument?.callee?.property?.name === 'completeUpload', 'original single completion');
  edits.push({ start: completeCall.start, end: completeCall.end, text: `(__lcosCompletedReceipt=${code(completeCall)})` });
  const result = find(upload, value => value.type === 'VariableDeclarator' && value.id?.name === 'u'
    && value.init?.callee?.name === 'Zrt', 'original final result');
  edits.push({ start: result.init.start, end: result.init.end,
    text: `LCOSNativeFileUploadReceipt(${code(result.init)},__lcosCompletedReceipt,e)` });
  const output = edit(source, edits) + indexHelper; parse(output, filename); return output;
}

export function restoreNativeFileUploadCompletionScriptForComparison(filename, source) {
  if (filename.split(/[\\/]/).pop() !== indexTarget) return source;
  if (!source.endsWith(indexHelper)) throw new Error('Native upload completion marker missing.');
  const ast = parse(source, filename), edits = [], code = value => source.slice(value.start, value.end);
  const client = find(ast, value => value.type === 'ClassDeclaration' && value.id?.name === 'Jir', 'client');
  const complete = find(client, value => value.type === 'ClassMethod' && value.key?.name === 'completeUpload', 'complete');
  const returned = find(complete, value => value.type === 'ReturnStatement', 'return receipt');
  edits.push({ start: returned.start, end: returned.argument.start, text: '' });
  const uploader = find(ast, value => value.type === 'ClassDeclaration' && value.id?.name === 'Mor', 'uploader');
  const capture = find(uploader, value => value.type === 'VariableDeclaration' && value.declarations[0]?.id?.name === '__lcosCompletedReceipt', 'receipt variable');
  edits.push({ start: capture.start, end: capture.end, text: '' });
  const assignment = find(uploader, value => value.type === 'AssignmentExpression' && value.left?.name === '__lcosCompletedReceipt', 'receipt assignment');
  // Remove the explicitly inserted surrounding parentheses as well.
  if (source[assignment.start - 1] !== '(' || source[assignment.end] !== ')') throw new Error('Native completion parentheses changed.');
  edits.push({ start: assignment.start - 1, end: assignment.end + 1, text: code(assignment.right) });
  const result = find(uploader, value => value.type === 'CallExpression' && value.callee?.name === 'LCOSNativeFileUploadReceipt', 'final adoption');
  edits.push({ start: result.start, end: result.end, text: code(result.arguments[0]) });
  return edit(source, edits).slice(0, -indexHelper.length);
}
