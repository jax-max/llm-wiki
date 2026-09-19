# llm-wiki

简体中文 | [English](README.md)

一套可复用的 Agent Skills，用于构建可溯源、面向工作流的研究 wiki。
模型把不可变的原始来源编译为相互链接的 Entity（实体）、Workflow（工作流）、
Rule（规则）、StateMachine（状态机）、Event（事件）页面，让知识持续复利，
而不是每次查询都被重新发现。

## 为什么不用朴素 RAG？

朴素 RAG（切块 + embedding + 相似度检索）回答的是"什么像"，而不是"什么对"。
本项目把检索问题改写为编译问题：来源被一次性提炼为有类型、相互链接、可评审的页面。

| 朴素 RAG 的缺点 | 本项目的应对 |
|---|---|
| 只懂"像不像"，不懂"对不对"：语义相近的内容可能是旧版本、草稿或例外规则。 | `raw/` 是不可变证据；linter 校验每个数字、ISO 日期、引文都逐字出现在所链接的 Raw 文件中。 |
| 切块会切断上下文：条件、定义、表格、前后条款被拆开，答案容易断章取义。 | 知识以完整的类型化页面组织而非切片，条件与定义整页保留。 |
| 不理解实体和关系：很难稳定回答跨文档、多跳问题，例如"客户—合同—产品—政策"的关联。 | 五种页面类型 + schema 签名的关系；查询沿 `## Relations` 链接扩展。 |
| 术语与同名问题严重：一个词多义、一个实体多名称时，召回容易混乱。 | 每个 Entity 归属唯一主领域、携带 `Aliases` 别名，以链接复用而非复制。 |
| 无法天然处理时间、权限、版本和优先级：例如"当前有效的制度""仅限本部门可见"。 | 部分支持、如实声明：ISO 日期必须逐字一致，Event 页面记录带时间的业务发生；时间有效性与访问控制超出本 MVP 范围。 |
| 难解释、难治理：通常只能给出若干文本片段，难明确证明答案依据、数据来源和冲突如何裁决。 | 每个承重事实都链接回 `raw/`；`wiki/log.md` 记录处置与 Coverage 覆盖表；lint 强制执行两者。 |
| 维护靠调参：chunk 大小、重叠、embedding、top-k、rerank 都要反复试，业务语义却没有被显式沉淀。 | 业务语义显式沉淀为可评审的 Markdown（schema + 页面），而非检索器超参数。 |

权衡：在摄取时付出编译成本，换取查询时的确定性。

## 知识模型

```text
project/
├── raw/                         # 不可变的原始来源
└── wiki/
    ├── schema.md                # 页面类型、元数据、关系动词
    ├── index.md
    ├── log.md
    └── domains/                 # 领域命名空间
        └── machine-learning/    # 一个具体领域
            ├── overview.md
            ├── entities/
            ├── workflows/
            ├── rules/
            ├── state-machines/
            └── events/
```

`domains/` 是领域集合；`machine-learning/` 是一个具体的边界知识域。每个
Entity 归属一个主领域，其他领域通过链接引用而非复制。仅当现有领域无法承载
该知识时才新建领域。领域的 overview 拥有
该业务对象的定义与边界。Workflow 描述跨实体协作；Rule 描述决策、机制、
策略与算法；StateMachine 描述实体生命周期；Event 描述有业务意义的领域事件
（当来源提供时间与上下文时，可细化为具体实例）。

每个类型化页面声明 `Type`、`Raw` 原文链接与 `Updated` 编译日期，三者必填。
`Domain` 由路径推导；`Aliases`、`Sources` 可选。`Type` 是唯一的结构化分类。
承重事实始终可追溯到 `raw/` 下的不可变文件。

生命周期：`wiki-init` 创建 wiki，`wiki-ingest` 编译来源，`wiki-query` 回答，
`wiki-lint` 检查。

## Skills

| Skill | 用途 |
|---|---|
| `wiki-init` | 创建空的面向工作流的 wiki 与 schema。 |
| `wiki-ingest` | 添加来源并编译 Entity、Workflow、Rule、StateMachine 或 Event 页面。 |
| `wiki-query` | 只读地从本地 wiki 回答问题。 |
| `wiki-lint` | 检查证据、schema、普通链接与关系结构。 |

- `wiki-init` 幂等，且拒绝改动没有 `schema.md` 的已有 `wiki/`。
- `wiki-ingest` 先把原文完整存入 `raw/` 并在其 log 条目记录文件 SHA-256，规划候选矩阵（对每种页面类型给出 Added / Updated / Reused / N-A 处置，每个 N/A 都要有可溯源的理由），再编译页面——页面中每个精确数字、日期、引文都必须逐字出现在所链接的 Raw 文件中，且每次创建或重编译的页面都盖当日的 `Updated` 日期。没有增量知识的来源只保留 Raw 并记录 `Disposition: No material`。面对链接清单或多个文件时走批量摄入：先保存全部 raw，再逐个顺序编译，绝不并行。
- `wiki-query` 只读：搜索 `wiki/domains/`，沿 Relations 扩展（Inverse 仅作查询时遍历提示，不写镜像边），区分可溯源事实与综合推断，并报告证据缺口。
- `wiki-lint` 运行证据与 schema 两个检查器，向 `wiki/log.md` 追加一条结果；`--strict` 下发现问题即非零退出，供 CI 使用。它还会重算每个 raw 文件的 SHA-256 并与摄入时记录的摘要比对，标记被改动过的证据；并以摘要锚定的摄入日期校验页面 `Updated`，标记落后于其证据最新摄入的页面。自动修复仅限无歧义的链接与索引修复。

`skills/` 下是五个自包含 skill。其中 `skills/llm-wiki/` 是导航器，负责路由
到其余四个；把 `skills/*` 复制进 skills 目录即装上整套（见快速开始）。

## 示例：demo-wiki

`examples/demo-wiki/` 把一篇完整的中文文章——美团技术博客《领域驱动设计在
互联网业务开发中的实践》——编译为 `lottery-platform` 领域：5 个 Entity、
1 个 Workflow、4 个 Rule、2 个 Event 页面，全部收录在 `wiki/index.md`。
它的 `state-machines/` 目录刻意留空，因为原文没有给出可独立验证的生命周期
状态迁移——这正是"N/A 处置必须给出诚实理由"的活示范。

示例原文即中文，你可以打开任意页面，与 `raw/` 原文逐条对照验证"逐字一致"校验。

```bash
# 对示例运行只读检查。
# （不要对示例跑 lint_wiki.py——它会向示例 log.md 追加记录。）
python3 skills/wiki-lint/scripts/check_evidence.py examples/demo-wiki --strict
python3 skills/wiki-lint/scripts/check_schema.py examples/demo-wiki --strict
```

## 快速开始

### 安装 skills

skill 只被发现于一层深度（`skills/<name>/SKILL.md`），因此要复制的是
`skills/` 的内容——而不是整个仓库——放进 skills 目录。

```bash
git clone https://github.com/jax-max/llm-wiki
mkdir -p ~/.claude/skills && cp -R llm-wiki/skills/* ~/.claude/skills/    # 个人级
# 或安装到某个项目：
mkdir -p <your-project>/.claude/skills && cp -R llm-wiki/skills/* <your-project>/.claude/skills/
```

想通过 `git pull` 持续更新？可以用 symlink 逐个链接 skill，skills 目录
官方支持符号链接：

```bash
for s in "$(pwd)"/llm-wiki/skills/*; do ln -s "$s" ~/.claude/skills/; done
```

带脚本的 skill（`wiki-init`、`wiki-lint`）要求 PATH 上有 Python 3.8+ ——
仅标准库，无需 pip 安装任何依赖。macOS 与 Linux 均预装。Windows 原生
环境需从 python.org 安装 Python，或执行 `winget install Python.Python.3.12`，
并用 `python` 或 `py -3` 代替 `python3`（或直接使用 WSL）。Claude Code 在
Windows 原生的 shell 经由 Git for Windows 运行，其 bash 环境自带
`sha256sum`，可供摄取时计算哈希。

### 使用

然后在支持 skill 的 agent（如 Claude Code）中用自然语言驱动：

- "在这个项目里建一个 wiki" —— `wiki-init` 完成脚手架。
- "把这篇文章摄取进 wiki：<url>" —— `wiki-ingest` 把来源编译为类型化页面。
- "wiki 里对……了解多少？" —— `wiki-query` 只从本地 wiki 回答。
- "检查一下 wiki" —— `wiki-lint` 校验证据与结构。

### 无 agent 直接使用

脚本也可以在本仓库克隆中直接运行：

```bash
# 1. 在你的项目中创建空 wiki
python3 skills/wiki-init/scripts/initialize_wiki.py /path/to/your-project

# 2. 健康检查你的 wiki（会向其 log.md 追加一条 lint 记录）
python3 skills/wiki-lint/scripts/lint_wiki.py /path/to/your-project --strict
```

## 设计边界（Ontology MVP）

`wiki/schema.md` 刻意保持小而可执行：包含页面类型、必填元数据和关系签名表。
linter 校验 Type 与目录兼容性、关系主客体类型兼容性、专用页面结构、链接和
证据。Inverse 名称是查询时的遍历提示，不重复建边。

这不是 RDF/OWL，也不是图数据库。用 `Event` 页面记录有意义的业务发生；当一个
断言需要时间、参与者或其他上下文时，再细化为具体实例。普通关系是持久的、
无限定的。每次新的摄取都在 `wiki/log.md` 记录
一张页面类型覆盖矩阵；schema lint 校验其链接、处置和 Raw 页面覆盖。任一
检查器都可加 `--strict`，让问题导致 CI 失败。

本 MVP 刻意不建模版本、权限与时间有效性（见上表第 5 行）。

## 开发

```bash
python3 -m unittest discover -s tests -v
```

两套测试分别覆盖证据检查器与本体工具。项目仅使用 Python 标准库，零第三方
依赖。

## 致谢

受 [Karpathy 的 LLM Wiki 构想](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)启发：

> "The LLM writes and maintains the wiki; the human reads and asks questions."

本项目是那一工作流的非官方社区实现。

## 许可证

[MIT](LICENSE)
