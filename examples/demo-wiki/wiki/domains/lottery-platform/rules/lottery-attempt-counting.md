# 抽奖尝试计数

> Type: Rule
> Aliases: AwardCounterFacade; incrTryCount
> Sources: 美团技术团队（文彬、子维），2017-12-22
> Raw: [领域驱动设计在互联网业务开发中的实践](../../../../raw/meituan-tech/2026-09-18-ddd-in-practice.md)
> Updated: 2026-09-18

## Overview

计数上下文是为抽奖、风控和活动准入提供访问接口的通用上下文；抽奖领域服务在读取抽奖活动聚合后增加抽奖计数。

## Rule

每次进入抽奖领域服务时，先获取对应抽奖活动的聚合，再增加本次抽奖的尝试计数，随后选择奖池和奖品。计数能力同时服务于抽奖、风控和活动准入中涉及的次数限制。

## Relations

- governs: [抽奖活动](../entities/lottery-activity.md)
- governs: [用户参与抽奖](../workflows/user-participation.md)
