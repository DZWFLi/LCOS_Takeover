# 原 Undo 自身丢回包：最小复现

结论先留给执行结果。本轮只测原 O8 Undo 发出的正文 DTO，不把 autosave 已登记路径的通过扩成历史请求也通过。

复用已执行的实际原 O8/r6/request-hook/wrapper fixture 组件，通过新独立驱动运行：先正常保存并准确退掉 port 握手，再调用原 O8 undo；HTTP peer 仅首次正确 CAS 提交，模拟该响应丢失，后续旧 CAS 真正拒绝。数原 inner retry、25 秒回队、显式原 retry 和 cleanup 的 POST；同时读原 raw history/index/正文/ref 与 port pending。

不重写 queue/Undo，不给历史 DTO 偷加 autosave 来源；普通真正原动作照常执行。只写新测试/e 报告，冻结产品源码不变、不写候选、不启动 full 实例、不跑模型。对端和时钟受控，这不是整 App 或真实 Core；通过是成功复现缺口，不是修好了。
