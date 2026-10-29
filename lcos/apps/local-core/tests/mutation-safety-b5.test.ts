import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Relation } from '@local-creative-os/domain'
import { MutationSafetyService } from '../src/mutation-safety-service.js'
import { SqliteMetadataRepository } from '../src/metadata-repository.js'
import { PresentationApplicationService } from '../src/presentation-application-service.js'
import { createMvpSampleSnapshot } from '../src/mvp-sample-project.js'

const roots: string[] = []
const repos: SqliteMetadataRepository[] = []
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'lcos-b5-mutation-')); roots.push(root)
  const graph = createMvpSampleSnapshot(join(root, 'project'), '2026-08-16T00:00:00.000Z')
  const repo = new SqliteMetadataRepository(join(root, 'metadata.sqlite')); repos.push(repo); repo.save(graph)
  const presentation = new PresentationApplicationService(repo, repo)
  return { graph, repo, service: new MutationSafetyService(repo, presentation), projectId: String(graph.project.id) }
}
afterEach(async()=>{for(const r of repos.splice(0)){try{r.close()}catch{}};await Promise.all(roots.splice(0).map((p)=>rm(p,{recursive:true,force:true,maxRetries:3})))})

describe('B5 MutationSafety relation lifecycle', () => {
  it('persists canonical Collection membership with safe undo, redo, and idempotent receipts', async () => {
    const { repo, service, projectId } = await setup()
    const { collection } = service.createCollection({ projectId, title: 'Reference set' })
    const memberRef = { type: 'artifact', id: 'artifact-feedback' } as const

    const added = service.addCollectionMember({ projectId, collectionId: String(collection.id), memberRef })
    expect(added.status).toBe('applied')
    expect(repo.listCollectionMemberships(projectId, String(collection.id))).toHaveLength(1)
    expect(service.addCollectionMember({ projectId, collectionId: String(collection.id), memberRef })).toMatchObject({ status: 'already-member', relationId: added.relationId })
    expect(added.changeSetId).toBeTruthy()
    expect(service.revert(added.changeSetId!).revertable).toBe(true)
    expect(repo.listCollectionMemberships(projectId, String(collection.id))).toHaveLength(0)
    expect(service.reapply(added.changeSetId!).revertable).toBe(true)
    expect(repo.listCollectionMemberships(projectId, String(collection.id))).toHaveLength(1)

    const removed = service.removeCollectionMember({ projectId, collectionId: String(collection.id), memberRef })
    expect(removed.status).toBe('removed')
    expect(repo.listCollectionMemberships(projectId, String(collection.id))).toHaveLength(0)
    expect(service.removeCollectionMember({ projectId, collectionId: String(collection.id), memberRef }).status).toBe('not-member')
  })

  it('rejects cross-project and cyclic Collection members', async () => {
    const { service, projectId } = await setup()
    const { collection: first } = service.createCollection({ projectId, title: 'First' })
    const { collection: second } = service.createCollection({ projectId, title: 'Second' })
    expect(() => service.addCollectionMember({ projectId, collectionId: String(first.id), memberRef: { type: 'artifact', id: 'missing-artifact' } })).toThrow(/canonical entity/i)
    service.addCollectionMember({ projectId, collectionId: String(first.id), memberRef: { type: 'collection', id: String(second.id) } })
    expect(() => service.addCollectionMember({ projectId, collectionId: String(second.id), memberRef: { type: 'collection', id: String(first.id) } })).toThrow(/cycle/i)
  })

  it('records create, safely reverts, and reapplies a Relation including provenance evidence', async () => {
    const { repo, service, projectId } = await setup()
    const now = new Date().toISOString()
    const relation: Relation = {
      id: 'relation-b5-created' as Relation['id'], projectId: projectId as Relation['projectId'],
      sourceEntityType: 'artifact', sourceEntityId: 'artifact-feedback', targetEntityType: 'artifact', targetEntityId: 'artifact-script',
      kind: 'supports', origin: 'user', createdBy: 'test', evidenceRefs: [{ kind:'artifact', id:'artifact-feedback', label:'feedback' }], confidence: .9,
      createdAt: now, updatedAt: now,
    }
    const cs = service.upsertRelation({ projectId, relation, operationId:'op-create' })
    expect(repo.getRelation(String(relation.id))?.evidenceRefs?.[0]?.label).toBe('feedback')
    expect(service.revert(cs.id).revertable).toBe(true)
    expect(repo.getRelation(String(relation.id))).toBeUndefined()
    expect(service.reapply(cs.id).revertable).toBe(true)
    expect(repo.getRelation(String(relation.id))?.evidenceRefs?.[0]?.id).toBe('artifact-feedback')
  })

  it('refuses undo after touched relation changed again', async () => {
    const { repo, service, projectId } = await setup()
    const current = repo.getRelation('relation-feedback-script')!
    const changed: Relation = { ...current, kind:'change_request', updatedAt:new Date().toISOString() }
    const cs = service.upsertRelation({ projectId, relation: changed, operationId:'op-update' })
    repo.upsertRelation({ ...changed, kind:'someone-else-changed-this', updatedAt:new Date().toISOString() })
    expect(service.revert(cs.id)).toMatchObject({ revertable:false, reason:'TOUCHED_STATE_CHANGED_AFTER_APPLY' })
    expect(repo.getRelation(String(current.id))?.kind).toBe('someone-else-changed-this')
  })
})
