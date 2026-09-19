# 奖池匹配与概率选奖

> Type: Rule
> Aliases: chooseAwardPool; randomGetAward
> Sources: 美团技术团队（文彬、子维），2017-12-22
> Raw: [领域驱动设计在互联网业务开发中的实践](../../../../raw/meituan-tech/2026-09-18-ddd-in-practice.md)
> Updated: 2026-09-18

## Overview

该机制先依据抽奖场景为用户匹配可发奖的奖池，再在奖池内按运营预先配置的概率选择奖品。场景携带城市信息时按城市匹配；否则按抽奖得分匹配。

## Rule

抽奖活动在多个奖池中选择与城市或得分相匹配的奖池。选定奖池后，累加其中各奖品的被抽中概率，生成随机数，并按累计概率区间命中一个奖品；没有命中时返回空结果。

## Relations

- governs: [奖池](../entities/award-pool.md)
- governs: [用户参与抽奖](../workflows/user-participation.md)
