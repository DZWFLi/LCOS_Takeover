# Release / Upgrade

## Release verify

不能用 `npm test` 代替 Desktop Release Gate。正式发布至少覆盖当前 repo 已定义的：

```text
bootstrap / typecheck / tests / build
Desktop doctor
Desktop start
Core + Bridge health
managed Skills + MCP integration
restart / reopen / persistence
clean install / upgrade install（发布阶段）
```

具体命令以当前 repo package scripts 为准，不从旧 Skill 硬编码。

## Migration

任何 Schema / persistence migration：

- 有旧版本 fixture；
- 可识别版本；
- crash/restart 可恢复；
- 不手改生产 DB；
- 有 backup/recovery 策略；
- migration PASS 后再验证业务 invariant。

## Dependency / Provider upgrade

先查上游官方 release / breaking changes，再定位 LCOS 实际调用面；只做最小解释得清的升级，不顺手重构产品。
