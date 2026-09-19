# 用户参与抽奖

> Type: Workflow
> Aliases: participateLottery
> Sources: 美团技术团队（文彬、子维），2017-12-22
> Raw: [领域驱动设计在互联网业务开发中的实践](../../../../raw/meituan-tech/2026-09-18-ddd-in-practice.md)
> Updated: 2026-09-18

## Overview

用户从活动页面参与抽奖时，应用服务负责协调登录校验、风控、活动准入和抽奖领域服务；成功时返回奖品信息，发奖失败时返回错误结果。领域服务内部读取抽奖活动聚合、增加抽奖计数、选择适配奖池和奖品，并调用发奖服务。

## Steps

1. 校验[用户](../entities/user.md)的登录信息。
2. 执行参与频率风控，取得可参与时的风险校验结果。
3. 执行活动准入检查，确认[抽奖活动](../entities/lottery-activity.md)的参与条件。
4. 获取抽奖活动聚合，增加抽奖尝试计数，并按用户的城市或得分选择[奖池](../entities/award-pool.md)。
5. 在选中的奖池中按概率选择[奖品](../entities/award.md)，调用发奖服务并返回奖品信息或失败结果。

## Relations

- uses: [用户](../entities/user.md)
- uses: [抽奖活动](../entities/lottery-activity.md)
- uses: [奖池](../entities/award-pool.md)
- uses: [奖品](../entities/award.md)
- uses: [奖池匹配与概率选奖](../rules/award-selection.md)
- uses: [活动准入](../rules/activity-admission.md)
- uses: [参与频率风控](../rules/participation-risk-control.md)
- uses: [抽奖尝试计数](../rules/lottery-attempt-counting.md)
