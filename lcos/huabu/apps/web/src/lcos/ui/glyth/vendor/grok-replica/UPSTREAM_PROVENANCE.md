# 上游来源与使用限制

# Grok-icon-study 采用决策与署名义务（2026-09-03 用户裁定）

## 决策

**LCOS Glyph（Agent 角色形象）直接采用本目录的 grok-icon-study 实现**（blessonism/grok-icon-study 的 replica 渲染器：23 种规则几何形状 + 15 根弹簧 transform + 25 组眼型 morph + pose/overlay 系统），**不再自研几何**。

**LCOS 打开时自动在 Glyph 旁展示来源署名/商标**（用户要求：把人家商标放旁边）。

## 来源与许可现状（如实登记，供商业化前复审）

| 项 | 事实 |
|---|---|
| 仓库 | github.com/blessonism/grok-icon-study（P3 批 donor，DONOR_MANIFEST 标记 REFERENCE_ONLY） |
| 声明 | 仓库无 LICENSE 文件；其源码注释自称「Extracted from Grok Bot.app v0.18.0 app.asar — personal study only」 |
| 上游 | 几何/眼型/状态数据源自 Grok Bot.app（xAI 的 Grok 官方客户端）内部 bundle |
| 风险提示 | 「旁置商标/署名」是致谢行为，不等同于开源许可或商业授权；xAI 或原仓库作者若主张权利，仍可能冲突。商业启动前必须重新评估（联系作者授权 / 替换为自有几何数据）。当前 LCOS 非商业化，采用为研究阶段决策 |

## 施工要求（GPT 接手时强制执行）

1. Glyph 组件 = 搬运 replica 渲染器为 LCOS 组件（apps/web-gen2/src/.../glyph/），保留其分层（geometry-data / tables / pose / eyes / tricks / fx / character）。
2. 署名落点：LCOS 画布打开/引导界面（Glyph 出现处）显示署名元素「Grok Bot 造型参考 · blessonism/grok-icon-study · xAI Grok」；样式按视觉宪法 D 类 token（克制、小字、不抢戏）。
3. 商业化前检查点：LICENSE 授权 → 若无，切换为自建几何（保留本目录的架构与参数表结构做接口形状，不抄数据）。
4. 交接：本决策并入 B04（Glyth 施工卡）与 MD6 附录（Glyph 造型定位）。

## 关联

- 原始 zip：源码参考_20260903\motion_donors_p3\sources\grok-icon-study.zip
- 本副本：Gen2开发\grok-icon-study_replica_20260903\（可直接双击 index.html 预览/挑款）

## 本次薄适配

本目录由用户已提供的研究复刻源码转为私有 ES 模块；不是官方 MIT 授权，也不宣称获得品牌/商业再分发许可。用于本项目隔离候选实现与审计；正式分发必须核清原有许可限制。

保留 renderer 数学、eyes、pose、tricks、fx；调度/指针/组件生命周期转由已有 Gen1 共享机制适配。状态映射不写回业务真值。
