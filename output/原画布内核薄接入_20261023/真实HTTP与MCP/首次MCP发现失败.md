# 首次真实 MCP 发现失败

2026-10-23，实际预览 PID57220。HTTP 的原 Bearer、Host／Origin、能力子集、原结构查询等只读检查已执行；真实 MCP 客户端列工具时失败，尚未写画布、没有模型请求。

原因：包装器把 `query` 简单拼复数，误请求 `/capabilities/querys/...`；真实入口为 `/capabilities/queries/...`。最初协议测试端只看后缀，未识别此路径差异。

修复：使用原准确路径；测试 HTTP 明确拒绝未知 capability 路径。随后重跑标准 MCP 协议与真实入口，不重复任何写操作。最终结果另存新报告，本记录保留。
