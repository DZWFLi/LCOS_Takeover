/** Keep the original Overlay transaction/abort/input owner, injecting only
 * the exact-Library delegate and source admission before the existing draft. */
export function transformNativeLibraryMaterialOverlay(source) {
  const normalized = source.replaceAll('\r\n', '\n');
  const input = '    const inputIsCurrent = () => inputPreparation?.isCurrent() ?? true;';
  const owner = '    const owners = {\n      projectId,';
  const draft = '        const result = references.addEntitiesToDraft(referenceIntent.references ?? [referenceIntent.reference], shell.composerTarget?.intent);';
  const marker = '    const nativeLibraryMaterialOwner = createNativeLibraryMaterialOwner(projectId, dropCanvasId, store.state.payload, dropState.transactionId);';
  if (normalized.includes(marker)) return source;
  for (const seam of [input, owner, draft]) if (normalized.split(seam).length !== 2) throw new Error('Original Library material Overlay seam changed.');
  return "import { createNativeLibraryMaterialOwner } from '../../../../../../lab/pilot/native-library-material-owner';\n" + normalized
    .replace(input, input + '\n' + marker)
    .replace(owner, owner + '\n      handleNativeLibraryMaterial: nativeLibraryMaterialOwner.handle,')
    .replace(draft, `        await nativeLibraryMaterialOwner.admitComposer(referenceIntent, signal, inputIsCurrent);
        const nativeLibraryDraftShell = useLcosShellStore.getState();
        const nativeLibraryDraftReferences = useLcosReferenceStore.getState();
        if (signal?.aborted || !inputIsCurrent() || nativeLibraryDraftShell.projectId !== projectId
          || nativeLibraryDraftReferences.projectId !== projectId
          || nativeLibraryDraftShell.composerTarget?.intent !== shell.composerTarget?.intent
          || (referenceIntent.inputKey !== undefined && referenceIntent.inputKey !== composerInputKey(nativeLibraryDraftShell.composerTarget))) {
          throw new Error('原输入已变化，材料保留，未加入其他对话。');
        }
        const result = nativeLibraryDraftReferences.addEntitiesToDraft(referenceIntent.references ?? [referenceIntent.reference], nativeLibraryDraftShell.composerTarget?.intent);`);
}
