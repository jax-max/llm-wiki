# 用户

> Type: Entity
> Aliases: C 端用户; User
> Sources: 美团技术团队（文彬、子维），2017-12-22
> Raw: [领域驱动设计在互联网业务开发中的实践](../../../../raw/meituan-tech/2026-09-18-ddd-in-practice.md)
> Updated: 2026-09-18

## Overview

抽奖平台的用户划分为运营和用户：运营对抽奖活动的配置十分复杂但相对低频；用户通过活动页面参与不同类型的抽奖活动，对这些配置的使用是高频次且无感知的。C 端还存在一些刷单行为，活动通过风控配置限制用户参与抽奖的频率。

用户参与抽奖时的场景信息由 `LotteryContext` / `DrawLotteryContext` 承带：包括 `getUserId`、`getLotteryId`、抽奖得分 `getGameScore`、经纬度 `getLat` / `getLng` 等；用户所在的城市信息（`MtCityInfo`）由防腐层 `UserCityInfoFacade` 以抽奖请求参数为入参，调用外部用户城市信息 RPC 服务（`LbsService`）换算得到。用户抽中奖品后，以用户领奖记录（`UserLotteryLog`）作为领奖凭据和存根。

## Relations

- related-to: [抽奖活动](lottery-activity.md)
- related-to: [奖品](award.md)
