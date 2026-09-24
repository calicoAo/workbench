# Personal Workbench 路线复审结论

日期：2026-09-21  
基于：R2D0 已完成、Finance PRD、vNext PRD / Functional Design / Development Plan / Architecture

## 结论

当前路线需要做三个关键调整：

1. **Finance 提升为下一主线。**
2. **内部 AI / Familiar 与外部 Agent Bridge 分离。**
3. **Growth 保留为英雄培养系统核心，但排在 Finance 之后；Pixel 资产可并行制作。**

## 为什么改

当前已经有：

- Task / Assignment / Timer / ActualTime
- Projects
- Quick Notes / Search / Trash
- Habits / Water / Sleep / Writing
- Settings / Category / Writing Slot / Today UX

也就是说，Workbench 已经能回答：

- 我做了什么
- 我为什么做
- 我花了多少时间
- 我有哪些重复行为
- 我写了什么

但还不能可靠回答：

- **我的钱发生了什么**

Finance 是剩余最大的核心 truth domain。相比之下，Growth / AI 都主要消费已有事实。因此先 Finance 可以减少后续 Review / AI 再补财务 Context 的返工。

## 当前路线

```text
R2D0.1 Writing Slot default correction
→ R3 Finance
→ R2D1 Hero Growth + Pixel Visual V1
→ R3.5A AI Foundation + Familiar
→ R3.5B Writing AI
→ R2D2 Period Reviews
→ R3.5C Decision / Psychological Bridge
→ R3.5D Project Copilot / Ask Workbench
→ R2E Import
→ R4 Agent Bridge
→ R5 Finance Projection / Agent Wallet
→ R6 Extensions
```

## 一个重要依赖修正

旧计划让 FIN-04 借用 B16b 通用 Import 的批次协议，这会在“Finance 先做”后形成不必要的反向依赖。

新版：

- Finance 自己拥有 `FinanceImportBatch`、source-row identity、preview、dedupe、reconcile。
- R2E 通用 Import 后续可以复用经验，但不提前造通用平台。
- 不建立 UniversalImport / UniversalItem。

## Writing Slot

目标产品决策：

- 新用户 Morning Writing OFF
- 新用户 Journal OFF
- 新用户 Stock Review OFF
- 用户在 Settings 显式选择
- 既有用户 preference 不迁移强改
- 关闭不删除历史、不影响 Search / Export / History

## AI

AI 不应该成为新的“万能大脑 owner”。

- Code / SQL：事实
- Jev：判断
- Cheap LLM：梳理/生成
- Reasoning LLM：复杂决策
- Familiar：presentation shell
- Domain owner：最终写入

因此普通 Daily Summary 不调用 AI；Journal / Morning Writing / Decision / Psychological Bridge 才是高价值模型场景。
