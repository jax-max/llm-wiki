# 用户参与抽奖事件

> Type: Event
> Sources: 美团技术团队（文彬、子维），2017-12-22
> Raw: [领域驱动设计在互联网业务开发中的实践](../../../../raw/meituan-tech/2026-09-18-ddd-in-practice.md)
> Updated: 2026-10-15

## Overview

用户通过活动页面参与抽奖，是发生在用户与抽奖活动之间的业务行为。本页将原文描述的参与行为建模为事件类型，展示 Event 如何关联业务对象和所属工作流；不代表某次真实参与记录。

事件关注“用户参与抽奖”这一业务发生；登录校验、风险校验、活动准入、计数、选奖与发奖的步骤顺序见[用户参与抽奖](../workflows/user-participation.md)。原文未定义事件消息结构、发布时间或订阅者，本页不补充这些实现约定。

## Relations

- occurred-in: [用户](../entities/user.md)
- occurred-in: [抽奖活动](../entities/lottery-activity.md)
- occurred-in: [用户参与抽奖](../workflows/user-participation.md)
