# 参与频率风控

> Type: Rule
> Aliases: LotteryRiskService; risk control
> Sources: 美团技术团队（文彬、子维），2017-12-22
> Raw: [领域驱动设计在互联网业务开发中的实践](../../../../raw/meituan-tech/2026-09-18-ddd-in-practice.md)
> Updated: 2026-09-18

## Overview

风控上下文用于应对刷单行为，并在用户参与抽奖流程中先于活动准入和抽奖执行。

## Rule

抽奖活动可配置风控条件以限制用户参与抽奖的频率。应用服务先执行风险校验；未取得可参与结果时，不进入活动准入和抽奖步骤。

## Relations

- governs: [用户](../entities/user.md)
- governs: [用户参与抽奖](../workflows/user-participation.md)
