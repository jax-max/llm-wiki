# 奖品发放事件

> Type: Event
> Aliases: sendAward; SendResult
> Sources: 美团技术团队（文彬、子维），2017-12-22
> Raw: [领域驱动设计在互联网业务开发中的实践](../../../../raw/meituan-tech/2026-09-18-ddd-in-practice.md)
> Updated: 2026-09-18

## Overview

抽奖服务在选中奖品后调用发奖服务，形成奖品发放这一领域事件；服务将发奖响应构造成抽奖结果，用户领奖记录作为领奖凭据和存根。

## Relations

- occurred-in: [抽奖活动](../entities/lottery-activity.md)
- occurred-in: [用户](../entities/user.md)
- occurred-in: [奖品](../entities/award.md)
- related-to: [用户参与抽奖事件](lottery-participation.md)
