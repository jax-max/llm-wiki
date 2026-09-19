# 活动准入

> Type: Rule
> Aliases: LotteryCondition; checkLotteryCondition
> Sources: 美团技术团队（文彬、子维），2017-12-22
> Raw: [领域驱动设计在互联网业务开发中的实践](../../../../raw/meituan-tech/2026-09-18-ddd-in-practice.md)
> Updated: 2026-09-18

## Overview

活动准入上下文集中管理用户参与抽奖活动的限制条件，并在用户参与抽奖流程中于实际抽奖前执行检查。

## Rule

抽奖活动的开始和结束时间、用户可参与抽奖的次数等限制条件统一由活动准入管理；只有通过活动准入检查后，用户才进入后续抽奖步骤。

## Relations

- governs: [抽奖活动](../entities/lottery-activity.md)
- governs: [用户参与抽奖](../workflows/user-participation.md)
