import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { transformNativeProviderSessionMcp } from '../lab/native-provider-session-mcp-transform.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function prepareNativeProviderMcp() {
  const runtime = fs.realpathSync(path.join(root, '.runtime/isolated-node-carry-20261020'));
  if (path.dirname(runtime) !== fs.realpathSync(path.join(root, '.runtime'))) throw new Error('Provider runtime must stay in this workspace.');
  const file = fs.realpathSync(path.join(runtime, 'live-provider/node_modules/@qwen-code/qwen-code/chunks/acpAgent-5XER3TGL.js'));
  if (!file.startsWith(runtime + path.sep)) throw new Error('Only the isolated provider copy can be adapted.');
  const source = fs.readFileSync(file, 'utf8'), backup = file + '.lcos-original';
  const original = fs.existsSync(backup) ? fs.readFileSync(backup, 'utf8') : source;
  const result = transformNativeProviderSessionMcp(original);
  const previousManaged = [transformNativeProviderSessionMcp(original, { declarationEvidence: false }),
    transformNativeProviderSessionMcp(original, { emptySessionRecord: false }),
    transformNativeProviderSessionMcp(original, { declarationEvidence: false, emptySessionRecord: false })];
  if (source !== original && source !== result && !previousManaged.includes(source))
    throw new Error('The isolated provider copy has unrelated changes; its original was preserved.');
  if (result !== source) {
    if (!fs.existsSync(backup)) fs.copyFileSync(file, backup, fs.constants.COPYFILE_EXCL);
    fs.writeFileSync(file, result);
    execFileSync(process.execPath, ['--check', file], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  }
  const receipt = { prepared: true, changed: result !== source, file, backup,
    behavior: 'Original session MCP add/remove refreshes the same model declarations. New sessions persist the original approval-mode metadata through the original recording service and writer lease before returning; no synthetic chat turn or permission change.' };
  fs.writeFileSync(path.join(runtime, 'provider-session-mcp-preparation.json'), JSON.stringify(receipt, null, 2));
  return receipt;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(JSON.stringify(prepareNativeProviderMcp(), null, 2));
