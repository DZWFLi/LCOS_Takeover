import path from 'node:path';
import { createRequire } from 'node:module';
import { currentGen2Root } from './current-gen2-resources.mjs';

const root=path.resolve(import.meta.dirname,'..'),base='lcos/huabu/apps/web/src/lcos/';
const ts=createRequire(path.join(currentGen2Root,'package.json'))('typescript');
const owners={references:base+'lcosReferenceState.ts',snapshot:base+'composer/referenceSnapshot.ts',
 ingress:base+'composer/composerMaterialIngress.ts',composer:base+'composer/LcosComposerHost.tsx'};
const marker='/* LCOS exact GUI reference source locations. */';
const helperFile=path.join(root,'lab/pilot/native-reference-locations.ts');
const typeFile=path.join(root,'lab/pilot/native-text-location.ts');
function spec(from,to){const value=path.relative(path.dirname(from),to).replaceAll('\\','/');return value.startsWith('.')?value:'./'+value;}
function adapt(source,kind,sourcePath){
 if(path.resolve(sourcePath).toLowerCase()!==path.resolve(root,owners[kind]).toLowerCase())throw Error('Reference locations require the exact original '+kind+' owner.');
 if(source.includes(marker))return source;
 let value=source.replaceAll('\r\n','\n');
 const once=(from,to)=>{if(value.split(from).length!==2)throw Error('Original reference location seam changed: '+from.slice(0,100));value=value.replace(from,to);};
 const imports=[];
 if(kind==='references'){
  imports.push('mergeNativeDraftReferenceLocations');
  value='import type {NativeTextSingleLocator} from '+JSON.stringify(spec(sourcePath,typeFile))+';\n'+value;
  once('export interface LcosNodeEntityRef extends CoreEntityRefLike {','export interface LcosNodeEntityRef extends CoreEntityRefLike {\n  readonly sourceLocations?: readonly NativeTextSingleLocator[];');
  once('          draft = toggleReference(draft, ref); added++;\n        }','          draft = toggleReference(draft, ref); added++;\n        } else {\n          draft = mergeNativeDraftReferenceLocations(draft, ref);\n        }');
 }else if(kind==='snapshot'){
  imports.push('normalizeNativeReferenceLocationFields','nativeReferenceLocationFields','mergeNativeReferenceLocations');
  value='import type {NativeTextSingleLocator} from '+JSON.stringify(spec(sourcePath,typeFile))+';\n'+value;
  once('export interface PresentedReference extends CoreEntityRefLike {','export interface PresentedReference extends CoreEntityRefLike {\n  readonly sourceLocations?: readonly NativeTextSingleLocator[];');
  once('  const descriptor = ref.descriptor;','  ref = normalizeNativeReferenceLocationFields(ref);\n  const descriptor = ref.descriptor;');
  once('    ...(snapshot.displayLabel ? { displayLabel: snapshot.displayLabel } : {}),','    ...(snapshot.displayLabel ? { displayLabel: snapshot.displayLabel } : {}),\n    ...nativeReferenceLocationFields(snapshot),');
  once('    if (!seen.has(key)) { seen.add(key); references.push(snapshot); }',`    if (!seen.has(key)) { seen.add(key); references.push(snapshot); }
    else {
      const index = references.findIndex(value => draftReferenceKey(value) === key);
      if (index >= 0) references[index] = mergeNativeReferenceLocations(references[index]!, snapshot);
    }`);
 }else if(kind==='ingress'){
  imports.push('withNativeReferenceSourceLocation');
  value='import {normalizeNativeTextLocator} from '+JSON.stringify(spec(sourcePath,typeFile))+';\n'+value;
  once("  if (!text?.trim()) return reject('此摘录暂无正文，请在阅读器选择文字；原输入保留。');",`  if (!text?.trim()) return reject('此摘录暂无正文，请在阅读器选择文字；原输入保留。');
  const sourceLocator=source.locator===undefined?undefined:normalizeNativeTextLocator(source.locator);
  if(source.locator!==undefined&&!sourceLocator)return reject('摘录位置无法识别，原输入与引用保留。');
  if(sourceLocator&&'textRange' in sourceLocator&&sourceLocator.textRange.quote!==text)
    return reject('摘录文字与原位置不一致，原输入与引用保留。');`);
  once("references.addEntitiesToDraft([{entityType:'artifact',entityId:source.artifactId,revisionId:source.revisionId,\n    displayLabel:source.title,...(source.viewId ? {artifactViewId:source.viewId} : {})}]", "references.addEntitiesToDraft([withNativeReferenceSourceLocation({entityType:'artifact',entityId:source.artifactId,revisionId:source.revisionId,\n    displayLabel:source.title,...(source.viewId ? {artifactViewId:source.viewId} : {})},sourceLocator)]");
 }else if(kind==='composer'){
  imports.push('inspectNativeReferenceLocation');
  once('const inspectRequest = useRef<AbortController | null>(null);','const inspectRequest = useRef<{owner:object;controller:AbortController} | null>(null);');
  once('  const inputKey = composerInputKey(composerTarget);',`  const inputKey = composerInputKey(composerTarget);
  const inspectCanvasId = useCanvasStore(value => value.canvasId), inspectCanvasApi = useCanvasStore(value => value.rfInstance);
  const inspectOwner = useMemo(() => ({}), [projectId,inputKey,open,composerTarget?.messageId,composerTarget?.continuationOperationId,inspectCanvasId,inspectCanvasApi]);
  const inspectLatestOwner = useRef<object|null>(inspectOwner); inspectLatestOwner.current=inspectOwner;`);
  // Mixed Scope already adds message/operation ownership to this exact effect.
  // Address the real cleanup AST instead of requiring its pre-composition text.
  const cleanupFile=ts.createSourceFile(sourcePath,value,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),cleanups=[];
  const findCleanup=node=>{if(ts.isCallExpression(node)&&node.expression.getText(cleanupFile)==='useEffect'
    &&node.arguments[0]?.getText(cleanupFile).includes('inspectRequest.current?.abort()'))cleanups.push(node);ts.forEachChild(node,findCleanup);};findCleanup(cleanupFile);
  if(cleanups.length!==1||cleanups[0].arguments.length!==2||!ts.isArrayLiteralExpression(cleanups[0].arguments[1]))throw Error('Original reference inspection cleanup owner changed.');
  const cleanup=cleanups[0],dependencies=cleanup.arguments[1].elements.map(node=>node.getText(cleanupFile));
  const basic=['projectId','inputKey'],mixed=[...basic,'composerTarget?.messageId','composerTarget?.continuationOperationId'];
  if(JSON.stringify(dependencies)!==JSON.stringify(basic)&&JSON.stringify(dependencies)!==JSON.stringify(mixed))throw Error('Original reference inspection cleanup dependencies changed.');
  value=value.slice(0,cleanup.getStart(cleanupFile))+`useEffect(() => {
    if(inspectLatestOwner.current===null)inspectLatestOwner.current=inspectOwner;
    return()=>{
      if(inspectLatestOwner.current===inspectOwner)inspectLatestOwner.current=null;
      if(inspectRequest.current?.owner===inspectOwner)inspectRequest.current.controller.abort();
    };
  }, [inspectOwner])`+value.slice(cleanup.end);
  const file=ts.createSourceFile(sourcePath,value,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),matches=[];
  const visit=node=>{if(ts.isVariableDeclaration(node)&&node.name.getText(file)==='inspectReference'&&node.initializer&&ts.isArrowFunction(node.initializer))matches.push(node.initializer.body);ts.forEachChild(node,visit);};visit(file);
  if(matches.length!==1||!ts.isBlock(matches[0]))throw Error('Original reference chip inspect owner changed.');
  const body=matches[0];
  const scopeBranches=[];const findScope=node=>{if(ts.isIfStatement(node)&&node.expression.getText(file)==="ref.entityType === 'scope'")scopeBranches.push(node);ts.forEachChild(node,findScope);};findScope(body);
  if(scopeBranches.length>1)throw Error('Original Scope reference inspection owner changed.');
  const scope=scopeBranches[0];
  if(scope&&(!scope.getText(file).includes('draftReferenceUnavailableReason(ref, composerTarget?.intent)')
    ||!scope.getText(file).includes('requestNativeScopeReferenceView(')
    ||!scope.getText(file).includes('current.composerTarget?.messageId !== composerTarget?.messageId')
    ||!scope.getText(file).includes('current.composerTarget?.continuationOperationId !== composerTarget?.continuationOperationId')))throw Error('Original Scope reference inspection safeguards changed.');
  const hasNativeMaterialRoute=body.getText(file).includes('requestNativeMaterialView(');
  value=value.slice(0,body.getStart(file))+`{
    if(!inputKey||inspectLatestOwner.current!==inspectOwner)return;
    const request=new AbortController();
    try {
      await inspectNativeReferenceLocation(ref,title,{projectId,inputKey,open,
        messageId:composerTarget?.messageId,continuationOperationId:composerTarget?.continuationOperationId},request,{
        shell:()=>useLcosShellStore.getState(),canvas:()=>useCanvasStore.getState(),references:()=>useLcosReferenceStore.getState(),snapshotReference:snapshotDraftReference,
        subscribeShell:useLcosShellStore.subscribe,subscribeCanvas:useCanvasStore.subscribe,subscribeReferences:useLcosReferenceStore.subscribe,
        isRenderedCurrent:()=>inspectLatestOwner.current===inspectOwner,
        readGraph:(id)=>session.projects.getProjectGraph(id),
        ${scope?`scopeUnavailableReason:()=>draftReferenceUnavailableReason(ref,composerTarget?.intent),
        openScope:(target)=>requestNativeScopeReferenceView(target),`:''}
        ${hasNativeMaterialRoute?'openMaterial:(target)=>requestNativeMaterialView(target),':''}
        onBeforeRead:()=>{rememberCaret();inspectRequest.current?.controller.abort();inspectRequest.current={owner:inspectOwner,controller:request};},
      });
    } catch(error) {
      if(!request.signal.aborted&&inspectLatestOwner.current===inspectOwner){setState('error');setErrorDetail(error instanceof Error?error.message:'引用读取失败');}
    } finally {if(inspectRequest.current?.controller===request)inspectRequest.current=null;}
  }`+value.slice(body.end);
 }
 return 'import {'+imports.join(',')+'} from '+JSON.stringify(spec(sourcePath,helperFile))+';\n'+value+'\n'+marker;
}
/** Compose last, after the existing exact Reader/Composer/draft transforms. */
export function withNativeReferenceLocationTransforms(existing={}){
 const next={...existing};for(const[kind,file]of Object.entries(owners)){
  const prior=next[file];next[file]=(source,options)=>adapt(prior?prior(source,options):source,kind,options.sourcePath);
 }return next;
}
export const nativeReferenceLocationOwners={...owners};
