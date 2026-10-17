# Policy: Capability Gate

任何写入前先确认真实能力链：

```text
Contract → Core route → CLI/MCP/tool → Skill declaration → test
```

- 当前工具/命令不存在：不得编造；写操作停在 Proposal / blocked。
- CLI 与 MCP 只是一种 transport；Core 才是 canonical write owner。
- 读能力有合法降级时可继续；写能力没有受控路径时不得用 shell/HTTP 私接。
- 当前 Surface / mode / permission 不允许的能力，不应作为候选动作暴露给 Agent。
- 完成后必须用对应 verifier 读回真实状态，不以“调用成功”代替完成。
