# 奖品发放事件

> Type: Event
> Sources: 美团技术团队（文彬、子维），2017-12-22
> Raw: [领域驱动设计在互联网业务开发中的实践](../../../../raw/meituan-tech/2026-09-18-ddd-in-practice.md)
> Updated: 2026-10-15

## Overview

抽奖服务选中奖品后调用发奖服务，将选中的奖品发放给用户。本页将原文描述的发奖行为建模为事件类型，展示 Event 如何连接参与者、业务对象与工作流；不代表某次奖品已成功到账的真实记录。

`sendAward` 是发奖方法，`SendResult` 是抽奖结果输出，二者都不是事件名称的别名。发奖调用、发奖响应转换为抽奖响应，以及用户领奖记录作为领奖凭据和存根的说明，见[用户参与抽奖](../workflows/user-participation.md)。原文未定义独立事件消息、投递机制或消费方，也未给出具体发奖时间与凭据值。

## Relations

- occurred-in: [用户](../entities/user.md)
- occurred-in: [抽奖活动](../entities/lottery-activity.md)
- occurred-in: [奖品](../entities/award.md)
- occurred-in: [用户参与抽奖](../workflows/user-participation.md)
- related-to: [用户参与抽奖事件](lottery-participation.md)
