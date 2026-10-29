# 所有权边界

- **Local Core** 拥有 Project、Workspace、Artifact、View、Revision、Current、
  ActiveContext、ContextManifest、Run、ArtifactReturn 与用户 Review。
- **Light Bridge** 是内部 REST worker 网关：只拥有 provider 任务身份、认领、
  租约、心跳、取消与 ResultEnvelope；不暴露公共 MCP 面。
- **Agent / Skill** 负责理解自然语言、识别 Target 与 Context、选择
  create/revise/analyze、解释真实歧义或风险。
- **Web / CLI / MCP** 是适配器，绝不直接写 SQLite。
- **Accept 是唯一改变 Current 的路径。**

## 不夸大能力

宣传任何能力前，按这条链确认存在：

```text
Contract → Core route → CLI/MCP tool → Skill declaration → test
```

任何一层缺失就说“该能力不可用”，不要发明工作流。

## 用户看到的话术

```text
Agent 任务 / waiting for Agent / Agent is working / needs one answer /
result ready / use this version / abandon this result / try again / withdraw task
```

不暴露内部 ID 或术语，除非用户打开 Diagnostics。
