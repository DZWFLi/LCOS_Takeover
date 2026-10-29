import { expect, it } from 'vitest';


import { assemblyIngressSelectionCarry, assemblySelectionCarry } from './assemblySelectionCarry';
import { assemblyDraftReferenceOf, assemblySourceRefOf } from './assemblySourceRef';
import { resolveDropIntent } from '../drop/dropIntentResolver';

import type { DropTargetCandidate } from '../drop/dropTypes';
import type { WarehouseItemV1 } from '@local-creative-os/contracts';

const items = ['one','two'].map(id=>({schemaVersion:1,kind:'artifact',entityRef:{type:'artifact',id:`artifact-${id}`,viewId:`view-${id}`},
  title:`文件 ${id}`,presentedRevisionId:`revision-${id}`,usageCount:0})) as WarehouseItemV1[];
const selected = [{kind:'artifactView',id:'view-two'},{kind:'artifactView',id:'view-one'}] as const;
const target = (semantic: DropTargetCandidate['semantic']): DropTargetCandidate => ({targetId:'receiver',semantic,
  enabled:true});

it('carries all selected files with exact Views and revisions through the original workspace resolver', () => {
  const payload = assemblySelectionCarry(items,selected,selected[0]);
  expect(payload?.objects.map(ref=>[ref.entityId,ref.artifactViewId,ref.revisionId])).toEqual([
    ['artifact-two','view-two','revision-two'],['artifact-one','view-one','revision-one'],
  ]);
  expect(payload && resolveDropIntent(payload,target({kind:'canvas',targetRef:{kind:'workspace',id:'workspace-original'}})))
    .toMatchObject({status:'ready',intent:{kind:'assembly-apply',sourceRefs:selected}});
});

it('gives the same selection to the existing Composer reference owner without executing it', () => {
  const payload = assemblySelectionCarry(items,selected,selected[0])!;
  const resolution = resolveDropIntent(payload,target({kind:'composer-reference',intent:'delegate',inputKey:'original-input'}));
  expect(resolution).toMatchObject({status:'ready',intent:{kind:'composer-reference',inputKey:'original-input',references:[
    {entityType:'artifact',entityId:'artifact-two',revisionId:'revision-two'},
    {entityType:'artifact',entityId:'artifact-one',revisionId:'revision-one'},
  ]}});
});

it('rejects the whole selection when any current source is missing instead of silently carrying a supported subset', () => {
  expect(()=>assemblySelectionCarry(items.slice(0,1),selected,selected[0])).toThrow('整组保留');
});

it('leaves an unselected row and a single selection on their original single-source path', () => {
  expect(assemblySelectionCarry(items,selected,{kind:'artifactView',id:'another-view'})).toBeUndefined();
  expect(assemblySelectionCarry(items,[selected[0]],selected[0])).toBeUndefined();
});

it('keeps an unfixed artifact View address explicit rather than guessing its current revision', () => {
  const payload = assemblySelectionCarry(items.map(item=>({...item,presentedRevisionId:undefined})),selected,selected[0])!;
  expect(payload.objects[0]).toMatchObject({entityType:'artifactView',entityId:'view-two',artifactId:'artifact-two'});
  expect(payload.objects[0]?.revisionId).toBeUndefined();
  expect(resolveDropIntent(payload,target({kind:'canvas',targetRef:{kind:'main'}}))).toMatchObject({status:'ready',intent:{sourceRefs:selected}});
});

it('a single unfixed View remains referenceable with its real parent, while a mismatched parent is refused', () => {
  const item={...items[0]!,presentedRevisionId:undefined,mimeType:'text/plain'};
  const payload={kind:'assembly' as const,itemId:item.entityRef.id,sourceRef:assemblySourceRefOf(item)!,
    entityRef:item.entityRef,reference:assemblyDraftReferenceOf(item)!};
  const receiver=target({kind:'composer-reference',intent:'delegate'});
  expect(resolveDropIntent(payload,receiver)).toMatchObject({status:'ready',intent:{kind:'composer-reference',reference:{
    entityType:'artifactView',entityId:'view-one',artifactId:'artifact-one',mimeType:'text/plain',
  }}});
  expect(payload.reference.revisionId).toBeUndefined();
  expect(resolveDropIntent({...payload,reference:{...payload.reference,artifactId:'another-artifact'}},receiver))
    .toMatchObject({status:'ineligible'});
});

it.each(['capture','resource'] as const)('the checked %s bay uses original batch Apply addresses without claiming Composer support',kind=>{
  const sources=['one','two'].map(id=>({sourceRef:{kind,id},title:`来源 ${id}`})),refs=sources.map(item=>item.sourceRef);
  const payload=assemblyIngressSelectionCarry(sources,refs,refs[0]!)!;
  expect(payload.objects.map(item=>[item.entityType,item.entityId])).toEqual([[kind,'one'],[kind,'two']]);
  expect(resolveDropIntent(payload,target({kind:'canvas',targetRef:{kind:'workflow',id:'workflow-original'}})))
    .toMatchObject({status:'ready',intent:{kind:'assembly-apply',sourceRefs:refs,targetRef:{kind:'workflow',id:'workflow-original'}}});
  expect(resolveDropIntent(payload,target({kind:'composer-reference',intent:'delegate'}))).toMatchObject({status:'ineligible'});
  expect(()=>assemblyIngressSelectionCarry(sources.slice(0,1),refs,refs[0]!)).toThrow('整组保留');
});
