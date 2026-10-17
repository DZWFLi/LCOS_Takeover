#!/usr/bin/env node
import { readFile, readdir, lstat, open, writeFile } from "node:fs/promises";
import { basename, join, relative, sep } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { coreRequest, jsonBody } from "./lib/client.mjs";

const [group = "help", action, ...rest] = process.argv.slice(2);
const option = (name) => {
  const index = rest.indexOf(`--${name}`);
  return index < 0 ? undefined : rest[index + 1];
};
const positional = rest.filter((value, index) => !value.startsWith("--") && !rest[index - 1]?.startsWith("--"));
const activeContextPath = (projectId, afterVersion) => {
  const query = new URLSearchParams();
  if (option("workspace")) query.set("workspaceId", option("workspace"));
  if (afterVersion !== undefined) query.set("afterVersion", String(afterVersion));
  const encoded = encodeURIComponent(projectId);
  return `/projects/${encoded}/active-context${query.size ? `?${query}` : ""}`;
};
const contextProposalsPath = (projectId) => {
  const query = new URLSearchParams();
  if (option("workspace")) query.set("workspaceId", option("workspace"));
  return `/projects/${encodeURIComponent(projectId)}/context-proposals${query.size ? `?${query}` : ""}`;
};

const activeContextMutation = (active, patch = {}) => ({
  ...(option("workspace") ? { workspaceId: option("workspace") } : {}),
  scopeId: active.scopeId || "",
  selectedViewIds: active.selectedViewIds ?? [],
  pinnedContextIds: active.pinnedContextIds ?? [],
  excludedContextIds: active.excludedContextIds ?? [],
  ...(active.viewport ? {
    viewport: { x: active.viewport.x, y: active.viewport.y, zoom: active.viewport.zoom },
    visibleViewIds: active.viewport.visibleViewIds ?? [],
  } : {}),
  ...(active.targetArtifactId ? { targetArtifactId: active.targetArtifactId } : {}),
  ...(active.targetRevisionId ? { targetRevisionId: active.targetRevisionId } : {}),
  expectedVersion: active.version,
  updatedBy: "codex",
  ...patch,
});
let exitCode = 0;

try {
  let result;
  if (group === "doctor") {
    const [core, bridge, ollama] = await Promise.all([
      probe(coreRequest("/health")),
      probe(coreRequest("/executor/health")),
      probe(fetch("http://127.0.0.1:11434/api/tags", { signal: AbortSignal.timeout(2000) }).then((response) => response.json())),
    ]);
    const { existsSync } = await import("node:fs");
    const { join } = await import("node:path");
    const vec0 = existsSync(join(process.cwd(), ".runtime", "sqlite-vec", "vec0.dll"));
    const capabilities = bridge.ok ? await probe(coreRequest("/executor/capabilities")) : null;
    const healthy = core.ok && bridge.ok;
    result = {
      healthy,
      core: core.ok ? { ok: true, ...core.value } : { ok: false, error: core.error },
      bridge: bridge.ok ? { ok: true, ...bridge.value } : { ok: false, error: bridge.error },
      semantic: {
        ollama: ollama.ok ? "available" : "unavailable",
        sqliteVec: vec0 ? "native-file-present" : "unavailable",
      },
      capabilities: capabilities === null ? null : capabilities.ok ? capabilities.value : { error: capabilities.error },
    };
    if (!healthy) exitCode = 1;
  } else if (group === "capabilities") {
    const bridge = await probe(coreRequest("/executor/capabilities"));
    const core = await probe(coreRequest("/health"));
    result = {
      coreHealthy: core.ok,
      ...(bridge.ok ? bridge.value : { bridgeError: bridge.error }),
    };
    if (!bridge.ok || !core.ok) exitCode = 1;
  } else if (group === "project" && action === "list") {
    result = await coreRequest("/projects");
  } else if (group === "project" && action === "open") {
    const rootPath = required(positional[0], "project root path");
    const name = required(option("name"), "--name");
    const inspection = await coreRequest("/project-roots/inspect", { method: "POST", ...jsonBody({ rootPath }), timeoutMs: 60_000 });
    if (inspection.requiresConfirmation && !rest.includes("--import-existing") && !rest.includes("--empty")) {
      throw new Error(`Directory contains ${inspection.fileCount} files and ${inspection.directoryCount} folders. Re-run with --import-existing to build Canvas nodes or --empty to register only the root.`);
    }
    result = await coreRequest("/projects", { method: "POST", ...jsonBody({ name, intent: "open", rootPath, importExisting: rest.includes("--import-existing") }), timeoutMs: 120_000 });
  } else if (group === "project" && action === "create") {
    const parentPath = required(positional[0], "parent path");
    const name = required(option("name"), "--name");
    result = await coreRequest("/projects", { method: "POST", ...jsonBody({ name, intent: "create", parentPath, directoryName: option("directory") || name.replace(/\s+/g, "-") }), timeoutMs: 60_000 });
  } else if (group === "project" && action === "show") {
    result = await coreRequest(`/projects/${encodeURIComponent(required(positional[0], "project id"))}/graph`);
  } else if (group === "project" && action === "inspect") {
    const rootPath = required(positional[0], "root path");
    result = await coreRequest("/project-roots/inspect", { method: "POST", ...jsonBody({ rootPath }), timeoutMs: 60_000 });
  } else if (group === "project" && action === "current") {
    const projects = await coreRequest("/projects");
    const explicit = positional[0];
    if (explicit !== undefined) {
      const found = projects.find((item) => item.id === explicit);
      if (found === undefined) throw new Error(`Project not found: ${explicit}`);
      result = found;
    } else if (projects.length === 1) {
      result = projects[0];
    } else if (projects.length === 0) {
      throw new Error("No projects registered. Use lcos project open|create first.");
    } else {
      throw new Error(`Multiple projects registered; pass the project id: ${projects.map((item) => item.id).join(", ")}`);
    }
  } else if (group === "project" && action === "export") {
    const projectId = required(positional[0], "project id");
    result = await coreRequest(`/projects/${encodeURIComponent(projectId)}/export-lcosproj`, {
      method: "POST",
      ...jsonBody({ targetPath: required(option("to"), "--to") }),
      timeoutMs: 120_000,
    });
  } else if (group === "project" && action === "export-all") {
    result = await coreRequest("/lcosproj/export-all", {
      method: "POST",
      ...jsonBody({
        targetDir: required(option("to"), "--to"),
        ...(option("ids") ? { projectIds: option("ids").split(",") } : {}),
      }),
      timeoutMs: 300_000,
    });
  } else if (group === "project" && action === "open-file") {
    result = await coreRequest("/lcosproj/open", {
      method: "POST",
      ...jsonBody({
        filePath: required(positional[0], ".lcosproj path"),
        ...(option("root") ? { rootPath: option("root") } : {}),
      }),
      timeoutMs: 120_000,
    });
  } else if (group === "project" && action === "inspect-file") {
    result = await coreRequest(`/lcosproj/inspect?file=${encodeURIComponent(required(positional[0], ".lcosproj path"))}`);
  } else if (group === "workspace" && action === "list") {
    result = await coreRequest(`/projects/${encodeURIComponent(required(positional[0], "project id"))}/workspace-memberships`);
  } else if (group === "workspace" && action === "add") {
    const workspaceId = required(positional[0], "workspace id");
    const viewIds = positional.slice(1);
    if (viewIds.length === 0) throw new Error("workspace add requires at least one view id");
    result = await coreRequest(`/workspaces/${encodeURIComponent(workspaceId)}/members`, {
      method: "POST",
      ...jsonBody({ viewIds, ...(option("by") ? { addedBy: option("by") } : {}) }),
    });
  } else if (group === "workspace" && action === "remove") {
    const workspaceId = required(positional[0], "workspace id");
    const viewId = required(positional[1], "view id");
    result = await coreRequest(`/workspaces/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(viewId)}`, { method: "DELETE" });
  } else if (group === "workspace" && action === "move") {
    const fromWorkspaceId = required(positional[0], "from workspace id");
    const viewId = required(positional[1], "view id");
    const toWorkspaceId = required(option("to"), "--to (target workspace id)");
    result = await coreRequest(`/workspaces/${encodeURIComponent(fromWorkspaceId)}/members/move`, {
      method: "POST",
      ...jsonBody({ viewId, toWorkspaceId }),
    });
  } else if (group === "run" && action === "propose") {
    const projectId = required(positional[0], "project id");
    const prompt = required(option("prompt"), "--prompt");
    const active = await coreRequest(activeContextPath(projectId));
    const contextItems = (active.contextItems ?? []).flatMap((item, order) => item.revisionId ? [{ artifactId: item.artifactId, revisionId: item.revisionId, order }] : []);
    const editTargets = active.targetArtifactId && active.targetRevisionId
      ? [{ artifactId: active.targetArtifactId, baseRevisionId: active.targetRevisionId }]
      : [];
    result = await coreRequest(`/projects/${encodeURIComponent(projectId)}/runs/propose`, {
      method: "POST",
      ...jsonBody({
        ...(option("workspace") ? { workspaceId: option("workspace") } : {}),
        prompt,
        requestedProvider: option("provider") || "auto",
        createAsNewNode: rest.includes("--new-node"),
        contextItems,
        editTargets,
      }),
    });
  } else if (group === "run" && action === "validate-plan") {
    const projectId = required(positional[0], "project id");
    const planPath = required(positional[1], "agent plan json path");
    const plan = JSON.parse(await readFile(planPath, "utf8"));
    result = await coreRequest(`/projects/${encodeURIComponent(projectId)}/runs/validate-plan`, {
      method: "POST",
      ...jsonBody(plan),
    });
  } else if (group === "continuity" && action === "resolve") {
    const body = {
      capturedAt: new Date().toISOString(),
      ...(option("path") ? { cwd: option("path") } : {}),
      ...(option("file") ? { activeFilePath: option("file") } : {}),
      ...(option("session") ? { sessionId: option("session") } : {}),
      ...(option("project") ? { explicitProjectId: option("project") } : {}),
    };
    result = await coreRequest("/runtime/continuity/resolve", { method: "POST", ...jsonBody(body) });
  } else if (group === "continuity" && action === "resume") {
    const projectId = required(positional[0], "project id");
    const query = new URLSearchParams();
    if (option("workspace")) query.set("workspaceId", option("workspace"));
    if (option("session")) query.set("sessionId", option("session"));
    if (option("action")) query.set("explicitAction", option("action"));
    if (option("budget")) query.set("tokenBudget", option("budget"));
    result = await coreRequest(`/projects/${encodeURIComponent(projectId)}/continuity/resume${query.size ? `?${query}` : ""}`, { timeoutMs: 60_000 });
  } else if (group === "continuity" && action === "attach") {
    const projectId = required(positional[0], "project id");
    const query = new URLSearchParams();
    if (option("workspace")) query.set("workspaceId", option("workspace"));
    if (option("session")) query.set("sessionId", option("session"));
    if (option("provider")) query.set("provider", option("provider"));
    if (option("action")) query.set("explicitAction", option("action"));
    if (option("budget")) query.set("tokenBudget", option("budget"));
    result = await coreRequest(`/projects/${encodeURIComponent(projectId)}/continuity/attach${query.size ? `?${query}` : ""}`, { timeoutMs: 60_000 });
  } else if (group === "continuity" && action === "bind") {
    const projectId = required(positional[0], "project id");
    const sessionId = required(positional[1], "session id");
    result = await coreRequest(`/runtime/continuity/sessions/${encodeURIComponent(sessionId)}/bind`, {
      method: "POST",
      ...jsonBody({ projectId, ...(option("workspace") ? { workspaceId: option("workspace") } : {}), ...(option("status") ? { status: option("status") } : {}) }),
      timeoutMs: 60_000,
    });
  } else if (group === "continuity" && action === "return") {
    const projectId = required(positional[0], "project id");
    const inputPath = required(option("data"), "--data <return.json>");
    const body = JSON.parse(await readFile(inputPath, "utf8"));
    result = await coreRequest(`/projects/${encodeURIComponent(projectId)}/continuity/returns`, { method: "POST", ...jsonBody(body), timeoutMs: 60_000 });
  } else if (group === "providers") {
    result = await coreRequest("/runtime/providers");
  } else if (group === "context" && action === "get") {
    result = await coreRequest(activeContextPath(required(positional[0], "project id")));
  } else if (group === "selection" && action === "get") {
    result = await coreRequest(activeContextPath(required(positional[0], "project id")));
  } else if (group === "context" && action === "search") {
    const projectId = required(positional[0], "project id");
    result = await coreRequest(`/projects/${encodeURIComponent(projectId)}/artifacts/search?q=${encodeURIComponent(option("q") || "")}`, { timeoutMs: 120_000 });
  } else if (group === "target" && action === "set") {
    const projectId = required(positional[0], "project id");
    const artifactId = required(positional[1], "artifact id");
    const active = await coreRequest(activeContextPath(projectId));
    result = await coreRequest(activeContextPath(projectId), {
      method: "PUT",
      ...jsonBody(activeContextMutation(active, {
        targetArtifactId: artifactId,
        ...(option("revision") ? { targetRevisionId: option("revision") } : {}),
      })),
    });
  } else if (group === "target" && action === "clear") {
    const projectId = required(positional[0], "project id");
    const active = await coreRequest(activeContextPath(projectId));
    result = await coreRequest(activeContextPath(projectId), {
      method: "PUT",
      ...jsonBody({
        ...(option("workspace") ? { workspaceId: option("workspace") } : {}),
        scopeId: active.scopeId || "",
        selectedViewIds: active.selectedViewIds ?? [],
        pinnedContextIds: active.pinnedContextIds ?? [],
        excludedContextIds: active.excludedContextIds ?? [],
        ...(active.viewport ? { viewport: { x: active.viewport.x, y: active.viewport.y, zoom: active.viewport.zoom }, visibleViewIds: active.viewport.visibleViewIds ?? [] } : {}),
        expectedVersion: active.version,
        updatedBy: "codex",
      }),
    });
  } else if (group === "context" && action === "add") {
    const projectId = required(positional[0], "project id");
    const viewIds = positional.slice(1);
    if (viewIds.length === 0) throw new Error("context add requires at least one view id");
    const active = await coreRequest(activeContextPath(projectId));
    result = await coreRequest(activeContextPath(projectId), {
      method: "PUT",
      ...jsonBody(activeContextMutation(active, {
        pinnedContextIds: [...new Set([...(active.pinnedContextIds ?? []), ...viewIds])],
        excludedContextIds: (active.excludedContextIds ?? []).filter((id) => !viewIds.includes(id)),
      })),
    });
  } else if (group === "context" && action === "remove") {
    const projectId = required(positional[0], "project id");
    const viewIds = positional.slice(1);
    if (viewIds.length === 0) throw new Error("context remove requires at least one view id");
    const active = await coreRequest(activeContextPath(projectId));
    const removed = new Set(viewIds);
    result = await coreRequest(activeContextPath(projectId), {
      method: "PUT",
      ...jsonBody(activeContextMutation(active, {
        selectedViewIds: (active.selectedViewIds ?? []).filter((id) => !removed.has(id)),
        pinnedContextIds: (active.pinnedContextIds ?? []).filter((id) => !removed.has(id)),
        excludedContextIds: [...new Set([...(active.excludedContextIds ?? []), ...viewIds])],
        ...(active.targetArtifactId && (active.contextItems ?? []).some((item) => removed.has(item.viewId) && item.artifactId === active.targetArtifactId)
          ? { targetArtifactId: undefined, targetRevisionId: undefined }
          : {}),
      })),
    });
  } else if (group === "artifact" && action === "inspect") {
    result = await coreRequest(`/artifacts/${encodeURIComponent(required(positional[0], "artifact id"))}`);
  } else if (group === "revision" && action === "list") {
    result = await coreRequest(`/artifacts/${encodeURIComponent(required(positional[0], "artifact id"))}/revisions`);
  } else if (group === "revision" && action === "compare") {
    const projectId = required(positional[0], "project id");
    const base = required(positional[1], "base revision id");
    const head = required(positional[2], "head revision id");
    result = await coreRequest(`/projects/${encodeURIComponent(projectId)}/revisions/compare?base=${encodeURIComponent(base)}&head=${encodeURIComponent(head)}`);
  } else if (group === "process" && action === "projection") {
    result = await coreRequest(`/projects/${encodeURIComponent(required(positional[0], "project id"))}/process-projection`);
  } else if (group === "workspace" && action === "save-state") {
    const workspaceId = required(positional[0], "workspace id");
    result = await coreRequest(`/workspaces/${encodeURIComponent(workspaceId)}/states`, {
      method: "POST",
      ...jsonBody({ name: required(option("name"), "--name") }),
    });
  } else if (group === "workspace" && action === "restore-state") {
    const workspaceId = required(positional[0], "workspace id");
    const stateId = required(positional[1], "state id");
    result = await coreRequest(`/workspaces/${encodeURIComponent(workspaceId)}/states/${encodeURIComponent(stateId)}/restore`, { method: "POST", ...jsonBody({}) });
  } else if (group === "provider-session" && action === "get") {
    const projectId = required(positional[0], "project id");
    const provider = option("provider") || "codex";
    result = await coreRequest(`/projects/${encodeURIComponent(projectId)}/provider-sessions/${encodeURIComponent(provider)}`);
  } else if (group === "provider-session" && action === "set") {
    const projectId = required(positional[0], "project id");
    const provider = option("provider") || "codex";
    result = await coreRequest(`/projects/${encodeURIComponent(projectId)}/provider-sessions/${encodeURIComponent(provider)}`, {
      method: "PUT",
      ...jsonBody({
        externalSessionId: required(option("session"), "--session"),
        origin: option("origin") || "manual",
        status: option("status") || "active",
        lastSeenAt: new Date().toISOString(),
        ...(option("run") ? { lastRunId: option("run") } : {}),
        failureCount: Number(option("failures") || 0),
      }),
    });
  } else if (group === "provider-session" && action === "clear") {
    const projectId = required(positional[0], "project id");
    const provider = option("provider") || "codex";
    result = await coreRequest(`/projects/${encodeURIComponent(projectId)}/provider-sessions/${encodeURIComponent(provider)}`, { method: "DELETE" });
  } else if (group === "session" && action === "summarize") {
    const projectId = required(positional[0], "project id");
    result = await coreRequest(`/projects/${encodeURIComponent(projectId)}/session-summaries`, {
      method: "POST",
      ...jsonBody({
        title: option("title") || `Session ${new Date().toISOString().slice(0, 10)}`,
        summary: required(option("summary"), "--summary"),
        ...(option("runs") ? { runIds: option("runs").split(",") } : {}),
        ...(option("handoff") ? { handoffRef: option("handoff") } : {}),
      }),
    });
  } else if (group === "session" && action === "list") {
    result = await coreRequest(`/projects/${encodeURIComponent(required(positional[0], "project id"))}/session-summaries`);
  } else if (group === "manifest" && action === "build") {
    const projectId = required(positional[0], "project id");
    const active = await coreRequest(activeContextPath(projectId));
    result = await coreRequest(`/projects/${encodeURIComponent(projectId)}/context-manifests/v0`, {
      method: "POST",
      ...jsonBody({
        ...(option("target") ? { targetArtifactId: option("target") } : {}),
        contextArtifactIds: (active.contextArtifacts || active.selectedArtifacts || []).map((item) => item.artifactId),
        ...(option("output") ? { requestedOutput: option("output") } : {}),
      }),
    });
  } else if (group === "run" && action === "list") {
    result = await coreRequest(`/projects/${encodeURIComponent(required(positional[0], "project id"))}/runs?limit=${encodeURIComponent(option("limit") || "20")}`);
  } else if (group === "run" && action === "pending") {
    const projectId = required(positional[0], "project id");
    const reviews = await coreRequest(`/projects/${encodeURIComponent(projectId)}/runs?limit=${encodeURIComponent(option("limit") || "100")}`);
    result = reviews.filter((item) =>
      ["created", "queued", "running"].includes(item.run?.status)
      && item.dispatch?.status === "bound");
  } else if (group === "run" && action === "create") {
    const projectId = required(positional[0], "project id");
    const instruction = required(option("instruction"), "--instruction");
    const outputIntent = required(option("output"), "--output (create|revise|analyze)");
    const payload = {
      instruction,
      ...(option("target") ? { targetArtifactId: option("target") } : {}),
      outputIntent,
      requestedProvider: option("provider") || "workbuddy",
    };
    if (rest.includes("--dry-run")) {
      result = { dryRun: true, projectId, method: "POST", path: `/projects/${encodeURIComponent(projectId)}/runs`, payload };
    } else {
      result = await coreRequest(`/projects/${encodeURIComponent(projectId)}/runs`, {
        method: "POST",
        ...jsonBody(payload),
        timeoutMs: 60_000,
      });
    }
  } else if (group === "run" && action === "dispatch") {
    result = await coreRequest(`/runs/${encodeURIComponent(required(positional[0], "run id"))}/dispatch`, { method: "POST", ...jsonBody({}), timeoutMs: 60_000 });
  } else if (group === "run" && action === "recover") {
    result = await coreRequest(`/runs/${encodeURIComponent(required(positional[0], "run id"))}/recover`, { method: "POST", ...jsonBody({}), timeoutMs: 60_000 });
  } else if (group === "run" && action === "finalize") {
    result = await coreRequest(`/runs/${encodeURIComponent(required(positional[0], "run id"))}/finalize`, {
      method: "POST",
      ...jsonBody({ decision: option("decision") || "completed", ...(option("comment") ? { comment: option("comment") } : {}) }),
    });
  } else if (group === "run" && action === "show") {
    result = await coreRequest(`/runs/${encodeURIComponent(required(positional[0], "run id"))}/review`);
  } else if (group === "run" && action === "sync") {
    result = await coreRequest(`/runs/${encodeURIComponent(required(positional[0], "run id"))}/sync`, { method: "POST", ...jsonBody({}) });
  } else if (group === "run" && action === "context") {
    const runId = required(positional[0], "run id");
    const review = await coreRequest(`/runs/${encodeURIComponent(runId)}/review`);
    result = await coreRequest(`/projects/${encodeURIComponent(review.run.projectId)}/context-manifests/v0/${encodeURIComponent(review.run.contextManifestId)}`);
  } else if (group === "context" && action === "select") {
    const projectId = required(positional[0], "project id");
    const active = await coreRequest(activeContextPath(projectId));
    result = await coreRequest(activeContextPath(projectId), {
      method: "PUT",
      ...jsonBody(activeContextMutation(active, {
        selectedViewIds: (option("views") || "").split(",").filter(Boolean),
      })),
    });
  } else if (group === "context" && action === "focus") {
    const projectId = required(positional[0], "project id");
    const viewId = required(positional[1], "view id");
    const active = await coreRequest(activeContextPath(projectId));
    result = await coreRequest(activeContextPath(projectId), {
      method: "PUT",
      ...jsonBody(activeContextMutation(active, { selectedViewIds: [viewId] })),
    });
  } else if (group === "canvas" && action === "move") {
    const projectId = required(positional[0], "project id");
    result = await coreRequest(`/projects/${encodeURIComponent(projectId)}/graph`, {
      method: "POST",
      ...jsonBody({
        baseVersion: Number(required(option("base-version"), "--base-version")),
        ops: [{
          type: "move_artifact_view",
          viewId: required(positional[1], "view id"),
          x: Number(required(option("x"), "--x")),
          y: Number(required(option("y"), "--y")),
        }],
      }),
    });
  } else if (group === "canvas" && action === "viewport") {
    const projectId = required(positional[0], "project id");
    const active = await coreRequest(activeContextPath(projectId));
    const zoom = Number(required(option("zoom"), "--zoom"));
    if (!Number.isFinite(zoom) || zoom < 0.05 || zoom > 8) throw new Error("--zoom must be between 0.05 and 8");
    result = await coreRequest(activeContextPath(projectId), {
      method: "PUT",
      ...jsonBody(activeContextMutation(active, {
        viewport: {
          x: Number(required(option("x"), "--x")),
          y: Number(required(option("y"), "--y")),
          zoom,
        },
        visibleViewIds: (option("visible") || "").split(",").filter(Boolean),
      })),
    });
  } else if (group === "canvas" && action === "observe") {
    const projectId = required(positional[0], "project id");
    const query = new URLSearchParams();
    if (option("workspace")) query.set("workspaceId", option("workspace"));
    result = await coreRequest(`/projects/${encodeURIComponent(projectId)}/canvas-observation${query.size ? `?${query}` : ""}`);
  } else if (group === "relation" && action === "create") {
    const projectId = required(positional[0], "project id");
    const sourceViewId = required(positional[1], "source view id");
    const targetViewId = required(positional[2], "target view id");
    if (sourceViewId === targetViewId) throw new Error("source and target views must be different");
    const graph = await coreRequest(`/projects/${encodeURIComponent(projectId)}/graph`);
    const source = graph.artifactViews?.find((view) => String(view.id) === sourceViewId);
    const target = graph.artifactViews?.find((view) => String(view.id) === targetViewId);
    if (!source || !target) throw new Error("source or target view was not found in this project");
    const relationId = `rel-${randomUUID()}`;
    const now = new Date().toISOString();
    result = await coreRequest(`/projects/${encodeURIComponent(projectId)}/relations/${encodeURIComponent(relationId)}`, {
      method: "PUT",
      ...jsonBody({
        id: relationId,
        projectId,
        sourceEntityType: "artifact",
        sourceEntityId: String(source.artifactId),
        targetEntityType: "artifact",
        targetEntityId: String(target.artifactId),
        kind: required(option("kind"), "--kind"),
        createdAt: now,
        updatedAt: now,
      }),
    });
  } else if (group === "preview" && action === "open") {
    const projectId = required(positional[0], "project id");
    const viewId = required(positional[1], "view id");
    const graph = await coreRequest(`/projects/${encodeURIComponent(projectId)}/graph`);
    const view = graph.artifactViews?.find((item) => String(item.id) === viewId);
    if (!view?.revisionId) throw new Error("view or revision not found");
    const active = await coreRequest(activeContextPath(projectId));
    await coreRequest(activeContextPath(projectId), {
      method: "PUT",
      ...jsonBody(activeContextMutation(active, { selectedViewIds: [viewId] })),
    });
    let records = await coreRequest(`/projects/${encodeURIComponent(projectId)}/preview-records`);
    let record = records.find((item) => String(item.revisionId) === String(view.revisionId) && item.previewProfile === "thumbnail");
    if ((!record || record.status !== "ready") && rest.includes("--generate")) {
      await coreRequest(`/projects/${encodeURIComponent(projectId)}/previews`, {
        method: "POST",
        ...jsonBody({ revisionId: String(view.revisionId), previewProfile: "thumbnail" }),
        timeoutMs: 120_000,
      });
      records = await coreRequest(`/projects/${encodeURIComponent(projectId)}/preview-records`);
      record = records.find((item) => String(item.revisionId) === String(view.revisionId) && item.previewProfile === "thumbnail");
    }
    result = {
      viewId,
      revisionId: String(view.revisionId),
      record: record ?? null,
      browserUrl: `http://127.0.0.1:5173/?agent=1&project=${encodeURIComponent(projectId)}&focus=${encodeURIComponent(viewId)}`,
    };
  } else if (group === "context" && action === "watch") {
    const projectId = required(positional[0], "project id");
    result = await coreRequest(activeContextPath(projectId, Number(option("after") || 0)));
  } else if (group === "context" && action === "propose") {
    const projectId = required(positional[0], "project id");
    const active = await coreRequest(activeContextPath(projectId));
    result = await coreRequest(contextProposalsPath(projectId), {
      method: "POST",
      ...jsonBody({
        ...(option("workspace") ? { workspaceId: option("workspace") } : {}),
        baseContextVersion: active.version,
        addViewIds: (option("add") || "").split(",").filter(Boolean),
        removeViewIds: (option("remove") || "").split(",").filter(Boolean),
        ...(option("target") ? { targetViewId: option("target") } : {}),
        reason: required(option("reason"), "--reason"),
      }),
    });
  } else if (group === "context" && action === "accept") {
    const projectId = required(positional[0], "project id");
    const proposalId = required(positional[1], "proposal id");
    result = await coreRequest(`/projects/${encodeURIComponent(projectId)}/context-proposals/${encodeURIComponent(proposalId)}/accept`, { method: "POST", ...jsonBody({}) });
  } else if (group === "context" && action === "reject") {
    const projectId = required(positional[0], "project id");
    const proposalId = required(positional[1], "proposal id");
    result = await coreRequest(`/projects/${encodeURIComponent(projectId)}/context-proposals/${encodeURIComponent(proposalId)}/reject`, { method: "POST", ...jsonBody({}) });
  } else if (group === "context" && action === "snapshot-list") {
    const projectId = required(positional[0], "project id");
    const query = new URLSearchParams();
    if (option("workspace")) query.set("workspaceId", option("workspace"));
    result = await coreRequest(`/projects/${encodeURIComponent(projectId)}/context-snapshots${query.size ? `?${query}` : ""}`);
  } else if (group === "context" && action === "snapshot-create") {
    const projectId = required(positional[0], "project id");
    result = await coreRequest(`/projects/${encodeURIComponent(projectId)}/context-snapshots`, {
      method: "POST",
      ...jsonBody({ label: required(option("label"), "--label"), ...(option("workspace") ? { workspaceId: option("workspace") } : {}) }),
    });
  } else if (group === "context" && action === "snapshot-compare") {
    const projectId = required(positional[0], "project id");
    const snapshotId = required(positional[1], "snapshot id");
    const otherSnapshotId = required(positional[2], "other snapshot id");
    result = await coreRequest(`/projects/${encodeURIComponent(projectId)}/context-snapshots/${encodeURIComponent(snapshotId)}/compare`, {
      method: "POST", ...jsonBody({ otherSnapshotId }),
    });
  } else if (group === "context" && action === "snapshot-branch") {
    const projectId = required(positional[0], "project id");
    const snapshotId = required(positional[1], "snapshot id");
    result = await coreRequest(`/projects/${encodeURIComponent(projectId)}/context-snapshots/${encodeURIComponent(snapshotId)}/branch`, {
      method: "POST",
      ...jsonBody({ label: required(option("label"), "--label"), ...(option("scope") ? { targetScopeId: option("scope") } : {}) }),
    });
  } else if (group === "context" && action === "proposals") {
    result = await coreRequest(contextProposalsPath(required(positional[0], "project id")));
  } else if (group === "run" && action === "input") {
    result = await coreRequest(`/runs/${encodeURIComponent(required(positional[0], "run id"))}/input-request`);
  } else if (group === "run" && action === "answer") {
    const runId = required(positional[0], "run id");
    result = await coreRequest(`/runs/${encodeURIComponent(runId)}/input-request`, {
      method: "POST",
      ...jsonBody({
        requestId: required(option("request"), "--request"),
        ...(option("text") ? { text: option("text") } : {}),
        selectedOptions: (option("select") || "").split(",").filter(Boolean),
      }),
    });
  } else if (group === "run" && action === "cancel") {
    result = await coreRequest(`/runs/${encodeURIComponent(required(positional[0], "run id"))}/cancel`, { method: "POST", ...jsonBody({}) });
  } else if (group === "run" && action === "events") {
    const runId = required(positional[0], "run id");
    const query = option("after") === undefined ? "" : `?after=${encodeURIComponent(option("after"))}`;
    result = await coreRequest(`/runs/${encodeURIComponent(runId)}/events${query}`);
  } else if (group === "run" && action === "accept") {
    const returnId = required(positional[0], "artifact return id");
    result = await coreRequest(`/artifact-returns/${encodeURIComponent(returnId)}/accept`, {
      method: "POST",
      ...jsonBody({ expectedBaseRevisionId: required(option("base-revision"), "--base-revision") }),
    });
  } else if (group === "run" && action === "reject") {
    result = await coreRequest(`/artifact-returns/${encodeURIComponent(required(positional[0], "artifact return id"))}/reject`, { method: "POST", ...jsonBody({}) });
  } else if (group === "run" && action === "retry") {
    result = await coreRequest(`/artifact-returns/${encodeURIComponent(required(positional[0], "artifact return id"))}/retry`, {
      method: "POST",
      ...jsonBody(option("instruction") ? { instruction: option("instruction") } : {}),
    });
  } else if (group === "connector" && action === "list") {
    result = await coreRequest("/connectors");
  } else if (group === "conversation" && action === "import") {
    const projectId = required(positional[0], "project id");
    const filePath = required(positional[1], "conversation JSONL path");
    const scopeId = required(option("scope"), "--scope");
    const handle = await open(filePath, "r");
    try {
      const info = await handle.stat();
      const session = await coreRequest(`/projects/${encodeURIComponent(projectId)}/conversation-import-sessions`, {
        method: "POST",
        ...jsonBody({ sourceKind: option("source") || "codex", sourceFileName: basename(filePath), expectedBytes: info.size, scopeId, ...(option("workspace") ? { workspaceId: option("workspace") } : {}), ...(option("title") ? { title: option("title") } : {}) }),
      });
      const totalHash = createHash("sha256");
      const chunkSize = 4 * 1024 * 1024;
      let chunkIndex = 0;
      for (let offset = 0; offset < info.size; offset += chunkSize) {
        const buffer = Buffer.alloc(Math.min(chunkSize, info.size - offset));
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, offset);
        const bytes = buffer.subarray(0, bytesRead);
        totalHash.update(bytes);
        await coreRequest(`/projects/${encodeURIComponent(projectId)}/conversation-import-sessions/${encodeURIComponent(session.id)}/chunks/${chunkIndex}`, {
          method: "PUT",
          body: bytes,
          headers: { "content-type": "application/octet-stream", "x-content-sha256": createHash("sha256").update(bytes).digest("hex") },
          timeoutMs: 120_000,
        });
        chunkIndex += 1;
      }
      result = await coreRequest(`/projects/${encodeURIComponent(projectId)}/conversation-import-sessions/${encodeURIComponent(session.id)}/complete`, {
        method: "POST", ...jsonBody({ expectedChunks: chunkIndex, expectedContentHash: totalHash.digest("hex") }), timeoutMs: 600_000,
      });
    } finally { await handle.close(); }
  } else if (group === "conversation" && action === "import-manual") {
    const projectId = required(positional[0], "project id");
    const source = JSON.parse(await readFile(required(positional[1], "manual timeline JSON path"), "utf8"));
    result = await coreRequest(`/projects/${encodeURIComponent(projectId)}/conversations/import-manual`, { method: "POST", ...jsonBody({ title: option("title"), scopeId: required(option("scope"), "--scope"), ...(option("workspace") ? { workspaceId: option("workspace") } : {}), entries: Array.isArray(source) ? source : source.entries }), timeoutMs: 600_000 });
  } else if (group === "conversation" && action === "list") {
    result = await coreRequest(`/projects/${encodeURIComponent(required(positional[0], "project id"))}/conversations`);
  } else if (group === "conversation" && action === "show") {
    result = await coreRequest(`/projects/${encodeURIComponent(required(positional[0], "project id"))}/conversations/${encodeURIComponent(required(positional[1], "conversation id"))}`);
  } else if (group === "conversation" && action === "messages") {
    const query = new URLSearchParams(); if (option("offset")) query.set("offset", option("offset")); if (option("limit")) query.set("limit", option("limit")); if (rest.includes("--pinned")) query.set("pinnedOnly", "true");
    result = await coreRequest(`/projects/${encodeURIComponent(required(positional[0], "project id"))}/conversations/${encodeURIComponent(required(positional[1], "conversation id"))}/messages?${query}`);
  } else if (group === "conversation" && action === "search") {
    const query = new URLSearchParams({ q: required(option("q"), "--q") }); if (rest.includes("--lexical-only")) query.set("semantic", "false"); if (option("limit")) query.set("limit", option("limit"));
    result = await coreRequest(`/projects/${encodeURIComponent(required(positional[0], "project id"))}/conversations/search?${query}`, { timeoutMs: 120_000 });
  } else if (group === "conversation" && action === "export") {
    const projectId = required(positional[0], "project id");
    const conversationId = required(positional[1], "conversation id");
    const exported = await coreRequest(`/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(conversationId)}/export?includeMessages=${rest.includes("--without-messages") ? "false" : "true"}`, { timeoutMs: 120_000 });
    const outputPath = required(option("output"), "--output");
    await writeFile(outputPath, `${JSON.stringify(exported, null, 2)}
`, "utf8");
    result = { ok: true, outputPath, conversationId, rawTimelineIncluded: !rest.includes("--without-messages") };
  } else if (group === "conversation" && action === "sections") {
    const projectId = required(positional[0], "project id");
    const conversationId = required(positional[1], "conversation id");
    result = await coreRequest(`/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(conversationId)}/sections${rest.includes("--refresh") ? "/refresh" : ""}`, rest.includes("--refresh") ? { method: "POST" } : {});
  } else if (group === "conversation" && action === "section-rename") {
    result = await coreRequest(`/projects/${encodeURIComponent(required(positional[0], "project id"))}/conversations/${encodeURIComponent(required(positional[1], "conversation id"))}/sections/${encodeURIComponent(required(positional[2], "section id"))}`, { method: "PATCH", ...jsonBody({ title: required(option("title"), "--title"), lockedByUser: true }) });
  } else if (group === "conversation" && action === "annotate") {
    const projectId = required(positional[0], "project id");
    const conversationId = required(positional[1], "conversation id");
    const sectionId = required(positional[2], "section id");
    let annotation;
    if (option("data")) annotation = JSON.parse(await readFile(option("data"), "utf8"));
    else annotation = {
      sourceHash: required(option("source-hash"), "--source-hash"),
      title: required(option("title"), "--title"),
      decisions: (option("decisions") || "").split("|").map((value) => value.trim()).filter(Boolean),
      todos: (option("todos") || "").split("|").map((value) => value.trim()).filter(Boolean),
      involvedFiles: (option("files") || "").split("|").map((value) => value.trim()).filter(Boolean),
      annotatedBy: "agent",
    };
    result = await coreRequest(`/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(conversationId)}/sections/${encodeURIComponent(sectionId)}/annotation`, { method: "POST", ...jsonBody(annotation) });
  } else if (group === "conversation" && action === "section-source") {
    result = await coreRequest(`/projects/${encodeURIComponent(required(positional[0], "project id"))}/conversations/${encodeURIComponent(required(positional[1], "conversation id"))}/sections/${encodeURIComponent(required(positional[2], "section id"))}/source`);
  } else if (group === "conversation" && action === "pin") {
    result = await coreRequest(`/projects/${encodeURIComponent(required(positional[0], "project id"))}/conversations/${encodeURIComponent(required(positional[1], "conversation id"))}/messages/${encodeURIComponent(required(positional[2], "message id"))}/pin`, { method: "POST", ...jsonBody({ scopeId: required(option("scope"), "--scope"), ...(option("workspace") ? { workspaceId: option("workspace") } : {}), ...(option("title") ? { title: option("title") } : {}), ...(option("summary") ? { summary: option("summary") } : {}), ...(option("x") ? { x: Number(option("x")) } : {}), ...(option("y") ? { y: Number(option("y")) } : {}) }) });
  } else if (group === "conversation" && action === "index-status") {
    result = await coreRequest(`/projects/${encodeURIComponent(required(positional[0], "project id"))}/conversations/semantic-index`);
  } else if (group === "conversation" && action === "index-build") {
    result = await coreRequest(`/projects/${encodeURIComponent(required(positional[0], "project id"))}/conversations/semantic-index`, { method: "POST", ...jsonBody({ ...(option("model") ? { model: option("model") } : {}), ...(option("session") ? { sessionId: option("session") } : {}), force: rest.includes("--force"), ...(option("batch") ? { batchSize: Number(option("batch")) } : {}) }), timeoutMs: 1800_000 });
  } else if (group === "connector" && action === "obsidian-scan") {
    result = await coreRequest("/connectors/obsidian/select-and-scan", { method: "POST", ...jsonBody({}), timeoutMs: 120_000 });
  } else if (group === "connector" && action === "obsidian-import") {
    const projectId = required(positional[0], "project id");
    const scanId = required(option("scan"), "--scan");
    const scopeId = required(option("scope"), "--scope");
    let relativePaths = [];
    if (option("paths-file")) {
      const parsed = JSON.parse(await readFile(option("paths-file"), "utf8"));
      relativePaths = Array.isArray(parsed) ? parsed : parsed.relativePaths;
    } else if (option("paths")) {
      relativePaths = option("paths").split(",").map((value) => value.trim()).filter(Boolean);
    }
    if (!Array.isArray(relativePaths) || relativePaths.length === 0) throw new Error("--paths or --paths-file must provide at least one note path");
    result = await coreRequest(`/projects/${encodeURIComponent(projectId)}/connectors/obsidian/import`, {
      method: "POST",
      ...jsonBody({
        scanId,
        relativePaths,
        scopeId,
        position: { x: Number(option("x") || 180), y: Number(option("y") || 160) },
      }),
      timeoutMs: 180_000,
    });
  } else if (group === "resource" && action === "list") {
    result = await coreRequest(`/projects/${encodeURIComponent(required(positional[0], "project id"))}/resources`);
  } else if (group === "resource" && action === "show") {
    result = await coreRequest(`/projects/${encodeURIComponent(required(positional[0], "project id"))}/resources/${encodeURIComponent(required(positional[1], "resource id"))}`);
  } else if (group === "resource" && action === "read") {
    const projectId = required(positional[0], "project id");
    const resourceId = required(positional[1], "resource id");
    const query = new URLSearchParams();
    if (option("path")) query.set("path", option("path"));
    if (option("offset")) query.set("offset", option("offset"));
    if (option("limit")) query.set("limit", option("limit"));
    if (option("format")) query.set("format", option("format"));
    const suffix = query.size === 0 ? "" : `?${query.toString()}`;
    result = await coreRequest(`/projects/${encodeURIComponent(projectId)}/resources/${encodeURIComponent(resourceId)}/content${suffix}`);
  } else if (group === "resource" && action === "reanalyze") {
    result = await coreRequest(`/projects/${encodeURIComponent(required(positional[0], "project id"))}/resources/${encodeURIComponent(required(positional[1], "resource id"))}/reanalyze`, { method: "POST" });
  } else if (group === "resource" && action === "match") {
    const projectId = required(positional[0], "project id");
    const instruction = required(option("instruction"), "--instruction");
    result = await coreRequest(`/projects/${encodeURIComponent(projectId)}/resources/match`, {
      method: "POST",
      ...jsonBody({
        instruction,
        ...(option("output") ? { outputIntent: option("output") } : {}),
        ...(option("limit") ? { limit: Number(option("limit")) } : {}),
      }),
    });
  } else if (group === "resource" && action === "import") {
    const projectId = required(positional[0], "project id");
    const source = required(positional[1], "path or url");
    const graph = await coreRequest(`/projects/${encodeURIComponent(projectId)}/graph`);
    const scopes = graph?.scopes || [];
    const scopeId = scopes.find((scope) => scope.kind === "root")?.id || scopes[0]?.id || "";
    const importRequestId = `cli-${Date.now().toString(36)}`;
    const fallbackName = source.split(/[\\/]/).filter(Boolean).pop() || "resource";
    if (/^https?:\/\//i.test(source)) {
      result = await coreRequest(`/projects/${encodeURIComponent(projectId)}/resources/import-url`, {
        method: "POST",
        ...jsonBody({
          url: source,
          scopeId,
          ...(option("name") ? { title: option("name") } : {}),
        }),
      });
    } else if (/\.zip$/i.test(source)) {
      const bytes = await readFile(source);
      const form = new FormData();
      form.set("file", new Blob([bytes]), basename(source));
      form.set("importRequestId", importRequestId);
      form.set("scopeId", scopeId);
      form.set("position.x", option("x") || "180");
      form.set("position.y", option("y") || "160");
      result = await coreRequest(`/projects/${encodeURIComponent(projectId)}/resources/import-archive`, {
        method: "POST",
        body: form,
      });
    } else if ((await lstat(source)).isFile()) {
      const bytes = await readFile(source);
      const form = new FormData();
      form.set("file", new Blob([bytes]), basename(source));
      form.set("importRequestId", importRequestId);
      form.set("scopeId", scopeId);
      form.set("position.x", option("x") || "180");
      form.set("position.y", option("y") || "160");
      result = await coreRequest(`/projects/${encodeURIComponent(projectId)}/imports`, { method: "POST", body: form, timeoutMs: 60_000 });
    } else {
      const files = await collectDirectory(source);
      const session = await coreRequest(`/projects/${encodeURIComponent(projectId)}/resource-upload-sessions`, {
        method: "POST",
        ...jsonBody({
          importRequestId,
          rootName: option("name") || fallbackName,
          scopeId,
          x: Number(option("x") || 180),
          y: Number(option("y") || 160),
        }),
      });
      for (const file of files) {
        await coreRequest(`/projects/${encodeURIComponent(projectId)}/resource-upload-sessions/${encodeURIComponent(session.sessionId)}/files?path=${encodeURIComponent(file.path)}`, {
          method: "PUT", headers: { "content-type": "application/octet-stream" }, body: await readFile(file.filePath), timeoutMs: 60_000,
        });
      }
      result = await coreRequest(`/projects/${encodeURIComponent(projectId)}/resource-upload-sessions/${encodeURIComponent(session.sessionId)}/complete`, { method: "POST" });
    }
  } else if (group === "task" && action === "show") {
    result = await coreRequest(`/executor/tasks/${encodeURIComponent(required(positional[0], "task id"))}`);
  } else if (group === "open") {
    const projectId = action;
    result = { url: `http://127.0.0.1:5173/?agent=1${projectId ? `&project=${encodeURIComponent(projectId)}` : ""}` };
  } else if (group === "search") {
    const { runSearchCommand } = await import("./commands/search.mjs");
    result = await runSearchCommand({ action, rest, coreRequest });
  } else if (group === "retrieval" && action === "spatial") {
    const projectId = required(positional[0], "project id");
    const seeds = option("seeds") ?? "";
    if (!seeds) throw new Error("retrieval spatial 需要 --seeds viewId1,viewId2");
    const body = { seedViewIds: seeds.split(",").map((item) => item.trim()).filter(Boolean) };
    const limit = option("limit");
    if (limit !== undefined) body.limit = Number(limit);
    result = await coreRequest(`/projects/${encodeURIComponent(projectId)}/retrieval/spatial`, { method: "POST", body: JSON.stringify(body) });
  } else if (group === "affinity" && action === "resolve") {
    const body = { capturedAt: new Date().toISOString() };
    if (option("explicit")) body.explicitProjectId = option("explicit");
    if (option("session")) body.sessionId = option("session");
    if (option("path")) body.localPath = option("path");
    if (option("tab")) {
      const [profileId, tabId] = option("tab").split(":");
      if (!profileId || !tabId) throw new Error("--tab must be profileId:tabId");
      body.browser = { profileId, tabId: Number(tabId) };
    }
    result = await coreRequest("/runtime/affinity/resolve", { method: "POST", body: JSON.stringify(body) });
  } else if (group === "capture" && action === "pending") {
    const recent = option("recent") ?? "30m";
    const ms = recent.endsWith("m") ? Number(recent.slice(0, -1)) * 60_000 : Number(recent);
    result = await coreRequest(`/runtime/captures/staging?recent=${Number.isFinite(ms) && ms > 0 ? ms : 1_800_000}`);
  } else if (group === "capture" && action === "resolve") {
    const id = required(positional[0], "capture id");
    const projectId = required(option("project"), "--project");
    result = await coreRequest(`/runtime/captures/${encodeURIComponent(id)}/resolve`, { method: "POST", body: JSON.stringify({ projectId }) });
  } else if (group === "capture" && action === "send") {
    const kind = option("kind") ?? (option("url") ? "web_page" : option("text") ? "clipboard_text" : option("file") ? "local_file" : undefined);
    if (!kind) throw new Error("capture send 需要 --url / --text / --file 之一");
    const payload = option("url") ? { type: "url", url: required(option("url"), "--url") }
      : option("text") ? { type: "text", text: required(option("text"), "--text") }
      : { type: "local_path", path: required(option("file"), "--file") };
    const body = {
      schemaVersion: 0,
      operationId: `cli-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      kind,
      source: {
        app: "lcos-cli",
        capturedAt: new Date().toISOString(),
        ...(option("session") ? { sessionId: option("session") } : {}),
      },
      payload,
      ...(option("title") ? { hints: { title: option("title") } } : {}),
      ...(option("project") ? { targetHint: { projectId: option("project") } } : {}),
    };
    result = await coreRequest("/capture", { method: "POST", body: JSON.stringify(body) });
  } else if (group === "runtime" && action === "extension-token") {
    result = await coreRequest("/runtime/extension-token", { method: "POST", body: "{}" });
  } else if (group === "skill") {
    const { runSkillCommand } = await import("./commands/skill.mjs");
    result = await runSkillCommand({ action, rest });
  } else if (group === "local-ai") {
    if (action === "status") {
      result = await coreRequest("/runtime/local-intelligence");
    } else if (action === "models") {
      const status = await coreRequest("/runtime/local-intelligence");
      result = { available: status.available, embeddingModels: status.embeddingModels ?? [], generativeModels: status.generativeModels ?? [] };
    } else if (action === "embed-smoke") {
      const model = option("model") ?? "nomic-embed-text";
      const ollama = await fetch(`http://127.0.0.1:11434/api/embed`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model, input: ["LCOS semantic smoke"], truncate: true, keep_alive: "1m" }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!ollama.ok) throw new Error(`Ollama embed failed: ${ollama.status}`);
      const body = await ollama.json();
      result = { model, dimensions: body.embeddings?.[0]?.length ?? 0, ok: (body.embeddings?.length ?? 0) > 0 };
    } else {
      throw new Error("Usage: lcos local-ai status|models|embed-smoke [--model name]");
    }
  } else if (group === "session" && action === "bind") {
    const sessionId = required(positional[0], "session id");
    const projectId = required(option("project"), "--project");
    const body = { projectId, status: option("status") ?? "idle" };
    if (option("views")) body.selectedViewIds = option("views").split(",").filter(Boolean);
    if (option("refs")) body.retrievalEntityRefs = option("refs").split(",").filter(Boolean);
    result = await coreRequest(`/runtime/sessions/${encodeURIComponent(sessionId)}/bind`, { method: "POST", body: JSON.stringify(body) });
  } else if (group === "session" && action === "context") {
    const sessionId = required(positional[0], "session id");
    result = await coreRequest(`/runtime/sessions/${encodeURIComponent(sessionId)}/context`);
  } else if (group === "session" && action === "close") {
    const sessionId = required(positional[0], "session id");
    result = await coreRequest(`/runtime/sessions/${encodeURIComponent(sessionId)}/close`, { method: "POST", body: "{}" });
  } else if (group === "session" && action === "sources") {
    const sessionId = required(positional[0], "session id");
    const context = await coreRequest(`/runtime/sessions/${encodeURIComponent(sessionId)}/context`);
    result = { sources: context.sourceRefs ?? [] };
  } else if (group === "project" && action === "pin-capture") {
    const projectId = required(positional[0], "project id");
    result = await coreRequest("/runtime/registry/capture-target", { method: "POST", body: JSON.stringify({ projectId }) });
  } else if (group === "project" && action === "unpin-capture") {
    result = await coreRequest("/runtime/registry/capture-target", { method: "POST", body: JSON.stringify({ projectId: null }) });
  } else if (group === "project" && action === "reveal") {
    const projectId = required(positional[0], "project id");
    result = await coreRequest(`/projects/${encodeURIComponent(projectId)}/reveal`, { method: "POST", body: "{}" });
  } else if (group === "presentation" && action === "patch") {
    const { runPresentationCommand } = await import("./commands/presentation.mjs");
    result = await runPresentationCommand({ action, rest, coreRequest });
  } else if (group === "node" && (action === "create-text" || action === "update-text")) {
    const { runCurationWriteCommand } = await import("./commands/curation-command.mjs");
    result = await runCurationWriteCommand({ group, action, rest, coreRequest });
  } else if (group === "curation") {
    const { runCurationWriteCommand } = await import("./commands/curation-command.mjs");
    result = await runCurationWriteCommand({ group, action, rest, coreRequest });
  } else if (group === "node" || group === "selection" || group === "presentation") {
    const { runCurationCommand } = await import("./commands/curation-query.mjs");
    result = await runCurationCommand({ group, action, rest, coreRequest });
  } else {
    printHelp();
    process.exit(0);
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (exitCode !== 0) process.exitCode = exitCode;
} catch (error) {
  process.stderr.write(`lcos: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

async function probe(requestPromise) {
  try {
    const value = await requestPromise;
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function required(value, label) {
  if (!value) throw new Error(`${label} is required`);
  return value;
}

async function collectDirectory(root) {
  const files = [];
  const walk = async (directory) => {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (files.length >= 200) return;
      const full = join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      const info = await lstat(full);
      if (info.size > 10 * 1024 * 1024) continue;
      files.push({
        path: relative(root, full).split(sep).join("/"),
        filePath: full,
      });
    }
  };
  await walk(root);
  return files;
}

function printHelp() {
  process.stdout.write(`LCOS Agent CLI

Project truth:
  lcos doctor
  lcos capabilities
  lcos project list
  lcos project open <root-path> --name "Project" [--import-existing|--empty]
  lcos project create <parent-path> --name "Project" [--directory folder-name]
  lcos project show <project-id>
  lcos project inspect <root-path>
  lcos project current [project-id]
  lcos project export <project-id> --to <path.lcosproj>
  lcos project export-all --to <目录> [--ids id1,id2]
  lcos project open-file <path.lcosproj> [--root <项目根目录>]
  lcos project inspect-file <path.lcosproj>
  lcos workspace list <project-id>
  lcos workspace add <workspace-id> <view...> [--by user|agent|run|import]
  lcos workspace remove <workspace-id> <view-id>
  lcos workspace move <from-workspace-id> <view-id> --to <to-workspace-id>
  lcos workspace save-state <workspace-id> --name "现场名"
  lcos workspace restore-state <workspace-id> <state-id>
  lcos selection get <project-id>
  lcos context get <project-id> [--workspace id]
  lcos context watch <project-id> [--workspace id] [--after N]
  lcos context search <project-id> [--q 关键词]
  lcos context add <project-id> <view...>
  lcos context remove <project-id> <view...>
  lcos context propose <project-id> [--workspace id] --reason "..." [--add v1,v2] [--remove v3] [--target v4]
  lcos context accept <project-id> <proposal-id>
  lcos context reject <project-id> <proposal-id>
  lcos context proposals <project-id>
  lcos context snapshot-list <project-id> [--workspace id]
  lcos context snapshot-create <project-id> --label "..." [--workspace id]
  lcos context snapshot-compare <project-id> <snapshot-id> <other-snapshot-id>
  lcos context snapshot-branch <project-id> <snapshot-id> --label "..." [--scope scope-id]
  lcos target set <project-id> <artifact-id> [--revision id]
  lcos target clear <project-id>
  lcos artifact inspect <artifact-id>
  lcos revision list <artifact-id>
  lcos revision compare <project-id> <base-revision-id> <head-revision-id>
  lcos process projection <project-id>
  lcos provider-session get <project-id> [--provider codex|workbuddy]
  lcos provider-session set <project-id> --session <id> [--provider codex|workbuddy] [--origin manual|watchdog]
  lcos provider-session clear <project-id> [--provider codex|workbuddy]
  lcos session summarize <project-id> --summary "..." [--title 标题] [--runs a,b] [--handoff ref]
  lcos session list <project-id>
  lcos manifest build <project-id> [--target <artifact-id>] [--output <description>]
  lcos run list <project-id> [--limit 20]
  lcos run pending <project-id> [--limit 100]
  lcos run create <project-id> --instruction "..." [--target artifact-id] [--output create|revise|analyze] [--provider workbuddy|codex] [--dry-run]
  lcos run propose <project-id> --prompt "..." [--workspace id] [--new-node]
  lcos run validate-plan <project-id> <agent-plan.json>
  lcos run dispatch <run-id>
  lcos run recover <run-id>
  lcos run finalize <run-id> [--decision completed|retrying] [--comment "..."]
  lcos run show <run-id>
  lcos run sync <run-id>
  lcos run cancel <run-id>
  lcos run events <run-id> [--after N]
  lcos run context <run-id>
  lcos run input <run-id>
  lcos run answer <run-id> --request <id> [--text "..."] [--select A,B]
  lcos run accept <artifact-return-id> --base-revision <revision-id>
  lcos run reject <artifact-return-id>
  lcos run retry <artifact-return-id> [--instruction "..."]
  lcos context select <project-id> --views view-a,view-b [--workspace id]
  lcos context focus <project-id> <view-id> [--workspace id]
  lcos canvas move <project-id> <view-id> --x N --y N --base-version N
  lcos conversation import <project-id> <session.jsonl> --scope <scope-id> [--workspace id] [--title 标题] [--source codex]
  lcos conversation import-manual <project-id> <entries.json> --scope <scope-id> [--workspace id] [--title 标题]
  lcos conversation list <project-id>
  lcos conversation show <project-id> <conversation-id>
  lcos conversation messages <project-id> <conversation-id> [--offset N --limit N --pinned]
  lcos conversation search <project-id> --q "..." [--lexical-only --limit N]
  lcos conversation export <project-id> <conversation-id> --output <file.json> [--without-messages]
  lcos conversation sections <project-id> <conversation-id> [--refresh]
  lcos conversation section-rename <project-id> <conversation-id> <section-id> --title "新标题"
  lcos conversation section-source <project-id> <conversation-id> <section-id>
  lcos conversation annotate <project-id> <conversation-id> <section-id> (--data annotation.json | --source-hash <hash> --title "标题" [--decisions a|b --todos a|b --files a|b])
  lcos conversation pin <project-id> <conversation-id> <message-id> --scope <scope-id> [--title 标题]
  lcos conversation index-status <project-id>
  lcos conversation index-build <project-id> [--model nomic-embed-text --session id --force --batch 32]
  lcos connector obsidian-scan
  lcos connector obsidian-import <project-id> --scan <scan-id> --scope <scope-id> (--paths a.md,b.md | --paths-file paths.json) [--x N --y N]
  lcos resource list <project-id>
  lcos resource show <project-id> <resource-id>
  lcos resource read <project-id> <resource-id> [--path name] [--offset N] [--limit N] [--format text|raw|json_tree]
  lcos resource reanalyze <project-id> <resource-id>
  lcos resource import <project-id> <path-or-url> [--name rootName]
  lcos resource match <project-id> --instruction "..." [--output create|revise|analyze] [--limit 8]
  lcos open [project-id]
  lcos providers

Project continuity:
  lcos continuity resolve [--path <cwd>] [--file <active-file>] [--session <id>] [--project <id>]
  lcos continuity resume <project-id> [--workspace id] [--session id] [--action "..."] [--budget N]
  lcos continuity attach <project-id> [--workspace id] [--session id] [--provider codex|claude|deepseek] [--action "..."] [--budget N]
  lcos continuity bind <project-id> <session-id> [--workspace id] [--status idle|working|blocked|closed]
  lcos continuity return <project-id> --data <return.json>

Agent pull:
  lcos task show <task-id>
  （worker 接单/心跳/提交请走 lcos-executor MCP；Buddy 走 lcos-bridge task CLI）

Environment:
  LCOS_CORE_URL=http://127.0.0.1:43121
`);
}
