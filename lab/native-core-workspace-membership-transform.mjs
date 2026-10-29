import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { currentGen2Root } from './current-gen2-resources.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ts = createRequire(path.join(currentGen2Root, 'package.json'))('typescript');
export const nativeCoreWorkspaceMembershipSafetySource = 'lcos/apps/local-core/src/mutation-safety-service.ts';
export const nativeCoreWorkspaceMembershipRouteSource = 'lcos/apps/local-core/src/routes/workspace-states.ts';
function sourceText(source, sourcePath, file, marker) {
  if (path.resolve(sourcePath ?? '').toLowerCase() !== path.resolve(root, file).toLowerCase())
    throw new Error('Workspace member condition requires its exact Core sourcePath.');
  if (typeof source !== 'string') throw new TypeError('Actual Core source text is required.');
  const eol = source.includes('\r\n') ? '\r\n' : '\n', text = source.replaceAll('\r\n', '\n');
  if (text.includes(marker)) {
    if (text.split(marker).length !== 2) throw new Error('Workspace member condition is duplicated.');
    return { eol, text, installed: true };
  }
  return { eol, text, installed: false };
}
function parse(text, file) {
  const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if (ast.parseDiagnostics.length) throw new Error('Workspace member condition transformed source does not parse: ' + file);
  return ast;
}
function one(list, label) { if (list.length !== 1) throw new Error('Workspace member condition seam drifted: ' + label); return list[0]; }
function replaceOnce(source, before, after, label) {
  if (source.split(before).length !== 2) throw new Error('Workspace member condition seam drifted: ' + label);
  return source.replace(before, after);
}
function edits(source, changes) {
  let last = source.length + 1;
  for (const edit of changes.sort((a, b) => b.start - a.start || b.end - a.end)) {
    if (edit.end > last) throw new Error('Workspace member condition edits overlap.');
    source = source.slice(0, edit.start) + edit.text + source.slice(edit.end); last = edit.start;
  }
  return source;
}
export function transformNativeCoreWorkspaceMembershipSafety(source, { sourcePath } = {}) {
  const marker = 'native-workspace-membership-condition-owner';
  const { eol, text, installed } = sourceText(source, sourcePath, nativeCoreWorkspaceMembershipSafetySource, marker);
  if (installed) return source;
  const ast = parse(text, sourcePath), methods = [];
  const visit = node => { if (ts.isMethodDeclaration(node) && ['addWorkspaceMember', 'removeWorkspaceMember'].includes(node.name.getText(ast))) methods.push(node); ts.forEachChild(node, visit); }; visit(ast);
  if (methods.length !== 2) throw new Error('Both actual original workspace member owners are required.');
  const changes = [];
  for (const method of methods) {
    const add = method.name.getText(ast) === 'addWorkspaceMember', input = method.parameters[0];
    if (!input?.type || !ts.isTypeLiteralNode(input.type) || !method.body) throw new Error('Original member input owner changed.');
    const statements = [...method.body.statements];
    const mutation = one(statements.filter(node => ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)
      && node.expression.expression.getText(ast) === 'this.#metadata.runCurationMutation'), 'original curation write');
    const publish = one(statements.filter(node => ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)
      && node.expression.expression.getText(ast) === 'this.#publishChangeSet'), 'original ChangeSet publish');
    const finalReturn = one(statements.filter(node => ts.isReturnStatement(node) && node.expression?.getText(ast) === 'changeSet'), 'original mutation result');
    const plan = mutation.expression.arguments[0];
    if (!plan || !ts.isObjectLiteralExpression(plan)) throw new Error('Original workspace mutation plan changed.');
    let body = text.slice(method.body.getStart(ast) + 1, method.body.end - 1);
    body = body.replace(mutation.getText(ast), 'nativeMemberChangeSet = changeSet\n      return ' + plan.getText(ast))
      .replace(publish.getText(ast), '').replace(finalReturn.getText(ast), '')
      .replaceAll('return undefined', "throw new Error('WORKSPACE_MEMBER_CONDITION_CHANGED')");
    const workspaceCheck = "    if (workspace === undefined || String(workspace.projectId) !== input.projectId) throw new Error('Workspace not found.')";
    const condition = `
      const nativeExpected = input.expectedWorkspaceMember!
      if (nativeExpected.workspaceId !== input.workspaceId || nativeExpected.viewId !== input.viewId)
        throw new Error('WORKSPACE_MEMBER_CONDITION_CHANGED')
      const nativeRow = this.#metadata.listWorkspaceMembers(input.workspaceId as never)
        .find(member => String(member.artifactViewId) === input.viewId)
      ${add ? "if (nativeExpected.absent !== true || nativeRow !== undefined)" : "if (!nativeRow || nativeRow.addedAt !== nativeExpected.addedAt || nativeRow.addedBy !== nativeExpected.addedBy)"}
        throw new Error('WORKSPACE_MEMBER_CONDITION_CHANGED')
`;
    body = replaceOnce(body, workspaceCheck, workspaceCheck + condition, 'original workspace ownership check');
    const branch = `
    // ${add ? marker : 'workspace-member-remove-condition'}: compare in the original
    // BEGIN IMMEDIATE callback, then submit the original plan/ChangeSet.
    if (input.expectedWorkspaceMember !== undefined) {
      let nativeMemberChangeSet: MutationChangeSetV1 | undefined
      this.#metadata.runCurationMutation(() => {${body}
      })
      if (nativeMemberChangeSet !== undefined) this.#publishChangeSet(nativeMemberChangeSet, input.origin)
      return nativeMemberChangeSet
    }
`;
    changes.push({ start: method.body.getStart(ast) + 1, end: method.body.getStart(ast) + 1, text: branch });
    const expected = add ? "{ readonly workspaceId: string; readonly viewId: string; readonly absent: true }"
      : "{ readonly workspaceId: string; readonly viewId: string; readonly addedAt: string; readonly addedBy: 'user' | 'agent' | 'run' | 'import' }";
    changes.push({ start: input.type.end - 1, end: input.type.end - 1, text: '    readonly expectedWorkspaceMember?: ' + expected + '\n  ' });
  }
  const result = edits(text, changes); parse(result, sourcePath); return result.replaceAll('\n', eol);
}

const parser = `
// native-workspace-membership-condition-route: optional exact-row/absence
// input for the existing member write; never a second membership owner.
type NativeWorkspaceMemberExpected = { workspaceId: string; viewId: string; absent: true }
  | { workspaceId: string; viewId: string; addedAt: string; addedBy: 'user' | 'agent' | 'run' | 'import' }
function readNativeWorkspaceMemberExpected(raw: unknown, workspaceId: string, viewIds: readonly string[], add: boolean): NativeWorkspaceMemberExpected | undefined {
  if (raw === undefined) return undefined
  if (typeof raw !== 'string' || !raw || viewIds.length !== 1) throw new Error('Workspace member condition must address one exact member.')
  const parsed: unknown = JSON.parse(decodeURIComponent(raw))
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Workspace member condition must be an object.')
  const value = parsed as Record<string, unknown>
  const keys = add ? 'absent,viewId,workspaceId' : 'addedAt,addedBy,viewId,workspaceId'
  if (Object.keys(value).sort().join(',') !== keys || value.workspaceId !== workspaceId || value.viewId !== viewIds[0]
    || typeof value.workspaceId !== 'string' || !value.workspaceId || typeof value.viewId !== 'string' || !value.viewId
    || (add ? value.absent !== true : typeof value.addedAt !== 'string' || !value.addedAt || !['user', 'agent', 'run', 'import'].includes(String(value.addedBy))))
    throw new Error('Workspace member condition does not match the original address.')
  return value as NativeWorkspaceMemberExpected
}
`;
export function transformNativeCoreWorkspaceMembershipRoute(source, { sourcePath } = {}) {
  const marker = 'native-workspace-membership-condition-route';
  const { eol, text, installed } = sourceText(source, sourcePath, nativeCoreWorkspaceMembershipRouteSource, marker);
  if (installed) return source;
  let result = replaceOnce(text, 'export interface WorkspaceStatesRouteContext', parser + '\nexport interface WorkspaceStatesRouteContext', 'original route imports');
  const parseAt = (add, views) => `    let nativeMemberExpected: NativeWorkspaceMemberExpected | undefined
    try { nativeMemberExpected = readNativeWorkspaceMemberExpected(request.headers['x-lcos-expected-workspace-member'], String(workspaceId), ${views}, ${add}) }
    catch (error: unknown) {
      sendJson(response, 400, failure('INVALID_ARGUMENT', error instanceof Error ? error.message : 'Invalid Workspace member condition.'))
      return true
    }
`;
  const originalPost = `    const changeSetIds: string[] = []
    for (const viewId of input.viewIds as ArtifactViewId[]) {
      const changeSet = mutationSafety.addWorkspaceMember({ projectId, workspaceId: String(workspaceId), viewId: String(viewId), addedBy, actorKind: 'web' })
      if (changeSet !== undefined) changeSetIds.push(changeSet.id)
    }`;
  result = replaceOnce(result, originalPost, parseAt('true', 'input.viewIds') + `    const changeSetIds: string[] = []
    try {
      for (const viewId of input.viewIds as ArtifactViewId[]) {
        const changeSet = mutationSafety.addWorkspaceMember({ projectId, workspaceId: String(workspaceId), viewId: String(viewId), addedBy, actorKind: 'web',
          ...(nativeMemberExpected === undefined ? {} : { expectedWorkspaceMember: nativeMemberExpected as { workspaceId: string; viewId: string; absent: true } }) })
        if (changeSet !== undefined) changeSetIds.push(changeSet.id)
      }
    } catch (error: unknown) {
      if (nativeMemberExpected === undefined) throw error
      sendJson(response, 409, failure('CONFLICT', error instanceof Error ? error.message : 'Membership add condition changed.'))
      return true
    }`, 'original POST member loop');
  const deleteCall = "      const changeSet = mutationSafety.removeWorkspaceMember({ projectId: String(workspace.projectId), workspaceId: String(workspaceId), viewId: String(viewId), actorKind: 'web' })";
  result = replaceOnce(result, deleteCall, parseAt('false', '[String(viewId)]')
    + "      const changeSet = mutationSafety.removeWorkspaceMember({ projectId: String(workspace.projectId), workspaceId: String(workspaceId), viewId: String(viewId), actorKind: 'web',\n        ...(nativeMemberExpected === undefined ? {} : { expectedWorkspaceMember: nativeMemberExpected as { workspaceId: string; viewId: string; addedAt: string; addedBy: 'user' | 'agent' | 'run' | 'import' } }) })", 'original DELETE member owner');
  parse(result, sourcePath); return result.replaceAll('\n', eol);
}
export function createNativeCoreWorkspaceMembershipTransforms() {
  return {
    [nativeCoreWorkspaceMembershipSafetySource]: transformNativeCoreWorkspaceMembershipSafety,
    [nativeCoreWorkspaceMembershipRouteSource]: transformNativeCoreWorkspaceMembershipRoute,
  };
}
