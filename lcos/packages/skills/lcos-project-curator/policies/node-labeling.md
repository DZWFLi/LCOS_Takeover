# Policy: Node Labeling（节点短命名规范）

来源：huabu resolve-label.ts + command-cookbook.md 借鉴（20260826 晚任务一）。
适用：任何让节点出现在画布上的路径——Curator 建节点、Run 产出节点、对话章节摘要节点、导入整理节点。

## 铁律

1. **节点 label 只承载 1-5 个词**（中文 ≤10 字）。label 是「一眼能辨识的名片」，不是标题、不是摘要、不是句子。
2. **label 与 content 分离**：label = 命名（frontmatter 语义），content = 正文（body 语义）。回传/写回时只传 body，label 由本规范生成——绝不把 `---` frontmatter 块或元数据混进 content。
3. **短命名生成 prompt 统一**（Agent 需要为图片/组起名时）：
   - 图片：`用 1-5 个词描述这张图片作为短标签。只回答标签文本，不带引号标点。`
   - 组名：`根据这组内容：[子项 label 列表]，建议一个 1-5 个词的组名。只回答组名，不带引号标点。`
4. **不重复父级已有信息**：父级 `PortaSplit` → 子节点叫 `EP05 客户反馈`，不叫 `PortaSplit EP05 客户反馈`。
5. **不虚构业务阶段**：命名贴合当前真实内容；`labelSource` 如实标注（agent 起的名不冒充用户命名）。

## 展示侧缩略约定（与代码层对齐）

- 节点卡片 label 截断 24 字符（超长 `truncate`，chip 永不撑破行）。
- Agent 输入侧 preview = `content[:120]` 折叠成单行（先折叠空白再截断，120 字预算花在内容上）。

## 违例样例（Review 时按此判）

| 违例 | 正解 |
|---|---|
| `关于第二季度短视频脚本的客户反馈整理结果汇总` | `EP05 客户反馈` |
| `新建的竞品分析文档（包含三个维度）` | `竞品分析` |
| content 里混入 `---\nlabel: xxx\n---\n` | content 只留 body，label 走独立字段 |