const marker='/* native-workflow-lifecycle */';
function change(source,edits){if(source.includes(marker))return source;let text=source.replaceAll('\r\n','\n');for(const[from,to]of edits){if(text.split(from).length!==2)throw new Error('Workflow lifecycle seam changed: '+from.slice(0,100));text=text.replace(from,to)}return text+'\n'+marker;}
const history=`
  transitionWorkflowArchiveHistory(id: string, direction: 'undo' | 'redo'): boolean {
    this.#database.exec('BEGIN IMMEDIATE')
    try {
      const set = this.getMutationChangeSet(id), change = set?.changes[0]
      if (!set || set.changes.length !== 1 || change?.type !== 'scope_archive_state'
        || set.status !== (direction === 'undo' ? 'applied' : 'reverted')) { this.#database.exec('ROLLBACK'); return false }
      const scope = this.getScopes(set.projectId).find(value => String(value.id) === change.scopeId)
      const expected = direction === 'undo' ? change.afterArchivedAt : change.beforeArchivedAt
      if (!scope || scope.kind !== 'workflow' || scope.lifecycleVersion !== change.lifecycleVersion || scope.archivedAt !== expected) { this.#database.exec('ROLLBACK'); return false }
      const archivedAt = direction === 'undo' ? change.beforeArchivedAt : change.afterArchivedAt
      const now = new Date().toISOString(), nextVersion = change.lifecycleVersion + 1
      this.#database.prepare('UPDATE scopes SET archived_at = ?, lifecycle_version = ?, updated_at = ? WHERE id = ? AND project_id = ?')
        .run(archivedAt ?? null, nextVersion, now, change.scopeId, set.projectId)
      this.#database.prepare('UPDATE projects SET graph_version = graph_version + 1 WHERE id = ?').run(set.projectId)
      this.#database.prepare('UPDATE mutation_change_sets SET changes_json = ? WHERE id = ?').run(JSON.stringify([{...change,lifecycleVersion:nextVersion}]),id)
      if (!(direction === 'undo' ? this.markChangeSetReverted(id,now) : this.markChangeSetApplied(id))) throw new Error('方法恢复状态已改变。')
      this.#database.exec('COMMIT'); return true
    } catch(error) { this.#database.exec('ROLLBACK'); throw error }
  }

`;
const service=`
  setWorkflowArchive(input: { projectId: string; scopeId: string; expectedVersion: number }, archived: boolean) {
    if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 0) throw new Error('请重新读取方法状态。')
    let changeSet: MutationChangeSetV1 | undefined
    this.#metadata.runCurationMutation(() => {
      const scope = this.#metadata.getScopes(input.projectId).find(value => String(value.id) === input.scopeId)
      if (!scope || scope.kind !== 'workflow') throw new Error('方法不存在于当前项目。')
      if ((scope.archivedAt !== undefined) === archived) return {projectId:input.projectId}
      if (scope.lifecycleVersion !== input.expectedVersion) throw new Error('方法移除状态已更新，请重新读取。')
      const now = new Date().toISOString(), afterArchivedAt = archived ? now : undefined
      changeSet = this.#buildChangeSet({projectId:input.projectId,operationId:'workflow-lifecycle-'+randomUUID(),actorKind:'web',changes:[{
        type:'scope_archive_state',scopeId:input.scopeId,beforeArchivedAt:scope.archivedAt,afterArchivedAt,lifecycleVersion:input.expectedVersion+1,
        inverse:{type:'restore_scope_archive_state',scopeId:input.scopeId,archivedAt:scope.archivedAt},
        forward:{type:'restore_scope_archive_state',scopeId:input.scopeId,archivedAt:afterArchivedAt},
      }]})
      return {projectId:input.projectId,scopeArchiveStates:[{scopeId:input.scopeId,expectedVersion:input.expectedVersion,archivedAt:afterArchivedAt,updatedAt:now}],changeSet}
    })
    if(changeSet)this.#publishChangeSet(changeSet)
    return {scope:this.#metadata.getScopes(input.projectId).find(value=>String(value.id)===input.scopeId)!,changeSet}
  }

`;
export function createNativeCoreWorkflowLifecycleTransforms(){return{
 'lcos/packages/domain/src/index.ts':source=>change(source,[['export interface Scope {','export interface Scope {\n  readonly archivedAt?: IsoDateTime\n  readonly lifecycleVersion?: number']]),
 'lcos/packages/contracts/src/curation-patch.ts':source=>change(source,[['export type MutationChangeItemV1 =',`export type MutationChangeItemV1 =
  | { readonly type:'scope_archive_state'; readonly scopeId:string; readonly beforeArchivedAt?:string; readonly afterArchivedAt?:string; readonly lifecycleVersion:number;
      readonly inverse:{readonly type:'restore_scope_archive_state'; readonly scopeId:string; readonly archivedAt?:string};
      readonly forward:{readonly type:'restore_scope_archive_state'; readonly scopeId:string; readonly archivedAt?:string} }
`]]),
 'lcos/packages/contracts/src/assembly.ts':source=>change(source,[['export interface WarehouseQueryV1 {',"export interface WarehouseQueryV1 {\n  readonly scopeLifecycle?: 'active' | 'archived' | 'all'"]]),
 'lcos/apps/local-core/src/metadata-repository.ts':source=>{
  if(source.includes(marker))return source;
  let text=change(source,[
   ['    if (current !== 57)',"    if (current === 57) { this.#migrate_058_from_v57(); current = 58 }\n    if (current !== 58)"],
   ['  #migrate_057_from_v56(): void {',`  #migrate_058_from_v57(): void {
    this.#database.exec(\`BEGIN; ALTER TABLE scopes ADD COLUMN archived_at TEXT;
      ALTER TABLE scopes ADD COLUMN lifecycle_version INTEGER NOT NULL DEFAULT 0;
      CREATE INDEX idx_scopes_project_archived ON scopes(project_id,archived_at,updated_at);
      PRAGMA user_version = 58; COMMIT;\`)
  }

  #migrate_057_from_v56(): void {`],
   ['    readonly artifactArchiveStates?: readonly {',`    readonly scopeArchiveStates?: readonly { readonly scopeId:string; readonly expectedVersion:number; readonly archivedAt?:string; readonly updatedAt:string }[]
    readonly artifactArchiveStates?: readonly {`],
   ['      for (const state of plan.artifactArchiveStates ?? []) {',`      for (const state of plan.scopeArchiveStates ?? []) {
        const result = this.#database.prepare("UPDATE scopes SET archived_at = ?, lifecycle_version = lifecycle_version + 1, updated_at = ? WHERE id = ? AND project_id = ? AND kind = 'workflow' AND lifecycle_version = ?")
          .run(state.archivedAt ?? null,state.updatedAt,state.scopeId,plan.projectId,state.expectedVersion)
        if (result.changes !== 1) throw new Error('方法状态已变化，未覆盖其他操作。')
        this.#database.prepare('UPDATE projects SET graph_version = graph_version + 1 WHERE id = ?').run(plan.projectId)
      }
      for (const state of plan.artifactArchiveStates ?? []) {`],
   ['  transitionCollectionCreation(id: string, direction:',history+'  transitionCollectionCreation(id: string, direction:'],
   ['  insertPresentationView(value: PresentationViewV0): void {',`  #assertWorkflowScopeWritable(projectId:string,scopeId:string):void {
    const scope=this.#database.prepare("SELECT archived_at FROM scopes WHERE id = ? AND project_id = ? AND kind = 'workflow'").get(scopeId,projectId) as Row | undefined
    if(scope?.archived_at != null)throw new Error('方法已移除，恢复后可继续编辑。')
  }

  insertPresentationView(value: PresentationViewV0): void {
    this.#assertWorkflowScopeWritable(value.projectId,value.scopeId)`],
   ['  compareAndSwapPresentationView(value: PresentationViewV0, expectedVersion: number): { readonly updated: boolean; readonly currentVersion: number } {',`  compareAndSwapPresentationView(value: PresentationViewV0, expectedVersion: number): { readonly updated: boolean; readonly currentVersion: number } {
    this.#assertWorkflowScopeWritable(value.projectId,value.scopeId)
    const currentScope=this.getPresentationView(value.projectId,value.id)?.scopeId
    if(currentScope)this.#assertWorkflowScopeWritable(value.projectId,currentScope)`],
   ['  #upsertScope(value: Scope, projectId: ProjectId): void {',`  #upsertScope(value: Scope, projectId: ProjectId): void {
    this.#assertWorkflowScopeWritable(String(projectId),String(value.id))`],
  ]);
  const start=text.indexOf('  #upsertScope('),end=text.indexOf('  #upsertWorkspace(',start);let part=text.slice(start,end);
  part=part.replace('created_at, updated_at)','created_at, updated_at, archived_at, lifecycle_version)').replace('VALUES (?, ?, ?, ?, ?, ?, ?, ?)','VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').replace('value.createdAt, value.updatedAt)','value.createdAt, value.updatedAt, value.archivedAt ?? null, value.lifecycleVersion ?? 0)');
  text=text.slice(0,start)+part+text.slice(end);
  const scope=/return \{ id: row\.id as ScopeId,[^\n]+/.exec(text);if(!scope)throw new Error('Scope mapper missing');
  text=text.replace(scope[0],scope[0].replace('projectId: row.project_id as ProjectId,','projectId: row.project_id as ProjectId, lifecycleVersion: Number(row.lifecycle_version ?? 0), ...(row.archived_at == null ? {} : { archivedAt: String(row.archived_at) as Scope["createdAt"] }),'));
  return text;
 },
 'lcos/apps/local-core/src/mutation-safety-service.ts':source=>{
  if(source.includes(marker))return source;
  const early=direction=>`    if(changeSet.changes.length===1&&changeSet.changes[0]?.type==='scope_archive_state'){
      const changed=this.#metadata.transitionWorkflowArchiveHistory(changeSetId,'${direction}')
      if(!changed)return{revertable:false,reason:'TOUCHED_STATE_CHANGED_AFTER_APPLY',changeSetId}
      this.#publishChangeSet(this.#metadata.getMutationChangeSet(changeSetId)!,origin)
      return{revertable:true,changeSetId}
    }
`;
  return change(source,[['  revert(changeSetId: string, origin?: ProjectEventOrigin): RevertResultV1 {',service+'  revert(changeSetId: string, origin?: ProjectEventOrigin): RevertResultV1 {'],
   ["    if (changeSet.status !== 'applied') return { revertable: false, changeSetId }","    if (changeSet.status !== 'applied') return { revertable: false, changeSetId }\n"+early('undo')],
   ["    if (changeSet.status !== 'reverted') return { revertable: false, changeSetId }","    if (changeSet.status !== 'reverted') return { revertable: false, changeSetId }\n"+early('redo')]]);
 },
 'lcos/apps/local-core/src/server.ts':source=>change(source,[['      if (await handleWorkflowRoute({\n        method,','      if (await handleWorkflowRoute({\n        mutationSafety,\n        method,']]),
 'lcos/apps/local-core/src/routes/workflow.ts':source=>change(source,[['export interface WorkflowRouteContext extends RouteHttpContext {',"export interface WorkflowRouteContext extends RouteHttpContext {\n  readonly mutationSafety?: import('../mutation-safety-service.js').MutationSafetyService"],['  const exportMatch =',`
  const lifecycleMatch = /^\\/projects\\/([^/]+)\\/workflow\\/methods\\/([^/]+)\\/(archive|restore)$/.exec(pathname)
  if(method==='POST'&&lifecycleMatch){
    const db=routeRequireMetadata(ctx);if(!db)return true
    const projectId=decodeURIComponent(lifecycleMatch[1]!),scopeId=decodeURIComponent(lifecycleMatch[2]!)
    if(!routeRequireProject(projectId,{metadata:db,response,helpers}))return true
    if(!ctx.mutationSafety){sendJson(response,503,failure('UNAVAILABLE','方法移除与恢复暂不可用。'));return true}
    try{
      const input=await helpers.readJsonBody(request,controller.signal)
      if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==1||!Object.hasOwn(input,'expectedVersion'))throw new Error('请重新读取方法状态。')
      const value=ctx.mutationSafety.setWorkflowArchive({projectId,scopeId,expectedVersion:(input as any).expectedVersion},lifecycleMatch[3]==='archive')
      sendJson(response,200,{ok:true,value})
    }catch(error){sendJson(response,409,failure('CONFLICT',error instanceof Error?error.message:'方法状态未确认。'))}
    return true
  }
  const exportMatch =`]]),
 'lcos/apps/local-core/src/routes/f6-assembly.ts':source=>change(source,[['    const searchRaw =',`    const scopeLifecycle=url.searchParams.get('scopeLifecycle')??'active'
    if(!['active','archived','all'].includes(scopeLifecycle)){sendJson(response,400,failure('INVALID_ARGUMENT','Unsupported method lifecycle.'));return true}
    const searchRaw =`],['    const value: WarehouseSnapshotV1 = warehouse.query(projectId, {',"    const value: WarehouseSnapshotV1 = warehouse.query(projectId, {\n      scopeLifecycle:scopeLifecycle as 'active'|'archived'|'all',"]]),
 'lcos/apps/local-core/src/warehouse-service.ts':source=>change(source,[["        if (scope.kind !== 'context' && scope.kind !== 'workflow') continue",`        if (scope.kind !== 'context' && scope.kind !== 'workflow') continue
        const lifecycle=query.scopeLifecycle??'active'
        if(lifecycle!=='all'&&(lifecycle==='archived'?scope.archivedAt===undefined:scope.archivedAt!==undefined))continue`]]),
 'lcos/apps/local-core/src/presentation-application-service.ts':source=>change(source,[["    if (!scope) throw new Error('Scope does not belong to the project.')",`    if (!scope) throw new Error('Scope does not belong to the project.')
    if(this.metadata.getScopes(projectId).find(value=>String(value.id)===input.scopeId)?.archivedAt!==undefined)throw new Error('方法已移除，恢复后可继续编辑。')`]]),
 'lcos/apps/local-core/src/assembly-apply-service.ts':source=>change(source,[['    const results: AssemblyApplyItemResultV1[] = []',`    const target=request.targetRef
    const targetWorkspace=target.kind==='workspace'||target.kind==='scene'?this.metadata.getWorkspace(target.id):undefined
    const targetScopeId=target.kind==='workflow'||target.kind==='context'?target.id:targetWorkspace&&String(targetWorkspace.projectId)===projectId?String(targetWorkspace.scopeId):undefined
    if(targetScopeId&&this.metadata.getScopes(projectId).some(scope=>String(scope.id)===targetScopeId&&scope.archivedAt!==undefined))
      return{schemaVersion:1,projectId,allApplied:false,results:request.sourceRefs.map(sourceRef=>({sourceRef,status:'failed',channel:'error',message:'方法已移除，恢复后可继续加入内容。'}))}
    const results: AssemblyApplyItemResultV1[] = []`]]),
};}
