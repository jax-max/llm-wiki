# Wiki Log

## [2026-09-18] ingest | 抽奖平台
- Disposition: New
- Raw: raw/meituan-tech/2026-09-18-ddd-in-practice.md
- SHA-256: 6504ef982af1844331b961370adcfb56462ee4768b6b282e9e4a953660243c20
- Pages: wiki/domains/lottery-platform/entities/lottery-activity.md, wiki/domains/lottery-platform/entities/award-pool.md, wiki/domains/lottery-platform/entities/award.md, wiki/domains/lottery-platform/entities/user.md, wiki/domains/lottery-platform/entities/stock.md, wiki/domains/lottery-platform/workflows/user-participation.md, wiki/domains/lottery-platform/rules/award-selection.md, wiki/domains/lottery-platform/rules/activity-admission.md, wiki/domains/lottery-platform/rules/participation-risk-control.md, wiki/domains/lottery-platform/rules/lottery-attempt-counting.md, wiki/domains/lottery-platform/events/lottery-participation.md, wiki/domains/lottery-platform/events/award-issued.md

### Coverage

| Type | Disposition | Pages or rationale |
|---|---|---|
| Entity | Added | [抽奖活动](domains/lottery-platform/entities/lottery-activity.md), [奖池](domains/lottery-platform/entities/award-pool.md), [奖品](domains/lottery-platform/entities/award.md), [用户](domains/lottery-platform/entities/user.md), [库存](domains/lottery-platform/entities/stock.md) |
| Workflow | Added | [用户参与抽奖](domains/lottery-platform/workflows/user-participation.md) |
| Rule | Added | [奖池匹配与概率选奖](domains/lottery-platform/rules/award-selection.md), [活动准入](domains/lottery-platform/rules/activity-admission.md), [参与频率风控](domains/lottery-platform/rules/participation-risk-control.md), [抽奖尝试计数](domains/lottery-platform/rules/lottery-attempt-counting.md) |
| StateMachine | N/A | 原文未给出可独立验证的生命周期状态与迁移。 |
| Event | Added | [用户参与抽奖事件](domains/lottery-platform/events/lottery-participation.md), [奖品发放事件](domains/lottery-platform/events/award-issued.md) |

## [2026-10-15] maintenance | 抽奖平台

- 原先存在“用户参与抽奖事件”（`lottery-participation.md`）和“奖品发放事件”（`award-issued.md`）两个 Event 页面；此次将其信息合并到[用户参与抽奖](domains/lottery-platform/workflows/user-participation.md) Workflow 后删除两页。相关知识属于参与流程中的调用、输出和记录，无需独立建页。
- Workflow 保留参与场景、发奖调用、响应转换与用户领奖记录的说明，并明确 `sendAward` 是方法、`SendResult` 是输出信息。
- 修订[参与频率风控](domains/lottery-platform/rules/participation-risk-control.md)和 Workflow：应用服务先执行风险校验，再进行活动准入和抽奖；来源未展示风险校验失败时的具体处理，不补写失败分支。两个修改后的类型化页面均更新 `Updated`。
- 同步索引、领域概览及中英文 README，现有类型化页面为 5 个 Entity、1 个 Workflow、4 个 Rule，不补建 StateMachine。
- 因检查器也校验历史 Coverage 的链接，同步修订上述原摄入条目的 Pages 和 Event Coverage，移除已删除页面的引用；该条目的原始摄入日期与 SHA-256 保持不变。原始来源、schema、skill 和检查器逻辑均未因本次维护改动。

## [2026-10-15] maintenance | 补齐教学示例类型

- 按用户对 demo 覆盖面的要求，恢复“用户参与抽奖事件”和“奖品发放事件”两页，取代上条维护中无需独立建页的处置。它们展示来源所述业务行为的事件类型及其关联对象，不声称存在独立事件消息实现或某次真实发生记录。
- 保留 Workflow 中的发奖调用、响应转换、领奖记录及风控修正；Event 页不再将 `sendAward`、`SendResult` 列为别名，分别明确为方法和输出。
- 原摄入条目的 Pages 和 Event Coverage 同步恢复为现存页面引用；原始摄入日期、SHA-256 以及美团 Raw 内容不变。原文 StateMachine 仍为 N/A，补充教学规格单独摄入并记录如下。
- 索引、领域概览及中英文 README 同步为 5 个 Entity、1 个 Workflow、4 个 Rule、1 个 StateMachine、2 个 Event，区分文章来源与虚构教学设定。schema、skill 和检查器未因本次维护改动。

## [2026-10-15] ingest | 抽奖活动生命周期教学设定
- Disposition: New
- Raw: raw/demo-spec/2026-10-15-lottery-lifecycle.md
- SHA-256: c98958c767872232a3a237aa735c6e61ca083eee7e3104e478298bdb942fd3cd
- Pages: wiki/domains/lottery-platform/state-machines/lottery-activity.md
- Note: 用户要求尽可能覆盖各类目录；新增明确标注为虚构的教学规格，不代表美团系统实际实现。

### Coverage

| Type | Disposition | Pages or rationale |
|---|---|---|
| Entity | N/A | 沿用既有抽奖活动对象，无新增业务对象定义。 |
| Workflow | N/A | 仅定义单个活动的状态迁移，不定义跨对象协作流程。 |
| Rule | N/A | 迁移守卫在状态机中说明，无需独立规则页。 |
| StateMachine | Added | [抽奖活动生命周期（教学设定）](domains/lottery-platform/state-machines/lottery-activity.md) |
| Event | N/A | 时间检查作为迁移触发条件记录，无需独立事件页。 |
