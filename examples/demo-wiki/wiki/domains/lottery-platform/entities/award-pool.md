# 奖池

> Type: Entity
> Aliases: AwardPool
> Sources: 美团技术团队（文彬、子维），2017-12-22
> Raw: [领域驱动设计在互联网业务开发中的实践](../../../../raw/meituan-tech/2026-09-18-ddd-in-practice.md)
> Updated: 2026-09-18

## Overview

奖池是抽奖活动与奖品之间的配置单元：一个奖池针对一个特定的用户群体（`UserGroup`）设置多个奖品。用户群体有多种区别方式，如按照用户所在城市区分、按照新老客区分。工程上奖池被建模为 `AwardPool`，字段包括奖池支持的城市 `cityIds`、奖池支持的得分 `scores`、奖池匹配的用户类型 `userGroupType`，以及奖池中包含的奖品列表。

奖池承担按概率选奖的领域行为：奖池里配置多个奖项，各奖项的被抽中概率由运营预先配置；`matchedCity` 判断当前奖池是否与城市匹配，`matchedScore` 判断是否与用户得分匹配；`randomGetAward` 累加奖池内各奖品的被抽中概率，生成随机数并按累计概率区间命中一个奖品返回。在领域模型的开发方式下，使用概率选择对应的奖品这一逻辑内聚在奖池对象内，而非写在服务层。

## Relations

- has-part: [奖品](award.md)
