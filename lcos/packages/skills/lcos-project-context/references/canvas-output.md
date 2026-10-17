# 画布产出规范（节点命名与落位）

Run 结果物化为画布节点时（create_artifact / create_collection 产出、摘要沉淀节点），遵循 Curator 同款两条规范：

1. **短命名**：节点 label 1-5 个词（中文 ≤10 字），label 与 content 分离；content 只写 body（Markdown 正文），不带 frontmatter/元数据块。摘要类产出不要把「生成说明」写进 label。
2. **确定性落位**：一次产出多个节点时 position 必填，按模板坐标排布：
   - 顺序/流程：左到右 `x = 0,230,460…`
   - 分类/目录：网格 `x = col*230, y = row*150`
   - 原件↔译文 / 问题↔答案等成对内容：并排 grid（同一行放配对项，无对应项的列跳过该行）
3. **边是噪声**：排列本身能表达的分组不连线；只有布局看不出的依赖才建关系。
4. **回传简短**：改动落地后最终回复一俩行即可——动作在画布上说话，不在聊天里复述全部内容。

详细版见 `lcos-project-curator/policies/node-labeling.md` 与 `policies/layout-recipes.md`。