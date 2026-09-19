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
