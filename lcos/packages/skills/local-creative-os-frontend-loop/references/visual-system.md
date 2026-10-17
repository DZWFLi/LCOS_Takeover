# Visual System

视觉优先级：

```text
内容可读性
> 工作现场层级
> 操作反馈
> 品牌材质
> 装饰
```

规则：

- 节点内容比 chrome 更重要；不要重新回到统一大卡片 + 永久面板。
- 强视觉文件尽量显示真实预览/比例；文本根据长度在直读/折叠间切换。
- 同 Entity 跨 Surface 的主身份稳定；第二级 clue 随 Surface 变化即可。
- Action feedback 必须及时，但避免整个节点平移/闪烁造成粘滞感。
- 颜色用于状态/类别提示，不应吞掉内容层级。
- 当前 Design System Skill / repo token 是数值事实源；历史 Make 颜色值只在追兼容时读取 legacy reference。
- 验收至少覆盖 1366×768 与一个更大 desktop viewport，以及 reduced motion/基本 keyboard path。
