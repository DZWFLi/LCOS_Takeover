import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { currentGen2Root, currentGen2Resources, readCurrentGen2Resource } from '../lab/current-gen2-resources.mjs';
import { createNativeUiSourceTransforms } from '../lab/native-ui-source-transforms.mjs';
import { withNativeChatSourceTransforms } from '../lab/native-chat-owner-transform.mjs';
import { withNativeMaterialReaderSourceTransforms } from '../lab/native-material-reader-source-transform.mjs';
import { withNativeReaderRecoverySourceTransforms } from '../lab/native-reader-recovery-source-transform.mjs';
import { withNativeComposerFileSourceTransforms } from '../lab/native-composer-file-source-transform.mjs';
import { nativeComposerSourceOverride } from '../lab/native-composer-source-transform.mjs';

// A source and built-module inventory for review. This is neither a runtime
// reachability proof nor an acceptance gate, and never changes product state.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtime = process.argv.find(v => v.startsWith('--runtime-label='))?.slice(16);
if (!runtime || !/^isolated-[a-z0-9-]+$/.test(runtime)) throw new Error('Use the explicit isolated runtime whose UI was just built.');
const output = path.join(root, 'output/原流程融合_20261017c');
const ts = createRequire(path.join(currentGen2Root, 'package.json'))('typescript');
const relative = file => path.relative(root, file).replaceAll('\\', '/');
const sources = new Set();
const gather = directory => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) gather(file);
    else if (/\.[jt]sx?$/.test(entry.name) && !/\.test\./.test(entry.name)) sources.add(relative(file));
  }
};
gather(path.join(root, 'lcos/huabu/apps/web/src/lcos'));
gather(path.join(root, 'lab/pilot'));
for (const row of currentGen2Resources) if (row.resourcePath.startsWith('huabu/apps/web/src/lcos/') && /\.[jt]sx?$/.test(row.resourcePath)) sources.add('lcos/' + row.resourcePath);
const transforms = withNativeComposerFileSourceTransforms(withNativeReaderRecoverySourceTransforms(withNativeMaterialReaderSourceTransforms(withNativeChatSourceTransforms(createNativeUiSourceTransforms({ nativeRailPilot: true })))));
const overrides = { ...nativeComposerSourceOverride,
  'lcos/huabu/apps/web/src/store/canvasStore.ts': 'lab/pilot/native-canvas-port.ts',
  'lcos/huabu/apps/web/src/lcos/professional/NativeWorkspaceBody.tsx': 'lab/pilot/native-professional-host.tsx' };
const bundled = new Set();
for (const name of ['agent-ui.js', 'native-pile-ui.js', 'native-text-first-ui.js']) {
  const source = fs.readFileSync(path.join(root, '.runtime', runtime, 'native-ui', name), 'utf8');
  for (const match of source.matchAll(/^\/\/ ((?:lcos|lab)\/[^\r\n]+)$/gm)) bundled.add(match[1]);
}
const inspect = (source, file) => {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  if (ast.parseDiagnostics.length) throw new Error('Cannot inventory unparsed source: ' + file);
  const calls = [];
  const visit = node => {
    if (ts.isCallExpression(node) && ((ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'openWindow')
      || ts.isIdentifier(node.expression) && node.expression.text === 'openWindow')) {
      calls.push({ line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1,
        target: node.arguments[0]?.getText(ast) ?? '', call: node.getText(ast) });
    }
    ts.forEachChild(node, visit);
  };
  visit(ast); return calls;
};
const rows = [];
for (const file of [...sources].sort()) {
  const absolute = path.join(root, file), selected = readCurrentGen2Resource(absolute);
  const source = selected?.contents ?? fs.readFileSync(absolute, 'utf8');
  if (!/openWindow\s*\(/.test(source)) continue;
  const before = inspect(source, file);
  if (!before.length) continue;
  const adapted = overrides[file] ? undefined : transforms[file]?.(source, { sourcePath: absolute }) ?? source;
  rows.push({ file, selectedSource: selected?.sourcePath ?? absolute, overriddenBy: overrides[file] ?? null,
    transformed: !!transforms[file], bundledModule: bundled.has(file), before,
    after: adapted === undefined ? [] : inspect(adapted, file) });
}
const residual = rows.filter(row => row.bundledModule && !row.overriddenBy && row.after.length);
const result = { at: new Date().toISOString(), runtime, sourceFilesWithCalls: rows.length,
  selectedSourceCalls: rows.reduce((n, row) => n + row.before.length, 0),
  residualCallsInBundledModules: residual.reduce((n, row) => n + row.after.length, 0),
  limits: 'Module inclusion is not function reachability or proof that a user has opened the window. Adapted line numbers belong to generated source. Original openReader has a mounted-viewer route with preserved fallback and is reviewed separately. Ordinary TapNow portals and the MindMap action-slot portal are not new windows.', rows };
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, '当前旧窗口caller核对.json'), JSON.stringify(result, null, 2));
const lines = ['# 当前构建的旧窗口 caller 核对', '',
  `核对时间：${result.at}。候选运行目录：\`${runtime}\`。`, '',
  `按当前采用源规则读取 LCOS GUI 与 lab/pilot（包含未入包文件），共 ${result.selectedSourceCalls} 条 openWindow 直接调用，分布在 ${rows.length} 个文件；按当前正式组合变换核对后，当前 UI 已入包模块内仍有 ${result.residualCallsInBundledModules} 条。**入包不等于分支已触发，不能当作同等数量的实屏故障。**`, '',
  '## 当前入包仍保留的调用', '', '| 文件与原源码行 | 旧目的地 | 改接去向 |', '|---|---|---|'];
const destination = target => /conversation/.test(target) ? '原右栏原标题/会话内容；保留准确会话与请求回程'
  : /run-review/.test(target) ? '同一原右栏任务内容及返回栈'
  : /collection/.test(target) ? '原 Pile/Gallery/Group 与原成员详情'
  : /portal-preview/.test(target) ? '原位置轻预览及原 Workspace 导航'
  : /archive/.test(target) ? '原库归档分类/详情/恢复'
  : /runtime-doctor/.test(target) ? '原帮助/设置内按需诊断与真实恢复'
  : /native-workspace/.test(target) ? '当前唯一原画布及原右栏助手'
  : /native-preview/.test(target) ? '唯一原 Viewer 的资源/邻居切换'
  : '动态目的地须按真实 body 类型翻译；不得继续开启旧管理页';
for (const row of residual) for (const call of row.after) {
  const original = row.before.find(v => v.target === call.target) ?? row.before[0];
  lines.push(`| [${path.basename(row.file)}:${original.line}](<${row.selectedSource.replaceAll('\\', '/')}:${original.line}>) | \`${call.target.replaceAll('|', '\\|')}\` | ${destination(call.target)} |`);
}
lines.push('', '## 全部文件：改接、兼容与未入包区分', '', '| 文件 | 真实采用来源 | 原调用→变换后 | 当前模块入包 |', '|---|---|---|---|');
for (const row of rows) lines.push(`| [${path.basename(row.file)}](<${row.selectedSource.replaceAll('\\', '/')}>) | ${row.overriddenBy ? '由 ' + row.overriddenBy + ' 覆盖' : row.selectedSource === path.join(root, row.file) ? '工作区副本' : '显式当前 GN2 只读源'} | ${row.before.length} → ${row.after.length}${row.transformed ? '（实际生产组合变换）' : ''} | ${row.bundledModule ? '是；不代表已触发' : '本次三个 UI 包未检出模块，不报当前默认入口'} |`);
lines.push('', '## 需要人工判定的边界', '',
  '- ProfessionalWindowStage 仍有12类body分派与旧状态恢复。仅移掉新入口不足以退役，必须迁移地址、未完成输入和返回位置。',
  '- 选用源覆盖、当前磁盘副本、已构建包分别核对；没有拿副本里残留的旧调用替代真实组合变换。',
  '- 本表只计openWindow直接调用；openAssembly/openReader封装、shell恢复、旧portal/overlay、原厂商window.open/API旁路另见全区50项，不用31或8冒充整个功能覆盖率。',
  '- 当前没有入包的 ColorPinHud、LcosRailway、旧 Atlas/Hand 等不计为默认实屏窗口；保留功能迁移和潜伏旧实现记录。',
  '- 导图仅将按钮 portal 到原 Viewer 的既有动作槽，不构成第二窗口。普通原编辑路径保留的默认 dialog 和旧 GN2 恢复分支，分别登记。',
  '- 本清单是代码定位附录，逐功能流程、原件owner与修法以50项审查主报告为准；没有进行自动删窗或清状态。', '');
fs.writeFileSync(path.join(output, '当前旧窗口caller核对.md'), lines.join('\n'));
console.log(JSON.stringify({ at: result.at, sourceFilesWithCalls: result.sourceFilesWithCalls,
  selectedSourceCalls: result.selectedSourceCalls, residualCallsInBundledModules: result.residualCallsInBundledModules,
  output: path.join(output, '当前旧窗口caller核对.md') }));
