const marker='/* native-workflow-method-save */';
function edit(source,anchor,value){
  if(source.includes(marker))return source;
  if(source.split(anchor).length!==2)throw new Error('Original workflow method seam changed: '+anchor);
  return source.replace(anchor,value+anchor)+'\n'+marker;
}
export function createNativeCoreWorkflowMethodTransforms(){return{
 'lcos/apps/local-core/src/workflow-export-service.ts':source=>{
  if(source.includes(marker))return source;
  const from='      if (!memberSet.has(viewId)) throw new Error(`Operator references non-member ${viewId}.`)';
  if(source.split(from).length!==2)throw new Error('Original standalone method structure validation changed.');
  return source.replace(from,`      // Structural operators have their own identity; only their material targets are members.
      if (!viewId.trim() || !operator || !['condition', 'parallel-split', 'parallel-join', 'reference'].includes(operator.kind)
        || (operator.label !== undefined && typeof operator.label !== 'string')
        || (operator.branches !== undefined && !Array.isArray(operator.branches))) throw new Error('Workflow operator is invalid.')
      const branches = operator.branches ?? []
      if (new Set(branches.map(branch => branch.id)).size !== branches.length
        || branches.some(branch => !branch || typeof branch.id !== 'string' || !branch.id.trim() || typeof branch.label !== 'string' || !branch.label.trim()
          || (branch.predicateText !== undefined && typeof branch.predicateText !== 'string'))) throw new Error('Workflow branches are invalid.')`)+ '\n'+marker;
 },
 'lcos/apps/local-core/src/metadata-repository.ts':source=>edit(source,'  getPresentationView(projectId: string, id: string): PresentationViewV0 | undefined {',`
  claimWorkflowWorkspaceCanvas(projectId: string, scopeId: string, workspaceId: string, canvasId: string) {
    this.#database.exec('BEGIN IMMEDIATE;')
    try {
      const graph = this.get(projectId), scope = graph?.scopes.find(s => String(s.id) === scopeId && s.kind === 'workflow')
      if (!scope || (scope as any).archivedAt) throw new Error('方法已变化或已移除。')
      const old = this.getWorkspace(workspaceId)
      if (old && (String(old.projectId) !== projectId || String(old.scopeId) !== scopeId || old.preferredSurface !== 'workflow'
        || old.canvasId !== undefined && old.canvasId !== canvasId)) throw new Error('原现场已绑定其他空间，未覆盖。')
      if (!old && (workspaceId !== 'workspace:' + scopeId || graph!.workspaces.some(w => String(w.scopeId) === scopeId))) throw new Error('方法已有其他现场，请重新选择。')
      if (this.getWorkspaces(projectId).some(w => w.canvasId === canvasId && String(w.id) !== workspaceId)) throw new Error('空间已有其他现场 owner。')
      if (!old) this.#upsertWorkspace({id:workspaceId,projectId,scopeId,name:scope.name,intent:'build',viewport:{x:0,y:0,zoom:1},focusedViewIds:[],visibleLayers:['core','process'],contextPolicy:'workspace-related',preferredSurface:'workflow',updatedAt:new Date().toISOString()} as any)
      if (old?.canvasId !== canvasId) {
        this.updateWorkspaceCanvasId(projectId,workspaceId,canvasId)
        this.#database.prepare('UPDATE projects SET graph_version = graph_version + 1 WHERE id = ?').run(projectId as SQLInputValue)
      }
      this.#database.exec('COMMIT;')
      return this.getWorkspace(workspaceId)
    } catch(error) { this.#database.exec('ROLLBACK;'); throw error }
  }

  writeWorkflowMethod(projectId: string, scopeId: string, prepare: (graph: ProjectGraphSnapshot | undefined, views: PresentationViewV0[]) => any) {
    this.#database.exec('BEGIN IMMEDIATE;')
    try {
      const plan = prepare(this.get(projectId), this.listPresentationViews(projectId))
      assertContainmentWrite({ previousScopes: this.getScopes(projectId), nextScopes: [...this.getScopes(projectId).filter(scope => String(scope.id) !== scopeId), plan.scope], actor: 'user' })
      this.#upsertScope(plan.scope, projectId as ProjectId)
      if (plan.workspace) {
        if (this.getWorkspace(plan.workspace.id)) throw new Error('新方法现场身份已占用，未覆盖其他现场。')
        this.#upsertWorkspace(plan.workspace)
      }
      for (const entry of plan.views) {
        const before = this.getPresentationView(projectId, entry.view.id)
        if (before && (before.scopeId !== scopeId || before.capability !== 'workflow')) throw new Error('方法步骤身份已被其他内容使用。')
        if (!before) this.insertPresentationView(entry.view)
        else if (!this.compareAndSwapPresentationView(entry.view, entry.expectedVersion).updated) throw new Error('方法版本已改变，未覆盖其他修改。')
      }
      this.#database.prepare('UPDATE projects SET graph_version = graph_version + 1 WHERE id = ?').run(projectId as SQLInputValue)
      const graphVersion = this.get(projectId)!.graphVersion
      this.#database.exec('COMMIT;')
      return { scope: plan.scope, presentations: plan.views.map((entry: any) => entry.view), graphVersion }
    } catch (error) { this.#database.exec('ROLLBACK;'); throw error }
  }

`),
 'lcos/apps/local-core/src/presentation-application-service.ts':source=>{
  if(source.includes(marker))return source;
  return `import { prepareNativeWorkflowMethodSave } from '../../../../lab/pilot/native-workflow-method-save.ts'\n`+edit(source,'  delete(projectId: string, presentationId: string): void {',`
  saveWorkflowMethod(projectId: string, scopeId: string, input: unknown) {
    const result = this.metadata.writeWorkflowMethod(projectId, scopeId, (graph, views) =>
      prepareNativeWorkflowMethodSave(projectId, scopeId, input, graph, views, state => this.#validateState(projectId, state)))
    for (const view of result.presentations) this.#notify(projectId, view.id, { version: view.version, updatedAt: view.updatedAt, updatedBy: view.updatedBy })
    return result
  }

`);
 },
 'lcos/apps/local-core/src/routes/workflow.ts':source=>edit(source,'  const exportMatch =',`
  const methodMatch = /^\\/projects\\/([^/]+)\\/workflow\\/methods\\/([^/]+)$/.exec(pathname)
  if (methodMatch !== null && method === 'PUT') {
    const db = routeRequireMetadata(ctx); if (!db) return true
    const projectId = decodeURIComponent(methodMatch[1]!), scopeId = decodeURIComponent(methodMatch[2]!)
    if (!routeRequireProject(projectId, { metadata: db, response, helpers })) return true
    if (!presentation) { sendJson(response,503,failure('UNAVAILABLE','方法保存暂时不可用。')); return true }
    try {
      const input = await helpers.readJsonBody(request,controller.signal)
      if (controller.signal.aborted) return true
      const value = presentation.saveWorkflowMethod(projectId,scopeId,input)
      sendJson(response,200,{ ok:true,value })
    } catch(error) { sendJson(response,409,failure('CONFLICT',error instanceof Error?error.message:'方法尚未保存，输入保留。')) }
    return true
  }

`),
};}
