# 原保存真实回执恢复

故障：Core与空间已提交，浏览器丢掉成功回包。正文相同不能证明原批次/历史回执；旧CAS只能挡旧版本覆盖，Git、类型、主键和一般端口测试也无法找回丢掉的HTTP结果。不能永久卡住草稿或用重复POST猜成功。

Goal：保存时短期保留实际HTTP Promise/原结果；核对时GET取回原status/body/wireBody，经原observe与历史回填owner消费，再由原r6释放准确held组。缺失/淘汰/进程重启后保持unknown，绝不拼造回执。

Files：新增lab/pilot/native-text-response-cache.ts，surface-core-facade接原handle外层；startup-surface-core/native-text-save-port/r6由runtime代理协调。新测试分别验证真实handler缓存和原r6/整页loss。仅第三工作区。

Before/After：HTTP结果传输失败后无法证明原保存→在同进程有界transport缓存读回原结果；无新canonical字段、schema、持久journal、hash、冻结contract或gate。

Contract：只对已登记文本首请求传临时随机requestId（原batch URL query）；GET /api/lcos/canvases/:canvas/text-save-receipts/:requestId 返回{ok:true,value:{requestId,canvasId,wireBody,status,body}}，即原响应。相同token异body拒绝，同body共用原Promise；现有普通node/link请求不变。按当前Workspace归属核Canvas，数量/字节有界，未完成项不被淘汰后重执行。

Tests：实际Core+空间保存后丢首回包→GET原回执、0重复生产者；wrongCanvas/token/altered wireBody拒绝；并发同token只执行一次；失败原status准确保留；缓存缺失/满/过大不假确认；GET不改Core/空间；原r6跨重试周期不POST、普通节点策略不变；完整页面关闭续稿/核对/原撤销。

Risk/Rollback：缓存仅HTTP传输副本，非领域真值；内存淘汰/重启不可恢复时保留现有pending和草稿。失败响应不能变成功。回滚源接线即可，既有Core/空间数据不迁移、不清理。无模型、无外网、无发布。
