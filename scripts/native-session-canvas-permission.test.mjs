import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { installedRoot } from '../lab/pilot/build-pilot.mjs';
const source=await fs.readFile('lab/pilot/native-session-canvas-ui.tsx','utf8');
const start=source.indexOf('function canvasPermissionPresentation('),end=source.indexOf('/** Original Huabu permission tray',start);
assert.ok(start>0&&end>start);
const {transform}=createRequire(path.join(installedRoot,'huabu/apps/web/package.json'))('esbuild');
const compiled=await transform(source.slice(start,end),{loader:'ts',target:'es2022'});
const context=vm.createContext({useCanvasStore:{getState:()=>({nodes:[{id:'a',data:{title:'材料 A'}}]})}});
vm.runInContext(compiled.code+';globalThis.present=canvasPermissionPresentation;',context);
const report={passed:false,checks:[],scope:'Actual production canvasPermissionPresentation function; controlled original request/Canvas read port. No React UI or live session claim.',modelCalls:0,liveWrites:0};
try{
 const request=patches=>({toolCall:{rawInput:{patches}},options:[{name:'mcp: set_node_emphasis',kind:'allow_once',optionId:'once'},{name:'reject',kind:'reject_once',optionId:'no'}]});
 for(const [value,title]of[[true,'允许强调「材料 A」？'],[false,'允许取消强调「材料 A」？']]){
  const input=request([{nodeId:'a',patch:{lcos_gui_emphasis:value}}]),before=structuredClone(input),result=context.present(input);
  assert.equal(result.displayTitle,title);assert.equal(result.displayPreview,'只保存节点的视觉强调，不改正文、位置或任务。');
  assert.equal(result.part.toolCall,input.toolCall);assert.deepEqual(input,before);assert.equal(result.part.options[0].name,'允许这次');
 }
 report.checks.push('Actual same permission presenter labels true/false and preserves the original request/options ownership');
 const multiple=context.present(request([{nodeId:'a',patch:{lcos_gui_emphasis:true}},{nodeId:'b',patch:{lcos_gui_emphasis:false}}]));
 assert.equal(multiple.displayTitle,'允许调整画布强调显示？');
 assert.equal(context.present(request([null])).displayTitle,'允许调整画布强调显示？');
 report.checks.push('Multiple targets use honest generic wording; malformed raw null reaches no node lookup crash before the tool rejects it');
 const guiRequest=(name,rawInput)=>({toolCall:{rawInput},options:[{name:'mcp: '+name,kind:'allow_once',optionId:'once'},{name:'deny',kind:'reject_once',optionId:'no'}]});
 for(const[value,title]of[[true,'允许固定「材料 A」？'],[false,'允许取消固定「材料 A」？']]){
  const input=guiRequest('set_node_pinned',{nodeId:'a',pinned:value}),before=structuredClone(input),result=context.present(input);assert.equal(result.displayTitle,title);assert.equal(result.part.toolCall,input.toolCall);assert.deepEqual(input,before);
 }
 assert.match(context.present(guiRequest('set_node_pinned',{nodeId:'a',pinned:true,scope:'cross-surface'})).displayPreview,/其他现场/);
 report.checks.push('Pin explicit true/false and cross-surface use the same original permission request with accurate human action/range, not a toggle or new interface');
 for(const value of[true,false]){
  const input=guiRequest('set_node_color_pin',{nodeId:'a',color:'#F0606B',present:value}),before=structuredClone(input),result=context.present(input);
  assert.equal(result.displayTitle,`允许${value?'添加':'移除'}「材料 A」的颜色标记？`);assert.match(result.displayPreview,/红色标记，保留其他颜色/);assert.equal(result.part.toolCall,input.toolCall);assert.deepEqual(input,before);
 }
 const renamed=guiRequest('rename_color_pin',{definitionId:'original-definition',label:'交付相关',expectedLabel:null,expectedUpdatedAt:'observed-time'}),beforeRename=structuredClone(renamed),rename=context.present(renamed);
 assert.equal(rename.displayTitle,'允许将颜色组改名为「交付相关」？');assert.match(rename.displayPreview,/本项目里使用这个颜色组的位置/);assert.equal(rename.displayPreview.includes('observed-time'),false);assert.deepEqual(renamed,beforeRename);assert.equal(rename.part.toolCall,renamed.toolCall);
 for(const name of['set_node_pinned','set_node_color_pin','rename_color_pin'])assert.ok(context.present(guiRequest(name,null)).displayTitle);
 report.checks.push('Color add/remove preserve other colors; shared-definition rename honestly states project-wide usage and keeps CAS/raw callback untouched; malformed/null request is presentation-safe');
 report.passed=true;
}catch(error){report.error=String(error.stack??error);process.exitCode=1;}
const file=path.resolve('output/Agent纯GUI强调_20261027/原权限呈现.json');await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,file},null,2));
