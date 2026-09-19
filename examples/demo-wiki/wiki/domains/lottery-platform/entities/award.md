# 奖品

> Type: Entity
> Aliases: Award
> Sources: 美团技术团队（文彬、子维），2017-12-22
> Raw: [领域驱动设计在互联网业务开发中的实践](../../../../raw/meituan-tech/2026-09-18-ddd-in-practice.md)
> Updated: 2026-09-18

## Overview

奖品是奖池配置的发放内容。奖品有自身的奖品配置，例如库存量、被抽中的概率、最多被一个用户抽中的次数等。工程上对应 `Award` 对象，贫血模型版本仅持有 `awardId` 与概率 `probability` 之类的数据字段，领域模型则要求其与行为一同封装。

奖品的类型包括优惠券、激活码、实物奖品等，由运营在抽奖活动中针对一个用户群体配置一批发放；抽奖上下文发券时会依赖外部的券码、平台券、外卖券上下文。

## Relations

- related-to: [库存](stock.md)
