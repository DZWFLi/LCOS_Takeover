import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const saveHelper = path.join(workspaceRoot, 'lab/pilot/native-text-save.ts');
const bodyRelativePath = 'lcos/huabu/apps/web/src/lcos/nodes/LcosCanvasTextBody.tsx';
const parserStore = 'E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/huabu/node_modules/.pnpm';
let babelParser;

function parse(source, filename) {
  if (!babelParser) {
    try {
      babelParser = require('@babel/parser');
    } catch {
      const packageName = fs.existsSync(parserStore)
        ? fs.readdirSync(parserStore).find((name) => name.startsWith('@babel+parser@')) : undefined;
      if (!packageName) throw new Error('Native text body transform: installed Babel parser unavailable; no download attempted.');
      babelParser = require(path.join(parserStore, packageName, 'node_modules/@babel/parser/lib/index.js'));
    }
  }
  return babelParser.parse(source, { sourceType: 'module', sourceFilename: filename, plugins: ['typescript', 'jsx'] });
}

function walk(root, visit) {
  const pending = [root];
  while (pending.length) {
    const node = pending.pop();
    if (!node || typeof node.type !== 'string') continue;
    visit(node);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (const child of value) if (child?.type) pending.push(child);
      } else if (value?.type) pending.push(value);
    }
  }
}

function countExact(source, needle) {
  let count = 0;
  let from = 0;
  while (true) {
    const at = source.indexOf(needle, from);
    if (at < 0) return count;
    count += 1;
    from = at + needle.length;
  }
}

function localEol(source, marker) {
  const at = source.indexOf(marker);
  if (at < 0) throw new Error(`Native text body source marker is missing: ${marker}.`);
  return source.slice(at).match(/\r\n|\n|\r/)?.[0] ?? '\n';
}

function replaceOnce(source, needle, replacement, seam) {
  const count = countExact(source, needle);
  if (count !== 1) throw new Error(`Native text body ${seam} seam drift: expected exactly one anchor, found ${count}.`);
  const at = source.indexOf(needle);
  return source.slice(0, at) + replacement + source.slice(at + needle.length);
}

function replaceBlock(source, startMarker, endMarker, replacement, seam) {
  if (countExact(source, startMarker) !== 1 || countExact(source, endMarker) !== 1) {
    throw new Error(`Native text body ${seam} seam drift: expected unique block boundaries.`);
  }
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker);
  if (end <= start) throw new Error(`Native text body ${seam} seam drift: block boundaries are reversed.`);
  return source.slice(0, start) + replacement + source.slice(end);
}

function helperImport(sourcePath) {
  const relative = path.relative(path.dirname(path.resolve(sourcePath)), saveHelper).split(path.sep).join('/');
  return `import { acknowledgeNativeCanvasTextSave, saveNativeCanvasText, verifyNativeCanvasTextSave } from ${JSON.stringify(relative.startsWith('.') ? relative : `./${relative}`)};`;
}

function assertInput(source, sourcePath) {
  if (typeof source !== 'string') throw new TypeError('Native text body transform expects source text.');
  if (typeof sourcePath !== 'string' || !sourcePath.trim()) throw new Error('Native text body transform requires the real sourcePath.');
  const relative = path.relative(workspaceRoot, path.resolve(sourcePath)).split(path.sep).join('/');
  if (relative.toLowerCase() !== bodyRelativePath.toLowerCase()) {
    throw new Error(`Native text body transform only transforms ${bodyRelativePath}; received ${relative}.`);
  }
}

function assertOriginalSource(source, sourcePath) {
  const ast = parse(source, sourcePath);
  let bodyOwnerCount = 0;
  let directSaveCount = 0;
  for (const node of ast.program.body) {
    if (node.type === 'ExportNamedDeclaration' && node.declaration?.type === 'FunctionDeclaration'
      && node.declaration.id?.name === 'LcosCanvasTextBody') bodyOwnerCount += 1;
  }
  walk(ast, (node) => {
    if (node.type !== 'CallExpression' || node.callee?.type !== 'MemberExpression') return;
    const callee = node.callee;
    if (callee.computed || callee.property?.name !== 'saveCanvasText') return;
    if (callee.object?.type === 'MemberExpression' && !callee.object.computed
      && callee.object.object?.name === 'session' && callee.object.property?.name === 'artifacts') directSaveCount += 1;
  });
  if (bodyOwnerCount !== 1) throw new Error(`Native text body owner seam drift: expected one exported component, found ${bodyOwnerCount}.`);
  if (directSaveCount !== 2) throw new Error(`Native text body direct-save seam drift: expected save + retryOriginal callers, found ${directSaveCount}.`);
}

function assertInstalled(source, expectedImport) {
  const imports = [...source.matchAll(/^import \{ acknowledgeNativeCanvasTextSave, saveNativeCanvasText, verifyNativeCanvasTextSave \} from (['"])[^'\r\n]+\1;$/gm)];
  if (imports.length !== 1 || imports[0]?.[0] !== expectedImport) {
    throw new Error('Native text body transform appears partially installed, duplicated, or points at a different helper.');
  }
  const required = [
    ['helper import', expectedImport, 1],
    ['receipt field', 'receiptOperationId?: string', 1],
    ['host lock projection', 'layoutNodeLocked(s.nodes, input.nodeId)) || input.data.lcosNativeReadOnly === true', 1],
    ['native save call', 'await saveNativeCanvasText({ projectId, canvasId, nodeId: input.nodeId,', 1],
    ['read-only receipt verification', 'await verifyNativeCanvasTextSave(operationId)', 2],
    ['terminal acknowledgement', 'acknowledgeNativeCanvasTextSave(', 5],
    ['no-base fail-closed path', '原生文本创建/正文绑定尚未确认，请重读', 1],
    ['receipt recovery async boundary', '.then(async (value) => {', 1],
    ['retry is read-only', 'const retryOriginal = async () => { await verify(); };', 1],
  ];
  const duplicate = required.find(([label, needle, expectedCount]) => countExact(source, needle) !== expectedCount);
  if (duplicate) throw new Error(`Native text body transform has an incomplete or duplicated ${duplicate[0]} seam.`);
  if (source.includes('session.artifacts.saveCanvasText')) {
    throw new Error('Native text body transform still contains a direct Core writer.');
  }
  parse(source, bodyRelativePath);
}

/**
 * In-memory host-only rewire of the copied mature body. Existing Artifact
 * edits use the original native update/batch/history receipt; unbound carriers
 * remain owned by their existing creation lifecycle and fail closed here.
 */
export function transformNativeTextBody(source, { sourcePath } = {}) {
  assertInput(source, sourcePath);
  const expectedImport = helperImport(sourcePath);
  const installed = source.includes('saveNativeCanvasText') || source.includes('receiptOperationId')
    || source.includes('lcosNativeReadOnly');
  if (installed) {
    assertInstalled(source, expectedImport);
    return source;
  }
  assertOriginalSource(source, sourcePath);

  const eol = source.match(/\r\n|\n|\r/)?.[0] ?? '\n';
  let result = replaceOnce(source,
    "import { canvasTextReplyMatches, canvasTextCarrierMatches } from './canvasTextSave';",
    `import { canvasTextReplyMatches, canvasTextCarrierMatches } from './canvasTextSave';${eol}${expectedImport}`,
    'helper import');

  result = replaceOnce(result,
    'interface DraftRecord { body: string; base: CanvasTextSnapshot | null; pending?: CanvasTextWrite }',
    'interface DraftRecord { body: string; base: CanvasTextSnapshot | null; pending?: CanvasTextWrite; receiptOperationId?: string }',
    'draft receipt identity');

  result = replaceOnce(result,
    'const locked = useCanvasStore((s) => layoutNodeLocked(s.nodes, input.nodeId));',
    'const locked = useCanvasStore((s) => layoutNodeLocked(s.nodes, input.nodeId)) || input.data.lcosNativeReadOnly === true;',
    'host read-only projection');

  result = replaceOnce(result,
    'session.artifacts.readCanvasText(projectId, address, controller.signal).then((value) => {',
    'session.artifacts.readCanvasText(projectId, address, controller.signal).then(async (value) => {',
    'receipt recovery async boundary');

  result = replaceOnce(result,
    `&& latest.current.state === 'ready' && !layoutNodeLocked(useCanvasStore.getState().nodes, input.nodeId)) instance.focus();`,
    `&& latest.current.state === 'ready' && input.data.lcosNativeReadOnly !== true${eol}      && !layoutNodeLocked(useCanvasStore.getState().nodes, input.nodeId)) instance.focus();`,
    'editor focus lock');
  result = replaceOnce(result,
    '}, [current, key, input.nodeId]);',
    '}, [current, key, input.nodeId, input.data.lcosNativeReadOnly]);',
    'editor focus dependency');

  result = replaceOnce(result,
    `  const sent: CanvasTextWrite = { ...address, body: draft.body, expectedRevisionId: draft.base?.revisionId ?? null,${eol}      ...(draft.base ? { artifactId: draft.base.artifactId } : {}) };`,
    [
      '  if (!draft.base) {',
      '      unfinished.set(key, { body: draft.body, base: null });',
      "      setState('error'); setError('原生文本创建/正文绑定尚未确认，请重读。');",
      '      return false;',
      '    }',
      '    const sent: CanvasTextWrite = { ...address, body: draft.body, expectedRevisionId: draft.base.revisionId, artifactId: draft.base.artifactId };',
    ].join(eol),
    'unbound save refusal');

  result = replaceOnce(result,
    'if (layoutNodeLocked(useCanvasStore.getState().nodes, input.nodeId)) throw new Error(\'节点已锁定，未保存正文。\');',
    "if (input.data.lcosNativeReadOnly === true || layoutNodeLocked(useCanvasStore.getState().nodes, input.nodeId)) throw new Error('节点已锁定，未保存正文。');",
    'write-time host lock');

  result = replaceOnce(result,
    [
      '      const value = await session.artifacts.saveCanvasText(projectId, sent);',
      '      confirm(sent, value);',
      '      return pending.current === undefined;',
    ].join(eol),
    [
      '      const receipt = await saveNativeCanvasText({ projectId, canvasId, nodeId: input.nodeId,',
      '        artifactId: draft.base.artifactId, expectedRevisionId: draft.base.revisionId, body: sent.body });',
      '      if (receipt.operationId && receipt.status !== \'busy\') unfinished.set(key, { body: sent.body, base: draft.base, pending: sent, receiptOperationId: receipt.operationId });',
      "      if ((receipt.status === 'confirmed' || receipt.status === 'unchanged') && receipt.value) {",
      '        confirm(sent, receipt.value); return pending.current === undefined;',
      '      }',
      "      const rejectedBeforeNativeCall = ['rejected', 'wrong-canvas', 'wrong-node-or-view', 'unobserved-revision', 'core-preflight-failed'];",
      '      if (rejectedBeforeNativeCall.includes(receipt.status) || receipt.status === \'conflict\') {',
      '        if (receipt.operationId) acknowledgeNativeCanvasTextSave(receipt.operationId);',
      '        pending.current = undefined; unfinished.set(key, { body: sent.body, base: draft.base }); setState(\'error\');',
      "        const conflictDetail = receipt.status === 'conflict' && receipt.httpStatus !== undefined",
      "          ? '原生批次已发出，但 Core CAS 冲突拒绝提交。草稿保留；请重读并人工对照，不会重发。'",
      "          : receipt.status === 'conflict' ? 'Core 版本预检冲突，原生更新未调用。草稿保留；请重读并人工对照。' : null;",
      "        setError(conflictDetail || receipt.reason || '保存未提交；原稿保留。');",
      "      } else if (receipt.status === 'busy') { pending.current = undefined; unfinished.set(key, { body: sent.body, base: draft.base });",
      "        setState('error'); setError(receipt.reason || '同节点已有未完成保存；当前稿未发送。');",
      "      } else if (receipt.status === 'context-changed') {",
      '        if (receipt.operationId) acknowledgeNativeCanvasTextSave(receipt.operationId);',
      '        pending.current = undefined; unfinished.set(key, { body: sent.body, base: draft.base }); setState(\'error\');',
      "        setError(receipt.reason || '保存回执属于已离开的画布现场；草稿保留，请回到原现场重读。');",
      '      } else { setState(\'unknown\'); setError(receipt.reason || \'原生保存回执尚未确认；保留原稿，不会重发。\'); }',
      '      return false;',
    ].join(eol),
    'single native writer');

  const verifyEol = localEol(result, '  const verify = async () => {');
  const verifyBlock = [
    '  const verify = async () => {',
    '    if (!projectId || !pending.current || !current()) return;',
    '    const sent = pending.current;',
    '    const saved = unfinished.get(key);',
    '    const cachedOperationId = saved?.pending?.body === sent.body && saved.pending.artifactId === sent.artifactId',
    '      && saved.pending.expectedRevisionId === sent.expectedRevisionId ? saved.receiptOperationId : undefined;',
    '    const candidate = cachedOperationId ? null : window.__LCOS_NATIVE_TEXT_SAVE_PORT__?.getPending({ canvasId: sent.canvasId, nodeId: sent.spatialId });',
    '    const exactCandidate = candidate && candidate.body === sent.body && candidate.artifactId === sent.artifactId',
    '      && candidate.expectedRevisionId === sent.expectedRevisionId ? candidate.operationId : undefined;',
    '    const operationId = cachedOperationId || exactCandidate;',
    "    if (!operationId) { setError('原保存操作回执 ID 不可用；保留草稿，不会重发。'); return; }",
      '    if (!cachedOperationId && saved) unfinished.set(key, { ...saved, receiptOperationId: operationId });',
    '    try {',
    '      const receipt = await verifyNativeCanvasTextSave(operationId);',
    '      if (!current() || pending.current !== sent) return;',
    "      if (receipt.status === 'confirmed' && receipt.value) { confirm(sent, receipt.value); return; }",
    "      const terminalNoCommit = ['rejected', 'wrong-canvas', 'wrong-node-or-view', 'unobserved-revision', 'core-preflight-failed', 'conflict'];",
    "      if (terminalNoCommit.includes(receipt.status) || receipt.status === 'context-changed') {",
    '        acknowledgeNativeCanvasTextSave(operationId); pending.current = undefined;',
    '        unfinished.set(key, { body: sent.body, base: saved?.base ?? null }); setState(\'error\');',
    "        const terminalMessage = receipt.status === 'conflict' && receipt.httpStatus !== undefined",
    "          ? '原生批次已发出，但 Core CAS 冲突拒绝提交。草稿保留，请重读并人工对照。'",
    "          : receipt.status === 'conflict' ? 'Core 版本预检冲突，原生更新未调用。草稿保留，请重读并人工对照.' : receipt.reason;",
    "        setError(terminalMessage || '原操作已终结且未确认正文写入；草稿保留。'); return;",
    '      }',
    "      setState('unknown'); setError(receipt.reason || '原生保存/历史回执仍未精确确认；只读核对未重发。');",
    "    } catch (reason) { if (current() && pending.current === sent) setError(reason instanceof Error ? reason.message : '只读核对失败。'); }",
    '  };',
    '',
  ].join(verifyEol);
  result = replaceBlock(result, '  const verify = async () => {', '  const retryOriginal = async () => {',
    verifyBlock, 'read-only receipt verification');

  const retryEol = localEol(result, '  const retryOriginal = async () => {');
  const retryBlock = ['  const retryOriginal = async () => { await verify(); };', ''].join(retryEol);
  result = replaceBlock(result, '  const retryOriginal = async () => {', '  const discard = () => {',
    retryBlock, 'retry is verification only');

  result = replaceOnce(result,
    'if (!projectId || !canvasId || !current() || locked || editorError || latest.current.state !== \'ready\' || pending.current) return false;',
    'if (!projectId || !canvasId || !current() || locked || editorError || latest.current.state !== \'ready\' || pending.current) return false;',
    'save guard stability');

  result = replaceOnce(result,
    'onClick={() => void retryOriginal()}>重试原保存</Button>',
    'onClick={() => void retryOriginal()}>只读核对原回执（不重发）</Button>',
    'read-only retry label');

  const creationRecoveryEol = localEol(result, 'useCanvasStore.getState().updateNodeData(input.nodeId, { lcosProjectTextCreating: true');
  result = replaceOnce(result,
    'useCanvasStore.getState().updateNodeData(input.nodeId, { lcosProjectTextCreating: true, lcosProjectTextCreateError: undefined });',
    `if (input.data.lcosNativeReadOnly === true) return;${creationRecoveryEol}        useCanvasStore.getState().updateNodeData(input.nodeId, { lcosProjectTextCreating: true, lcosProjectTextCreateError: undefined });`,
    'creation recovery write lock');

  // A valid receipt may be late and retained by the native port until consumed.
  const confirmEol = localEol(result, "    if (!projectId || !canvasTextReplyMatches(projectId, sent, value))");
  result = replaceOnce(result,
    "    if (!projectId || !canvasTextReplyMatches(projectId, sent, value)) throw new Error('保存回执与原节点或正文不一致。');",
    "    if (!projectId || !canvasTextReplyMatches(projectId, sent, value)) throw new Error('保存回执与原节点或正文不一致。');",
    'receipt acknowledgement');
  const confirmCleanupEol = localEol(result, '    if (unfinished.get(key)?.pending === sent) unfinished.delete(key);');
  result = replaceOnce(result,
    '    if (unfinished.get(key)?.pending === sent) unfinished.delete(key);',
    [
      '    const saved = unfinished.get(key);',
      '    const receiptOperationId = saved?.pending?.body === sent.body && saved.pending.artifactId === sent.artifactId',
      '      && saved.pending.expectedRevisionId === sent.expectedRevisionId ? saved.receiptOperationId : undefined;',
      '    if (receiptOperationId) acknowledgeNativeCanvasTextSave(receiptOperationId);',
      '    if (unfinished.get(key)?.pending === sent) unfinished.delete(key);',
    ].join(confirmCleanupEol),
    'exact receipt acknowledgement');

  // A stored unresolved native update cannot be declared saved merely because
  // an independent body GET happens to show equal text; only its native receipt
  // can prove that the original history/batch operation settled.
  const recoveryEol = localEol(result, '        if (savedDraft.pending && value && canvasTextReplyMatches(projectId, savedDraft.pending, value)) {');
  result = replaceOnce(result,
    '        if (savedDraft.pending && value && canvasTextReplyMatches(projectId, savedDraft.pending, value)) {',
    [
      '        if (savedDraft.pending && savedDraft.base) {',
      '          const cachedOperationId = savedDraft.pending.body === savedDraft.body && savedDraft.pending.artifactId === savedDraft.base.artifactId',
      '            && savedDraft.pending.expectedRevisionId === savedDraft.base.revisionId ? savedDraft.receiptOperationId : undefined;',
      '          const candidate = cachedOperationId ? null : window.__LCOS_NATIVE_TEXT_SAVE_PORT__?.getPending({ canvasId: savedDraft.pending.canvasId, nodeId: savedDraft.pending.spatialId });',
      '          const exactCandidate = candidate && candidate.body === savedDraft.pending.body && candidate.artifactId === savedDraft.pending.artifactId',
      '            && candidate.expectedRevisionId === savedDraft.pending.expectedRevisionId ? candidate.operationId : undefined;',
      '          const operationId = cachedOperationId || exactCandidate;',
      '          if (operationId) {',
      '            unfinished.set(key, { ...savedDraft, receiptOperationId: operationId });',
      '            const receipt = await verifyNativeCanvasTextSave(operationId);',
      '            if (controller.signal.aborted || !current()) return;',
      "            if (receipt.status === 'confirmed' && receipt.value) { confirmRef.current(savedDraft.pending, receipt.value); return; }",
      "            const terminalNoCommit = ['rejected', 'wrong-canvas', 'wrong-node-or-view', 'unobserved-revision', 'core-preflight-failed', 'conflict'];",
      "            if (terminalNoCommit.includes(receipt.status) || receipt.status === 'context-changed') {",
      '              acknowledgeNativeCanvasTextSave(operationId); pending.current = undefined;',
      '              unfinished.set(key, { body: savedDraft.body, base: savedDraft.base }); setState(\'error\');',
      "              setError(receipt.reason || '原操作已终结；正文稿仍保留，请重读后对照。'); return;",
      '            }',
      '          }',
      '          setBody(savedDraft.body); setBase(savedDraft.base); setState(\'unknown\');',
      "          setError('原保存的原生批次回执尚未确认。保留原稿，不会以正文 GET 推断已保存，也不会重发。'); return;",
      '        }',
      '        if (savedDraft.pending && value && canvasTextReplyMatches(projectId, savedDraft.pending, value)) {',
    ].join(recoveryEol),
    'pending receipt recovery');

  assertInstalled(result, expectedImport);
  return result;
}
