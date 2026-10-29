import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { transformNativeCoreRunEventSource } from '../native-core-runtime-source-transform.mjs';
import { createNativeCoreCollectionTitleTransforms } from '../native-core-collection-title-transform.mjs';
import { createNativeCoreColorPinTransforms } from '../native-core-color-pin-transform.mjs';
import { createNativeCoreNavigationPinTransforms } from '../native-core-navigation-pin-transform.mjs';
import { createNativeCoreWorkspaceMembershipTransforms } from '../native-core-workspace-membership-transform.mjs';
import { createNativeCoreWorkflowCollectionMemberTransforms } from '../native-core-workflow-collection-member-transform.mjs';
import { createNativeCoreMixedScopeContinuationTransforms } from '../native-core-mixed-scope-continuation-transform.mjs';
import { createNativeCoreMixedScopeManifestTransforms } from '../native-core-mixed-scope-manifest-transform.mjs';
import { createNativeCoreLiveContinuationTransforms } from '../native-core-live-continuation-transform.mjs';
import { createNativeCoreLiveConversationArchiveTransforms } from '../native-core-live-conversation-archive-transform.mjs';
import { createNativeSessionCanvasToolsTransforms } from '../native-session-canvas-tools-transform.mjs';
import { createNativeCoreWorkflowMethodTransforms } from '../native-core-workflow-method-transform.mjs';
import { createNativeCoreWorkflowLifecycleTransforms } from '../native-core-workflow-lifecycle-transform.mjs';
import { createNativeWorkflowProjectionTransforms } from '../native-workflow-projection-source-transform.mjs';
import { currentGen2Root, readCurrentGen2Resource, resolveCurrentGen2Resource } from '../current-gen2-resources.mjs';
const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const installedRoot = currentGen2Root;
const dependencyRequire = createRequire(path.join(installedRoot, 'package.json'));
const dependencyResolvers = ['huabu/apps/web', 'huabu/packages/shared', 'apps/local-core', 'huabu/apps/server', 'huabu', ''].map(folder => createRequire(path.join(installedRoot, folder, 'package.json')));
const esbuild = dependencyRequire('esbuild');
const markdownStore=path.join(installedRoot,'huabu/node_modules/.pnpm');
const markdownPackage=fs.readdirSync(markdownStore).find(name=>name.startsWith('mdast-util-to-markdown@'));
const localPackages = new Map(fs.readdirSync(path.join(workspaceRoot, 'lcos/packages')).flatMap(name => {
  const file = path.join(workspaceRoot, 'lcos/packages', name, 'package.json');
  if (!fs.existsSync(file)) return [];
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  return [[manifest.name, path.join(path.dirname(file), 'src/index.ts')]];
}));
localPackages.set('@local-creative-os/web-gen2',path.join(workspaceRoot,'lcos/apps/web-gen2/src/index.ts'));
localPackages.set('@huabu/shared',path.join(workspaceRoot,'lcos/huabu/packages/shared/src/index.ts'));
localPackages.set('@huabu/shared/canvas-engine',path.join(workspaceRoot,'lcos/huabu/packages/shared/src/canvas-engine/index.ts'));
for(const folder of fs.readdirSync(path.join(workspaceRoot,'lcos/huabu/external/agenetes/packages'))) {
  const dir=path.join(workspaceRoot,'lcos/huabu/external/agenetes/packages',folder);
  if(fs.existsSync(path.join(dir,'src/index.ts')))localPackages.set(JSON.parse(fs.readFileSync(path.join(dir,'package.json'),'utf8')).name,path.join(dir,'src/index.ts'));
}
export async function buildPilotEntry(entry, output, platform = 'node', { nativeReact = false, env = {}, sourceOverrides = {}, sourceTransforms = {}, coreCollectionTitle = false, coreColorPin = false, coreWorkspaceMembership = false, coreWorkflowCollectionMembers = false, coreMixedScopeContext = false, coreLiveContinuation = false } = {}) {
  const adoptedResources = new Map();
  const readSource = sourcePath => {
    const current = readCurrentGen2Resource(sourcePath);
    if (!current) return fs.readFileSync(sourcePath, 'utf8');
    const { contents, ...provenance } = current;
    adoptedResources.set(current.resourcePath, provenance);
    return contents;
  };
  if (nativeReact && platform !== 'browser') throw new Error('Native React reuse is browser-only.');
  if (typeof coreCollectionTitle !== 'boolean') throw new TypeError('coreCollectionTitle must be an explicit boolean.');
  if (coreCollectionTitle && platform !== 'node') throw new Error('Core Collection title producer transforms are Node/Core-only.');
  if (typeof coreColorPin !== 'boolean') throw new TypeError('coreColorPin must be an explicit boolean.');
  if (coreColorPin && platform !== 'node') throw new Error('Core Color Pin producer transforms are Node/Core-only.');
  if (typeof coreWorkspaceMembership !== 'boolean') throw new TypeError('coreWorkspaceMembership must be an explicit boolean.');
  if (coreWorkspaceMembership && platform !== 'node') throw new Error('Core Workspace membership condition transforms are Node/Core-only.');
  if (typeof coreLiveContinuation !== 'boolean') throw new TypeError('coreLiveContinuation must be an explicit boolean.');
  if (coreLiveContinuation && platform !== 'node') throw new Error('Live Continuation Core transforms are Node/Core-only.');
  if (typeof coreMixedScopeContext !== 'boolean') throw new TypeError('coreMixedScopeContext must be an explicit boolean.');
  if (coreMixedScopeContext && platform !== 'node') throw new Error('Mixed Scope Core transforms are Node/Core-only.');
  if (typeof coreWorkflowCollectionMembers !== 'boolean') throw new TypeError('coreWorkflowCollectionMembers must be an explicit boolean.');
  if (coreWorkflowCollectionMembers && platform !== 'node') throw new Error('Core Workflow Collection member transforms are Node/Core-only.');
  if (Object.keys(sourceOverrides).length && (!nativeReact || platform !== 'browser')) throw new Error('Native source ports are browser-only and must share the original React runtime.');
  const overrides = new Map(Object.entries(sourceOverrides).map(([source, replacement]) => {
    const original = path.resolve(workspaceRoot, source), target = path.resolve(workspaceRoot, replacement);
    const copiedRoot = path.join(workspaceRoot, 'lcos') + path.sep, labRoot = path.join(workspaceRoot, 'lab') + path.sep;
    if (!original.startsWith(copiedRoot) || !target.startsWith(labRoot) || !fs.existsSync(original) || !fs.existsSync(target)) throw new Error('Source ports must map an existing copied LCOS file to an existing lab file.');
    return [original.toLowerCase(), target];
  }));
  if (Object.keys(sourceTransforms).length && (!nativeReact || platform !== 'browser')) throw new Error('Native source transforms are browser-only and must share the original React runtime.');
  const transforms = new Map(Object.entries(sourceTransforms).map(([source, transform]) => {
    const original = path.resolve(workspaceRoot, source);
    if (!original.toLowerCase().startsWith((path.join(workspaceRoot, 'lcos') + path.sep).toLowerCase())
      || (!fs.existsSync(original) && !resolveCurrentGen2Resource(original)) || typeof transform !== 'function' || overrides.has(original.toLowerCase())) {
      throw new Error('Source transforms must address an existing copied LCOS file, without a competing source override.');
    }
    return [original.toLowerCase(), transform];
  }));
  const coreTitleTransforms = new Map(coreCollectionTitle
    ? Object.entries(createNativeCoreCollectionTitleTransforms()).map(([source, transform]) => [
      path.resolve(workspaceRoot, source).toLowerCase(), transform,
    ])
    : []);
  const corePinTransforms = new Map(coreColorPin
    ? Object.entries({ ...createNativeCoreColorPinTransforms(), ...createNativeCoreNavigationPinTransforms() }).map(([source, transform]) => [
      path.resolve(workspaceRoot, source).toLowerCase(), transform,
    ]) : []);
  const coreMembershipTransforms = new Map(coreWorkspaceMembership
    ? Object.entries(createNativeCoreWorkspaceMembershipTransforms()).map(([source, transform]) => [
      path.resolve(workspaceRoot, source).toLowerCase(), transform,
    ]) : []);
  const coreWorkflowCollectionTransforms = new Map(coreWorkflowCollectionMembers
    ? Object.entries(createNativeCoreWorkflowCollectionMemberTransforms()).map(([source, transform]) => [
      path.resolve(workspaceRoot, source).toLowerCase(), transform,
    ]) : []);
  const coreMixedScopeTransforms = new Map(coreMixedScopeContext
    ? Object.entries({ ...createNativeCoreMixedScopeManifestTransforms(), ...createNativeCoreMixedScopeContinuationTransforms() }).map(([source, transform]) => [path.resolve(workspaceRoot, source).toLowerCase(), transform]) : []);
  const coreLiveContinuationTransforms = new Map(coreLiveContinuation
    ? Object.entries(createNativeCoreLiveContinuationTransforms()).map(([source, transform]) => [path.resolve(workspaceRoot, source).toLowerCase(), transform]) : []);
  const coreLiveConversationArchiveTransforms = new Map(coreLiveContinuation
    ? Object.entries(createNativeCoreLiveConversationArchiveTransforms()).map(([source, transform]) => [path.resolve(workspaceRoot, source).toLowerCase(), transform]) : []);
  const nativeSessionCanvasToolsTransforms = new Map(coreLiveContinuation
    ? Object.entries(createNativeSessionCanvasToolsTransforms()).map(([source, transform]) => [path.resolve(workspaceRoot, source).toLowerCase(), transform]) : []);
  const nativeWorkflowMethodTransforms = new Map(coreWorkflowCollectionMembers
    ? Object.entries(createNativeCoreWorkflowMethodTransforms()).map(([source, transform]) => [path.resolve(workspaceRoot, source).toLowerCase(), transform]) : []);
  const nativeWorkflowLifecycleTransforms = new Map(coreWorkflowCollectionMembers
    ? Object.entries(createNativeCoreWorkflowLifecycleTransforms()).map(([source, transform]) => [path.resolve(workspaceRoot, source).toLowerCase(), transform]) : []);
  const nativeWorkflowProjectionTransforms = new Map((coreWorkflowCollectionMembers || nativeReact) ? Object.entries(createNativeWorkflowProjectionTransforms()).map(([source, transform]) => [path.resolve(workspaceRoot, source).toLowerCase(), transform]) : []);
  const adaptCoreSource = (source, sourcePath) => {
    const target = path.resolve(sourcePath).toLowerCase();
    let adapted = source;
    for (const transforms of [coreTitleTransforms, corePinTransforms, coreMembershipTransforms, coreWorkflowCollectionTransforms, coreMixedScopeTransforms, coreLiveContinuationTransforms, coreLiveConversationArchiveTransforms, nativeSessionCanvasToolsTransforms, nativeWorkflowMethodTransforms, nativeWorkflowLifecycleTransforms, nativeWorkflowProjectionTransforms]) {
      const transform = transforms.get(target);
      if (transform) adapted = transform(adapted, { sourcePath });
    }
    return adapted;
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const built=await esbuild.build({ entryPoints: [path.join(workspaceRoot, entry)], outfile: output, bundle: true,metafile:true,
    platform, format: 'esm', target: platform === 'node' ? 'node22' : 'es2022', logLevel: 'warning',
    ...(platform==='browser'?{jsx:'automatic',...(nativeReact?{publicPath:'/lcos/'}:{}),define:{'import.meta.env':JSON.stringify({DEV:false,PROD:true,MODE:'production',BASE_URL:'/',VITE_API_BASE:'',...env})},loader:{'.woff2':'file','.woff':'file','.ttf':'file','.svg':'file','.png':'file','.jpg':'file','.webp':'file','.wasm':'file'},assetNames:'assets/[name]'}:{}),
    plugins: [...(platform === 'node' ? [(await import('../native-text-source-projection-build.mjs')).createNativeTextSourceProjectionPlugin()] : []),
      { name: 'copied-source-installed-dependencies', setup(build) {
      if (transforms.size) build.onLoad({ filter: /\.[jt]sx?$/ }, args => {
        const transform = transforms.get(args.path.toLowerCase());
        if (!transform) return undefined;
        const contents = transform(readSource(args.path), { sourcePath: args.path });
        if (typeof contents !== 'string') throw new TypeError('A native source transform must return source text.');
        return { contents, loader: args.path.endsWith('.tsx') ? 'tsx' : args.path.endsWith('.ts') ? 'ts' : 'js', resolveDir: path.dirname(args.path) };
      });
      if (platform === 'browser' && nativeWorkflowProjectionTransforms.size) build.onLoad({filter:/\.[jt]sx?$/}, args=>{
        const transform=nativeWorkflowProjectionTransforms.get(path.resolve(args.path).toLowerCase());
        if(!transform)return undefined;
        return {contents:transform(readSource(args.path)),loader:args.path.endsWith('.tsx')?'tsx':'ts',resolveDir:path.dirname(args.path)};
      });
      if(nativeReact){
        build.onResolve({filter:/^\/lcos\/agent-ui\.js$/},()=>({path:'/lcos/agent-ui.js',external:true}));
        build.onResolve({filter:/(?:^|\/)surface-dock-ui\.js$/},()=>({path:'/surface-dock-ui.js',external:true}));
        build.onResolve({filter:/^\/lcos\/native-flow\.js$/},()=>({path:'/lcos/native-flow.js',external:true}));
        const nativeModule=specifier=>specifier==='react'?'/lcos/native-react.js':specifier==='react-dom'?'/lcos/native-react-dom.js':'/lcos/native-jsx-runtime.js';
        const resolveNative=args=>args.kind==='require-call'
          ?{path:args.path,namespace:'pilot-native-react-cjs'}
          :{path:nativeModule(args.path),external:true};
        build.onResolve({filter:/^react(?:\/jsx(?:-dev)?-runtime)?$/},resolveNative);
        build.onResolve({filter:/^react-dom$/},resolveNative);
        build.onResolve({filter:/^react-router(?:-dom)?$/},args=>args.kind==='require-call'
          ?{path:args.path,namespace:'pilot-native-router-cjs'}
          :{path:'/lcos/native-router.js',external:true});
        build.onResolve({filter:/^\/lcos\/native-router\.js$/},()=>({path:'/lcos/native-router.js',external:true}));
        build.onLoad({filter:/.*/,namespace:'pilot-native-router-cjs'},()=>({
          contents:'import * as NativeRouter from "/lcos/native-router.js"; module.exports=NativeRouter;',loader:'js',
        }));
        build.onResolve({filter:/^\/lcos\/native-(?:react|react-dom|jsx-runtime)\.js$/},args=>({path:args.path,external:true}));
        build.onLoad({filter:/.*/,namespace:'pilot-native-react-cjs'},args=>({
          contents:args.path==='react'
            ?'import NativeReact from "/lcos/native-react.js"; module.exports=NativeReact;'
            :'import * as NativeRuntime from '+JSON.stringify(nativeModule(args.path))+'; module.exports=NativeRuntime;',
          loader:'js',
        }));
        build.onResolve({filter:/^react-dom\/client$/},()=>({errors:[{text:'Native extensions must reuse the original React root; react-dom/client is not allowed.'}]}));
      }
      if(overrides.size)build.onResolve({filter:/^\.{1,2}\//},args=>{
        const target=path.resolve(args.resolveDir,args.path);
        const candidates=[target,target+'.ts',target+'.tsx',target+'.js',path.join(target,'index.ts'),path.join(target,'index.tsx')];
        const replacement=candidates.map(file=>overrides.get(file.toLowerCase())).find(Boolean);
        return replacement?{path:replacement}:undefined;
      });
      // Resolve explicitly selected current helpers even when the early copy
      // never contained them. Keep their original copied module identity and
      // sibling resolution; do not introduce a second LCOS singleton tree.
      build.onResolve({filter:/^\.{1,2}\//},args=>{
        const target=path.resolve(args.resolveDir,args.path);
        const stem=target.replace(/\.[cm]?jsx?$/, '');
        const candidates=[target,target+'.ts',target+'.tsx',stem+'.ts',stem+'.tsx',path.join(target,'index.ts')];
        const selected=candidates.map(resolveCurrentGen2Resource).find(Boolean);
        return selected?{path:selected.copiedPath}:undefined;
      });
      build.onLoad({filter:/\.(?:css|[cm]?[jt]sx?)$/},args=>{
        if(!resolveCurrentGen2Resource(args.path))return undefined;
        let contents=readSource(args.path);
        if(platform==='node'){
          contents=adaptCoreSource(contents,args.path);
          contents=contents.replaceAll('import.meta.url',JSON.stringify(pathToFileURL(args.path).href));
        }
        return {contents,loader:args.path.endsWith('.css')?'css':args.path.endsWith('.tsx')?'tsx':args.path.endsWith('.ts')?'ts':'js',resolveDir:path.dirname(args.path)};
      });
      build.onResolve({filter:/^file:\/\//},args=>({path:args.path,external:true}));
      if(platform==='node'){
        build.onResolve({filter:/^pdfjs-dist$/},()=>({path:pathToFileURL(dependencyResolvers.map(r=>{try{return r.resolve('pdfjs-dist/legacy/build/pdf.mjs');}catch{return null;}}).find(Boolean)).href,external:true}));
        build.onResolve({filter:/^@resvg\/resvg-wasm$/},args=>({path:dependencyResolvers.map(r=>{try{return r.resolve(args.path);}catch{return null;}}).find(Boolean),namespace:'pilot-cjs-interop'}));
        build.onLoad({filter:/.*/,namespace:'pilot-cjs-interop'},args=>({contents:'import pkg from '+JSON.stringify(pathToFileURL(args.path).href)+'; export const initWasm=pkg.initWasm; export const Resvg=pkg.Resvg;',loader:'js'}));
      }
      if(platform==='browser'){
        build.onResolve({filter:/\?url$/},async args=>{
          const result=await build.resolve(args.path.slice(0,-4),{kind:'import-statement',resolveDir:args.resolveDir});
          return result.path?{path:result.path,namespace:'pilot-asset-url'}:undefined;
        });
        build.onLoad({filter:/.*/,namespace:'pilot-asset-url'},args=>{
          const dir=path.join(path.dirname(output),'assets');fs.mkdirSync(dir,{recursive:true});const name=path.basename(args.path);fs.copyFileSync(args.path,path.join(dir,name));
          return{contents:'export default '+JSON.stringify((nativeReact?'/lcos/assets/':'/assets/assets/')+name)+';',loader:'js'};
        });
      }
      if(platform==='node')build.onLoad({filter:/\.[cm]?[jt]sx?$/},args=>{
        if(!args.path.startsWith(path.join(workspaceRoot,'lcos')+path.sep))return undefined;
        const original=readSource(args.path);
        const sourcePath = path.resolve(args.path).toLowerCase();
        const titled = adaptCoreSource(original, args.path);
        const adapted=sourcePath===path.join(workspaceRoot,'lcos/apps/local-core/src/server.ts').toLowerCase()
          ?transformNativeCoreRunEventSource(titled,{sourcePath:args.path}):titled;
        return {contents:adapted.replaceAll('import.meta.url',JSON.stringify(pathToFileURL(args.path).href)),loader:args.path.endsWith('.ts')?'ts':args.path.endsWith('.tsx')?'tsx':'js',resolveDir:path.dirname(args.path)};
      });
      if(platform==='node')build.onLoad({filter:/\.(?:mjs|js)$/},args=>{
        const exactLabPaths = new Set([
          path.join(workspaceRoot, 'lab/native-pile-group-layout.mjs').toLowerCase(),
          path.join(workspaceRoot, 'lab/agent-node-transform.mjs').toLowerCase(),
        ]);
        if(!exactLabPaths.has(path.resolve(args.path).toLowerCase()))return undefined;
        // These two exact source helpers resolve donor assets relative to their
        // original file URLs. Preserve that provenance through the isolated
        // Node bundle instead of letting import.meta.url point into .runtime.
        const contents=fs.readFileSync(args.path,'utf8').replaceAll('import.meta.url',JSON.stringify(pathToFileURL(args.path).href));
        return {contents,loader:'js',resolveDir:path.dirname(args.path)};
      });
      build.onResolve({filter:/^@\//},args=>{
        const target=path.join(workspaceRoot,'lcos/huabu/apps/web/src',args.path.slice(2));
        const file=[target,target+'.ts',target+'.tsx',target+'.js',path.join(target,'index.ts'),path.join(target,'index.tsx')].find(file=>fs.existsSync(file)&&fs.statSync(file).isFile());
        return file?{path:overrides.get(file.toLowerCase())||file}:undefined;
      });
      build.onResolve({filter:/^mdast-util-to-markdown$/},()=>({path:path.join(markdownStore,markdownPackage,'node_modules/mdast-util-to-markdown/index.js')}));
      build.onResolve({filter:/^@huabu\//},args=>localPackages.has(args.path)?{path:localPackages.get(args.path)}:undefined);
      build.onResolve({filter:/^@agenetes\//},args=>localPackages.has(args.path)?{path:localPackages.get(args.path)}:undefined);
      build.onResolve({ filter: /^@local-creative-os\// }, args => {
        const entry = localPackages.get(args.path);
        return entry ? { path: entry } : undefined;
      });
      build.onResolve({ filter: /^[^./]/ }, async args => {
        if(args.pluginData?.installedResolution)return undefined;
        if(args.kind==='url-token')return undefined;
        if (args.kind === 'entry-point' || path.isAbsolute(args.path) || args.path.startsWith('node:') || args.path.startsWith('@/') || localPackages.has(args.path)) return undefined;
        try {
          const copiedRoot=path.join(workspaceRoot,'lcos');
          const originalDir=args.resolveDir.startsWith(copiedRoot+path.sep)?path.join(installedRoot,path.relative(copiedRoot,args.resolveDir)):args.resolveDir;
          const sourceResolver=createRequire(path.join(originalDir,'package.json'));
          if(platform==='browser'){
            const dirs=[originalDir,path.join(installedRoot,'huabu/apps/web'),path.join(installedRoot,'huabu/packages/shared')];
            for(const resolveDir of dirs){const result=await build.resolve(args.path,{kind:'import-statement',resolveDir,pluginData:{installedResolution:true}});if(result.path&&!result.errors.length)return{path:result.path,external:result.external};}
          }
          if(platform==='node'){
            for(const resolveDir of[originalDir,path.join(installedRoot,'huabu/apps/server'),path.join(installedRoot,'apps/local-core')]){
              const result=await build.resolve(args.path,{kind:'import-statement',resolveDir,pluginData:{installedResolution:true}});
              if(result.path&&!result.errors.length)return{path:pathToFileURL(result.path).href,external:true};
            }
          }
          const resolved = [sourceResolver,...dependencyResolvers].map(resolver => { try { return resolver.resolve(args.path); } catch { return null; } }).find(Boolean);
          if (!resolved) {
            const copiedRoot=path.join(workspaceRoot,'lcos');
            const relative=path.relative(copiedRoot,args.resolveDir);
            const directories=[args.resolveDir,path.join(installedRoot,relative),...['huabu/apps/web','huabu/apps/server','apps/local-core','huabu'].map(dir=>path.join(installedRoot,dir))];
            for(const resolveDir of directories){
              const result=await build.resolve(args.path,{kind:'import-statement',resolveDir,pluginData:{installedResolution:true}});
              if(result.path&&!result.errors.length){return platform==='node'?{path:pathToFileURL(result.path).href,external:true}:{path:result.path};}
            }
            return undefined;
          }
          return platform === 'node' ? { path: pathToFileURL(resolved).href, external: true } : { path: resolved };
        } catch { return undefined; }
      });
    } }] });
  if(platform==='browser')fs.writeFileSync(path.join(path.dirname(output),'public-assets.json'),JSON.stringify([...Object.keys(built.metafile.outputs).map(file=>path.relative(path.dirname(output),path.resolve(file)).replaceAll('\\','/')),'assets/pdf.worker.min.mjs','recovered-markdown.css','pilot.css']));
  fs.writeFileSync(output+'.sources.json',JSON.stringify({currentRoot:currentGen2Root,
    resources:[...adoptedResources.values()],nativePorts:[...overrides.entries()].map(([sourcePath,replacementPath])=>({sourcePath,replacementPath}))},null,2));
  return output;
}
