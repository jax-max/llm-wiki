# 抽奖活动

> Type: Entity
> Aliases: DrawLottery; 抽奖
> Sources: 美团技术团队（文彬、子维），2017-12-22
> Raw: [领域驱动设计在互联网业务开发中的实践](../../../../raw/meituan-tech/2026-09-18-ddd-in-practice.md)
> Updated: 2026-09-18

## Overview

抽奖活动是抽奖平台的核心业务对象，由运营在 M 端配置；一个抽奖活动包含多个奖品，可以针对一个或多个用户群体——通过为不同群体配置各自的奖池实现。C 端用户通过活动页面参与。工程上由聚合根 `DrawLottery` 承载：持有抽奖活动的 `lotteryId` 与该活动下所有可用奖池的列表，`setLotteryId` 会对非法的抽奖 id 抛出 `IllegalArgumentException`。

其最主要的领域功能是根据一个抽奖发生场景选出适配的奖池，即 `chooseAwardPool` 方法：场景信息由 `DrawLotteryContext` 携带（抽奖得分或抽奖时所在的城市），带有城市信息时按城市匹配奖池，否则按活动得分匹配。

抽奖活动有活动限制，例如用户的抽奖次数限制、抽奖的开始和结束的时间等，这些限制条件由活动准入上下文收拢管理；活动还具有风控配置，能够限制用户参与抽奖的频率。抽奖领域还会使用抽奖结果（`SendResult`）作为输出信息。

用户参与抽奖时，应用服务按序完成校验用户登录信息、风控校验与活动准入检查，再执行抽奖：获取抽奖配置聚合根、增加抽奖计数（`incrTryCount`）、选中奖池、选中奖品，最后经发奖服务（`AwardSendService`）发出奖品，并以奖品信息（`PrizeInfo`）返回结果。

## Relations

- has-part: [奖池](award-pool.md)
