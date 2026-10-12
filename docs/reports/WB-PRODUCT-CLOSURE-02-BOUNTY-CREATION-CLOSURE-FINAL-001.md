# BOUNTY-CREATION-CLOSURE — Final Acceptance

## RESULT — PASS

**BOUNTY-CREATION-CLOSURE COMPLETE。** 2026-10-12，验收当前工作区。Category / Project Quick Manager 两个已完成切片保持关闭；没有生产代码、API、schema、UI 或架构契约变更。

本轮先核对永久测试、浏览器脚本及其 MySQL/截图证据，只强化两个现有测试文件中的组合旅程。基线 116 个已有 dirty/untracked 文件中，114 个保持相同 hash；另外两个仅为下述测试。没有启动下一里程碑。

## EVIDENCE ALREADY COVERED

- [Category implementation/verification](./WB-PRODUCT-CLOSURE-02-BOUNTY-CATEGORY-QUICK-MANAGER-001.md) 与 [browser evidence](./WB-PRODUCT-CLOSURE-02-BOUNTY-CATEGORY-browser.json)：从未完成悬赏草稿创建分类、选择 enabled custom dimension、精确映射持久化、草稿/焦点保留、发布及发布并接取；1440×1000 与 375×812 CSS viewport。
- [Project implementation/verification](./WB-PRODUCT-CLOSURE-02-BOUNTY-PROJECT-QUICK-MANAGER-001.md) 与 [browser evidence](./WB-PRODUCT-CLOSURE-02-BOUNTY-PROJECT-browser.json)：同一草稿先创建分类、再创建项目，canonical GET identity、最终 Task 双 FK、完整草稿、两种 assignment 行为、一次 Project POST、发布前 Task=0、单 portal/active dialog、父表单 mounted/inert、独立 sibling forms。
- 既有 Web 永久测试另外覆盖请求失败、确认写入后的读取重试不再 POST、pending 防重复提交、认证隔离、无关项目编辑不更换所选身份、Task 发布失败不撤销已保存的项目等。

这些浏览器证据已真实执行公共 UI/API 与 MySQL。此轮复用它们，没有重拍截图或把旧证据称作新浏览器执行。

## MISSING ASSERTIONS FOUND

已有组合 browser flow 的分类没有维度映射；另一个 Category browser flow 虽验证初始 custom key，但在最终发布前测试编辑将其清空。因此缺少同一完整草稿组合中“新分类映射持续存在，最终发布后仍可经 Growth canonical config 读取”的永久断言。

现有 Project API/Web 组合测试分别使用 unmapped Category / 已有 Category，无法直接保护这个组合缺口。补齐同一旅程，而非重复架构审计或修改已完成产品切片。

## ADDITIONAL TESTS

没有新增框架或测试套件，只强化以下现有测试：

- [API combined journey](../../apps/api/tests/bounty-project-quick-manager.test.ts)：创建 configured enabled custom dimension → 创建精确映射 Category → 创建并 GET 解析 Project → 发布/发布并接取。SQL 核对 Category.dimension_key、Task 双 FK/title/description/priority/difficulty/duration/progress/UTC deadline、精确 assignment 日期；发布前无 Task；同 operationId 重放返回同 Task；Category/Project 各一条、两个发布模式恰好两条 Task；每次发布后 GET `/api/growth/dimensions` 验证相同 Category ID/key 及 enabled definition。
- [Web same-draft journey](../../apps/web/src/features/tasks/create-project.test.tsx)：参数化两种发布，实际挂载 CreateTaskWorkflow 与 domain quick managers。在同一个未完成草稿先创建映射分类、再创建项目；验证两次 secondary save 不发布 Task、父草稿不丢失、精确所选身份、截止日/时间与 timezone、acceptDate、有且仅有一次各 domain POST 和一次 Task POST、user-scoped growth-config 中同一 key，以及 single-panel composition。

本轮执行结果：

| 检查 | 结果 |
| --- | --- |
| Real MySQL：Category 3 + Project 3 + R2A 8 | **14 PASS，0 failed，0 skipped** |
| Web：Tasks create-category/create-project、Categories、Projects、Growth、architecture | **6 files / 49 PASS** |
| API production + test source typecheck | **PASS** |
| Web typecheck + lint/i18n | **PASS**；missing/untranslated/visible Chinese 均 0 |
| Architecture checker | **0 errors / 0 warnings**；defaults-only |
| git diff --check | **PASS** |

MySQL 使用仓库既有 native 8.0.25 隔离约定，仅绑定 loopback 33307；先探测 3306/3307/3407/3408/33307，均关闭。临时 datadir 初始化，自建 disposable `_test` schema；全量 **42 migrations through V41**。首次组合执行时，两个自建 schema 的 quick-manager suites 通过，但 R2A 所需外部预迁移 schema 尚不存在；按其 established fixture contract 创建并迁移后，完整 14 tests 重跑通过。未调整 guard 或生产行为。

执行命令（API 工作目录 `apps/api`）：

```sh
TZ=UTC ../../node_modules/.bin/tsc -p tsconfig.test.json --noEmit
TEST_DATABASE_URL=mysql://root@127.0.0.1:33307/workbench_bounty_final_test \
  TZ=UTC ../../node_modules/.bin/tsx --test --test-concurrency=1 \
  tests/bounty-category-quick-manager.test.ts \
  tests/bounty-project-quick-manager.test.ts tests/r2a-projects.test.ts
```

[Permanent API execution log](./WB-PRODUCT-CLOSURE-02-BOUNTY-CREATION-FINAL-api-tests.log)；[verification and cleanup evidence](./WB-PRODUCT-CLOSURE-02-BOUNTY-CREATION-FINAL-evidence.json)。既有全 Web/typecheck/lint/build 验证从关闭切片报告复用；本轮仅测试断言变化，不声称重新执行全 Web/build 或 fresh browser acceptance。

## FINAL USER JOURNEY

| 步骤 | 证据与结论 |
| --- | --- |
| 1. 未完成草稿创建分类 | Web combined journey + 原 Category/Project browser flow |
| 2. 选择配置且 enabled 的维度 | Web 选择 custom key + API canonical configuration 验证 |
| 3. 分类与精确 key 持久化 | Real MySQL SQL，禁止固定枚举替代 custom key |
| 4. 同一草稿创建项目 | Web combined journey + 原 Project browser flow |
| 5. 解析规范项目身份 | Project public GET + Web confirmed selection；读取失败重试回归保持 |
| 6. 发布或发布并接取 | Web 参数化 + real API 两种模式；已有 desktop/mobile browser |
| 7. 最终 Task 精确 Category/Project ID | Web payload + MySQL 双 FK |
| 8. 原草稿与 assignment 行为 | Web 字段保留/payload；MySQL 全字段与 UTC deadline、0/1 assignment 与指定日期 |
| 9. Growth 映射仍可读取 | 发布后现有 GET `/api/growth/dimensions` 返回同一 ID/key；Web canonical cache 同步 |
| 10. 无重复创建/意外发布 | Web domain POST 各一次、secondary save Task=0、最终 Task POST=1；SQL 发布前=0、最终行数精确；Task command 重放幂等 |

完整同草稿旅程由新增的永久 Web 组合断言与真实 MySQL API/SQL 组合断言闭合；实际浏览器交互、viewport、键盘/面板证据复用已完成切片。此报告不声称旧 browser flow 本身曾选择映射维度。

## ARCHITECTURE CONFORMANCE

- **Categories**：Category draft、validation、POST/PUT、metadata/mapping、confirmed response/cache；Tasks 经 public capability 使用。
- **Projects**：Project draft、validation、POST/PUT、version、canonical receipt/detail resolution、retry/cache；Tasks 经 public capability 使用。
- **Tasks**：只拥有 Bounty draft、selected Category/Project IDs 与 `bounty | category | project` active-panel intent，最终 Task publication/claim。
- 两个 quick manager 复用已有一个 ModalPortal；inactive parent mounted/inert，forms 同级；没有 global store、另一套 modal/integration framework 或复制分类/项目信息真值。
- 与 `docs/ARCHITECTURE.md` 2026-10-11/12 ownership 决策相符；本轮无需更新耐久边界。已有 architecture tests 本轮通过。

## REMAINING BLOCKERS

**NONE。没有未完成的 mandatory verification。** 所有 disposable databases 已删除；关闭 MySQL 前只剩四个系统 schema；临时 MySQL 已停止、33307 已关闭、datadir 已删除。日志保留。

**Closure status：COMPLETE。** 停止于本次最终验收，不启动 Growth 或其他下一里程碑。
