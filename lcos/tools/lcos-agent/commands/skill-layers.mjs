/**
 * Skill 分层加载（任务四 P2，借鉴 huabu prompt/skills/loader.ts MIT）。
 *
 * 两层来源：
 *   - system：`packages/skills/<id>/`（仓库内置，canonical）
 *   - user：`<projectRoot>/.creative-os/skills/<id>/SKILL.md`（项目自有，
 *     用户/agent 可改，运行时可变）
 *
 * 同 id 两层都有 → merged：system SKILL.md 原文 + `## User extensions`
 * 分隔 + user 正文（system frontmatter 是 canonical 身份，原样保留；
 * user frontmatter 是元数据不进正文）。user 独有 id → user 层原样透出。
 *
 * 纪律（huabu 同构）：
 *   - 坏 user skill 只 warn + skip，绝不 brick 加载器；
 *   - `skills/<id>/<subpath>` 读取必须落在 skill 目录内，`..`/反斜杠/盘符
 *     逃逸一律 SkillPathEscapeError（目录沙箱）。
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve, sep } from "node:path";

/** merged 视图的分隔头（huabu USER_EXTENSION_HEADER 同构常量）。 */
export const USER_EXTENSION_HEADER = "\n\n---\n\n## User extensions\n\n";

export class SkillPathEscapeError extends Error {
  constructor(ref) {
    super(`Skill path "${ref}" escapes the skill directory.`);
    this.name = "SkillPathEscapeError";
  }
}

/** 项目根 → user 层根（huabu userSkillsDir 的 LCOS 化：.creative-os/ 是项目自有目录）。 */
export function userSkillsRootFor(projectRoot) {
  return join(projectRoot, ".creative-os", "skills");
}

/** 极简 frontmatter 解析：--- 块内 `key: value` 行；块外是 body。 */
export function parseFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (match === null) return { meta: {}, body: text, hasFrontmatter: false };
  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (kv !== null) meta[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, "");
  }
  return { meta, body: text.slice(match[0].length).replace(/^\r?\n/, ""), hasFrontmatter: true };
}

function scanLayerIds(root) {
  if (!existsSync(root)) return [];
  const ids = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    if (!existsSync(join(root, entry.name, "SKILL.md"))) continue;
    ids.push(entry.name);
  }
  return ids;
}

/** 坏 user skill（缺 frontmatter 或缺 name/description）warn + skip，绝不 brick。 */
function validUserSkillIds(userRoot, warn) {
  const out = [];
  for (const id of scanLayerIds(userRoot)) {
    const parsed = parseFrontmatter(readFileSync(join(userRoot, id, "SKILL.md"), "utf8"));
    if (!parsed.hasFrontmatter || !parsed.meta.name || !parsed.meta.description) {
      warn(`[skill-layers] skipping invalid user skill (frontmatter needs name + description): ${id}`);
      continue;
    }
    out.push(id);
  }
  return out;
}

/**
 * 列出分层视图：`[{id, source: 'system' | 'user' | 'merged'}]`（按 id 排序）。
 * userRoot 缺省 → 仅 system 层（向后兼容）。
 */
export function listLayeredSkills({ systemRoot, userRoot }) {
  const sourceById = new Map();
  for (const id of scanLayerIds(systemRoot)) sourceById.set(id, "system");
  if (userRoot !== undefined) {
    for (const id of validUserSkillIds(userRoot, (message) => process.stderr.write(`${message}\n`))) {
      sourceById.set(id, sourceById.has(id) ? "merged" : "user");
    }
  }
  return [...sourceById.entries()]
    .map(([id, source]) => ({ id, source }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

/**
 * 解析读取引用：`<id>`（= SKILL.md）/ `<id>/<sub>` / `skills/<id>/<sub>`。
 * 段级沙箱：`.` / `..` / 反斜杠 / 盘符段直接判逃逸。
 */
function parseRef(ref) {
  if (typeof ref !== "string" || ref.length === 0) return null;
  const normalized = ref.replace(/^[\\/]+/, "");
  const withoutPrefix = normalized.startsWith("skills/") ? normalized.slice("skills/".length) : normalized;
  const segments = withoutPrefix.split("/").filter(Boolean);
  if (segments.length === 0) return null;
  for (const segment of segments) {
    if (segment === "." || segment === ".." || segment.includes("\\") || /^[a-zA-Z]:$/.test(segment)) {
      throw new SkillPathEscapeError(ref);
    }
  }
  const id = segments[0];
  const sub = segments.length === 1 ? "SKILL.md" : segments.slice(1).join("/");
  return { id, sub };
}

/** 解析到 root 内的绝对路径；前缀不达标即逃逸（第二层沙箱）。 */
function safeResolveWithin(root, sub) {
  const target = resolve(root, sub);
  if (target !== root && !target.startsWith(root + sep)) throw new SkillPathEscapeError(sub);
  return target;
}

/**
 * 沙箱读取：
 *   - SKILL.md → 分层合并视图（merged / system / user）
 *   - 其他 subpath → user 层优先、system 兜底（references 可被 user 层影子化）
 * 未命中返回 null；逃逸抛 SkillPathEscapeError。
 */
export function readLayeredSkillFile({ ref, systemRoot, userRoot }) {
  const parsed = parseRef(ref);
  if (parsed === null) return null;
  const { id, sub } = parsed;
  const systemDir = join(systemRoot, id);
  const userDir = userRoot === undefined ? undefined : join(userRoot, id);
  const hasSystem = existsSync(join(systemDir, "SKILL.md"));
  const hasUser = userDir !== undefined && existsSync(join(userDir, "SKILL.md"));

  if (sub === "SKILL.md") {
    if (hasSystem && hasUser) {
      const systemRaw = readFileSync(join(systemDir, "SKILL.md"), "utf8");
      const userBody = parseFrontmatter(readFileSync(join(userDir, "SKILL.md"), "utf8")).body;
      return { skill: id, source: "merged", ref, content: `${systemRaw.trimEnd()}${USER_EXTENSION_HEADER}${userBody.trim()}\n` };
    }
    if (hasSystem) return { skill: id, source: "system", ref, content: readFileSync(join(systemDir, "SKILL.md"), "utf8") };
    if (hasUser) return { skill: id, source: "user", ref, content: readFileSync(join(userDir, "SKILL.md"), "utf8") };
    return null;
  }

  const candidates = [];
  if (hasUser) candidates.push({ dir: userDir, source: hasSystem ? "merged-user" : "user" });
  if (hasSystem) candidates.push({ dir: systemDir, source: "system" });
  if (candidates.length === 0) return null;
  for (const candidate of candidates) {
    const abs = safeResolveWithin(candidate.dir, sub);
    if (!existsSync(abs)) continue;
    return { skill: id, source: candidate.source, ref, content: readFileSync(abs, "utf8") };
  }
  return null;
}
