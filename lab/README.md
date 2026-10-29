# 夺舍计划离线实验宿主

本实验直接加载安装版 color-adjust 原 HTML，在本地处理像素并保存控件状态。画布提交、消息发送与其它服务器工具尚未接入 LCOS；宿主明确返回错误，不伪造成功。

启动（Node 22+；无第三方依赖）：

```powershell
node .\lab\server.mjs --port 17873
```

- 宿主：http://127.0.0.1:17873/
- 安装版整前端诊断：http://127.0.0.1:17873/renderer/
- 原件来源：reference/tapnow-installed/resources/web/
- 新运行数据：.runtime/offline-lab/
- 服务只绑定 127.0.0.1；不会运行 TapNow.exe，不会读取旧用户 profile 或账户数据。

| 接口 | 用途 |
| --- | --- |
| GET /health | 查看离线模式与端口 |
| GET /api/state | 读取 { widgets: { [widget]: { state, updatedAt } } } |
| PUT /api/state | 保存 JSON { widget: "color-adjust", state: { ... } } |
| GET /api/errors | 读取失败、远端尝试、CSP 违例与未接入动作 |
| GET /api/events?after=0 | 读取事件及 lastSequence；内存返回最近 2000 条 |
| POST /api/events | 写入 JSON { source?, kind, detail? } |
| GET /vendor/... | 读取已复制安装版 resources/web 的原始文件 |
| GET /renderer/ | 加载安装版 index.html 并注入只读诊断；原 bundle 保持不变 |

JSON 写入限 128 KiB。状态按一次写入顺序保存，并通过临时文件替换。控件状态可恢复；测试图片只在浏览器内存中，刷新后回到合成测试图。

SDK 握手为 ui/initialize → ui/notifications/initialized → ui/notifications/tool-result。tapnow/setWidgetState 接本地状态。tools/call、ui/message 等未实现动作返回 JSON-RPC -32601。本地 state 写入失败返回 -32603。

浏览器 CSP 限制连接到同源，禁止 object 和表单提交，仅允许同源/blob 本地 Worker（WebAV 初始化需要）；远端 Worker 不放行。原件 frame 使用 sandbox="allow-scripts"。静态路径保护拒绝越界与越界 symlink。整前端诊断记录 CSP 违例、失败 fetch 与页面异常；缺少 API 或桌面桥仍然如实失败。浏览器实测还需使用干净 context，拦截所有非 loopback 请求与 WebSocket，禁用 Service Worker，以测量实际远端尝试。

建议实际检查：分页、滑杆像素变化、按住原图、重置、状态刷新恢复、Apply 明确拒绝，以及远程 HTTP/SSE/WebSocket 尝试为零成功。

