import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webRoot = path.join(repoRoot, "reference", "tapnow-installed", "resources", "web");
const outputPath = path.join(repoRoot, "evidence", "tool-islands.json");
const appRoot = "usercontent-proxy/apps/";
const notes = {};
const add = (file, value) => { notes[appRoot + file] = value; };

notes["index.html"] = {
  family: "桌面前端入口", behavior: "unknown", hostRequired: true,
  inputs: ["账户会话、项目与服务端数据；离线时只有登录页"],
  outputs: ["渲染完整桌面前端"],
  external: [
    "离线实测：/api/bff/platform/config 与 /api/tracking-attribution/v1/attribution-sessions 在本地宿主 404。",
    "client-edge.tapnow.media/v1/initialize、/v1/rgstr（Statsig）与 files.tapnow.media/files/check 被 CSP 拦截；Sentry envelope 也被拦。见 docs/首轮离线验证_20261013.md。"
  ],
  reason: "这是桌面壳，不是可复用工具；JS/CSS 走本地 assets 依赖闭包。"
};
notes["official-homepage.html"] = {
  family: "官网静态页面", behavior: "pure-display", hostRequired: false,
  inputs: [], outputs: ["静态页面与备案链接"],
  external: ["页面含 beian.miit.gov.cn 链接；未发现生成 API。"],
  reason: "展示页，不是工具入口。"
};
notes["usercontent-proxy/widget-proxy.html"] = {
  family: "宿主 widget 代理壳", behavior: "pure-display", hostRequired: true,
  inputs: ["宿主注入的 widget HTML/参数"],
  outputs: ["隔离 iframe 与 host postMessage 转发"],
  external: ["CSP/source allowlist: https://app.tapnow.ai, https://app.tapnow.media, https://app.tapnow.zone, https://app.tapnow.plus, https://app.tapnow.tv, https://preview.tapnow.ai, https://preview.tapnow.media, https://preview.tapnow.top, https://tamaredge.top；这是代理来源 allowlist，不是 API 端点。"],
  reason: "代理与隔离层，不是可复用工具。"
};
notes["usercontent-proxy/mcp-app-proxy.html"] = {
  family: "MCP App 代理壳", behavior: "pure-display", hostRequired: true,
  inputs: ["MCP App HTML、tool-result、hostContext"],
  outputs: ["JSON-RPC 消息转发与 SDK 握手"],
  external: ["CSP/source allowlist: https://app.tapnow.ai, https://app.tapnow.media, https://app.tapnow.zone, https://app.tapnow.plus, https://app.tapnow.tv, https://preview.tapnow.ai, https://preview.tapnow.media, https://preview.tapnow.top, https://tamaredge.top；这是代理来源 allowlist，不是 API 端点。"],
  reason: "适合复用的是 MCP Apps 桥接协议，不是它承载的 app 业务。"
};
notes["usercontent-proxy/artifact-proxy.html"] = {
  family: "Artifact 代理壳", behavior: "pure-display", hostRequired: true,
  inputs: ["宿主传入 artifact 内容与来源"],
  outputs: ["隔离 artifact 展示"],
  external: ["CSP/source allowlist: https://app.tapnow.ai, https://app.tapnow.media, https://app.tapnow.zone, https://app.tapnow.plus, https://app.tapnow.tv, https://preview.tapnow.ai, https://preview.tapnow.media, https://preview.tapnow.top, https://tamaredge.top；这是代理来源 allowlist，不是 API 端点。"],
  reason: "文档/产物渲染容器，不是工具业务入口。"
};

add("actor-emotion@v1.63ee986b.html", {
  family: "MCP App / Actor Emotion Director", behavior: "local-js-editing", hostRequired: true,
  inputs: ["tool-result.structuredContent 中 actor/表情指南与预览资源；业务 schema 未完整还原"],
  outputs: ["tapnow/setWidgetState", "actor_emotion_save_expression_guide server tool"],
  external: ["Three.js 可按输入 URL 加载模型/图片；保存由宿主 server tool 执行；未见固定 REST/model endpoint。"],
  reason: "内嵌 Three.js 渲染/编辑在浏览器执行，保存走宿主 server tool；业务 fixture 尚未还原。"
});
add("ad-review@v1.e990e21f.html", {
  family: "MCP App / Ad Review", behavior: "local-js-editing", hostRequired: true,
  inputs: ["tool-result.structuredContent.stage", "items[]：combo、preview_url/poster_url 等媒体预览"],
  outputs: ["tapnow/setWidgetState.state { marks, notes }", "ui/message 提交审阅摘要"],
  external: ["媒体从输入 preview_url/poster_url 加载；ui/message 由宿主对话处理；未发现固定 HTTP API。"],
  reason: "标记和备注在前端完成；需要媒体与可选对话接缝。"
});
add("animatic@v1.7f4d2fcb.html", {
  family: "MCP App / Animatic v1", behavior: "local-js-editing", hostRequired: true,
  inputs: ["tool-result.structuredContent 中 sheets、shots、image_url/texture_id"],
  outputs: ["tapnow/setWidgetState.state { selected_shot_code, view, playing }"],
  external: ["按输入 image_url 加载预览；没有发现 app 自己的固定 API/model endpoint。"],
  reason: "可做镜头浏览与状态编辑；最终资源由宿主提供。"
});
add("animatic@v2.bc00a3a5.html", {
  family: "MCP App / Animatic v2", behavior: "cloud-generation", hostRequired: true,
  inputs: ["tool-result.structuredContent 中 sheets、shots 与预览素材"],
  outputs: ["animatic_variants_lookup", "animatic_variants_submit", "tapnow/setWidgetState"],
  external: ["变体查询/提交通过宿主 server tools；模型/provider 不在 HTML 中暴露；预览可能引用输入媒体 URL。"],
  reason: "编辑与预览是本地 UI，变体生成边界依赖服务端。"
});
add("character-blocking@v1.596deb3b.html", {
  family: "MCP App / Character Blocking v1", behavior: "local-js-editing", hostRequired: true,
  inputs: ["tool-result.structuredContent 中角色、目标画幅与初始位置"],
  outputs: ["本地角色位置/构图状态；未发现固定生成 server tool"],
  external: ["图片字段来自输入；未见固定 HTTP API/model endpoint；字段仍需版本内 fixture 确认。"],
  reason: "核心看起来是本地构图/位置编辑，仍需合成 fixture 确认。"
});
add("character-blocking@v3.f1fd0e23.html", {
  family: "MCP App / Character Blocking v3", behavior: "local-js-editing", hostRequired: true,
  inputs: ["tool-result.structuredContent 中角色/portrait、target、aspect_ratio"],
  outputs: ["tapnow/setWidgetState.state { positions, facings, selected_id, snap, target, aspect_ratio }"],
  external: ["portrait 使用 data_uri 可离线；未发现固定 HTTP API/model endpoint。"],
  reason: "位置与朝向编辑为浏览器本地逻辑；v3 可用 data URI fixture 隔离测。"
});
add("color-adjust@v2.285e6ccb.html", {
  family: "MCP App / Color Adjust v2", behavior: "local-js-calculation", hostRequired: true,
  inputs: [
    "tool-result.structuredContent.node_ref",
    "params：exposure、brightness、contrast、saturation 等",
    "preview.data_uri；可选 _meta['tapnow/widgetState']"
  ],
  outputs: [
    "本地 Canvas ImageData 预览/对比，不上传图片",
    "tapnow/setWidgetState.state { params, activeTab, advancedOpen }",
    "tools/call color_adjust_apply({ node_ref, params })；成功后读取 structuredContent.node_id 并 updateModelContext"
  ],
  external: ["像素调整在浏览器本地；Apply 才依赖宿主 server tool。"],
  reason: "已由 lab/host.html 完成握手与像素实测，是拆岛对照样本。"
});
add("creative-picker@v1.2a07bc2e.html", {
  family: "MCP App / Creative Library", behavior: "unknown", hostRequired: true,
  inputs: ["tool-result.structuredContent 中素材/Library 条目与预览资源"],
  outputs: ["素材选择与 widget state；未发现固定生成 server tool"],
  external: ["Three.js loader 可读取输入资源 URL；搜索/插入接缝未完全静态确认。"],
  reason: "单页内有多个大脚本与 Three.js，需先确认与 website-design-picker 的关系。"
});
add("cutlist-review@v1.a3b10365.html", {
  family: "MCP App / Cutlist Review", behavior: "local-js-editing", hostRequired: true,
  inputs: ["tool-result.structuredContent.shots[]：id、default_keep、in_ms、out_ms、media_duration_ms、preview_url"],
  outputs: ["tapnow/setWidgetState.state.shots[id] { keep, in_ms, out_ms }", "ui/message 提交剪辑摘要"],
  external: ["preview_url 是输入驱动的视频依赖；ui/message 由宿主对话处理。"],
  reason: "保留/入出点编辑在本地；UI 不自行渲染或导出成片。"
});
add("director-markup@v1.4b53a29e.html", {
  family: "MCP App / Director Markup", behavior: "local-js-editing", hostRequired: false,
  inputs: [
    "tool-result.structuredContent: { version: 1, locale?, title?, draft, anchors?, annotations? }",
    "?demo=1 时使用 HTML 内置中文短文 fixture"
  ],
  outputs: [
    "tapnow/setWidgetState.state: { version, draft, anchors, annotations, active_annotation_id }",
    "ui/message 发送 DM1 data=... 摘要；页面没有直接模型客户端"
  ],
  external: ["标注/Unicode range 处理在前端本地；确认动作需要宿主接收 ui/message。"],
  reason: "无媒体/云 API；内置 ?demo=1 fixture 可直接离线启动，适合下一步。"
});
add("ecommerce-photoset@v2.a7b6a057.html", {
  family: "MCP App / E-commerce Photo Set v2", behavior: "cloud-generation", hostRequired: true,
  inputs: ["tool-result.structuredContent 中产品参考、场景/风格参数与生成状态；schema 未完整还原"],
  outputs: ["tapnow/estimateGenerationCost", "ecommerce_photoset_generate", "生成任务结果"],
  external: ["费用估算与生成经宿主 server tools；模型/provider 未由 HTML 直接揭示。"],
  reason: "生成能力不是本地工具岛；可拆的是参数表单与结果呈现。"
});
add("interactive-learning@v1.cd0bb18c.html", {
  family: "MCP App / Interactive Learning", behavior: "unknown", hostRequired: true,
  inputs: ["tool-result.structuredContent 中课程内容/交互步骤；字段未完整还原"],
  outputs: ["前端交互状态；未发现固定 HTTP/server tool"],
  external: ["未发现固定 API/model endpoint；仍需宿主注入 tool-result 与 hostContext。"],
  reason: "页面可独立打包，但业务数据结构不清，暂标 unknown。"
});
add("layer-composer@v1.067126cf.html", {
  family: "MCP App / Layer Composer", behavior: "local-js-editing", hostRequired: true,
  inputs: [
    "tool-result.structuredContent: { version: 1, locale, canvas, title, layers[] }",
    "每层含 id、node_ref、source_sha256、source_width/height、preview:{ data_uri,width,height }"
  ],
  outputs: [
    "本地 Canvas 图层预览、顺序/变换/透明度编辑",
    "tapnow/setWidgetState 保存编辑",
    "tools/call layer_composer_apply({ canvas, layers:[{ id,node_ref,source_sha256,...edits }], title })"
  ],
  external: ["预览可用 data:image/webp;base64；Apply 依赖宿主 server tool。input schema 要求 source_sha256，但页面没有证明由浏览器生成。"],
  reason: "复用价值高，但 fixture 边界较重，排在 platform-resize 之后。"
});
add("library-picker@v1.3449ff83.html", {
  family: "MCP App / Library Picker", behavior: "server-action", hostRequired: true,
  inputs: ["tool-result.structuredContent 中素材类别/查询词/候选资源"],
  outputs: ["find_library_assets server tool", "tapnow/addToCanvas host method", "tapnow/setWidgetState"],
  external: ["搜索与画布插入由宿主处理；候选 preview_url 可能触发媒体加载。"],
  reason: "核心是服务端检索/宿主写入桥，不是离线纯工具。"
});
add("motion-picker@v1.11addd0c.html", {
  family: "MCP App / Motion Library", behavior: "pure-display", hostRequired: true,
  inputs: ["tool-result.structuredContent 中动作预设/候选项"],
  outputs: ["本地筛选/选择状态经 tapnow/setWidgetState 保存"],
  external: ["未发现固定 HTTP/API/model endpoint；动作数据由宿主提供。"],
  reason: "素材库浏览和筛选可复用展示组件；动作生成在宿主。"
});
add("performance-rhythm@v1.html", {
  family: "MCP App / Performance Score v1", behavior: "pure-display", hostRequired: true,
  inputs: ["tool-result.structuredContent 中节拍/场次结构；字段按 v1 版本"],
  outputs: ["本地时间线浏览/列布局；存在的 UI 状态经宿主桥保存"],
  external: ["未发现固定 HTTP/API/model endpoint。"],
  reason: "版本间数据模型不同；暂优先复用 UI，不推断生成逻辑。"
});
add("performance-rhythm@v2.7064fb59.html", {
  family: "MCP App / Performance Score v2", behavior: "pure-display", hostRequired: true,
  inputs: ["tool-result.structuredContent 中节拍/场次结构；v2 schema 未完整还原"],
  outputs: ["本地时间线显示与宿主状态桥"],
  external: ["未发现固定 HTTP/API/model endpoint。"],
  reason: "v1/v2/v3 是独立入口，不能仅凭文件名假定 schema 兼容。"
});
add("performance-rhythm@v3.9ead0d0b.html", {
  family: "MCP App / Performance Score v3", behavior: "pure-display", hostRequired: true,
  inputs: ["tool-result.structuredContent 中 acts、scenes、plotlines、causal_links"],
  outputs: ["tapnow/setWidgetState 保存列、筛选/折叠/新消息状态"],
  external: ["未发现固定 HTTP/API/model endpoint。"],
  reason: "结构化叙事看板，适合后续评估 UI/状态模型复用。"
});
add("platform-resize@v1.897f4688.html", {
  family: "MCP App / Resize", behavior: "local-js-calculation", hostRequired: true,
  inputs: [
    "tool-result.structuredContent: { node_ref, project_id?, locale?, free?, preview:{ width,height,data_uri }, platforms[] }",
    "platform 项含 platform、ratio_id、label_en/label_zh、x/y/w/h、selected?/infeasible?"
  ],
  outputs: [
    "浏览器本地拖拽计算归一化裁切框 x/y/w/h（0–1000 坐标）",
    "tools/call resize_for_platform_apply({ image_id: node_ref, project_id?, crops:[{ platform,x,y,w,h }] })"
  ],
  external: ["预览用 data_uri；实际裁图/落盘依赖宿主 server tool。HTML 只产生裁切坐标，不证明输出位图。"],
  reason: "轻量、可 fixture；下一步适合测量可复用的裁切几何与输出适配器。"
});
add("previs@v3.584fd5b2.html", {
  family: "MCP App / Previs v3", behavior: "cloud-generation", hostRequired: true,
  inputs: ["tool-result.structuredContent 中 shots、sheet/texture 预览、variant 与任务状态"],
  outputs: ["previs_variants_lookup", "previs_variants_submit", "tapnow/getAppReplyRunStatus", "tapnow/validateAppReply", "tapnow/setWidgetState"],
  external: ["变体/任务经宿主 server tools；模型/provider 未在页面暴露；媒体预览取决于输入 URL/data URI。"],
  reason: "异步生成流程与宿主桥接较深，先保留为云端集成岛。"
});
add("product-kit@v1.758d09b3.html", {
  family: "MCP App / Product Kit", behavior: "pure-display", hostRequired: true,
  inputs: ["tool-result.structuredContent 中 look_state、palette、tone_words、confirmed_ids、view"],
  outputs: ["本地选款/配色状态经 tapnow/setWidgetState 保存"],
  external: ["含固定 demo 图片 https://files.tapnow.ai/demo/product-kit.webp；离线需用本地 data URI 或接受破图。"],
  reason: "配置 UI 可复用；商品素材和源数据来自宿主。"
});
add("production-progress@v1.acd4e750.html", {
  family: "MCP App / Production", behavior: "server-action", hostRequired: true,
  inputs: ["tool-result.structuredContent.node_ids、project_id/project_url"],
  outputs: ["get_production_result server tool 的结果并渲染状态"],
  external: ["项目生产状态依赖宿主 server tool；页面无直接模型/API endpoint。"],
  reason: "核心是远端状态读取/展示，适合复用视图，不是本地计算工具。"
});
add("story-room@v1.dae7d235.html", {
  family: "MCP App / Story Room", behavior: "local-js-editing", hostRequired: true,
  inputs: ["tool-result.structuredContent.acts、scenes、plotlines、causal_links"],
  outputs: ["tapnow/setWidgetState 保存列/折叠/筛选与通知状态", "交互结果在本地"],
  external: ["未发现固定 HTTP/API/model endpoint；后续模型对话由宿主控制。"],
  reason: "无媒体依赖的结构化故事板，可作为后续 UI 迁移候选。"
});
add("website-design-picker@v1.2a07bc2e.html", {
  family: "MCP App / Creative Library (website design picker)", behavior: "unknown", hostRequired: true,
  inputs: ["tool-result.structuredContent 中素材条目/预览资源"],
  outputs: ["素材浏览与 widget state；未发现固定生成 server tool"],
  external: ["Three.js loader 可读取输入资源 URL；搜索/插入接缝未完全静态确认。"],
  reason: "标题为 Creative Library，10 段内联脚本；需确认与 creative-picker 的职责关系，不先重写。"
});

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
}
function rel(file) {
  return path.relative(webRoot, file).split(path.sep).join("/");
}
function attributes(source) {
  const result = {};
  for (const match of source.matchAll(/([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    result[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return result;
}
function resolveLocalReference(reference, owner) {
  if (!reference || /^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(reference)) return null;
  const clean = decodeURIComponent(reference.split(/[?#]/, 1)[0]);
  const candidate = clean.startsWith("/")
    ? path.resolve(webRoot, "." + clean)
    : path.resolve(path.dirname(owner), clean);
  const relativePath = path.relative(webRoot, candidate);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) return null;
  return candidate;
}
function directReferences(html, owner) {
  const found = [];
  for (const tagName of ["script", "link", "img", "iframe", "source"]) {
    const pattern = new RegExp("<" + tagName + "\\b([^>]*)>", "gi");
    for (const match of html.matchAll(pattern)) {
      const attrs = attributes(match[1]);
      const value = tagName === "link" ? attrs.href : attrs.src;
      if (!value) continue;
      const localPath = resolveLocalReference(value, owner);
      found.push({
        tag: tagName, reference: value,
        relation: tagName === "link" ? (attrs.rel ?? "") : (attrs.type ?? ""),
        local: localPath && fs.existsSync(localPath) ? rel(localPath) : null,
        missingLocal: Boolean(localPath && !fs.existsSync(localPath))
      });
    }
  }
  return found;
}
function referencesInAsset(source, owner) {
  const found = new Set();
  const patterns = [
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\b(?:from|import)\s*["']([^"']+)["']/g,
    /new\s+URL\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url\s*\)/g,
    /(?:^|["' ])((?:\.{1,2}\/|\/)?assets\/[^"' \s]+?\.(?:m?js|css|wasm|svg|png|jpe?g|webp|woff2?))(?:["' ])/g,
    /url\(\s*["']?([^"')]+)["']?\s*\)/g
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const value = match[1];
      if (/^(?:https?:|data:|blob:|#|\/\/)/i.test(value)) continue;
      const candidate = resolveLocalReference(value, owner);
      if (candidate && fs.existsSync(candidate)) found.add(candidate);
    }
  }
  return [...found];
}
function dependencyClosure(html, htmlFile) {
  const queue = [];
  const unresolved = [];
  for (const reference of directReferences(html, htmlFile)) {
    if (reference.local) queue.push(path.resolve(webRoot, reference.local));
    else if (reference.missingLocal) unresolved.push(reference.reference);
  }
  const visited = new Map();
  while (queue.length) {
    const current = queue.shift();
    if (visited.has(current)) continue;
    visited.set(current, { path: rel(current), bytes: fs.statSync(current).size });
    if (!/\.(?:js|mjs|css)$/i.test(current)) continue;
    const source = fs.readFileSync(current, "utf8");
    for (const dependency of referencesInAsset(source, current)) {
      if (!visited.has(dependency)) queue.push(dependency);
    }
  }
  const files = [...visited.values()].sort((a, b) => a.path.localeCompare(b.path));
  return {
    method: "literal relative import, CSS url(), and Vite assets-path scan; not an AST",
    files, fileCount: files.length,
    bytes: files.reduce((sum, file) => sum + file.bytes, 0),
    unresolvedLocalReferences: [...new Set(unresolved)]
  };
}
function lineAt(source, offset) {
  let line = 1;
  for (let i = 0; i < offset; i += 1) if (source.charCodeAt(i) === 10) line += 1;
  return line;
}
function lineInSection(section, offset) {
  return lineAt(section.text, offset) + section.startLine - 1;
}
function analyzeBusinessBridge(sections) {
  const actions = new Map();
  const pattern = /\.callServerTool\(\s*\{[\s\S]{0,1000}?name\s*:\s*["']([^"']+)["']/g;
  const methods = new Map();
  const hostMethods = new Map();
  const anchors = new Map();
  const addSite = (map, name, section, offset) => {
    const rows = map.get(name) ?? [];
    rows.push({ file: section.file, line: lineInSection(section, offset) });
    map.set(name, rows);
  };
  const tapnowPattern = /\.request\(\s*\{\s*method\s*:\s*["'](tapnow\/[^"']+)["']/g;
  const hostPatterns = [
    ["ui/message", /\.sendMessage\(\s*\{\s*role\s*:\s*["']user["']/g],
    ["ui/update-model-context", /\.updateModelContext\(\s*\{/g],
    ["ui/open-link", /\.openLink\(\s*\{/g],
    ["ui/download-file", /\.downloadFile\(\s*\{/g]
  ];
  const anchorPatterns = [
    ["tool-result handler", /\.ontoolresult\s*=/g],
    ["tapnow state request", /\.request\(\s*\{\s*method\s*:\s*["']tapnow\/setWidgetState["']/g],
    ["host user message", /\.sendMessage\(\s*\{\s*role\s*:\s*["']user["']/g],
    ["server tool call", /\.callServerTool\(\s*\{/g],
    ["Canvas pixel read", /\.getImageData\(/g],
    ["director demo query", /new\s+URLSearchParams\(window\.location\.search\)\.get\(["']demo["']\)/g]
  ];
  const fixedExternalSinks = [];
  const sinks = [
    ["fetch", /\bfetch\s*\(\s*["'](https?:\/\/[^"']+)["']/g],
    ["WebSocket", /new\s+WebSocket\s*\(\s*["'](wss?:\/\/[^"']+)["']/g],
    ["EventSource", /new\s+EventSource\s*\(\s*["'](https?:\/\/[^"']+)["']/g],
    ["XMLHttpRequest.open", /\.open\(\s*["'](?:GET|POST|PUT|PATCH|DELETE)["']\s*,\s*["'](https?:\/\/[^"']+)["']/gi]
  ];
  for (const section of sections) {
    for (const match of section.text.matchAll(pattern)) addSite(actions, match[1], section, match.index);
    for (const match of section.text.matchAll(tapnowPattern)) addSite(methods, match[1], section, match.index);
    for (const [name, regex] of hostPatterns) {
      for (const match of section.text.matchAll(regex)) addSite(hostMethods, name, section, match.index);
    }
    for (const [name, regex] of anchorPatterns) {
      for (const match of section.text.matchAll(regex)) {
        const rows = anchors.get(name) ?? [];
        rows.push({ file: section.file, line: lineInSection(section, match.index) });
        anchors.set(name, rows);
      }
    }
    for (const [kind, regex] of sinks) {
      for (const match of section.text.matchAll(regex)) {
      const endpoint = new URL(match[1]);
      endpoint.username = "";
      endpoint.password = "";
      fixedExternalSinks.push({
        kind, url: endpoint.origin + endpoint.pathname,
        file: section.file, line: lineInSection(section, match.index)
      });
      }
    }
  }
  return {
    protocol: "MCP Apps JSON-RPC over window.parent postMessage",
    handshake: ["ui/initialize", "ui/notifications/initialized", "ui/notifications/tool-result"],
    serverTools: [...actions].map(([name, callSites]) => ({ name, callSites })),
    tapnowMethods: [...methods].map(([name, callSites]) => ({ name, callSites })),
    directHostMethods: [...hostMethods].map(([name, callSites]) => ({ name, callSites })),
    sourceAnchors: Object.fromEntries(anchors),
    fixedExternalNetworkSinks: fixedExternalSinks,
    endpointCountingRule: "只记 native network sink 实参为固定 HTTP(S)/WS(S) URL 的位置；SDK 文档/schema 示例和普通 URL 文本不计 endpoint。动态输入资源单列。"
  };
}
function inspectHtml(file) {
  const source = fs.readFileSync(file, "utf8");
  const scriptBlocks = [...source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  const scripts = scriptBlocks.map(match => ({
    src: attributes(match[1]).src ?? null,
    type: attributes(match[1]).type ?? "",
    inlineBytes: Buffer.byteLength(match[2])
  }));
  const styleCount = [...source.matchAll(/<style\b[^>]*>[\s\S]*?<\/style>/gi)].length;
  const key = rel(file);
  const detail = notes[key] ?? {
    family: "未分类 HTML", behavior: "unknown", hostRequired: null,
    inputs: ["未从静态源码可靠还原"], outputs: ["未从静态源码可靠还原"],
    external: ["未确认业务端点；动态运行依赖仍未知。"],
    reason: "需根据调用场景补充 fixture 后再分类。"
  };
  const closure = dependencyClosure(source, file);
  const sections = [];
  for (const block of scriptBlocks) {
    if (attributes(block[1]).src) continue;
    const contentOffset = block.index + block[0].indexOf(block[2]);
    sections.push({
      file: key, text: block[2], startLine: lineAt(source, contentOffset)
    });
  }
  for (const asset of closure.files.filter(item => /\.(?:m?js)$/i.test(item.path))) {
    sections.push({
      file: asset.path,
      text: fs.readFileSync(path.resolve(webRoot, asset.path), "utf8"),
      startLine: 1
    });
  }
  const title = (source.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim();
  return {
    path: key, bytes: Buffer.byteLength(source), title,
    family: detail.family,
    standalone: {
      bundleShape: scripts.some(script => script.src) ? "HTML + local external bundle" : "single HTML with inline scripts/styles",
      inlineScriptCount: scripts.filter(script => !script.src).length,
      inlineScriptBytes: scripts.reduce((sum, script) => sum + script.inlineBytes, 0),
      inlineStyleCount: styleCount,
      hostRequired: detail.hostRequired
    },
    behavior: detail.behavior,
    dependencyClosure: closure,
    directReferences: directReferences(source, file),
    sdkBridge: analyzeBusinessBridge(sections),
    inputs: detail.inputs, outputs: detail.outputs,
    externalApiOrModelDependencies: detail.external,
    staticAssessment: detail.reason
  };
}

if (!fs.existsSync(webRoot)) throw new Error("Missing read-only reference root: " + webRoot);
const htmlFiles = walk(webRoot).filter(file => file.toLowerCase().endsWith(".html")).sort();
const entries = htmlFiles.map(inspectHtml);
const behaviors = [...new Set(entries.map(entry => entry.behavior))].sort();
const behaviorCounts = Object.fromEntries(behaviors.map(behavior => [
  behavior, entries.filter(entry => entry.behavior === behavior).length
]));
const appEntries = entries.filter(entry => entry.path.startsWith(appRoot));
const appBehaviorCounts = Object.fromEntries(behaviors.map(behavior => [
  behavior, appEntries.filter(entry => entry.behavior === behavior).length
]).filter(([, count]) => count > 0));
const platformAppPath = path.join(webRoot, "usercontent-proxy", "apps", "platform-resize@v1.897f4688.html");
const platformSource = fs.readFileSync(platformAppPath, "utf8");
const styleKeysEnd = platformSource.indexOf("CSS variable keys available to MCP apps for theming.");
const styleKeysStart = platformSource.indexOf('f("--color-background-primary")');
const styleKeys = styleKeysStart >= 0 && styleKeysEnd > styleKeysStart
  ? [...platformSource.slice(styleKeysStart, styleKeysEnd).matchAll(/f\("(--[^"]+)"\)/g)].map(match => match[1])
  : [];
const packagedFiles = walk(webRoot);
const themeIntegration = {
  standaloneCssFiles: packagedFiles.filter(file => file.toLowerCase().endsWith(".css")).map(rel).sort(),
  standalonePanelThemeFiles: packagedFiles
    .map(rel)
    .filter(file => /(?:panel.*theme|theme.*panel).*\.css$/i.test(file)),
  mcpAppProxy: {
    file: "usercontent-proxy/mcp-app-proxy.html",
    stylePolicyLine: 184,
    styleContextLine: 185,
    policy: "Proxy injects no styles; host passes hostContext.styles.variables and the view SDK applies them."
  },
  buildTimeTokenSource: {
    pathMentionedByProxy: "packages/mcp-app-widgets/src/shared/design-tokens.css",
    packagedInReferenceWeb: fs.existsSync(path.join(webRoot, "packages", "mcp-app-widgets", "src", "shared", "design-tokens.css")),
    presentInCopiedLcos: fs.existsSync(path.join(repoRoot, "lcos", "packages", "mcp-app-widgets", "src", "shared", "design-tokens.css"))
  },
  hostStyleSchema: {
    source: "usercontent-proxy/apps/platform-resize@v1.897f4688.html",
    sourceLine: styleKeysEnd >= 0 ? lineAt(platformSource, styleKeysEnd) : null,
    field: "hostContext.styles.variables",
    allowedKeyCount: styleKeys.length,
    allowedKeys: styleKeys,
    valueType: "string CSS values; each key is optional and the host may pass a subset",
    stylesCssShape: "{ fonts?: string }"
  }
};
const evidence = {
  scope: "reference/tapnow-installed/resources/web/**/*.html",
  webBundle: "2026.10.10.38066889187.1",
  htmlCount: entries.length,
  totalHtmlBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
  behaviorCounts,
  appBehaviorCounts,
  themeIntegration,
  classificationLegend: {
    "local-js-calculation": "输入处理或几何/像素计算在浏览器本地执行；后续落盘可另需宿主。",
    "local-js-editing": "本地编辑/交互在浏览器执行；产物保存或对话可能依赖宿主。",
    "pure-display": "以浏览、筛选、状态展示为主，未确认独立业务计算。",
    "server-action": "关键操作由 MCP/TapNow server tool 或 host method 执行。",
    "cloud-generation": "明确调用生成/变体任务 server tool；模型/provider 不一定能由 HTML 判定。",
    "unknown": "静态证据不足以安全归类；SDK 文档字符串和 URL 文本不算实际调用。"
  },
  methodology: [
    "reference 原件只读；递归读取 HTML，计算 UTF-8 字节数，提取 script/link 依赖并对本地 JS/CSS 做词法闭包扫描。",
    "MCP Apps 桥接从业务 request/callServerTool 调用点提取；SDK 通用协议定义视为握手 surface。",
    "HTTP endpoint 只计 native network sink 的固定 URL 实参；schema 示例、文档 URL、普通 URL 文本不计。",
    "输入输出契约取自 tool-result handler、state write 与 server-tool call；未还原字段标记为 partial/unknown。",
    "扫描脚本用 Node 内置模块，不执行安装包 EXE、不访问网络、不提交生成任务。"
  ],
  entries
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(evidence, null, 2) + "\n", "utf8");
console.log(JSON.stringify({
  output: path.relative(repoRoot, outputPath).split(path.sep).join("/"),
  htmlCount: evidence.htmlCount,
  totalHtmlBytes: evidence.totalHtmlBytes,
  behaviorCounts,
  appEntries: appEntries.length,
  appBehaviorCounts,
  rootAssetClosure: {
    fileCount: entries.find(entry => entry.path === "index.html")?.dependencyClosure.fileCount,
    bytes: entries.find(entry => entry.path === "index.html")?.dependencyClosure.bytes,
    unresolvedLocalReferences: entries.find(entry => entry.path === "index.html")?.dependencyClosure.unresolvedLocalReferences
  }
}, null, 2));
