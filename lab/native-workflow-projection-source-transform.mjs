const root='lcos/apps/web-gen2/src/spatial/';
const once=(source,before,after,label)=>{if(source.split(before).length!==2)throw new Error('Workflow projection source changed: '+label);return source.replace(before,after);};
/** Adapts only original working-set selection and explicit Run reference admission.
 * It does not change canonical Run ownership or ResultSlot eligibility. */
export function createNativeWorkflowProjectionTransforms(){return{
 [root+'worksiteProjectionInput.ts'](source){
  source=once(source,'&& presentation.id === address.id && presentation.scopeId === address.scopeId && presentation.capability === address.capability);',
   '&& (scope.kind === \'workflow\' && address.capability === \'workflow\' || presentation.id === address.id) && presentation.scopeId === address.scopeId && presentation.capability === address.capability);','read all method groups');
  source=once(source,"const matching = presentations?.filter(presentation => presentation.projectId === projectId && presentation.id === address?.id",
   "const matching = presentations?.filter(presentation => presentation.projectId === projectId && (scope?.kind === 'workflow' && address?.capability === 'workflow' || presentation.id === address?.id)", 'select all method groups');
  source=once(source,'const received = new Set(presentation?.state.memberViewIds ?? []);',
   `const selectedPresentations = scope?.kind === 'workflow' && address?.capability === 'workflow' ? matching : presentation ? [presentation] : [];
  const memberRefs = selectedPresentations.flatMap(row => row.state.memberEntityRefs ?? []);
  // A Collection reference admits only its exact original descendants, never
  // every project entity or the contents of an unrelated Scope/Workspace.
  const expandedRefs = [...memberRefs], visitedCollections = new Set<string>();
  for (let index=0; scope?.kind==='workflow' && address?.capability==='workflow' && index<expandedRefs.length; index++) {
    const ref=expandedRefs[index]; if(ref.type!=='collection'||visitedCollections.has(ref.id))continue;
    visitedCollections.add(ref.id);
    if(!(graph?.collections??[]).some(row=>String(row.id)===ref.id&&String(row.projectId)===projectId))continue;
    expandedRefs.push(...(graph?.collectionMemberships??[]).filter(row=>String(row.collectionId)===ref.id).map(row=>row.memberRef));
  }
  const received = new Set(scope?.kind==='workflow' && address?.capability==='workflow' ? selectedPresentations.flatMap(row => [
    ...row.state.memberViewIds.filter(id => !(id in (row.state.workflowOperators??{})) || (graph?.artifactViews??[]).some(view=>String(view.id)===id)),
    ...(row.state.workflowActions??[]).flatMap(action=>action.attachedViewIds),
    ...Object.values(row.state.workflowOperators??{}).flatMap(operator=>(operator.branches??[]).flatMap(branch=>branch.targetViewId?[branch.targetViewId]:[])),
    ...(row.state.memberEntityRefs??[]).filter(ref=>ref.type==='view').map(ref=>ref.id)]) : presentation?.state.memberViewIds ?? []);`, 'all material and typed refs');
  source=source.replaceAll('(presentation?.state.memberEntityRefs ?? [])','expandedRefs');
  source=once(source,'conversationIds, scopeIds, workspaceIds, collectionIds,',
   "conversationIds, scopeIds, workspaceIds, collectionIds,\n    referencedRunIds: new Set(scope?.kind==='workflow'&&address?.capability==='workflow' ? expandedRefs.filter(ref=>ref.type==='run').map(ref=>ref.id) : []),",'explicit Run ids');
  return source;
 },
 [root+'reconcileExecutionProjection.ts'](source){
  source=once(source,'workspace?: ExecutionWorksite; activeArtifactIds: ReadonlySet<string>;',
   'workspace?: ExecutionWorksite; activeArtifactIds: ReadonlySet<string>; referencedRunIds?: ReadonlySet<string>;','internal reference input');
  return once(source,'const eligibleRuns = snapshot.runs.filter((run) => executionBelongsHere(run, workspace));',
   'const eligibleRuns = snapshot.runs.filter((run) => executionBelongsHere(run, workspace) || input.referencedRunIds?.has(run.id) === true);','Run-only display admission');
 },
 [root+'reconciliationRunner.ts'](source){
  source=once(source,
   '...(targetWorkspace === undefined ? {} : { workspace: targetWorkspace }),',
   '...(targetWorkspace === undefined ? {} : { workspace: targetWorkspace }),\n          referencedRunIds: worksiteProjectionInput(graph, targetWorkspace, presentations).referencedRunIds,','same cleanup census');
  source=once(source,'    const sources = rawArtifacts',`    // Method first-open pins exact material versions through the original
    // additional-View owner. Reconciliation must not create a second primary
    // Artifact carrier for that already-bound occurrence in the same method.
    const methodPinnedRevisions = new Set(targetWorkspace?.preferredSurface==='workflow'
      && graph?.scopes.some(scope=>String(scope.id)===String(targetWorkspace.scopeId)&&scope.kind==='workflow')
      ? initialBindings.filter(binding=>binding.projectId===projectId&&binding.canvasId===canvasId&&binding.spatialKind==='node'&&binding.entityType==='view')
        .flatMap(binding=>{const view=graph.artifactViews.find(view=>String(view.id)===binding.entityId&&String(view.scopeId)===String(targetWorkspace.scopeId)
          &&view.referenceKind==='explicit_additional'&&String(view.id).startsWith('view:native-library:'));
          return view?.revisionId?[JSON.stringify([String(view.artifactId),String(view.revisionId)])]:[];}) : []);
    const sources = rawArtifacts`, 'preserve pinned method occurrence');
  source=once(source,'    const artifactReport = await this.deps.nodeProjector.projectArtifactsWithReport(sources);',
   '    const artifactReport = await this.deps.nodeProjector.projectArtifactsWithReport(sources.filter(source=>!methodPinnedRevisions.has(JSON.stringify([source.artifactId,source.currentRevisionId]))));','avoid secondary primary carrier');
  source=once(source,'    for(const {source,facts} of extraViews.entries){',`    for(const {source,facts} of extraViews.entries){
      if(methodPinnedRevisions.has(JSON.stringify([facts.entityId,source.currentRevisionId]))
        &&!initialBindings.some(binding=>binding.canvasId===canvasId&&binding.spatialKind==='node'&&binding.entityType==='view'&&binding.entityId===source.entityId))continue;`, 'reuse already-pinned exact revision');
  return source;
 }
};}
