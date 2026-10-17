# 夺舍计划｜LCOS-DSH-03

本目录是独立的第三工作区。用户于 2026-10-13 授权复制当前 GN2 源码和 E 盘 TapNow 安装包，并在副本开展夺舍实验。

- 实际施工只在本工作区；原 OS、LCOS0.1收口、E:/tapnow 仅只读参照。
- lcos/ 是当前 GN2 文件树副本，含未提交源码；不复制旧 worktree 的 .git。实验根目录有自己的 Git，默认不设置 remote、不 push。
- reference/ 保存厂商安装原件与历史研究，只用于本地研究，不直接执行其中 EXE/Updater，不修改原件。
- lab/ 保存可运行的实验代码；正式修改 lcos/ 前按其对应指令与真实 owner 核查。
- 不继承旧数据库、账户登录、密钥、浏览器 profile 或真实项目文件 watcher。新运行数据只落本目录 .runtime/。
- TapNow 离线实验只允许 loopback 网络；浏览器拦截远端 HTTP、SSE、WebSocket，未知协议也必须记录。不得伪称离线完整能力已实现。
- 保留现有权限和路径保护。默认不新增 hash、冻结 contract、baseline 或 gate。
- LCOS Core 保持领域真值唯一 owner；新的画布方案必须先明确替换边界，不同时保留两套空间真值。
- 本地副本处理授权不等于厂商再分发许可。不得上传或公开 reference/、厂商编译代码、账号数据。
- 输出先结论再证据，简洁口语化；完整进度和剩余事项写 Markdown。
