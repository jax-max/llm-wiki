# 用户参与抽奖事件

> Type: Event
> Sources: 美团技术团队（文彬、子维），2017-12-22
> Raw: [领域驱动设计在互联网业务开发中的实践](../../../../raw/meituan-tech/2026-09-18-ddd-in-practice.md)
> Updated: 2026-09-18

## Overview

用户通过活动页面参与抽奖时发生此领域事件。该事件以用户、抽奖活动和抽奖场景为边界：应用服务依次校验登录、风控和活动准入，然后调用抽奖领域服务；抽奖服务读取活动聚合、增加尝试计数、选择奖池和奖品。

## Relations

- occurred-in: [抽奖活动](../entities/lottery-activity.md)
- occurred-in: [用户](../entities/user.md)
- related-to: [用户参与抽奖](../workflows/user-participation.md)
