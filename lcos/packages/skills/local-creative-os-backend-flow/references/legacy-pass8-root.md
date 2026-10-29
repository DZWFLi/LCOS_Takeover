---
name: local-creative-os-backend-flow
description: Run Local Creative OS backend and Local Core work with clear ownership, green/yellow/red risk routing, token-efficient validation, small commits, and honest handoffs. Use for tasks in E:\Codex 项目\OS开发 involving apps/local-core, packages/domain, packages/contracts, Web-to-Local-Core development integration, backend tests, or backend handoff documents.
---

# Local Creative OS Backend Flow

Read repository `README.md`, `AGENTS.md`, the current approved handoff, and relevant code first. Repository rules and the user's current instruction outrank this skill.

## Ownership

- Codex owns `apps/local-core`, `packages/domain`, `packages/contracts`, backend tests and backend handoffs.
- Modify `apps/web` only when the current scope explicitly authorizes Web-to-Local-Core integration.
- Keep one owner per core file. Use subagents or Buddy for peripheral read-only review, research, or evidence; never let them concurrently edit the same core files.
- Web never writes arbitrary files. Local Core binds only `127.0.0.1`.
- Do not present Fixture, Mock, CopyOnly, Buddy Task, or Task ID as real Runtime or canonical Run truth.

## Three Zones

### Green — implement directly

Use for reversible work that does not change product semantics, formal data models, user files, or infrastructure. Examples: local fixes, tests, dev scripts, read-only clients, diagnostics, timeout/Abort, source badges, and runbooks.

### Yellow — write a short plan, then continue

Use for front/back contracts, API versioning, proxy/dev-stack choices, Fixture/Runtime coexistence, lightweight Contract extension, development dependencies, or test-report generation.

The plan contains only:

```text
Goal
Files
Before/after flow
Contract change
Tests
Risk
Rollback
```

Continue in the same task when no red condition appears.

### Red — stop before implementation

Generate an ADR or handoff and request approval for:

- SQLite, schema, migration, or formal localStorage migration;
- Watcher, import, Preview, `.creative-os`, or real user-file writes;
- Bridge, canonical RunId, waiting_input, SSE, retry lineage, or recovery;
- Workspace, Scope, Artifact, Revision, Current, Accept, or Checkpoint semantics;
- Fixture full replacement;
- non-loopback, arbitrary CORS, browser-triggered Shell, credentials, or external network;
- path containment, hash, write lease, overwrite, move, delete, or other data-safety rules.

Do not implement red work without explicit approval.

## Token-Efficient Validation

Batch 4–7 related slices before validation when practical.

```text
Continuous implementation
→ one focused typecheck/test pass
→ fix only failures
→ one root quality chain
→ one browser/runtime validation when relevant
→ one final audit
→ one small commit
```

- Do not run the root quality chain or browser loop after every file.
- During implementation, use static inspection; run a package check only when a type/runtime uncertainty would compound.
- After a failure, rerun only the failed check. Rerun the root chain only for cross-module fixes or final integration.
- Browser validation belongs at the completed visible batch or milestone, not every non-visual edit.
- Audit green work only at batch completion unless the user requests otherwise.

## Dev Launcher / Process Manager

For routine browser/runtime testing, prefer the repository launcher scripts instead of ad-hoc PowerShell, `Start-Process`, `taskkill`, or guessed URLs.

Use:

```text
npm run dev:open
npm run dev:status
npm run dev:stop
```

Expected behavior:

- `dev:open` checks the current worktree version, branch, commit, and clean/dirty state before launching.
- `dev:open` starts Local Core on `127.0.0.1:43121`, Web on `127.0.0.1:5173`, performs health checks, and opens an isolated LCOS app-mode browser window.
- Closing the app-mode browser window should stop the Web and Local Core processes started by that launcher run.
- `dev:status` reports version, branch, commit, working tree state, recorded PIDs, and port owners.
- `dev:stop` stops only LCOS processes recorded under the current worktree runtime state, including legacy dev-stack PIDs when present.

Safety rules:

- Do not kill all `node.exe` processes.
- Do not close arbitrary processes on ports `5173` or `43121`; if the owner is not a recorded LCOS dev process, report a port conflict and stop.
- Do not silently launch from a dirty worktree or unexpected target when the user is asking to test “the latest” build.
- Do not rely on `pagehide` / `beforeunload` as the only cleanup mechanism; the launcher/browser process lifecycle is the primary control.
- Keep runtime PID files, logs, and browser profiles under ignored local runtime directories such as `.codex-runtime/`.
- UI development diagnostics should display build identity (version / branch / commit) when available, but the browser must not execute shell or read Git directly.

## Delivery

- Preserve unrelated changes and stop on unknown worktree modifications.
- Do not upgrade dependencies or modify lockfiles beyond an approved, explainable minimum.
- Keep commits small, reversible, and scoped. Never auto-push.
- Report only:

```text
Completed
Changed files
Tests
Browser/runtime-visible change
Unresolved
Red condition
Next slice
```

- Be explicit about completed, Fixture, Mock, placeholder, unverified, and blocked states.
