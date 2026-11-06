# Wiki 核心逻辑质量审查

本次仅阅读 `wiki/domains/lottery-platform/` 下的 13 个 Markdown 页面，未读取 Raw，也未跟随来源链接。
审查了准入、风控、计数、奖池匹配、概率选奖、发奖响应、库存通用性、接口隔离及结果身份等核心场景。
测试集包含 26 道已批准场景、7 个变异；对应关系见 `cores.json`。
批准表示当前 Wiki 能支持预期答案，不表示已经通过真实模型执行。

## Q1：城市存在但无匹配奖池时，后续行为缺失

- 场景：用户有城市和得分，但没有支持该城市的奖池。
- 位置：`wiki/domains/lottery-platform/rules/award-selection.md:11-15`；`wiki/domains/lottery-platform/entities/lottery-activity.md:13`。
- 已知：城市存在按城市匹配，否则按得分匹配。
- 缺口：没有说明城市分支匹配失败后应报错、返回空还是采用其他处理。“否则按得分”限定的是缺少城市，不足以推出匹配失败后的策略。
- 影响：读者可能错误实现得分回退或默认奖池。
- 待澄清：补充城市分支无结果时的处理。当前不为该场景编写确定答案。

## Q2：风控失败的具体响应明确未定义

- 场景：用户通过登录校验，但风险校验失败，需要向调用方返回结果。
- 位置：`wiki/domains/lottery-platform/rules/participation-risk-control.md:15`；`wiki/domains/lottery-platform/workflows/user-participation.md:18`。
- 已知：两页明确说明未展示风险校验失败的具体处理。
- 类型：已声明的知识边界，不是跨页矛盾。
- 影响：无法从 Wiki 确定错误响应内容、错误码或异常约定。
- 待澄清：如果 Wiki 要指导完整流程实现，需要补充失败路径。`risk-failure-unknown` 只保护“尚未定义”这一边界，不测试虚构的错误码。

## Q3：选奖为空后，发奖调用的前置条件缺失

- 场景：概率选奖没有命中任何奖品，返回空结果。
- 位置：`wiki/domains/lottery-platform/rules/award-selection.md:15`；`wiki/domains/lottery-platform/workflows/user-participation.md:21-22`。
- 已知：选奖规则允许空结果；工作流接着描述选择奖品、调用 sendAward、转换响应。
- 缺口：没有说明空结果是否跳过发奖、是否作为失败响应，或由哪个步骤处理。
- 影响：读者可能把空奖品传入发奖服务，或擅自认定为成功。
- 待澄清：补充空结果分支与发奖前置条件。`selection-no-hit-empty` 仅测试已定义的空返回，不推断后续行为。

## 审查结论

当前审查范围内未发现必须二选一的直接规则冲突；上述三个核心场景存在未定义的决策信息。
已删除纯关系边和页面分类复述，拆分计数时机、发奖调用与响应转换等复合题。
未因页面没有独立测试或缺少无关实现细节而增加问题。测试执行通过也不自动关闭以上发现。
