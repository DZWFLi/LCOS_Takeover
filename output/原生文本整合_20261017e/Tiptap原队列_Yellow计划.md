# Tiptap 原队列：Yellow 施工

结论：登记已有 autosave，不再发第二次编辑。原 vZ/hl/G7、原 r6/g、原 O8 继续拥有输入、防抖、队列和历史；只把该正文操作接到现有准确回执与 unknown hold。

- **Owner**：专用 `native-tiptap-autosave-transform.mjs` 标记原 callback 来源并接原 actions 内状态；`native-text-save-port.js` 新增原组准备与订阅；`history-intent-transform.mjs` 在原 s6 合并后、分组前等待准备；`startup-surface-core.js` 继续真实 observed CAS/HTTP receipt owner。不改 vendor、schema、Core producer，不新增窗口/队列/正文事实。
- **分组**：原 source 标记随原 change 到真实 ops；准备只登记准确 primary、canvas/project/API/Artifact+View、完整正文和 observed CAS。Core 预检只读，不再次 updateNodeData。旧 unknown/conflict 锁住准确旧组，后来输入仍留原 g；普通节点与 links 保留原策略。
- **恢复**：正常、迟到及 GET 真回执继续现有 owner；旧回执不得覆盖后来正文。原动作栏显示保存中/待核对/冲突及只读核对，关窗 flush 与离场草稿不丢；场景变更不把旧回执接到新现场。无法确认继续持有，不能清 pending 假成功。
- **测试**：真实原 vZ/hl + G7 DOM 输入 + 原 r6/wrapper，覆盖快输、慢预检期间后稿、unknown 与后稿、正常/迟到/冲突、换现场、关闭 flush、真 GET 恢复与普通 node/links。独立真实 Core 测准 CAS/回执，最后 root 统一 build 后整 App normal/loss/Undo/Redo。
- **边界/回退**：跨系统写仍由既有 Canvas→Core route/CAS 控制；原件只读，隔离合成材料、无模型。测试 PASS 必须说明层次；保留 d 目录 POST4 原复现。root 负责候选构建和精确重启，本 agent 不操作实例。
