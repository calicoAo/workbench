# Personal Workbench AI + Hero System Roadmap

版本：v1.0 · 2026-09-21

关联：[PRD](PRD_VNEXT.md) · [功能设计](FUNCTIONAL_DESIGN_VNEXT.md) · [开发计划](DEVELOPMENT_PLAN_VNEXT.md) · [架构](ARCHITECTURE.md)

## 1. 产品定位

Personal Workbench 是“现实生活中的英雄培养系统”。

- 用户是正在成长的 Hero。
- Task / Project / Habit / Time / Finance / Writing 是现实事实。
- Growth 是“我因此积累了什么”的可追溯呈现。
- AI 是住在工作台里的 **指引魔法使 Familiar**：在需要理解、梳理、选择、反思时出现。
- Familiar 不替用户行动，也不拥有任何业务真值。

核心句：

> **Workbench 记录我实际做了什么；Familiar 帮我理解这些事情意味着什么，以及下一步可以怎么做。**

## 2. 架构边界

```text
Domain Truth
Task / Project / Habit / ActualTime / Writing / Finance
        ↓
Deterministic Query / Code
        ↓
Context Builder（最小必要）
        ↓
AI Gateway
  ├─ Jev typed decision
  ├─ Cheap generative LLM
  └─ Reasoning LLM
        ↓
AI Artifact
        ↓
用户确认
        ↓
Domain Public Capability
```

AI Gateway 不能直接写 Task / Journal / Finance 表。

## 3. 成本分层

| Tier | 技术 | 默认用途 |
| --- | --- | --- |
| Tier 0 | SQL / Code / Template | 统计、日期、金额、完成率、日报、规则判断 |
| Tier 1 | Jev | actionable 判断、分类、筛选、路由、是否升级 |
| Tier 2 | Cheap LLM | 晨写梳理、日记洞察、候选 Task、短解释 |
| Tier 3 | Reasoning LLM | 心理桥梁、复杂决策、深度复盘，用户主动 |

原则：

- 能确定性计算就绝不调用模型。
- Jev 不是日报生成器，不做算术、日期比较或财务计算。
- Weekly / monthly AI 只解释已算好的事实，不重新“猜”统计。
- 每个 feature 有独立预算、超限策略与降级路径。

## 4. AI Artifact

每次可复用 AI 结果保存为派生 artifact：

```text
artifactType
sourceRefs[]
sourceVersions[]
generatedAt
provider
model
promptVersion
inputTokens
outputTokens
estimatedCost
result
stale
```

源记录修改后 artifact 标 stale；不静默覆盖原结果。

## 5. Familiar

Familiar 是 AI 的统一 presentation shell。

第一版本地状态：

- IDLE / 待机
- THINKING / 思考
- WRITING / 书写
- WAITING / 倾听
- CELEBRATING / 庆祝
- SLEEPING / 睡觉

这些动画状态由本地事件驱动，不调用 AI。

UI 形态：

1. Inline Familiar：当前功能旁的小提示。
2. Familiar Panel：心理桥梁、决策、Ask Workbench 等连续交互。
3. AI Artifact Card：可保存、重生、删除、查看来源的洞察卡。

## 6. 第一阶段功能

### 6.1 Morning Writing Guide

输入：当前晨写 + 今日确定性事实（可选）。

输出：

- 我今天主要在想什么
- 今天值得关注什么
- 可行动候选
- 暂时不用解决的事

候选 Task 必须确认。

### 6.2 Journal Insight

模式：

- 这篇里我反复在想什么
- 和最近 7/30 天有什么联系
- 最近发生了什么变化
- 我可能忽略了什么

要求：

- 明确来源记录
- 不做人格式诊断
- 数字对比由 code 提供

### 6.3 Text → Task

Jev 可先判断：

- actionable?
- one / multiple?
- suggested category
- urgency
- need LLM?

Cheap LLM 只生成候选 title / description / split。

### 6.4 Psychological Bridge

目标：

```text
混杂感受
→ 事实
→ 担忧
→ 冲突
→ 真正问题
→ 可处理下一步
```

不是聊天机器人式泛泛安慰，也不自动把情绪变 Task。

### 6.5 Decision Assistant

```text
原始问题
→ 重构问题
→ 补充缺失信息
→ A / B / C
→ criteria
→ Jev/code scoring
→ LLM trade-off
→ premortem
→ 用户决定
→ Decision Log
```

AI 不替用户做最终选择。

## 7. 后续功能

### Weekly / Monthly Review AI

事实层免费、确定性生成；AI 只回答“这些事实意味着什么”。

### Project Copilot

- 做到哪里
- 卡在哪里
- 下一步
- 长期未动但重要的 Task

### Ask My Workbench

自然语言问题 → query planner → deterministic queries / semantic retrieval → explanation。

### Stuck Insight

Code 先找 carryover / repeated starts / no progress / approaching deadline 等候选，再由 Jev/LLM 判断是否值得提醒。

## 8. Pixel Fantasy Skin

视觉原则：

> Modern Productivity Core + Pixel Fantasy Skin

像素化：

- Familiar
- Hero
- Nav / Category / Growth / AI icon
- Badge / Achievement
- Progress
- Empty State
- Decor

保持现代：

- Editor
- Search
- Date/Time picker
- 表单
- 长文本
- Data table

资产制作可从现在开始，并与 Finance 并行；代码集成先在 Hero Growth / Familiar 中落地。

## 9. 发布路线

```text
R3 Finance complete
→ Hero Growth + Pixel Visual V1
→ AI Foundation + Familiar
→ Morning Writing / Journal / Text→Task
→ Period Reviews + optional AI
→ Decision / Psychological Bridge
→ Project Copilot / Ask Workbench / Stuck Insight
```

AI 不作为 Finance 或 Growth 的前置依赖。
