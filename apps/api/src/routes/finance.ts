import { Hono } from "hono";
import { z } from "zod";
import { getCurrentUserId } from "../auth.js";
import { archiveFinanceAccount, correctFinanceTransaction, createFinanceAccount, createFinanceCategory, createFinanceRecurringTemplate, createFinanceTransaction, createFinanceTransfer, deleteFinanceBudget, financeAccountsForUser, financeBudgetsForUser, financeCategoriesForUser, financeOverviewForUser, financeRecurringOccurrencesForUser, financeRecurringTemplatesForUser, financeReportsForUser, financeTransactionForUser, financeTransactionsForUser, initializeFinance, postFinanceRecurringOccurrence, prepareFinanceRecurringOccurrences, refundFinanceTransaction, skipFinanceRecurringOccurrence, updateFinanceAccount, updateFinanceCategory, updateFinanceRecurringTemplate, updateFinanceTransactionNote, upsertFinanceBudget, voidFinanceTransaction } from "../finance.js";
import { ok } from "../http.js";
import { confirmExternalImport, confirmFinanceRestore, externalCsvPreview, exportFinanceBackup, exportFinanceCsv, financeReconciliation, getImportBatch, previewFinanceRestore, updateImportRow } from "../finance-maintenance.js";

const operationId = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/);
const cents = z.string().regex(/^-?(0|[1-9]\d*)$/);
const positiveCents = z.string().regex(/^[1-9]\d*$/);
const accountType = z.enum(["CASH", "BANK", "PAYMENT", "CREDIT"]);
const categoryKind = z.enum(["INCOME", "EXPENSE"]);
const transactionType = z.enum(["OPENING", "INCOME", "EXPENSE", "TRANSFER", "REFUND", "REVERSAL", "CORRECTION"]);

const accountCreate = z.object({ operationId, name: z.string().trim().min(1).max(120), type: accountType, currency: z.literal("CNY").default("CNY"), openingDate: date, openingBalanceCents: cents.default("0"), includeInOverview: z.boolean().default(true) });
const accountUpdate = z.object({ expectedVersion: z.number().int().positive(), name: z.string().trim().min(1).max(120).optional(), includeInOverview: z.boolean().optional(), archived: z.boolean().optional() }).refine((value) => value.name !== undefined || value.includeInOverview !== undefined || value.archived !== undefined, { message: "at least one editable field is required" });
const categoryCreate = z.object({ kind: categoryKind, name: z.string().trim().min(1).max(64), sortOrder: z.number().int().min(0).max(10000) });
const categoryUpdate = z.object({ expectedVersion: z.number().int().positive(), name: z.string().trim().min(1).max(64).optional(), sortOrder: z.number().int().min(0).max(10000).optional(), enabled: z.boolean().optional() }).refine((value) => value.name !== undefined || value.sortOrder !== undefined || value.enabled !== undefined, { message: "at least one editable field is required" });
const record = z.object({ operationId, accountId: z.number().int().positive(), categoryId: z.number().int().positive(), amountCents: positiveCents, occurredDate: date, occurredTime: time, note: z.string().max(500).nullable().optional() });
const transfer = z.object({ operationId, sourceAccountId: z.number().int().positive(), targetAccountId: z.number().int().positive(), amountCents: positiveCents, feeAmountCents: positiveCents.optional(), feeCategoryId: z.number().int().positive().optional(), occurredDate: date, occurredTime: time, note: z.string().max(500).nullable().optional() });
const refund = z.object({ operationId, expectedVersion: z.number().int().positive(), amountCents: positiveCents, accountId: z.number().int().positive().optional(), occurredDate: date, occurredTime: time, note: z.string().max(500).nullable().optional() });
const correction = z.object({ operationId, expectedVersion: z.number().int().positive(), amountCents: positiveCents, accountId: z.number().int().positive().optional(), categoryId: z.number().int().positive().optional(), occurredDate: date, occurredTime: time, note: z.string().max(500).nullable().optional() });
const voidCommand = z.object({ operationId, expectedVersion: z.number().int().positive(), occurredDate: date.optional(), occurredTime: time.optional(), note: z.string().max(500).nullable().optional() });
const budget = z.object({ operationId, budgetMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), categoryId: z.number().int().positive().nullable().optional(), limitCents: cents, expectedVersion: z.number().int().positive().optional() });
const recurringTemplate = z.object({ operationId, type: z.enum(["INCOME", "EXPENSE"]), name: z.string().trim().min(1).max(120), amountCents: positiveCents, accountId: z.number().int().positive(), categoryId: z.number().int().positive(), frequency: z.enum(["MONTHLY", "WEEKLY"]), scheduleValue: z.number().int().min(0).max(31), startDate: date, endDate: date.nullable().optional() });
const recurringTemplateUpdate = z.object({ operationId, expectedVersion: z.number().int().positive(), name: z.string().trim().min(1).max(120).optional(), enabled: z.boolean().optional(), amountCents: positiveCents.optional(), accountId: z.number().int().positive().optional(), categoryId: z.number().int().positive().optional(), frequency: z.enum(["MONTHLY", "WEEKLY"]).optional(), scheduleValue: z.number().int().min(0).max(31).optional(), startDate: date.optional(), endDate: date.nullable().optional() }).refine((value) => Object.keys(value).some((key) => !["operationId", "expectedVersion"].includes(key)), { message: "at least one editable field is required" });
const importMapping = z.object({ date: z.string().min(1), time: z.string().optional(), amount: z.string().optional(), direction: z.string().optional(), debit: z.string().optional(), credit: z.string().optional(), account: z.string().optional(), category: z.string().optional(), note: z.string().optional(), externalId: z.string().optional(), currency: z.string().optional() });
const externalPreview = z.object({ operationId, sourceName: z.string().trim().min(1).max(255), csv: z.string().min(1), mapping: importMapping, timezone: z.string().trim().min(1).max(64) });
const importConfirm = z.object({ operationId, rowIds: z.array(z.number().int().positive()).optional(), allowPossibleDuplicates: z.boolean().default(false) });
const importRowUpdate = z.object({ accountId: z.number().int().positive().optional(), categoryId: z.number().int().positive().optional(), date: date.optional(), time: time.optional(), amountCents: z.string().regex(/^-?[1-9]\d*$/).optional(), kind: z.enum(["INCOME", "EXPENSE"]).optional(), note: z.string().max(500).nullable().optional() }).refine((value) => Object.keys(value).length > 0, { message: "at least one correction is required" });
const restoreConfirm = z.object({ operationId, backup: z.unknown() });

export const financeRoute = new Hono()
  .post("/initialize", async (c) => ok(c, await initializeFinance({ userId: getCurrentUserId(c), ...z.object({ operationId }).parse(await c.req.json()) })))
  .get("/overview", async (c) => ok(c, await financeOverviewForUser(getCurrentUserId(c), z.string().regex(/^\d{4}-\d{2}$/).optional().parse(c.req.query("month")))))
  .get("/budgets", async (c) => ok(c, await financeBudgetsForUser(getCurrentUserId(c), z.string().regex(/^\d{4}-\d{2}$/).parse(c.req.query("month")))))
  .post("/budgets", async (c) => ok(c, await upsertFinanceBudget({ userId: getCurrentUserId(c), ...budget.parse(await c.req.json()) })))
  .delete("/budgets/:id", async (c) => { const body = z.object({ operationId, expectedVersion: z.number().int().positive() }).parse(await c.req.json()); return ok(c, await deleteFinanceBudget({ userId: getCurrentUserId(c), id: z.coerce.number().int().positive().parse(c.req.param("id")), ...body })); })
  .get("/reports", async (c) => ok(c, await financeReportsForUser(getCurrentUserId(c), z.string().regex(/^\d{4}-\d{2}$/).parse(c.req.query("month")))))
  .get("/recurring-templates", async (c) => ok(c, await financeRecurringTemplatesForUser(getCurrentUserId(c))))
  .post("/recurring-templates", async (c) => ok(c, await createFinanceRecurringTemplate({ userId: getCurrentUserId(c), ...recurringTemplate.parse(await c.req.json()) })))
  .put("/recurring-templates/:id", async (c) => { const body = recurringTemplateUpdate.parse(await c.req.json()); return ok(c, await updateFinanceRecurringTemplate({ userId: getCurrentUserId(c), id: z.coerce.number().int().positive().parse(c.req.param("id")), ...body })); })
  .get("/recurring-occurrences", async (c) => { const query = z.object({ from: date.optional(), to: date.optional() }).parse(c.req.query()); return ok(c, await financeRecurringOccurrencesForUser(getCurrentUserId(c), query.from, query.to)); })
  .post("/recurring-occurrences/prepare", async (c) => ok(c, await prepareFinanceRecurringOccurrences({ userId: getCurrentUserId(c), ...z.object({ operationId, from: date, to: date }).parse(await c.req.json()) })))
  .post("/recurring-occurrences/:id/confirm", async (c) => { const body = z.object({ operationId, expectedVersion: z.number().int().positive(), occurredTime: time.optional() }).parse(await c.req.json()); return ok(c, await postFinanceRecurringOccurrence({ userId: getCurrentUserId(c), id: z.coerce.number().int().positive().parse(c.req.param("id")), ...body })); })
  .post("/recurring-occurrences/:id/skip", async (c) => { const body = z.object({ operationId, expectedVersion: z.number().int().positive() }).parse(await c.req.json()); return ok(c, await skipFinanceRecurringOccurrence({ userId: getCurrentUserId(c), id: z.coerce.number().int().positive().parse(c.req.param("id")), ...body })); })
  .get("/accounts", async (c) => ok(c, await financeAccountsForUser(getCurrentUserId(c), z.enum(["active", "archived", "all"]).default("active").parse(c.req.query("view")))))
  .post("/accounts", async (c) => { const body = accountCreate.parse(await c.req.json()); return ok(c, await createFinanceAccount({ userId: getCurrentUserId(c), ...body })); })
  .put("/accounts/:id", async (c) => { const body = accountUpdate.parse(await c.req.json()); return ok(c, await updateFinanceAccount({ userId: getCurrentUserId(c), accountId: z.coerce.number().int().positive().parse(c.req.param("id")), ...body })); })
  .post("/accounts/:id/archive", async (c) => { const body = z.object({ operationId, expectedVersion: z.number().int().positive() }).parse(await c.req.json()); return ok(c, await archiveFinanceAccount({ userId: getCurrentUserId(c), accountId: z.coerce.number().int().positive().parse(c.req.param("id")), archived: true, expectedVersion: body.expectedVersion, operationId: body.operationId })); })
  .post("/accounts/:id/unarchive", async (c) => { const body = z.object({ operationId, expectedVersion: z.number().int().positive() }).parse(await c.req.json()); return ok(c, await archiveFinanceAccount({ userId: getCurrentUserId(c), accountId: z.coerce.number().int().positive().parse(c.req.param("id")), archived: false, expectedVersion: body.expectedVersion, operationId: body.operationId })); })
  .get("/categories", async (c) => ok(c, await financeCategoriesForUser(getCurrentUserId(c))))
  .post("/categories", async (c) => ok(c, await createFinanceCategory({ userId: getCurrentUserId(c), ...categoryCreate.parse(await c.req.json()) })))
  .put("/categories/:id", async (c) => { const body = categoryUpdate.parse(await c.req.json()); return ok(c, await updateFinanceCategory({ userId: getCurrentUserId(c), categoryId: z.coerce.number().int().positive().parse(c.req.param("id")), ...body })); })
  .get("/transactions", async (c) => {
    const query = z.object({ from: date.optional(), to: date.optional(), accountId: z.coerce.number().int().positive().optional(), categoryId: z.coerce.number().int().positive().optional(), type: transactionType.optional(), keyword: z.string().trim().max(100).optional(), cursor: z.coerce.number().int().positive().optional(), limit: z.coerce.number().int().min(1).max(100).default(30) }).parse(c.req.query());
    return ok(c, await financeTransactionsForUser(getCurrentUserId(c), query));
  })
  .get("/transactions/:id", async (c) => ok(c, await financeTransactionForUser(getCurrentUserId(c), z.coerce.number().int().positive().parse(c.req.param("id")))))
  .put("/transactions/:id", async (c) => { const body = z.object({ expectedVersion: z.number().int().positive(), note: z.string().max(500).nullable() }).parse(await c.req.json()); return ok(c, await updateFinanceTransactionNote({ userId: getCurrentUserId(c), transactionId: z.coerce.number().int().positive().parse(c.req.param("id")), ...body })); })
  .post("/income", async (c) => ok(c, await createFinanceTransaction({ userId: getCurrentUserId(c), type: "INCOME", ...record.parse(await c.req.json()) })))
  .post("/expenses", async (c) => ok(c, await createFinanceTransaction({ userId: getCurrentUserId(c), type: "EXPENSE", ...record.parse(await c.req.json()) })))
  .post("/transfers", async (c) => ok(c, await createFinanceTransfer({ userId: getCurrentUserId(c), ...transfer.parse(await c.req.json()) })))
  .post("/transactions/:id/refunds", async (c) => ok(c, await refundFinanceTransaction({ userId: getCurrentUserId(c), transactionId: z.coerce.number().int().positive().parse(c.req.param("id")), ...refund.parse(await c.req.json()) })))
  .post("/transactions/:id/correct", async (c) => ok(c, await correctFinanceTransaction({ userId: getCurrentUserId(c), transactionId: z.coerce.number().int().positive().parse(c.req.param("id")), ...correction.parse(await c.req.json()) })))
  .post("/transactions/:id/void", async (c) => { const body = voidCommand.parse(await c.req.json()); return ok(c, await voidFinanceTransaction({ userId: getCurrentUserId(c), transactionId: z.coerce.number().int().positive().parse(c.req.param("id")), ...body })); });

financeRoute
  .post("/imports/external/preview", async (c) => ok(c, await externalCsvPreview({ userId: getCurrentUserId(c), ...externalPreview.parse(await c.req.json()) })))
  .get("/imports/:id", async (c) => ok(c, await getImportBatch(getCurrentUserId(c), z.coerce.number().int().positive().parse(c.req.param("id")))))
  .put("/imports/:id/rows/:rowId", async (c) => ok(c, await updateImportRow({ userId: getCurrentUserId(c), batchId: z.coerce.number().int().positive().parse(c.req.param("id")), rowId: z.coerce.number().int().positive().parse(c.req.param("rowId")), ...importRowUpdate.parse(await c.req.json()) })))
  .post("/imports/:id/confirm", async (c) => ok(c, await confirmExternalImport({ userId: getCurrentUserId(c), batchId: z.coerce.number().int().positive().parse(c.req.param("id")), ...importConfirm.parse(await c.req.json()) })))
  .post("/maintenance/export/json", async (c) => { z.object({ operationId }).parse(await c.req.json()); return ok(c, await exportFinanceBackup(getCurrentUserId(c))); })
  .post("/maintenance/export/csv", async (c) => { z.object({ operationId }).parse(await c.req.json()); return ok(c, await exportFinanceCsv(getCurrentUserId(c))); })
  .post("/maintenance/restore/preview", async (c) => ok(c, await previewFinanceRestore(getCurrentUserId(c), await c.req.json())))
  .post("/maintenance/restore/confirm", async (c) => { const body = restoreConfirm.parse(await c.req.json()); return ok(c, await confirmFinanceRestore(getCurrentUserId(c), body.operationId, body.backup)); })
  .post("/maintenance/reconciliation", async (c) => { const body = z.object({ operationId, from: date.optional(), to: date.optional() }).parse(await c.req.json()); return ok(c, await financeReconciliation(getCurrentUserId(c), body.from, body.to)); });
