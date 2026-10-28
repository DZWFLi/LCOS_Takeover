import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {currentGen2Root} from './current-gen2-resources.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),ts=createRequire(path.join(currentGen2Root,'package.json'))('typescript');
export const nativeReaderSelectionSource='lcos/huabu/apps/web/src/lcos/ui/professional/useReaderTextFeatures.tsx';
const marker='/* native-reader-local-selection-payload */';
export function transformNativeReaderSelectionSource(source,{sourcePath}={}){
 if(!sourcePath||path.resolve(sourcePath).toLowerCase()!==path.join(root,nativeReaderSelectionSource).toLowerCase())throw Error('Original Reader selection source path changed.');
 if(source.includes(marker)){if(!source.includes('onExcerptDragStart?.(transfer'))throw Error('Original Reader excerpt drag callback is partially installed.');return source;}
 const file=ts.createSourceFile(sourcePath,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const owners=file.statements.filter(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='useReaderTextFeatures');
 if(owners.length!==1)throw Error('Original Reader selection owner changed.');const owner=owners[0],param=owner.parameters[0];
 if(!param||!ts.isObjectBindingPattern(param.name)||!param.type||!ts.isTypeLiteralNode(param.type)||param.name.elements.some(e=>e.name.getText(file)==='selectionPayload'))throw Error('Original Reader selection parameter seam changed.');
 const payloads=[];const walk=n=>{if(ts.isVariableDeclaration(n)&&n.name.getText(file)==='payload')payloads.push(n);ts.forEachChild(n,walk);};walk(owner);
 if(payloads.length!==1||!payloads[0].initializer||!ts.isArrowFunction(payloads[0].initializer)||!ts.isBlock(payloads[0].initializer.body))throw Error('Original Reader selection payload seam changed.');
 const body=payloads[0].initializer.body;
 if(!body.getText(file).includes('const selected = readerTextSelection(documentRoot());'))throw Error('Original Reader selection containment seam changed.');
 const drag=owner.body.statements.filter(n=>ts.isVariableStatement(n)).flatMap(n=>[...n.declarationList.declarations])
  .find(n=>n.name.getText(file)==='onDragStartCapture');
 const dragBody=drag?.initializer?.body,plain=[];
 const findPlain=n=>{if(ts.isExpressionStatement(n)&&ts.isCallExpression(n.expression)
  &&ts.isPropertyAccessExpression(n.expression.expression)&&n.expression.expression.name.text==='setData'
  &&n.expression.arguments[0]?.getText(file)==="'text/plain'")plain.push(n);ts.forEachChild(n,findPlain);};
 if(!dragBody||!ts.isBlock(dragBody)||drag.initializer.parameters[0]?.name.getText(file)!=='event')throw Error('Original Reader native drag source changed.');
 findPlain(dragBody);if(plain.length!==1)throw Error('Original Reader native drag readable payload seam changed.');
 const edits=[{start:param.name.end-1,end:param.name.end-1,text:', selectionPayload, onExcerptDragStart'},
 {start:param.type.end-1,end:param.type.end-1,text:' readonly selectionPayload?: () => MaterialTransferPayloadV1 | null; readonly onExcerptDragStart?: (payload: MaterialTransferPayloadV1, source: HTMLElement | null) => void; '},
 {start:body.getStart(file)+1,end:body.getStart(file)+1,text:'\n    if (selectionPayload) return selectionPayload();'},
 {start:plain[0].end,end:plain[0].end,text:'\n    onExcerptDragStart?.(transfer, event.target instanceof HTMLElement ? event.target : null);'}];
 for(const e of edits.sort((a,b)=>b.start-a.start))source=source.slice(0,e.start)+e.text+source.slice(e.end);
 return marker+'\n'+source;
}
export const nativeReaderSelectionSourceTransforms={[nativeReaderSelectionSource]:transformNativeReaderSelectionSource};
export function withNativeReaderSelectionSourceTransforms(existing={}){
 const before=existing[nativeReaderSelectionSource];return{...existing,[nativeReaderSelectionSource]:before?(source,options)=>transformNativeReaderSelectionSource(before(source,options),options):transformNativeReaderSelectionSource};
}
