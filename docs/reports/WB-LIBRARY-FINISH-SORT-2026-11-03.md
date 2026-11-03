# Library 完成日期排序验收

任务：用户明确选择“仅想体验置顶；其他按完成日期倒序”。

- ROOT_CAUSE：原列表按录入时间倒序，尚未应用已确认的完成日期排序语义。
- FIX：Library API 是唯一排序 owner。WANT 单独置顶并按 createdAt/id 倒序；其余状态按 finishedOn 倒序、空日期在后，同日期按 createdAt/id 倒序。Web 继续展示服务端顺序及真实完成日期。不新增字段、迁移或前端排序副本。
- REGRESSION_RISK：状态、类型和关键词过滤后的顺序；同日/同秒记录；无完成日期的历史记录。均有真实 MySQL 回归覆盖。
- TESTS_RUN：vnext-11-14 真实 MySQL 集成 7/7 PASS；lint（API/Web 类型与 i18n）、API 测试类型检查、git diff --check PASS。真实公开 UI/API 浏览器验收 1440×1000 和 375×812 PASS，校验 WANT 置顶、其余日期倒序、日期可见、刷新顺序及无水平溢出。证据见同名 evidence 目录的 browser.json 与截图。
- REMAINING_BLOCKERS：NONE。隔离数据库与临时进程已清理。未提交、未部署；保留现有工作区改动。
