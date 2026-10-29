import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const nativeCoreColorPinRepositorySource='lcos/apps/local-core/src/metadata-repository.ts';
export const nativeCoreColorPinSafetySource='lcos/apps/local-core/src/mutation-safety-service.ts';
export const nativeCoreColorPinRouteSource='lcos/apps/local-core/src/routes/color-pins.ts';
export const nativeCoreColorPinChangeSource='lcos/packages/contracts/src/curation-patch.ts';
export const nativeCoreColorPinClientSource='lcos/apps/web-gen2/src/backend/colorPins.ts';

function adapt(source,sourcePath,relativePath,marker,edits){
  if(path.resolve(sourcePath??'')!==path.resolve(root,relativePath))throw new Error('Color Pin producer transform requires its exact selected sourcePath.');
  const eol=source.includes('\r\n')?'\r\n':'\n';let result=source.replaceAll('\r\n','\n');
  if(result.includes(marker)){if(result.split(marker).length!==2)throw new Error('Color Pin producer transform is duplicated.');return source;}
  for(const [before,after]of edits){if(result.split(before).length!==2)throw new Error('Color Pin producer seam drifted: '+before.slice(0,80));result=result.replace(before,after);}
  return result.replaceAll('\n',eol);
}
const updatePlan='    readonly colorPinDefinitionUpdates?: readonly { readonly before: ColorPinDefinitionV0; readonly after: ColorPinDefinitionV0 }[]\n';
const deleteCheckPlan='    readonly colorPinDefinitionDeleteChecks?: readonly { readonly definition: ColorPinDefinitionV0; readonly memberships: readonly ColorPinMembershipV0[] }[]\n';
const updateTransaction=String.raw`      // Check exact definition and owned members within the transaction before
      // any delete; SQLite CASCADE is not an undo policy.
      for (const expected of plan.colorPinDefinitionDeleteChecks ?? []) {
        if (expected.definition.projectId !== plan.projectId
          || !plan.colorPinDefinitionDeletes?.includes(expected.definition.id)
          || !sameColorPinDefinition(this.getColorPinDefinition(expected.definition.id), expected.definition)
          || !sameColorPinMembers(this.listColorPinMemberships(plan.projectId as ProjectId)
            .filter(member => member.colorPinId === expected.definition.id), expected.memberships))
          throw new Error('STALE_COLOR_PIN_DEFINITION_DELETE')
      }
      // native-color-pin-label-transaction: preserve canonical identity and use
      // the original transaction + old value/timestamp CAS, never delete/add.
      for (const update of plan.colorPinDefinitionUpdates ?? []) {
        const { before, after } = update
        if (before.id !== after.id || before.projectId !== plan.projectId || after.projectId !== plan.projectId
          || before.color !== after.color || before.createdAt !== after.createdAt)
          throw new Error('Color Pin label update cannot replace canonical identity.')
        const result = this.#database.prepare('UPDATE color_pin_definitions SET label = ?, updated_at = ? WHERE id = ? AND project_id = ? AND updated_at = ? AND label IS ?')
          .run(after.label ?? null, after.updatedAt, before.id, plan.projectId, before.updatedAt, before.label ?? null)
        if (result.changes !== 1) throw new Error('STALE_COLOR_PIN_DEFINITION')
      }
`;
export function transformNativeCoreColorPinRepository(source,{sourcePath}={}){
  const field='    readonly colorPinDefinitionAdds?: readonly ColorPinDefinitionV0[]\n';
  const write='      for (const definition of plan.colorPinDefinitionAdds ?? []) this.#insertColorPinDefinition(definition)\n';
  return adapt(source,sourcePath,nativeCoreColorPinRepositorySource,'native-color-pin-label-transaction',[[field,field+updatePlan+deleteCheckPlan],['export class SqliteMetadataRepository',sameDefinition+'export class SqliteMetadataRepository'],[write,updateTransaction+write]]);
}
const createService=String.raw`  /** native-color-pin-definition-create: one GUI identity, no invented target/member. */
  createColorPinDefinition(input: {
    readonly projectId: string; readonly color: string; readonly label: string
    readonly expectedDefinitionId: null
    readonly actorKind?: MutationChangeSetV1['actorKind']; readonly origin?: ProjectEventOrigin
  }): { readonly definition: ColorPinDefinitionV0; readonly changeSet: MutationChangeSetV1 } {
    const color = input.color.toUpperCase(), label = input.label.trim()
    if (input.expectedDefinitionId !== null || !/^#[0-9A-F]{6}$/.test(color) || !label || label.length > 500)
      throw new Error('Color Pin definition requires #RRGGBB, a 1–500 character label and observed absence.')
    const projectId = input.projectId as Parameters<SqliteMetadataRepository['getColorPinDefinitionByColor']>[0]
    if (this.#metadata.getColorPinDefinitionByColor(projectId, color) !== undefined)
      throw new Error('STALE_COLOR_PIN_DEFINITION_ABSENCE')
    const now = new Date().toISOString()
    const definition: ColorPinDefinitionV0 = { id: 'color-pin-' + randomUUID(), projectId: input.projectId, color, label, createdAt: now, updatedAt: now }
    const change: MutationChangeItemV1 = { type: 'color_pin_definition_add', colorPinId: definition.id, definition,
      inverse: { type: 'color_pin_definition_remove', colorPinId: definition.id },
      forward: { type: 'color_pin_definition_add', colorPinId: definition.id },
      appliedFingerprint: 'color-pin-definition:' + definition.id + ':present' }
    const changeSet = this.#buildChangeSet({ projectId: input.projectId, operationId: 'color-pin-definition-create-' + randomUUID(),
      actorKind: input.actorKind ?? 'web', changes: [change] })
    this.#metadata.runCurationMutation({ projectId: input.projectId, colorPinDefinitionAdds: [definition], changeSet })
    this.#publishChangeSet(changeSet, input.origin)
    return { definition: this.#metadata.getColorPinDefinition(definition.id)!, changeSet }
  }

`;
const service=String.raw`  /** native-color-pin-label-owner: a project-wide label only, in the original
   * curation transaction and original ChangeSet undo/redo owner. */
  renameColorPinDefinition(input: {
    readonly projectId: string; readonly colorPinId: string; readonly label: string
    readonly expectedUpdatedAt: string; readonly expectedLabel: string | null
    readonly actorKind?: MutationChangeSetV1['actorKind']; readonly origin?: ProjectEventOrigin
  }): { readonly definition: ColorPinDefinitionV0; readonly changeSet?: MutationChangeSetV1 } {
    const before = this.#metadata.getColorPinDefinition(input.colorPinId)
    if (!before || before.projectId !== input.projectId) throw new Error('COLOR_PIN_DEFINITION_NOT_FOUND')
    const label = input.label.trim()
    if (!label || label.length > 500) throw new Error('Color Pin label must contain 1–500 characters.')
    if (before.updatedAt !== input.expectedUpdatedAt || (before.label ?? null) !== input.expectedLabel)
      throw new Error('STALE_COLOR_PIN_DEFINITION')
    if (before.label === label) return { definition: before }
    const after = { ...before, label, updatedAt: new Date(Math.max(Date.now(), Date.parse(before.updatedAt) + 1)).toISOString() }
    const change: MutationChangeItemV1 = { type: 'color_pin_definition_update', colorPinId: before.id, before, after,
      inverse: { type: 'color_pin_definition_update', colorPinId: before.id },
      forward: { type: 'color_pin_definition_update', colorPinId: before.id } }
    const changeSet = this.#buildChangeSet({ projectId: input.projectId, operationId: 'color-pin-rename-' + randomUUID(),
      actorKind: input.actorKind ?? 'web', changes: [change] })
    this.#metadata.runCurationMutation({ projectId: input.projectId, colorPinDefinitionUpdates: [{ before, after }], changeSet })
    this.#publishChangeSet(changeSet, input.origin)
    return { definition: this.#metadata.getColorPinDefinition(before.id)!, changeSet }
  }

`;
const sameDefinition=String.raw`// native-color-pin-label-equality: exact original before/after fields, not a hash.
function sameColorPinDefinition(a: ColorPinDefinitionV0 | undefined, b: ColorPinDefinitionV0): boolean {
  return !!a && a.id === b.id && a.projectId === b.projectId && a.color === b.color
    && (a.label ?? null) === (b.label ?? null) && a.createdAt === b.createdAt && a.updatedAt === b.updatedAt
}
function sameColorPinMembership(a: ColorPinMembershipV0, b: ColorPinMembershipV0): boolean {
  return a.id === b.id && a.projectId === b.projectId && a.colorPinId === b.colorPinId
    && a.targetRef.projectId === b.targetRef.projectId && a.targetRef.kind === b.targetRef.kind && a.targetRef.id === b.targetRef.id
    && a.createdAt === b.createdAt && a.updatedAt === b.updatedAt
}
function sameColorPinMembers(actual: readonly ColorPinMembershipV0[], expected: readonly ColorPinMembershipV0[]): boolean {
  return actual.length === expected.length && actual.every(member => expected.some(row => sameColorPinMembership(member, row)))
}

`;
export function transformNativeCoreColorPinSafety(source,{sourcePath}={}){
  const method='  removeColorPinMembership(input:';
  const undoCheck="      else if (change.type === 'color_pin_definition_add') {\n        if (this.#metadata.getColorPinDefinition(change.colorPinId) === undefined) return { revertable: false, reason: 'TOUCHED_STATE_CHANGED_AFTER_APPLY', changeSetId }";
  const redoCheck="      else if (change.type === 'color_pin_definition_add') {\n        if (this.#metadata.getColorPinDefinition(change.colorPinId) !== undefined) return { revertable: false, reason: 'TOUCHED_STATE_CHANGED_AFTER_APPLY', changeSetId }";
  const undoWrite="      else if (change.type === 'color_pin_definition_add') {\n        this.#metadata.runCurationMutation({ projectId: changeSet.projectId, colorPinDefinitionDeletes: [change.colorPinId] })";
  const redoWrite="      else if (change.type === 'color_pin_definition_add') {\n        this.#metadata.runCurationMutation({ projectId: changeSet.projectId, colorPinDefinitionAdds: [change.definition] })";
  const owned=String.raw`        const owned = changeSet.changes.flatMap(item => item.type === 'color_pin_membership_add'
          && item.membership.colorPinId === change.colorPinId ? [item.membership] : [])
`;
  const guardedUndo=String.raw`      else if (change.type === 'color_pin_definition_add') {
`+owned+String.raw`        if (!sameColorPinDefinition(this.#metadata.getColorPinDefinition(change.colorPinId), change.definition)
          || !sameColorPinMembers(this.#metadata.listColorPinMemberships(changeSet.projectId as Parameters<SqliteMetadataRepository['listColorPinMemberships']>[0])
            .filter(member => member.colorPinId === change.colorPinId), owned))
          return { revertable: false, reason: 'TOUCHED_STATE_CHANGED_AFTER_APPLY', changeSetId }`;
  const guardedRedo=redoCheck+String.raw`
        if (this.#metadata.getColorPinDefinitionByColor(changeSet.projectId as Parameters<SqliteMetadataRepository['getColorPinDefinitionByColor']>[0], change.definition.color) !== undefined)
          return { revertable: false, reason: 'TOUCHED_STATE_CHANGED_AFTER_APPLY', changeSetId }`;
  const guardedDelete=String.raw`      else if (change.type === 'color_pin_definition_add') {
`+owned+String.raw`        try {
          this.#metadata.runCurationMutation({ projectId: changeSet.projectId,
            colorPinDefinitionDeleteChecks: [{ definition: change.definition, memberships: owned }],
            colorPinMembershipDeletes: owned.map(member => member.id), colorPinDefinitionDeletes: [change.colorPinId] })
        } catch (error) {
          if (error instanceof Error && error.message === 'STALE_COLOR_PIN_DEFINITION_DELETE')
            return { revertable: false, reason: 'TOUCHED_STATE_CHANGED_AFTER_APPLY', changeSetId }
          throw error
        }`;
  const check=(state)=>"      else if (change.type === 'color_pin_definition_update') {\n        if (!sameColorPinDefinition(this.#metadata.getColorPinDefinition(change.colorPinId), change."+state+")) return { revertable: false, reason: 'TOUCHED_STATE_CHANGED_AFTER_APPLY', changeSetId }\n      } ";
  const write=(before,after)=>"      else if (change.type === 'color_pin_definition_update') {\n        this.#metadata.runCurationMutation({ projectId: changeSet.projectId, colorPinDefinitionUpdates: [{ before: change."+before+", after: change."+after+" }] })\n      } ";
  return adapt(source,sourcePath,nativeCoreColorPinSafetySource,'native-color-pin-label-owner',[
    ['export class MutationSafetyService',sameDefinition+'export class MutationSafetyService'],[method,createService+service+method],
    [undoCheck,check('after')+guardedUndo.trimStart()],[redoCheck,check('before')+guardedRedo.trimStart()],
    [undoWrite,write('after','before')+guardedDelete.trimStart()],[redoWrite,write('before','after')+redoWrite.trimStart()],
  ]);
}
const createRoute=String.raw`  // native-color-pin-definition-create-route: original owner, no membership.
  const createDefinitionMatch = /^\/projects\/([^/]+)\/color-pins\/definitions$/.exec(pathname)
  if (createDefinitionMatch && method === 'POST') {
    const db = routeRequireMetadata(ctx); if (!db) return true
    const projectId = decodeURIComponent(createDefinitionMatch[1] ?? '') as ProjectId
    if (!routeRequireProject(projectId, { metadata: db, response, helpers: ctx.helpers })) return true
    let input: unknown
    try { input = await readJsonBody(request, controller.signal) } catch {
      sendJson(response,400,failure('INVALID_ARGUMENT','Request body must be valid JSON.')); return true
    }
    if (!isRecord(input) || Object.keys(input).sort().join(',') !== 'color,expectedDefinitionId,label'
      || typeof input.color !== 'string' || !COLOR_RE.test(input.color)
      || typeof input.label !== 'string' || !input.label.trim() || input.label.trim().length > 500
      || input.expectedDefinitionId !== null) {
      sendJson(response,400,failure('INVALID_ARGUMENT','Color Pin definition requires color, label and expectedDefinitionId:null.')); return true
    }
    if (!mutationSafety) { sendJson(response,503,failure('UNAVAILABLE','Mutation safety service is not configured.')); return true }
    try {
      const result = mutationSafety.createColorPinDefinition({ projectId:String(projectId),color:input.color.toUpperCase(),
        label:input.label,expectedDefinitionId:null,actorKind:'web' })
      sendJson(response,201,{ok:true,value:{definition:result.definition},meta:{changeSetId:result.changeSet.id}})
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Color Pin definition creation failed.'
      const conflict = message === 'STALE_COLOR_PIN_DEFINITION_ABSENCE'
        || message.includes('UNIQUE constraint failed: color_pin_definitions.project_id, color_pin_definitions.color_value')
      sendJson(response,conflict?409:422,failure(conflict?'CONFLICT':'INVALID_ARGUMENT',conflict?'STALE_COLOR_PIN_DEFINITION_ABSENCE':message))
    }
    return true
  }

`;
const renameRoute=String.raw`  // native-color-pin-label-route: original MutationSafety owns this update.
  const renameMatch = /^\/projects\/([^/]+)\/color-pins\/definitions\/([^/]+)$/.exec(pathname)
  if (renameMatch && method === 'PATCH') {
    const db = routeRequireMetadata(ctx); if (!db) return true
    const projectId = decodeURIComponent(renameMatch[1] ?? '') as ProjectId
    if (!routeRequireProject(projectId, { metadata: db, response, helpers: ctx.helpers })) return true
    const colorPinId = decodeURIComponent(renameMatch[2] ?? ''), definition = db.getColorPinDefinition(colorPinId)
    if (!definition || definition.projectId !== projectId) { sendJson(response,404,failure('NOT_FOUND','Color Pin definition not found.')); return true }
    let input: unknown
    try { input = await readJsonBody(request, controller.signal) } catch {
      sendJson(response,400,failure('INVALID_ARGUMENT','Request body must be valid JSON.')); return true
    }
    if (!isRecord(input) || Object.keys(input).sort().join(',') !== 'expectedLabel,expectedUpdatedAt,label'
      || typeof input.label !== 'string' || !input.label.trim() || input.label.trim().length > 500
      || typeof input.expectedUpdatedAt !== 'string' || !input.expectedUpdatedAt
      || !(input.expectedLabel === null || typeof input.expectedLabel === 'string')) {
      sendJson(response,400,failure('INVALID_ARGUMENT','Color Pin rename requires label and the observed label/updatedAt.')); return true
    }
    if (!mutationSafety) { sendJson(response,503,failure('UNAVAILABLE','Mutation safety service is not configured.')); return true }
    try {
      const result = mutationSafety.renameColorPinDefinition({projectId:String(projectId),colorPinId,label:input.label,
        expectedUpdatedAt:input.expectedUpdatedAt,expectedLabel:input.expectedLabel,actorKind:'web'})
      sendJson(response,200,{ok:true,value:{definition:result.definition},...(result.changeSet?{meta:{changeSetId:result.changeSet.id}}:{})})
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Color Pin rename failed.'
      sendJson(response,message === 'STALE_COLOR_PIN_DEFINITION'?409:422,failure(message === 'STALE_COLOR_PIN_DEFINITION'?'CONFLICT':'INVALID_ARGUMENT',message))
    }
    return true
  }

`;
export function transformNativeCoreColorPinRoute(source,{sourcePath}={}){
  const anchor='  const assignMatch = ';
  // String.raw keeps source regex escapes; the generated TypeScript has one
  // slash escape, matching the original route convention.
  return adapt(source,sourcePath,nativeCoreColorPinRouteSource,'native-color-pin-label-route',[[anchor,(createRoute+renameRoute).replaceAll('\\\\/','\\/')+anchor]]);
}
const changeType=String.raw`  | {
      /** native-color-pin-label-change: original curation before/after update. */
      readonly type: 'color_pin_definition_update'
      readonly colorPinId: string
      readonly before: ColorPinDefinitionV0
      readonly after: ColorPinDefinitionV0
      readonly inverse: { readonly type: 'color_pin_definition_update'; readonly colorPinId: string }
      readonly forward: { readonly type: 'color_pin_definition_update'; readonly colorPinId: string }
    }
`;
export function transformNativeCoreColorPinChange(source,{sourcePath}={}){
  const anchor="  | {\n      readonly type: 'color_pin_membership_add'";
  return adapt(source,sourcePath,nativeCoreColorPinChangeSource,'native-color-pin-label-change',[[anchor,changeType+anchor]]);
}
const clientInput=String.raw`/** native-color-pin-label-client: observed definition CAS, shared project label. */
export interface ColorPinRenameInputV1 { readonly label:string; readonly expectedUpdatedAt:string; readonly expectedLabel:string|null }
export interface ColorPinRenameReceiptV1 { readonly definition:ColorPinDefinitionV0; readonly changeSetId?:string }
export interface ColorPinCreateDefinitionInputV1 { readonly color:string; readonly label:string; readonly expectedDefinitionId:null }
export interface ColorPinCreateDefinitionReceiptV1 { readonly definition:ColorPinDefinitionV0; readonly changeSetId?:string }

`;
const clientMethod=String.raw`  async createDefinition(projectId:string,input:ColorPinCreateDefinitionInputV1,signal?:AbortSignal):Promise<ColorPinCreateDefinitionReceiptV1> {
    const envelope=await coreEnvelope<{definition:ColorPinDefinitionV0}>(this.http,'POST',
      '/projects/'+encodeURIComponent(projectId)+'/color-pins/definitions',{body:input,signal})
    const changeSetId=(envelope.meta as {changeSetId?:string}|undefined)?.changeSetId
    return {...envelope.value,...(changeSetId?{changeSetId}:{})}
  }

  async renameDefinition(projectId:string,colorPinId:string,input:ColorPinRenameInputV1,signal?:AbortSignal):Promise<ColorPinRenameReceiptV1> {
    const envelope=await coreEnvelope<{definition:ColorPinDefinitionV0}>(this.http,'PATCH',
      '/projects/'+encodeURIComponent(projectId)+'/color-pins/definitions/'+encodeURIComponent(colorPinId),{body:input,signal})
    const changeSetId=(envelope.meta as {changeSetId?:string}|undefined)?.changeSetId
    return {...envelope.value,...(changeSetId?{changeSetId}:{})}
  }

`;
export function transformNativeCoreColorPinClient(source,{sourcePath}={}){
  return adapt(source,sourcePath,nativeCoreColorPinClientSource,'native-color-pin-label-client',[
    ['export class CoreColorPinClient',clientInput+'export class CoreColorPinClient'],
    ['  snapshot(projectId:',clientMethod+'  snapshot(projectId:'],
  ]);
}
export function createNativeCoreColorPinTransforms(){return {
  [nativeCoreColorPinRepositorySource]:transformNativeCoreColorPinRepository,
  [nativeCoreColorPinSafetySource]:transformNativeCoreColorPinSafety,
  [nativeCoreColorPinRouteSource]:transformNativeCoreColorPinRoute,
  [nativeCoreColorPinChangeSource]:transformNativeCoreColorPinChange,
  [nativeCoreColorPinClientSource]:transformNativeCoreColorPinClient,
};}
