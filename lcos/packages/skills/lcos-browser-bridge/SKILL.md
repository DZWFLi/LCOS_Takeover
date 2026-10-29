---
name: lcos-browser-bridge
description: "通过 lcos-browser-bridge MCP server（browser_exec / browser_doctor 两 tool）驱动 browser-harness CDP 真浏览器、排障 daemon、沉淀站点技能时用本 skill。"
---

# lcos-browser-bridge：浏览器桥施工与使用契约

## 何时不用（反边界）

- 公开信息用普通 HTTP 能读（公开页 / API / 文档）就不开浏览器——先 `curl`/fetch，失败或返回壳页再升级（browser-harness SKILL.md「When Not to Use」原文语义）。
- 登录墙停下问人：密码 / MFA / 同意页 / 账号二义性一律停；唯一例外是 Chrome 已登 SSO 时可自动用。
- 不往 MCP server 的 stdout 打印任何东西——stdio 是 JSON-RPC 协议通道，stdout 被污染 = 协议崩（mcp_server.py 头注红线）；日志只写同目录 `mcp_server.log`。
- 不在 MCP server 进程内 exec 用户代码：死循环/崩溃只能死一次性子进程，server 本体不受影响。

## 数据模型（状态是哪份数据，真实契约/函数名）

- **实现落点**：`tools/lcos-browser-bridge/mcp_server.py`（RC 仓库已实现，本文路径即它）。stdio transport；`MCPServer(name="lcos-browser-bridge")`；入口 `main()` → `mcp.run()`。
- **两个 tool**：
  - `browser_exec(code: str) -> str`：把 code 经 stdin 喂给 `browser-harness` 子进程（等价 shell 的 `browser-harness <<'PY' ... PY`）；helpers 预导入（`new_tab / page_info / ensure_real_tab / cdp() / goto / click / type_text` 等，完整清单见 browser-harness 的 SKILL.md）；`print()` 结果走 stdout 回传；超时 `EXEC_TIMEOUT_SECONDS = 60`。
  - `browser_doctor() -> str`：跑 `browser-harness --doctor`，返回安装 / daemon 存活 / CDP 端口连通诊断；超时 `DOCTOR_TIMEOUT_SECONDS = 120`；daemon/browser FAIL 不一定是桥的问题（浏览器连接由用户手动 gate）。
- **关键常量**：`MAX_RESULT_CHARS = 50_000`（`_clip` 超长首尾各留一半 + 截断标记，防刷爆协议通道）。
- **CLI 解析**（`_harness_command()`，命中即止并缓存）：① 当前解释器同级 `Scripts/browser-harness.exe`；② PATH 上的 `browser-harness`（`shutil.which` 处理 Windows PATHEXT）；③ 兜底 `[sys.executable, "-c", "from browser_harness.run import main; main()"]`。
- **子进程封装**（`_run_harness`）：UTF-8 stdin + `PYTHONIOENCODING/PYTHONUTF8` 双保险（防 GBK 乱码）；超时只 kill 直接子进程——**daemon 是独立常驻进程，不受影响**。
- **参考形态**：`browser-harness-reference/SKILL.md`（skill 文本形态：frontmatter `name/description` + Usage/When Not to Use/Gotchas 结构）与 `browser-harness-reference/agent-workspace/agent_helpers.py`（agent 可编辑 helper 落点）。

## 施工标准（分步骤）

1. **注册到 Codex**：Codex CLI 的 `config.toml` 加 `[mcp_servers.lcos-browser-bridge]`，`command = "python"`，`args = ["tools/lcos-browser-bridge/mcp_server.py"]`（相对仓库根；也可给绝对路径）。手工启动即 `python tools/lcos-browser-bridge/mcp_server.py`。
2. **执行浏览器代码**：调 `browser_exec(code)`，code 里首选可达性树而非截图——`cdp("Accessibility.getFullAXTree")["nodes"]` 过滤后用 `DOM.getBoxModel` 取中心坐标再 `click_at_xy(x, y)`，动作后用 `js(...)` / `page_info()` 验证；导航后 `wait_for_load()`；当前 tab 陈旧/内部页先 `ensure_real_tab()`。首次导航用 `new_tab(url)`（不是 `goto_url`）。
3. **排障**：连接异常先 `browser_doctor()`；Chrome 没开会自动拉起重试；远程调试未开启时 harness 会开 `chrome://inspect/#remote-debugging`，按提示放行（macOS 另有 `browser-harness mac-approve`，不要轮询——daemon 只持一条连接）。
4. **多 workspace 多 daemon**：本地默认 daemon 只有一个（共享 Chrome）；并行/隔离任务用命名远端 daemon——`browser_exec("start_remote_daemon('r7k2')")` 起一个，之后同 workspace 的调用带 `BU_NAME=r7k2`（或 `BU_CDP_URL`/`BU_CDP_WS`）路由到同一 daemon；**不许起了远端还继续打默认 daemon**；用完问用户是否 `stop_remote_daemon(name)`（计费到停为止）。
5. **agent-workspace 接线**：`BH_AGENT_WORKSPACE` 指到 agent-workspace 目录后，`agent_helpers.py` 里的任务级 helper 会被核心 helpers 加载；站点技能沉淀进 `domain-skills/<host>/*.md`（`BH_DOMAIN_SKILLS=1` 启用后 `goto_url` 会回报该 host 的技能文件名）。LCOS 侧的对应沉淀位：项目技能池 SKILL.md（`frontend-focus/src/features/workflow/skillLibrary.ts` 契约）与 `packages/skills/` 各契约 skill。
6. **超时与长任务**：单次 `browser_exec` 60s 上限，超时返回「只 kill 执行子进程，daemon 不受影响；请缩小任务后重试」——把长任务拆成多次调用，不调超时常量。

## 视觉词汇（复用，禁自带样式）

本 skill 无 GUI 施工面；诊断输出为纯文本协议（`exit_code` + `--- stdout ---` + `--- stderr ---` 三段式，`_format_result`）。涉及 LCOS 前端呈现浏览器结果时（如 Workbench 网页对象），视觉走 `lcos-glaze-materials` 契约，不自带样式。

## 验收（数值断言）

- MCP server 暴露的 tool 恰好 2 个：`browser_exec` / `browser_doctor`。
- `browser_exec` 子进程超时 60s、`browser_doctor` 120s；超时后 daemon 进程仍存活（只 kill 子进程 pid）。
- 返回文本 > 50_000 字符时被 `_clip` 截断：保留首尾各 25_000 字符且含截断标记行。
- `_harness_command()` 三级解析命中即止并缓存（进程内只解析一次）。
- server 进程自身 stdout 全程零输出（所有日志落 `mcp_server.log`）。
- 远端 daemon 会话内所有调用 `BU_NAME` 一致；`stop_remote_daemon(name)` 后该名下连接关闭。

## 已知边界（0.1 不做什么，不假装）

- 桥不修浏览器连接：remote-debugging 授权由用户手动确认（gate），doctor 只报状态。
- 不做 MCP server 内嵌 Python 执行环境（永远 subprocess 隔离）；不做流式输出（一次性回传 stdout/stderr/exit_code）。
- 云浏览器（Browser Use cloud）走远端 daemon 通道，计费与凭据归用户；桥不自动起停。
- 站点技能默认关闭（`BH_DOMAIN_SKILLS` 未设时忽略 domain-skills）；0.1 不做技能自动学习，只有手工沉淀。
