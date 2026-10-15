# 抽奖活动生命周期（教学设定）

> Type: StateMachine
> Sources: 本仓库教学设定，2026-10-15
> Raw: [抽奖活动生命周期教学设定](../../../../raw/demo-spec/2026-10-15-lottery-lifecycle.md)
> Updated: 2026-10-15

## Overview

本页依据补充的虚构教学规格，演示单个[抽奖活动](../entities/lottery-activity.md)的生命周期，不代表美团原文或实际系统的实现。初始状态为未开始，配置要求开始时间早于结束时间。

StateMachine 关注同一活动处于什么状态、何时迁移；[用户参与抽奖](../workflows/user-participation.md) Workflow 关注多个对象如何协作。进行中仅表示进入活动时间窗口，不保证用户通过活动准入或其他参与检查。本设定不包含暂停、取消、重新开启或修改活动时间。

## States

| State | Meaning |
|---|---|
| 未开始 | 活动已创建，尚未进入可参与的时间窗口；初始状态。 |
| 进行中 | 活动已进入时间窗口，可以继续执行活动准入及其他参与检查。 |
| 已结束 | 活动时间窗口已经关闭；终态。 |

## Transitions

| From | Trigger | Guard | To |
|---|---|---|---|
| 未开始 | 时间检查 | 当前时间达到开始时间且早于结束时间 | 进行中 |
| 进行中 | 时间检查 | 当前时间达到或超过结束时间 | 已结束 |
| 未开始 | 时间检查 | 当前时间达到或超过结束时间，已错过整个窗口 | 已结束 |

## Relations

- state-machine-of: [抽奖活动](../entities/lottery-activity.md)
