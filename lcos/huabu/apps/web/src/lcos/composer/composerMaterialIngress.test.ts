import { afterEach, beforeEach, expect, it } from 'vitest';

import { composerInputKey } from './composerInputJourney';
import { insertComposerMaterial } from './composerMaterialIngress';
import { useLcosReferenceStore } from '../lcosReferenceState';
import { useLcosShellStore } from '../shell/lcosShellStore';
import { LCOS_MATERIAL_TRANSFER_MIME } from '../ui/professional/donor/Gen1TextTransfer';

const material={schemaVersion:1,kind:'material-transfer',capturedAt:'2026-10-13T00:00:00Z',
  source:{projectId:'p',artifactId:'file',revisionId:'historical-revision',viewId:'view',title:'原版本材料'},
  content:{kind:'text',text:'第一行\n第二行'}};
const transfer=(value:unknown=material)=>({types:[LCOS_MATERIAL_TRANSFER_MIME,'text/plain'],getData:(mime:string)=>
  mime===LCOS_MATERIAL_TRANSFER_MIME ? JSON.stringify(value) : 'browser fallback must not be inserted'});
const key=()=>composerInputKey(useLcosShellStore.getState().composerTarget);
beforeEach(()=>{
  useLcosShellStore.getState().clear();useLcosShellStore.getState().setProject('p');
  useLcosShellStore.getState().openComposer({nodeId:'receiver',title:'原任务',intent:'delegate',workspaceId:'w',anchor:{x:0,y:0,width:1,height:1}});
  useLcosShellStore.getState().setComposerPrompt('前文后文');
  useLcosReferenceStore.getState().reset();useLcosReferenceStore.getState().setProject('p');
});
afterEach(()=>{useLcosShellStore.getState().clear();useLcosReferenceStore.getState().reset();});
it('inserts the Reader excerpt at the saved caret with its exact old version, preserving receiver and suffix',()=>{
  const original=useLcosShellStore.getState().composerTarget;
  useLcosShellStore.getState().rememberComposerCaret({projectId:'p',targetKey:key()!,text:'前文后文',start:2,end:2});
  expect(insertComposerMaterial('p',key(),transfer())).toMatchObject({claimed:true,ok:true});
  expect(useLcosShellStore.getState().composerPrompt).toBe('前文\n\n〔来源 原版本材料〕\n> 第一行\n> 第二行\n\n后文');
  expect(useLcosShellStore.getState().composerTarget).toBe(original);
  expect(useLcosReferenceStore.getState().draft.orderedEntityRefs).toMatchObject([{entityType:'artifact',entityId:'file',revisionId:'historical-revision',artifactViewId:'view'}]);
  expect(useLcosShellStore.getState().composerPrompt).not.toContain('historical-revision');
});
it('replaces only the actual selected input text and deduplicates the existing same-version reference',()=>{
  insertComposerMaterial('p',key(),transfer(),{start:0,end:2});
  insertComposerMaterial('p',key(),transfer());
  expect(useLcosShellStore.getState().composerPrompt.startsWith('前文')).toBe(false);
  expect(useLcosReferenceStore.getState().draft.orderedEntityRefs).toHaveLength(1);
});
it('claims malformed Reader transport without allowing plain-text fallback to alter the input',()=>{
  expect(insertComposerMaterial('p',key(),transfer(null))).toMatchObject({claimed:true,ok:false});
  expect(useLcosShellStore.getState().composerPrompt).toBe('前文后文');
  expect(useLcosReferenceStore.getState().draft.orderedEntityRefs).toEqual([]);
});
it('rejects a changed input and a foreign project without changing references or prompt',()=>{
  const originalKey=key();
  useLcosShellStore.getState().openComposer({nodeId:'another',title:'另一任务',anchor:{x:0,y:0,width:1,height:1}});
  expect(insertComposerMaterial('p',originalKey,transfer())).toMatchObject({claimed:true,ok:false});
  expect(insertComposerMaterial('p',key(),transfer({...material,source:{...material.source,projectId:'elsewhere'}}))).toMatchObject({claimed:true,ok:false});
  expect(useLcosShellStore.getState().composerPrompt).toBe('前文后文');
  expect(useLcosReferenceStore.getState().draft.orderedEntityRefs).toEqual([]);
});
it('accepts a real PDF page text excerpt while refusing an image-only page without inventing text',()=>{
  expect(insertComposerMaterial('p',key(),transfer({...material,content:{kind:'document-page',pageNumber:2,text:'原页文字'}}))).toMatchObject({claimed:true,ok:true});
  const prompt=useLcosShellStore.getState().composerPrompt;
  expect(insertComposerMaterial('p',key(),transfer({...material,content:{kind:'document-page',pageNumber:2,previewDataUrl:'data:image/png;base64,AA=='}}))).toMatchObject({claimed:true,ok:false});
  expect(useLcosShellStore.getState().composerPrompt).toBe(prompt);
});
it('ordinary text has no Reader MIME and keeps the browser native editing path',()=>{
  expect(insertComposerMaterial('p',key(),{types:['text/plain'],getData:()=> '普通文字'})).toEqual({claimed:false});
  expect(useLcosShellStore.getState().composerPrompt).toBe('前文后文');
});
