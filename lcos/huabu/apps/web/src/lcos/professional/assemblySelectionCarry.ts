import { assemblyDraftReferenceOf, assemblySourceRefOf } from './assemblySourceRef';

import type { AssemblySourceRefV1, WarehouseItemV1 } from '@local-creative-os/contracts';
import type { DropPayload } from '@local-creative-os/web-gen2';


/** Use the existing multi-object payload and resolver, never loop over writes
 * from the library. Selection order and exact Views come from the current bay. */
export function assemblySelectionCarry(items: readonly WarehouseItemV1[], selected: readonly AssemblySourceRefV1[],
  primary: AssemblySourceRefV1): Extract<DropPayload, {kind:'objects'}> | undefined {
  if (selected.length < 2 || !selected.some(ref => ref.kind === primary.kind && ref.id === primary.id)) return undefined;
  const objects: Extract<DropPayload,{kind:'objects'}>['objects'][number][] = selected.map(ref => {
    const matches = items.filter(item => {
      const source = assemblySourceRefOf(item);
      return source?.kind === ref.kind && source.id === ref.id;
    });
    const item = matches[0];
    if (matches.length !== 1 || !item) throw new Error('所选材料身份已改变，请重新选择后拿取；整组保留。');
    if (item.kind === 'artifact') {
      const reference = assemblyDraftReferenceOf(item);
      if (!reference || ref.kind !== 'artifactView') throw new Error('所选材料版本尚未确认，整组未拿取。');
      return { ...reference, artifactId: item.entityRef.id, artifactViewId: ref.id, displayLabel: item.title };
    }
    if (item.kind === 'scene' || item.kind === 'context' || item.kind === 'workflow') {
      return { entityType: item.kind === 'scene' ? 'workspace' : 'scope', entityId: item.entityRef.id,
        sourceRef: {...ref}, displayLabel: item.title };
    }
    return {entityType:item.kind,entityId:item.entityRef.id,displayLabel:item.title};
  });
  return {kind:'objects',objects};
}

/** Capture/Source bays carry their existing source address. Core's original
 * Assembly service materializes or resolves it only after an explicit release. */
export function assemblyIngressSelectionCarry(items: readonly {readonly sourceRef: Extract<AssemblySourceRefV1,{kind:'capture'|'resource'}>;
  readonly title:string}[], selected:readonly AssemblySourceRefV1[], primary:AssemblySourceRefV1):Extract<DropPayload,{kind:'objects'}> | undefined {
  if(selected.length<2 || !selected.some(ref=>ref.kind===primary.kind && ref.id===primary.id))return undefined;
  const objects=selected.map(ref=>{
    const matches=items.filter(item=>item.sourceRef.kind===ref.kind && item.sourceRef.id===ref.id),item=matches[0];
    if(matches.length!==1 || !item || !ref.id.trim())throw new Error('所选收件或来源已改变，请重新选择后拿取；整组保留。');
    return {entityType:item.sourceRef.kind,entityId:item.sourceRef.id,displayLabel:item.title};
  });
  return {kind:'objects',objects};
}
