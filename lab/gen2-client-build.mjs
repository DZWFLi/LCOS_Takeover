import { stripTypeScriptTypes } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backendRoot = path.join(workspaceRoot, 'lcos', 'apps', 'web-gen2', 'src', 'backend');
const sources = ['client.ts', 'coreTypes.ts', 'projects.ts', 'artifacts.ts'];

// Build output only: original Gen2 source files are never edited or executed during transformation.
export async function prepareGen2ClientModules(outputDirectory) {
  const output = path.resolve(outputDirectory);
  const runtime = path.join(workspaceRoot, '.runtime');
  if (!output.startsWith(runtime + path.sep)) throw new Error('Generated clients must stay in this experiment runtime.');
  await mkdir(output, { recursive: true });
  const files = [];
  for (const name of sources) {
    const sourcePath = path.join(backendRoot, name);
    const source = await readFile(sourcePath, 'utf8');
    const javascript = stripTypeScriptTypes(source, { mode: 'transform', sourceUrl: sourcePath });
    const emittedName = name.replace(/\.ts$/, '.js');
    await writeFile(path.join(output, emittedName), javascript, 'utf8');
    files.push({ source: path.relative(workspaceRoot, sourcePath).replaceAll('\\', '/'),
      emitted: emittedName, sourceBytes: Buffer.byteLength(source), emittedBytes: Buffer.byteLength(javascript) });
  }
  await writeFile(path.join(output, 'package.json'), '{"type":"module"}\n', 'utf8');
  return { outputDirectory: output, files, compiler: 'Node stripTypeScriptTypes, mode transform',
    scope: 'Original readonly client methods tested with an explicit injected fixture fetch; not a live Core connection.' };
}
