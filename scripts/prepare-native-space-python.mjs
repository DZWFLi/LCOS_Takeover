import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The installed MCP distribution has one dependency in the user's package
 * directory. Copy that package module into our ignored runtime so the MCP
 * child can keep its isolated profile and never restore the user's HOME. */
export async function prepareNativeSpacePython(python) {
  const code = 'import importlib.util,json;from importlib.metadata import version;print(json.dumps({"mcp":version("mcp"),"typingExtensions":version("typing_extensions"),"module":importlib.util.find_spec("typing_extensions").origin}))';
  const info = JSON.parse(execFileSync(python, ['-X', 'utf8', '-c', code], { encoding: 'utf8', windowsHide: true, timeout: 10_000, stdio: ['ignore', 'pipe', 'pipe'] }));
  if (info.mcp !== '2.1.1' || path.basename(info.module).toLowerCase() !== 'typing_extensions.py') throw new Error('The installed canvas MCP dependencies are not the inspected versions.');
  const runtime = await fs.realpath(path.join(root, '.runtime'));
  const directory = path.join(runtime, 'native-space-python'); await fs.mkdir(directory, { recursive: true });
  if (await fs.realpath(directory) !== directory) throw new Error('The generated Python dependency directory must stay inside this runtime.');
  await fs.copyFile(info.module, path.join(directory, 'typing_extensions.py'));
  const result = { mcp: info.mcp, typingExtensions: info.typingExtensions, sourceModule: info.module,
    copiedModule: path.join(directory, 'typing_extensions.py'), packageOnly: true, userProfileCopied: false };
  await fs.writeFile(path.join(directory, 'provenance.json'), JSON.stringify(result, null, 2));
  return result;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const python = process.argv.find(arg => arg.startsWith('--python='))?.slice(9);
  if (!python || !path.isAbsolute(python)) throw new Error('Provide the existing absolute Python executable.');
  console.log(JSON.stringify(await prepareNativeSpacePython(python), null, 2));
}
