# PRODUCT-CLOSURE-02 / LIABILITY-TRANSFER-FLOW

Date: 2026-10-11

## RESULT

**PASS — LIABILITY-TRANSFER-FLOW COMPLETE.**

借入和还款已成为 Wallet 负债账户上的明确操作。三种操作复用同一个 TransferDialog、同一个 TRANSFER API 和原有 signed Entry 账本。已关闭的账户归档、负债账户语义未重新设计。

## EXISTING TRANSFER PATH

审查了 Web Finance 的 Accounts、TransferDialog、页面查询/刷新组合、金额适配、流水列表/详情，以及 API route、Finance transfer workflow、FIN-01/02/03 和 i18n。

既有路径：`TransferDialog → POST /api/finance/transfers → createFinanceTransfer → TRANSFER header + source negative Entry + target positive Entry`。手续费仍是关联 EXPENSE。

此前，表单根据目标账户类型自动使用还款措辞，仅预览目标欠款；没有账户行借入/还款入口，预览未复用隐私遮罩，失败重试生成新 operationId。现在由用户明确选择操作意图，两个账户均显示当前/预计余额，同一未修改命令的重试复用 receipt。API 实现、schema、历史 migrations 均未为本切片修改。

## BORROWING FLOW

负债账户行点击「借入」，预选该 active CREDIT 为转出账户，转入账户仅允许 active CASH/BANK/PAYMENT。可切换账户及操作意图。

例：欠款 ¥3,200，借入 ¥500 → 资产增加 ¥500、欠款变为 ¥3,700。若 CREDIT 有预存，先减少预存再形成欠款，表单明确说明这点。保存后的余额来自原有 Finance 查询刷新。

## REPAYMENT FLOW

负债账户行点击「还款」，预选该 CREDIT 为转入账户，转出账户为 active asset。支持部分、等额及超额还款。

例：欠款 ¥3,200，还 ¥500 → 欠款 ¥2,700；还 ¥3,200 → 已结清；还 ¥3,300 → 预存 ¥100。没有添加余额不足或授信限额规则。

## GENERIC TRANSFER SEMANTICS

普通转账保留原有账户对，使用中性标题、保存按钮及余额预览。CREDIT→CREDIT 和预存提取不会被方向自动标记为还款/借入。

操作意图仅存在于表单；不进入请求 payload、Transaction 或任何新字段。历史列表/详情继续显示 TRANSFER、转出/转入账户、金额、发生时间及备注，不追溯推断经济意图。永久 Web 测试验证两种 CREDIT 边界历史的中性展示。

## CREDIT EDGE CASES

负数 CREDIT 是欠款，零是已结清，正数是预存。预存仍遵守既有资产语义；超额还款、向已结清/预存账户转入、预存提取及 CREDIT 间转账均保留。

## BALANCE PREVIEW

复用 Finance-owned `accountBalanceLabel` 与精确 decimal-to-cents / BigInt：转出账户减本金和手续费，转入账户加本金。没有浮点金额计算或新余额权威。空/无效金额不展示虚假的预计余额。页面隐藏金额偏好同时遮罩两个账户的预览，输入草稿仍可编辑。

## MONTHLY ANALYTICS

真实 MySQL 验证：借入/还本金不增加月收入或支出；信用卡购买后还款的 EXPENSE 在 Overview、Budget、Report 中只计一次；手续费单独贡献 EXPENSE。包括与 active excluded account 的转账，scoped Overview 沿用现有规则，不改变 inclusion preference。

## ACCOUNT ELIGIBILITY

只筛除 archived，不把 `includeInOverview=false` 当作禁用。借入/还款按显式意图筛选账户类型，普通转账保留既有选择。原选账户缺失、被归档或意图变更后不再匹配时，显示可恢复错误和空选择，禁止提交，等待用户修正，不偷偷替换账户。

原 API 的 ownership、CNY、正金额、同账户限制、receipt、version、原子事务与 rollback 继续生效。失败保留金额、备注及账户草稿，显示错误，允许重试；成功前不关闭表单或刷新为成功状态。

## TESTS

| Gate | Actual result |
| --- | --- |
| Focused Finance Web, 4 files | PASS — 70 tests |
| Full Web, 31 files | PASS — 276 tests |
| Real MySQL: new liability transfer + archived current state + FIN-01 + FIN-02 + both FIN-03 suites | PASS — 41 tests, 0 skipped |
| API test-source typecheck | PASS |
| API/Web typecheck | PASS |
| API/Web lint + i18n audit | PASS — missing/untranslated/visible Chinese all 0 |
| API/Web production build | PASS |
| Engineering architecture checker | PASS — 0 errors, 0 warnings |
| git diff --check | PASS |
| Real Chrome, public UI → isolated API → MySQL | PASS — 1440×1000 and 375×812 |

Permanent coverage maps to all requested A–L scenarios. New Web tests cover intent/defaults, settlement/overpay, neutral generic CREDIT pairs, invalid selections and correction, excluded eligibility, archived/missing selection on refetch, failure draft/receipt retry, exact large cents/fees and masking. Existing generic asset transfers remain covered. New API tests check signed Entries, balances, scoped totals, analytics, archive rejection without posting, and receipt replay; FIN-01/02/03 preserve ownership, validation, version/conflict, rollback and analytics regressions.

Browser acceptance performed six transfers through the actual public form: borrow, partial repayment, exact settlement, overpayment, generic prepaid withdrawal, generic CREDIT→CREDIT. SQL confirmed six headers, two balanced Entries each; every step retained zero monthly Income/Expense. Excluded active account selection, archived exclusion, privacy, neutral history, actual CSS viewport, no horizontal page/form overflow and visible 44px mobile action buttons were asserted. Screenshots were inspected after transitions settled.

Mobile defect found and fixed within TransferDialog: a fixed 16px footer negative margin disagreed with the existing 1rem form padding at the repository's 13px root font, creating 3px horizontal overflow. A transfer-specific mobile footer rule uses matching rem sizes and flex buttons. Shared modal/Button behavior was not modified. Regression risk is limited to transfer footer placement; real viewport assertions cover it.

Evidence:

- [Desktop borrow](WB-PRODUCT-CLOSURE-02-LIABILITY-TRANSFER-borrow-1440.png)
- [Mobile repayment](WB-PRODUCT-CLOSURE-02-LIABILITY-TRANSFER-repay-375.png)
- [Mobile prepaid preview](WB-PRODUCT-CLOSURE-02-LIABILITY-TRANSFER-prepaid-375.png)
- [Mobile privacy](WB-PRODUCT-CLOSURE-02-LIABILITY-TRANSFER-privacy-375.png)
- [Neutral transfer history](WB-PRODUCT-CLOSURE-02-LIABILITY-TRANSFER-history-1440.png)
- [Browser/API/SQL assertions](WB-PRODUCT-CLOSURE-02-LIABILITY-TRANSFER-browser.json)
- [Isolated environment cleanup](WB-PRODUCT-CLOSURE-02-LIABILITY-TRANSFER-cleanup.json)

### Commands

```sh
# Repository root
npm test -w apps/web -- src/features/finance/index.test.tsx src/features/finance/transfer-dialog.test.tsx src/features/finance/liability-accounts.test.tsx src/features/finance/fin03.test.tsx
npm test -w apps/web
npm run typecheck
npm run lint
npm run build
node /Users/lijingru/.codex/skills/engineering-architecture/scripts/architecture-check.mjs --root /Users/lijingru/Developer/workbench --json
git diff --check

# apps/api, isolated TEST_DATABASE_URL supplied
npx tsc -p tsconfig.test.json --noEmit
TZ=UTC npx tsx --test --test-concurrency=1 tests/finance-liability-transfer.test.ts tests/r3-fin01-core-ledger.test.ts tests/r3-fin02-transfer-refund-reversal.test.ts tests/r3-fin03-budget-recurring-reports.test.ts tests/r3-fin03-edge-cases.test.ts tests/finance-archived-current-state.test.ts

# Fresh isolated QA user/database/API/Web/Chrome; token supplied via environment
node scripts/liability-transfer-browser-evidence.mjs
```

Verification inspected Compose/test scripts, DB guards and previous local QA conventions, and probed local MySQL candidates 3306/3307/3407/3408/33307. No suitable instance was running; the established isolated native MySQL 8 convention provisioned 33307. The browser database applied all 42 migrations through V41; integration suites created/dropped their own disposable `_test` databases, with FIN-01/02 fresh/upgrade paths retained. Cleanup dropped the browser database and verified only MySQL system schemas remained, stopped temporary API/Web/Chrome/MySQL services, asserted all four service ports closed, and removed datadir, Chrome profile and QA token. Verification logs remain under `/tmp/workbench-liability-transfer-GQ90R7`.

## ARCHITECTURE CONFORMANCE

Engineering-architecture conformance reviewed: Web Finance owns UI intent, form drafts, eligibility, provisional previews and receipt retry lifecycle; FinancePage only composes the existing queries/dialog/actions. API Finance owns posting, signed Entries, balances, validation, analytics and Overview scope. No cross-feature internal access, global state, new dependency, Debt domain, write endpoint, table, subtype or balance truth was introduced. The interaction boundary is recorded in `docs/ARCHITECTURE.md`. Pre-existing unrelated workspace changes were preserved.

## REMAINING BLOCKERS

NONE.
