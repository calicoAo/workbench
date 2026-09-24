import { createHash } from "node:crypto";
import { drizzle } from "drizzle-orm/mysql2";
import type mysql from "mysql2/promise";
import { pool as rawPool } from "./db/index.js";
import * as schema from "./db/schema.js";
import { FinanceCategoryKind, FinanceTransactionSource, FinanceTransactionStatus, FinanceTransactionType } from "./enums.js";
import { BusinessError, ErrorCode } from "./errors.js";
import { postImportedFinanceTransaction } from "./finance.js";
import { localDateTimeToUtc } from "./time.js";

const pool: any = rawPool;

type Connection = mysql.PoolConnection;
type Mapping = { date: string; time?: string; amount?: string; direction?: string; debit?: string; credit?: string; account?: string; category?: string; note?: string; externalId?: string; currency?: string };
type CsvRow = Record<string, string>;

export const ImportBatchKind = { EXTERNAL_TRANSACTIONS: 0, WORKBENCH_RESTORE: 1 } as const;
export const ImportBatchStatus = { PREVIEW: 0, CONFIRMING: 1, COMPLETED: 2, PARTIAL: 3, FAILED: 4, CANCELLED: 5 } as const;
export const ImportRowStatus = { READY: 0, NEEDS_MAPPING: 1, INVALID: 2, EXACT_DUPLICATE: 3, POSSIBLE_DUPLICATE: 4, IMPORTED: 5, FAILED: 6 } as const;

function sha(value: string) { return createHash("sha256").update(value).digest("hex"); }
function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, stableValue(item)]));
  }
  return value instanceof Date ? value.toISOString() : value;
}
function canonical(value: unknown) { return JSON.stringify(stableValue(value)); }
function mysqlDate(value: unknown) { if (value instanceof Date) return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`; return value === null || value === undefined ? null : String(value).slice(0, 10); }
function mysqlTime(value: unknown) { if (value instanceof Date) return value.toISOString().slice(11, 19); return value === null || value === undefined ? null : String(value).slice(0, 8); }
function mysqlDateTime(value: unknown) { if (value instanceof Date) return value; if (typeof value === "string" && value.includes("T")) return value.replace("T", " ").replace(/\.\d{3}Z$/, ""); return value ?? null; }
async function claimMutation(connection: any, userId: number, operationId: string, commandType: string, request: unknown) {
  const snapshot = canonical(request); const fingerprint = sha(canonical({ commandType, contractVersion: 1, request: JSON.parse(snapshot) }));
  try { await connection.query("INSERT INTO mutation_receipts (user_id, operation_id, command_type, contract_version, request_fingerprint, request_snapshot, created_at) VALUES (?, ?, ?, 1, ?, ?, ?)", [userId, operationId, commandType, fingerprint, snapshot, new Date()]); return null; }
  catch (error) { if (!(error && typeof error === "object" && "code" in error && error.code === "ER_DUP_ENTRY")) throw error; }
  const [rows] = await connection.query("SELECT * FROM mutation_receipts WHERE user_id = ? AND operation_id = ? FOR UPDATE", [userId, operationId]); const receipt = (rows as any[])[0];
  if (!receipt || receipt.command_type !== commandType || receipt.request_fingerprint !== fingerprint) throw new BusinessError(ErrorCode.CONFLICT, "operationId is already used with different parameters", 409);
  if (!receipt.committed_at || !receipt.result_metadata) throw new BusinessError(ErrorCode.CONFLICT, "mutation receipt requires repair", 409);
  return parsedJson(receipt.result_metadata, null);
}
async function commitMutation(connection: any, userId: number, operationId: string, result: unknown) { await connection.query("UPDATE mutation_receipts SET result_reference = ?, result_metadata = ?, committed_at = ? WHERE user_id = ? AND operation_id = ?", [result && typeof result === "object" && "id" in result ? String((result as any).id) : null, json(result), new Date(), userId, operationId]); }
function parseCsv(input: string): CsvRow[] {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]; const next = input[index + 1];
    if (char === '"' && quoted && next === '"') { cell += '"'; index += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === "," && !quoted) { row.push(cell); cell = ""; continue; }
    if ((char === "\n" || char === "\r") && !quoted) { if (char === "\r" && next === "\n") index += 1; row.push(cell); if (row.some((item) => item.trim())) rows.push(row); row = []; cell = ""; continue; }
    cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  if (rows.length < 2) return [];
  const headers = rows.shift()!.map((item, index) => item.trim() || `column_${index + 1}`);
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, (values[index] ?? "").trim()])));
}
function parseDate(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ? value : null; }
function parseTime(value?: string) { if (!value) return "09:00:00"; return /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value) ? (value.length === 5 ? `${value}:00` : value) : null; }
function parseMoney(value: string) {
  const normalized = value.trim().replaceAll(",", "");
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(normalized)) return null;
  const negative = normalized.startsWith("-"); const unsigned = negative ? normalized.slice(1) : normalized; const [whole, fraction = ""] = unsigned.split(".");
  const cents = BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2)); return negative ? -cents : cents;
}
function moneyCsv(value: bigint) { return `${value < 0n ? "-" : ""}${(value < 0n ? -value : value) / 100n}.${String((value < 0n ? -value : value) % 100n).padStart(2, "0")}`; }
function json(value: unknown) { return JSON.stringify(value ?? null); }
function parsedJson<T = any>(value: unknown, fallback: T): T { if (value && typeof value === "object") return value as T; if (typeof value !== "string") return fallback; try { return JSON.parse(value) as T; } catch { return fallback; } }
function rowResult(row: any) {
  return { id: Number(row.id), rowNumber: row.source_line_number, sourceRowKey: row.source_row_key, source: row.raw_json, date: mysqlDate(row.parsed_date), time: mysqlTime(row.parsed_time), amountCents: row.parsed_amount_cents === null ? null : String(row.parsed_amount_cents), kind: row.parsed_kind === 1 ? "INCOME" : row.parsed_kind === 2 ? "EXPENSE" : null, note: row.parsed_note, accountId: row.account_id, categoryId: row.category_id, status: ["READY", "NEEDS_MAPPING", "INVALID", "EXACT_DUPLICATE", "POSSIBLE_DUPLICATE", "IMPORTED", "FAILED"][row.status] ?? "INVALID", duplicateStatus: ["NONE", "EXACT_DUPLICATE", "POSSIBLE_DUPLICATE"][row.duplicate_status] ?? "NONE", warnings: parsedJson(row.warnings_json, []), error: row.error_message, transactionId: row.transaction_id };
}
async function userTimezone(connection: Connection, userId: number) { const [rows] = await connection.query("SELECT timezone FROM users WHERE id = ? AND deleted_at IS NULL", [userId]); const row = (rows as any[])[0]; if (!row) throw new BusinessError(ErrorCode.NOT_FOUND, "user not found", 404); return row.timezone as string; }
async function audit(connection: Connection, userId: number, action: string, batchId: number | null, sourceName: string | null, fileDigest: string | null, summary: unknown) { await connection.query("INSERT INTO finance_data_audits (user_id, action, batch_id, source_name, file_digest, summary_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", [userId, action, batchId, sourceName, fileDigest, json(summary), new Date()]); }
async function resolveId(connection: Connection, userId: number, value: string | undefined, table: "finance_accounts" | "finance_categories", kind?: number) {
  if (!value) return null;
  const numeric = /^\d+$/.test(value) ? Number(value) : null;
  const query = table === "finance_accounts" ? `SELECT id FROM ${table} WHERE user_id = ? AND ${numeric === null ? "name = ?" : "id = ?"} AND archived_at IS NULL LIMIT 1` : `SELECT id FROM ${table} WHERE user_id = ? AND ${numeric === null ? "name = ?" : "id = ?"} AND enabled = 1 ${kind === undefined ? "" : "AND kind = ?"} LIMIT 1`;
  const params = numeric === null ? [userId, value] : [userId, numeric]; if (table === "finance_categories" && kind !== undefined) params.push(kind);
  const [rows] = await connection.query(query, params); return (rows as any[])[0]?.id ?? null;
}
async function possibleDuplicate(connection: Connection, userId: number, date: string | null, amount: bigint | null, accountId: number | null, categoryId: number | null, note: string) {
  if (!date || amount === null || !accountId) return false;
  const [rows] = await connection.query("SELECT t.id FROM finance_transactions t INNER JOIN finance_entries e ON e.transaction_id = t.id WHERE t.user_id = ? AND t.business_date = ? AND e.account_id = ? AND e.amount_cents = ? AND COALESCE(t.note, '') = ? AND t.status = ? LIMIT 1", [userId, date, accountId, amount.toString(), note, FinanceTransactionStatus.POSTED]);
  return (rows as any[]).length > 0;
}
async function rowById(connection: Connection, userId: number, rowId: number) { const [rows] = await connection.query("SELECT * FROM finance_import_rows WHERE id = ? AND user_id = ? FOR UPDATE", [rowId, userId]); return (rows as any[])[0] ?? null; }

export async function externalCsvPreview(input: { userId: number; operationId: string; sourceName: string; csv: string; mapping: Mapping; timezone: string }) {
  if (input.csv.length > 5_000_000) throw new BusinessError(ErrorCode.PARAM_ERROR, "CSV is too large", 400);
  try { localDateTimeToUtc("2026-01-15", "12:00:00", input.timezone); } catch { throw new BusinessError(ErrorCode.PARAM_ERROR, "source timezone is invalid", 400); }
  const digest = sha(input.csv); const connection = await pool.getConnection();
  try {
    await connection.beginTransaction(); const replay = await claimMutation(connection, input.userId, input.operationId, "FINANCE_IMPORT_PREVIEW", { sourceName: input.sourceName, digest, mapping: input.mapping, timezone: input.timezone }); if (replay) { await connection.commit(); return replay; }
    const [existing] = await connection.query("SELECT * FROM finance_import_batches WHERE user_id = ? AND kind = ? AND file_digest = ? LIMIT 1", [input.userId, ImportBatchKind.EXTERNAL_TRANSACTIONS, digest]);
    if ((existing as any[])[0]) { const result = await getImportBatch(input.userId, Number((existing as any[])[0].id), connection); await commitMutation(connection, input.userId, input.operationId, result); await connection.commit(); return result; }
    const now = new Date();
    const [batchResult] = await connection.query("INSERT INTO finance_import_batches (user_id, kind, source_name, source_format, file_digest, status, summary_json, created_at, version) VALUES (?, ?, ?, 'CSV', ?, ?, ?, ?, 1)", [input.userId, ImportBatchKind.EXTERNAL_TRANSACTIONS, input.sourceName, digest, ImportBatchStatus.PREVIEW, json({ rowCount: 0 }), now]);
    const batchId = Number((batchResult as any).insertId); const rows = parseCsv(input.csv); const namespace = input.sourceName.trim() || "external-csv";
    for (let index = 0; index < rows.length; index += 1) {
      const raw = rows[index]; const rowKey = raw[input.mapping.externalId ?? ""] || String(index + 2); const date = parseDate(raw[input.mapping.date] ?? ""); const time = parseTime(raw[input.mapping.time ?? ""]); const rawAmount = input.mapping.amount ? parseMoney(raw[input.mapping.amount] ?? "") : null; const debit = input.mapping.debit ? parseMoney(raw[input.mapping.debit] ?? "") : null; const credit = input.mapping.credit ? parseMoney(raw[input.mapping.credit] ?? "") : null; let amount = rawAmount ?? (debit && debit !== 0n ? -debit : credit); const direction = (raw[input.mapping.direction ?? ""] ?? "").toUpperCase(); if (rawAmount !== null && direction.includes("EXPENSE") && rawAmount > 0n) amount = -rawAmount; if (rawAmount !== null && direction.includes("INCOME") && rawAmount < 0n) amount = -rawAmount;
      const kind: number | null = amount === null ? null : amount >= 0n ? FinanceCategoryKind.INCOME : FinanceCategoryKind.EXPENSE; const signedAmount = amount === null ? null : amount === 0n ? null : amount; const accountId = await resolveId(connection, input.userId, raw[input.mapping.account ?? ""], "finance_accounts"); const categoryId = await resolveId(connection, input.userId, raw[input.mapping.category ?? ""], "finance_categories", kind === FinanceCategoryKind.INCOME ? FinanceCategoryKind.INCOME : FinanceCategoryKind.EXPENSE); const note = (raw[input.mapping.note ?? ""] ?? "").slice(0, 500); const currency = (raw[input.mapping.currency ?? ""] ?? "CNY").trim().toUpperCase(); const fingerprint = sha(canonical({ namespace, rowKey, raw })); const warnings: string[] = []; let status: number = ImportRowStatus.READY; let error: string | null = null; if (currency !== "CNY") { status = ImportRowStatus.INVALID; error = "只支持 CNY 流水"; } else if (!date || !time || signedAmount === null) { status = ImportRowStatus.INVALID; error = !date ? "发生日期无效" : !time ? "发生时间无效" : "金额必须是非零 CNY 金额"; } else if (!accountId || !categoryId) { status = ImportRowStatus.NEEDS_MAPPING; error = !accountId ? "账户需要映射" : "分类需要映射"; } else if (await possibleDuplicate(connection, input.userId, date, signedAmount, accountId, categoryId, note)) { status = ImportRowStatus.POSSIBLE_DUPLICATE; warnings.push("发现相同日期、金额、账户、备注的已有流水；确认后仍可导入"); }
      const [exactRows] = await connection.query("SELECT id FROM finance_import_rows WHERE user_id = ? AND source_namespace = ? AND source_row_fingerprint = ? AND status = ? LIMIT 1", [input.userId, namespace, fingerprint, ImportRowStatus.IMPORTED]); if ((exactRows as any[]).length) { status = ImportRowStatus.EXACT_DUPLICATE; error = "来源行已成功导入"; }
      await connection.query("INSERT INTO finance_import_rows (user_id, batch_id, source_row_key, source_namespace, source_row_fingerprint, source_line_number, raw_json, parsed_date, parsed_time, parsed_amount_cents, parsed_kind, parsed_note, account_id, category_id, status, duplicate_status, warnings_json, error_message, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)", [input.userId, batchId, rowKey, namespace, fingerprint, index + 2, json(raw), date, time, signedAmount === null ? null : signedAmount.toString(), signedAmount === null ? null : signedAmount >= 0n ? 1 : 2, note || null, accountId, categoryId, status, status === ImportRowStatus.EXACT_DUPLICATE ? 1 : status === ImportRowStatus.POSSIBLE_DUPLICATE ? 2 : 0, json(warnings), error, now, now]);
    }
    const [counts] = await connection.query("SELECT status, COUNT(*) count FROM finance_import_rows WHERE batch_id = ? GROUP BY status", [batchId]); const summary = Object.fromEntries((counts as any[]).map((row) => [String(row.status), Number(row.count)])); await connection.query("UPDATE finance_import_batches SET summary_json = ? WHERE id = ?", [json({ rowCount: rows.length, counts: summary, timezone: input.timezone }), batchId]); await audit(connection, input.userId, "IMPORT_PREVIEW", batchId, input.sourceName, digest, { rowCount: rows.length, counts: summary, timezone: input.timezone }); const result = await getImportBatch(input.userId, batchId, connection); await commitMutation(connection, input.userId, input.operationId, result); await connection.commit(); return result;
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
}

export async function getImportBatch(userId: number, batchId: number, existingConnection?: Connection) {
  const connection = existingConnection ?? await pool.getConnection(); try { const [batches] = await connection.query("SELECT * FROM finance_import_batches WHERE id = ? AND user_id = ?", [batchId, userId]); const batch = (batches as any[])[0]; if (!batch) throw new BusinessError(ErrorCode.NOT_FOUND, "import batch not found", 404); const [rows] = await connection.query("SELECT * FROM finance_import_rows WHERE batch_id = ? AND user_id = ? ORDER BY source_line_number", [batchId, userId]); return { id: Number(batch.id), kind: batch.kind === 0 ? "EXTERNAL_TRANSACTIONS" : "WORKBENCH_RESTORE", sourceName: batch.source_name, sourceFormat: batch.source_format, fileDigest: batch.file_digest, status: ["PREVIEW", "CONFIRMING", "COMPLETED", "PARTIAL", "FAILED", "CANCELLED"][batch.status], summary: parsedJson(batch.summary_json, {}), createdAt: batch.created_at, confirmedAt: batch.confirmed_at, completedAt: batch.completed_at, rows: (rows as any[]).map(rowResult) }; } finally { if (!existingConnection) connection.release(); }
}

export async function updateImportRow(input: { userId: number; batchId: number; rowId: number; accountId?: number; categoryId?: number; date?: string; time?: string; amountCents?: string; kind?: "INCOME" | "EXPENSE"; note?: string | null }) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const row = await rowById(connection, input.userId, input.rowId);
    if (!row || Number(row.batch_id) !== input.batchId) throw new BusinessError(ErrorCode.NOT_FOUND, "import row not found", 404);
    if (row.status === ImportRowStatus.IMPORTED || row.status === ImportRowStatus.EXACT_DUPLICATE) throw new BusinessError(ErrorCode.CONFLICT, "processed import row is immutable", 409);
    const date = input.date ?? mysqlDate(row.parsed_date);
    const time = input.time ?? mysqlTime(row.parsed_time);
    const normalizedDate = date ?? "";
    const normalizedTime = time ?? "";
    const amount = input.amountCents === undefined ? BigInt(row.parsed_amount_cents) : BigInt(input.amountCents);
    const kind = input.kind === undefined ? row.parsed_kind : input.kind === "INCOME" ? 1 : 2;
    const signedAmount = kind === 1 ? (amount < 0n ? -amount : amount) : (amount > 0n ? -amount : amount);
    const accountId = input.accountId ?? Number(row.account_id);
    const categoryId = input.categoryId ?? Number(row.category_id);
    const note = input.note === undefined ? row.parsed_note : input.note?.trim() || null;
    const [accounts] = await connection.query("SELECT id FROM finance_accounts WHERE id = ? AND user_id = ? AND archived_at IS NULL", [accountId, input.userId]);
    const [categories] = await connection.query("SELECT id FROM finance_categories WHERE id = ? AND user_id = ? AND enabled = 1 AND kind = ?", [categoryId, input.userId, kind === 1 ? FinanceCategoryKind.INCOME : FinanceCategoryKind.EXPENSE]);
    let status: number = ImportRowStatus.READY;
    let error: string | null = null;
    let duplicateStatus: number = 0;
    const warnings: string[] = [];
    if (!parseDate(normalizedDate) || !parseTime(normalizedTime) || signedAmount === 0n) { status = ImportRowStatus.INVALID; error = "日期、时间或金额无效"; }
    else if (!(accounts as any[]).length || !(categories as any[]).length) { status = ImportRowStatus.NEEDS_MAPPING; error = !(accounts as any[]).length ? "账户需要映射" : "分类需要映射"; }
    else if (await possibleDuplicate(connection, input.userId, normalizedDate, signedAmount, accountId, categoryId, note ?? "")) { status = ImportRowStatus.POSSIBLE_DUPLICATE; duplicateStatus = 2; warnings.push("发现相同日期、金额、账户、备注的已有流水；确认后仍可导入"); }
    await connection.query("UPDATE finance_import_rows SET parsed_date = ?, parsed_time = ?, parsed_amount_cents = ?, parsed_kind = ?, parsed_note = ?, account_id = ?, category_id = ?, status = ?, duplicate_status = ?, warnings_json = ?, error_message = ?, version = version + 1, updated_at = ? WHERE id = ?", [normalizedDate || null, normalizedTime || null, signedAmount, kind, note, accountId, categoryId, status, duplicateStatus, json(warnings), error, new Date(), row.id]);
    await connection.commit();
    return rowResult(await rowById(connection, input.userId, input.rowId));
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
}

export async function confirmExternalImport(input: { userId: number; operationId: string; batchId: number; rowIds?: number[]; allowPossibleDuplicates?: boolean }) {
  const connection: any = await pool.getConnection(); const successes: number[] = []; const failures: Array<{ rowId: number; error: string }> = [];
  try {
    await connection.beginTransaction(); const replay = await claimMutation(connection, input.userId, input.operationId, "FINANCE_IMPORT_CONFIRM", { batchId: input.batchId, rowIds: input.rowIds ?? null, allowPossibleDuplicates: Boolean(input.allowPossibleDuplicates) }); if (replay) { await connection.commit(); return replay; } const [batches] = await connection.query("SELECT * FROM finance_import_batches WHERE id = ? AND user_id = ? FOR UPDATE", [input.batchId, input.userId]); const batch = (batches as any[])[0]; if (!batch) throw new BusinessError(ErrorCode.NOT_FOUND, "import batch not found", 404); await connection.query("UPDATE finance_import_batches SET status = ?, confirmed_at = COALESCE(confirmed_at, ?) WHERE id = ?", [ImportBatchStatus.CONFIRMING, new Date(), input.batchId]); const [rows] = await connection.query(`SELECT * FROM finance_import_rows WHERE batch_id = ? AND user_id = ? AND status IN (?, ?, ?) ${input.rowIds?.length ? `AND id IN (${input.rowIds.map(() => "?").join(",")})` : ""} ORDER BY source_line_number FOR UPDATE`, [input.batchId, input.userId, ImportRowStatus.READY, ImportRowStatus.POSSIBLE_DUPLICATE, ImportRowStatus.FAILED, ...(input.rowIds ?? [])]);
    const timezone = parsedJson<{ timezone?: string }>(batch.summary_json, {}).timezone ?? await userTimezone(connection, input.userId);
    for (const row of rows as any[]) {
      if (row.status === ImportRowStatus.POSSIBLE_DUPLICATE && !input.allowPossibleDuplicates) continue;
      await connection.query("SAVEPOINT finance_import_row");
      try {
        const [existing] = await connection.query("SELECT transaction_id FROM finance_import_rows WHERE user_id = ? AND source_namespace = ? AND source_row_fingerprint = ? AND status = ? AND transaction_id IS NOT NULL LIMIT 1", [input.userId, row.source_namespace, row.source_row_fingerprint, ImportRowStatus.IMPORTED]); if ((existing as any[])[0]) { await connection.query("UPDATE finance_import_rows SET status = ?, duplicate_status = 1, error_message = ?, updated_at = ? WHERE id = ?", [ImportRowStatus.EXACT_DUPLICATE, "来源行已成功导入", new Date(), row.id]); continue; }
        const finance = drizzle(connection, { schema, mode: "default" });
        const posted = await postImportedFinanceTransaction(finance, { userId: input.userId, type: row.parsed_kind === 1 ? "INCOME" : "EXPENSE", accountId: Number(row.account_id), categoryId: Number(row.category_id), amountCents: BigInt(row.parsed_amount_cents), occurredDate: mysqlDate(row.parsed_date)!, occurredTime: mysqlTime(row.parsed_time) ?? "09:00:00", recordTimezone: timezone, note: row.parsed_note, importBatchId: input.batchId, sourceRowKey: row.source_row_key, sourceNamespace: row.source_namespace, sourceRowFingerprint: row.source_row_fingerprint }); const now = new Date(); await connection.query("UPDATE finance_import_rows SET status = ?, transaction_id = ?, error_message = NULL, updated_at = ? WHERE id = ?", [ImportRowStatus.IMPORTED, posted.transactionId, now, row.id]); await connection.query("RELEASE SAVEPOINT finance_import_row"); successes.push(row.id);
      } catch (error) { await connection.query("ROLLBACK TO SAVEPOINT finance_import_row"); const message = error instanceof Error ? error.message : "导入失败"; const exact = error && typeof error === "object" && "code" in error && (error as any).code === "ER_DUP_ENTRY"; await connection.query("UPDATE finance_import_rows SET status = ?, duplicate_status = ?, error_message = ?, updated_at = ? WHERE id = ?", [exact ? ImportRowStatus.EXACT_DUPLICATE : ImportRowStatus.FAILED, exact ? 1 : row.duplicate_status, exact ? "来源行已成功导入" : message, new Date(), row.id]); if (!exact) failures.push({ rowId: row.id, error: message }); }
    }
    const [counts] = await connection.query("SELECT status, COUNT(*) count FROM finance_import_rows WHERE batch_id = ? GROUP BY status", [input.batchId]); const countMap = Object.fromEntries((counts as any[]).map((row) => [String(row.status), Number(row.count)])); const pending = Number(countMap[String(ImportRowStatus.READY)] ?? 0) + Number(countMap[String(ImportRowStatus.POSSIBLE_DUPLICATE)] ?? 0); const failed = Number(countMap[String(ImportRowStatus.FAILED)] ?? 0); const imported = Number(countMap[String(ImportRowStatus.IMPORTED)] ?? 0); const status = pending || failed ? (imported ? ImportBatchStatus.PARTIAL : ImportBatchStatus.FAILED) : ImportBatchStatus.COMPLETED; const summary = { imported, failed, exactDuplicate: Number(countMap[String(ImportRowStatus.EXACT_DUPLICATE)] ?? 0), possibleDuplicate: Number(countMap[String(ImportRowStatus.POSSIBLE_DUPLICATE)] ?? 0), counts: countMap }; await connection.query("UPDATE finance_import_batches SET status = ?, summary_json = ?, completed_at = ?, version = version + 1 WHERE id = ?", [status, json(summary), new Date(), input.batchId]); await audit(connection, input.userId, "IMPORT_CONFIRM", input.batchId, batch.source_name, batch.file_digest, summary); const result = { batchId: input.batchId, status: ["PREVIEW", "CONFIRMING", "COMPLETED", "PARTIAL", "FAILED", "CANCELLED"][status], summary, successes, failures }; await commitMutation(connection, input.userId, input.operationId, result); await connection.commit(); return result;
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
}

const backupTables = ["finance_accounts", "finance_categories", "finance_import_batches", "finance_transactions", "finance_entries", "finance_budgets", "finance_recurring_templates", "finance_recurring_occurrences", "finance_import_rows"] as const;

async function financeGraph(connection: Connection, userId: number) {
  const graph: Record<string, unknown[]> = {};
  for (const table of backupTables) {
    const [rows] = await connection.query(`SELECT * FROM ${table} WHERE user_id = ? ORDER BY id`, [userId]);
    graph[table] = rows as unknown[];
  }
  return graph;
}

function ids(rows: any[]) { return new Set(rows.map((row) => Number(row.id))); }
function relation(errors: string[], valid: Set<number>, value: unknown, label: string, nullable = false) {
  if ((value === null || value === undefined) && nullable) return;
  if (!valid.has(Number(value))) errors.push(`${label} relation invalid`);
}

export function validateFinanceBackup(payload: any) {
  const graph = payload?.graph ?? {};
  const counts = Object.fromEntries(backupTables.map((name) => [name, Array.isArray(graph[name]) ? graph[name].length : 0]));
  const errors: string[] = [];
  if (payload?.format !== "workbench-finance-backup" || payload?.schemaVersion !== 1) errors.push("不支持的 Finance backup 版本");
  if (payload?.currency !== "CNY") errors.push("只支持 CNY backup");
  for (const name of backupTables) if (!Array.isArray(graph[name])) errors.push(`缺少 ${name}`);
  if (errors.some((error) => error.startsWith("缺少"))) return { valid: false, errors: [...new Set(errors)], counts };
  const accounts = ids(graph.finance_accounts); const categories = ids(graph.finance_categories); const batches = ids(graph.finance_import_batches); const transactions = ids(graph.finance_transactions); const templates = ids(graph.finance_recurring_templates);
  for (const transaction of graph.finance_transactions) {
    relation(errors, categories, transaction.category_id, "Transaction category", true);
    relation(errors, accounts, transaction.source_account_id, "Transaction source account", true);
    relation(errors, accounts, transaction.target_account_id, "Transaction target account", true);
    relation(errors, transactions, transaction.related_transaction_id, "Transaction related", true);
    relation(errors, batches, transaction.import_batch_id, "Transaction import batch", true);
  }
  for (const entry of graph.finance_entries) { relation(errors, accounts, entry.account_id, "Entry account"); relation(errors, transactions, entry.transaction_id, "Entry transaction"); }
  for (const budget of graph.finance_budgets) relation(errors, categories, budget.category_id, "Budget category", true);
  for (const template of graph.finance_recurring_templates) { relation(errors, accounts, template.account_id, "Recurring account"); relation(errors, categories, template.category_id, "Recurring category"); }
  for (const occurrence of graph.finance_recurring_occurrences) { relation(errors, templates, occurrence.template_id, "Occurrence template"); relation(errors, accounts, occurrence.account_id_snapshot, "Occurrence account"); relation(errors, categories, occurrence.category_id_snapshot, "Occurrence category"); relation(errors, transactions, occurrence.posted_transaction_id, "Occurrence posted transaction", occurrence.status !== 1); if (occurrence.status === 1 && !occurrence.posted_transaction_id) errors.push("Recurring POSTED occurrence has no transaction"); }
  for (const row of graph.finance_import_rows) { relation(errors, batches, row.batch_id, "Import row batch"); relation(errors, accounts, row.account_id, "Import row account", true); relation(errors, categories, row.category_id, "Import row category", true); relation(errors, transactions, row.transaction_id, "Import row transaction", true); }
  const entriesByTransaction = new Map<number, any[]>();
  for (const entry of graph.finance_entries) entriesByTransaction.set(Number(entry.transaction_id), [...(entriesByTransaction.get(Number(entry.transaction_id)) ?? []), entry]);
  for (const transaction of graph.finance_transactions) {
    const entries = entriesByTransaction.get(Number(transaction.id)) ?? [];
    if (transaction.type === FinanceTransactionType.TRANSFER && (entries.length !== 2 || entries.reduce((sum, entry) => sum + BigInt(entry.amount_cents), 0n) !== 0n)) errors.push(`Transfer ${transaction.id} legs are invalid`);
    if (transaction.type === FinanceTransactionType.REFUND) {
      const original = graph.finance_transactions.find((candidate: any) => Number(candidate.id) === Number(transaction.related_transaction_id));
      if (!original || original.type !== FinanceTransactionType.EXPENSE) errors.push(`Refund ${transaction.id} relation is invalid`);
    }
    if (transaction.type === FinanceTransactionType.CORRECTION && !transaction.related_transaction_id) errors.push(`Correction ${transaction.id} relation is invalid`);
  }
  return { valid: errors.length === 0, errors: [...new Set(errors)], counts };
}

export async function exportFinanceBackup(userId: number) {
  const connection = await pool.getConnection();
  try {
    const graph = await financeGraph(connection, userId); const timezone = await userTimezone(connection, userId);
    const payload = { format: "workbench-finance-backup", schemaVersion: 1, exportedAt: new Date().toISOString(), timezone, currency: "CNY", graph };
    const counts = Object.fromEntries(Object.entries(graph).map(([key, rows]) => [key, rows.length]));
    await audit(connection, userId, "FINANCE_BACKUP_EXPORT", null, "Workbench Finance JSON", sha(JSON.stringify(payload)), { counts });
    return { fileName: "workbench-finance-backup-v1.json", contentType: "application/json", content: JSON.stringify(payload, null, 2), counts };
  } finally { connection.release(); }
}

function csvCell(value: unknown) { return `"${String(value ?? "").replaceAll('"', '""')}"`; }
function csvSection(name: string, rows: Array<Record<string, unknown>>) {
  const headers = Object.keys(rows[0] ?? { 记录: name });
  return [`# ${name}`, headers.map(csvCell).join(","), ...rows.map((row) => headers.map((key) => csvCell(row[key])).join(","))].join("\n");
}

export async function exportFinanceCsv(userId: number) {
  const connection = await pool.getConnection();
  try {
    const graph = await financeGraph(connection, userId); const accounts = new Map((graph.finance_accounts as any[]).map((row) => [row.id, row.name])); const categories = new Map((graph.finance_categories as any[]).map((row) => [row.id, row.name])); const entries = new Map<number, any[]>();
    for (const entry of graph.finance_entries as any[]) entries.set(entry.transaction_id, [...(entries.get(entry.transaction_id) ?? []), entry]);
    const transactions = (graph.finance_transactions as any[]).map((row) => { const legs = entries.get(row.id) ?? []; const primary = legs.find((entry) => BigInt(entry.amount_cents) < 0n) ?? legs[0]; const counterpart = legs.find((entry) => entry.id !== primary?.id); return { 业务日期: row.business_date, 类型: ["OPENING", "INCOME", "EXPENSE", "TRANSFER", "REFUND", "REVERSAL", "CORRECTION"][row.type], 显示金额: primary ? moneyCsv(BigInt(primary.amount_cents) < 0n ? -BigInt(primary.amount_cents) : BigInt(primary.amount_cents)) : "", 账户: primary ? accounts.get(primary.account_id) ?? "" : "", 对方账户: counterpart ? accounts.get(counterpart.account_id) ?? "" : "", 分类: categories.get(row.category_id) ?? "", 备注: row.note ?? "", 状态: ["POSTED", "REVERSED", "VOIDED"][row.status], 来源: row.source === FinanceTransactionSource.IMPORT ? "IMPORT" : "MANUAL" }; });
    const accountRows = (graph.finance_accounts as any[]).map((row) => ({ 账户: row.name, 类型: row.type, 币种: row.currency, 计入总览: row.include_in_overview ? "是" : "否", 期初日期: row.opening_date, 已归档: row.archived_at ? "是" : "否" }));
    const budgets = (graph.finance_budgets as any[]).map((row) => ({ 月份: row.budget_month, 分类: row.category_id ? categories.get(row.category_id) ?? "" : "总预算", 限额: moneyCsv(BigInt(row.limit_cents)), 时区: row.period_timezone }));
    const recurring = (graph.finance_recurring_templates as any[]).map((row) => ({ 名称: row.name, 类型: row.type === 1 ? "INCOME" : "EXPENSE", 金额: moneyCsv(BigInt(row.amount_cents)), 账户: accounts.get(row.account_id) ?? "", 分类: categories.get(row.category_id) ?? "", 频率: row.frequency === 0 ? "MONTHLY" : "WEEKLY", 规则值: row.schedule_value, 开始: row.start_date, 结束: row.end_date ?? "", 启用: row.enabled ? "是" : "否" }));
    const content = [csvSection("transactions", transactions), csvSection("accounts", accountRows), csvSection("budgets", budgets), csvSection("recurring", recurring)].join("\n\n");
    await audit(connection, userId, "FINANCE_CSV_EXPORT", null, "Finance multi-section CSV", null, { transactions: transactions.length, accounts: accountRows.length, budgets: budgets.length, recurring: recurring.length });
    return { fileName: "workbench-finance-data.csv", contentType: "text/csv", content, recordCount: transactions.length + accountRows.length + budgets.length + recurring.length };
  } finally { connection.release(); }
}

async function financeDomainIsEmpty(connection: Connection, userId: number) {
  const tables = ["finance_accounts", "finance_categories", "finance_transactions", "finance_budgets", "finance_recurring_templates", "finance_import_batches"];
  for (const table of tables) { const [rows] = await connection.query(`SELECT id FROM ${table} WHERE user_id = ? LIMIT 1 FOR UPDATE`, [userId]); if ((rows as any[]).length) return false; }
  return true;
}

export async function previewFinanceRestore(userId: number, payload: any) {
  const connection = await pool.getConnection();
  try {
    const validation = validateFinanceBackup(payload); const errors = [...validation.errors];
    if (!await financeDomainIsEmpty(connection, userId)) errors.push("完整恢复需要空账本/新环境");
    return { valid: errors.length === 0, errors: [...new Set(errors)], counts: validation.counts, currency: payload?.currency ?? null, schemaVersion: payload?.schemaVersion ?? null };
  } finally { connection.release(); }
}

export async function confirmFinanceRestore(userId: number, operationId: string, payload: any) {
  const connection: any = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const replay = await claimMutation(connection, userId, operationId, "FINANCE_BACKUP_RESTORE", { digest: sha(canonical(payload)) });
    if (replay) { await connection.commit(); return replay; }
    const validation = validateFinanceBackup(payload);
    if (!validation.valid) throw new BusinessError(ErrorCode.CONFLICT, validation.errors.join("; "), 409);
    if (!await financeDomainIsEmpty(connection, userId)) throw new BusinessError(ErrorCode.CONFLICT, "完整恢复需要空账本/新环境", 409);
    const graph = payload.graph; const accountMap = new Map<number, number>(); const categoryMap = new Map<number, number>(); const batchMap = new Map<number, number>(); const transactionMap = new Map<number, number>(); const templateMap = new Map<number, number>(); const now = new Date();
    for (const row of graph.finance_accounts) { const [result] = await connection.query("INSERT INTO finance_accounts (user_id, name, type, currency, include_in_overview, opening_date, archived_at, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [userId, row.name, row.type, row.currency, row.include_in_overview, mysqlDate(row.opening_date), row.archived_at, row.version ?? 1, now, now]); accountMap.set(Number(row.id), Number(result.insertId)); }
    for (const row of graph.finance_categories) { const [result] = await connection.query("INSERT INTO finance_categories (user_id, kind, name, sort_order, enabled, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [userId, row.kind, row.name, row.sort_order, row.enabled, row.version ?? 1, now, now]); categoryMap.set(Number(row.id), Number(result.insertId)); }
    for (const row of graph.finance_import_batches) { const [result] = await connection.query("INSERT INTO finance_import_batches (user_id, kind, source_name, source_format, file_digest, status, summary_json, created_at, confirmed_at, completed_at, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [userId, row.kind, row.source_name, row.source_format, row.file_digest, row.status, json(row.summary_json), now, mysqlDateTime(row.confirmed_at), mysqlDateTime(row.completed_at), row.version ?? 1]); batchMap.set(Number(row.id), Number(result.insertId)); }
    for (const row of graph.finance_transactions) { const [result] = await connection.query("INSERT INTO finance_transactions (user_id, type, occurred_at, record_timezone, business_date, category_id, source_account_id, target_account_id, related_transaction_id, note, status, source, import_batch_id, source_row_key, source_namespace, source_row_fingerprint, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [userId, row.type, mysqlDateTime(row.occurred_at), row.record_timezone, mysqlDate(row.business_date), row.category_id === null ? null : categoryMap.get(Number(row.category_id)), row.source_account_id === null ? null : accountMap.get(Number(row.source_account_id)), row.target_account_id === null ? null : accountMap.get(Number(row.target_account_id)), row.note, row.status, row.source, row.import_batch_id === null ? null : batchMap.get(Number(row.import_batch_id)), row.source_row_key, row.source_namespace, row.source_row_fingerprint, row.version ?? 1, now, now]); transactionMap.set(Number(row.id), Number(result.insertId)); }
    for (const row of graph.finance_transactions) if (row.related_transaction_id) await connection.query("UPDATE finance_transactions SET related_transaction_id = ? WHERE id = ? AND user_id = ?", [transactionMap.get(Number(row.related_transaction_id)), transactionMap.get(Number(row.id)), userId]);
    for (const row of graph.finance_entries) await connection.query("INSERT INTO finance_entries (user_id, transaction_id, account_id, amount_cents, created_at) VALUES (?, ?, ?, ?, ?)", [userId, transactionMap.get(Number(row.transaction_id)), accountMap.get(Number(row.account_id)), row.amount_cents, now]);
    for (const row of graph.finance_budgets) { const categoryId = row.category_id === null ? null : categoryMap.get(Number(row.category_id)); await connection.query("INSERT INTO finance_budgets (user_id, budget_month, period_timezone, category_id, category_scope_key, limit_cents, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [userId, row.budget_month, row.period_timezone, categoryId, categoryId === null ? "TOTAL" : String(categoryId), row.limit_cents, row.version ?? 1, now, now]); }
    for (const row of graph.finance_recurring_templates) { const [result] = await connection.query("INSERT INTO finance_recurring_templates (user_id, type, name, amount_cents, account_id, category_id, frequency, schedule_value, start_date, end_date, enabled, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [userId, row.type, row.name, row.amount_cents, accountMap.get(Number(row.account_id)), categoryMap.get(Number(row.category_id)), row.frequency, row.schedule_value, mysqlDate(row.start_date), mysqlDate(row.end_date), row.enabled, row.version ?? 1, now, now]); templateMap.set(Number(row.id), Number(result.insertId)); }
    for (const row of graph.finance_recurring_occurrences) await connection.query("INSERT INTO finance_recurring_occurrences (user_id, template_id, scheduled_date, record_timezone, status, amount_cents_snapshot, account_id_snapshot, category_id_snapshot, posted_transaction_id, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [userId, templateMap.get(Number(row.template_id)), mysqlDate(row.scheduled_date), row.record_timezone, row.status, row.amount_cents_snapshot, accountMap.get(Number(row.account_id_snapshot)), categoryMap.get(Number(row.category_id_snapshot)), row.posted_transaction_id ? transactionMap.get(Number(row.posted_transaction_id)) : null, row.version ?? 1, now, now]);
    for (const row of graph.finance_import_rows) await connection.query("INSERT INTO finance_import_rows (user_id, batch_id, source_row_key, source_namespace, source_row_fingerprint, source_line_number, raw_json, parsed_date, parsed_time, parsed_amount_cents, parsed_kind, parsed_note, account_id, category_id, status, duplicate_status, warnings_json, error_message, transaction_id, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [userId, batchMap.get(Number(row.batch_id)), row.source_row_key, row.source_namespace, row.source_row_fingerprint, row.source_line_number, json(row.raw_json), mysqlDate(row.parsed_date), mysqlTime(row.parsed_time), row.parsed_amount_cents, row.parsed_kind, row.parsed_note, row.account_id === null ? null : accountMap.get(Number(row.account_id)), row.category_id === null ? null : categoryMap.get(Number(row.category_id)), row.status, row.duplicate_status, json(row.warnings_json), row.error_message, row.transaction_id === null ? null : transactionMap.get(Number(row.transaction_id)), row.version ?? 1, now, now]);
    await audit(connection, userId, "FINANCE_BACKUP_RESTORE", null, "Workbench Finance JSON", sha(canonical(payload)), validation.counts);
    const result = { restored: true, counts: validation.counts, mapping: { accounts: Object.fromEntries(accountMap), categories: Object.fromEntries(categoryMap), batches: Object.fromEntries(batchMap), transactions: Object.fromEntries(transactionMap), templates: Object.fromEntries(templateMap) } };
    await commitMutation(connection, userId, operationId, result); await connection.commit(); return result;
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
}

export async function financeReconciliation(userId: number, from?: string, to?: string) {
  const connection = await pool.getConnection();
  try {
    const [accounts] = await connection.query("SELECT a.id, a.name, a.currency, COALESCE(SUM(CASE WHEN ? IS NOT NULL AND t.business_date < ? THEN e.amount_cents ELSE 0 END), 0) start_cents, COALESCE(SUM(CASE WHEN (? IS NULL OR t.business_date >= ?) AND (? IS NULL OR t.business_date <= ?) THEN e.amount_cents ELSE 0 END), 0) movement_cents, COALESCE(SUM(CASE WHEN ? IS NULL OR t.business_date <= ? THEN e.amount_cents ELSE 0 END), 0) end_cents, COUNT(e.id) entry_count, MAX(t.business_date) latest_transaction_date FROM finance_accounts a LEFT JOIN finance_entries e ON e.account_id = a.id AND e.user_id = a.user_id LEFT JOIN finance_transactions t ON t.id = e.transaction_id AND t.user_id = a.user_id WHERE a.user_id = ? GROUP BY a.id, a.name, a.currency ORDER BY a.id", [from ?? null, from ?? null, from ?? null, from ?? null, to ?? null, to ?? null, to ?? null, to ?? null, userId]);
    const anomalies: Array<{ code: string; message: string; objectId: number | null; suggestion: string }> = [];
    const add = (code: string, message: string, objectId: number | null) => anomalies.push({ code, message, objectId, suggestion: "查看相关流水后使用现有更正或作废操作" });
    const [badEntryAccounts] = await connection.query("SELECT e.id FROM finance_entries e LEFT JOIN finance_accounts a ON a.id = e.account_id AND a.user_id = e.user_id WHERE e.user_id = ? AND a.id IS NULL", [userId]); for (const row of badEntryAccounts as any[]) add("ENTRY_ACCOUNT", "分录账户无效", Number(row.id));
    const [badEntryUsers] = await connection.query("SELECT e.id FROM finance_entries e INNER JOIN finance_transactions t ON t.id = e.transaction_id WHERE e.user_id = ? AND t.user_id <> e.user_id", [userId]); for (const row of badEntryUsers as any[]) add("ENTRY_TRANSACTION_USER", "流水与分录用户不一致", Number(row.id));
    const [badTransfers] = await connection.query("SELECT t.id FROM finance_transactions t LEFT JOIN finance_entries e ON e.transaction_id = t.id AND e.user_id = t.user_id WHERE t.user_id = ? AND t.type = ? GROUP BY t.id HAVING COUNT(e.id) <> 2 OR COALESCE(SUM(e.amount_cents), 0) <> 0", [userId, FinanceTransactionType.TRANSFER]); for (const row of badTransfers as any[]) add("TRANSFER_LEGS", "转账分录不平或缺少一条腿", Number(row.id));
    const [badRefunds] = await connection.query("SELECT r.id FROM finance_transactions r LEFT JOIN finance_transactions o ON o.id = r.related_transaction_id AND o.user_id = r.user_id WHERE r.user_id = ? AND r.type = ? AND (o.id IS NULL OR o.type <> ?)", [userId, FinanceTransactionType.REFUND, FinanceTransactionType.EXPENSE]); for (const row of badRefunds as any[]) add("REFUND_RELATION", "退款原流水关系无效", Number(row.id));
    const [overRefunds] = await connection.query("SELECT o.id FROM finance_transactions o INNER JOIN finance_entries oe ON oe.transaction_id = o.id LEFT JOIN finance_transactions r ON r.related_transaction_id = o.id AND r.type = ? AND r.status = ? LEFT JOIN finance_entries re ON re.transaction_id = r.id WHERE o.user_id = ? AND o.type = ? GROUP BY o.id HAVING COALESCE(SUM(DISTINCT re.amount_cents), 0) > -MIN(oe.amount_cents)", [FinanceTransactionType.REFUND, FinanceTransactionStatus.POSTED, userId, FinanceTransactionType.EXPENSE]); for (const row of overRefunds as any[]) add("REFUND_OVER_ORIGINAL", "累计退款超过原支出", Number(row.id));
    const [badCorrections] = await connection.query("SELECT c.id FROM finance_transactions c LEFT JOIN finance_transactions o ON o.id = c.related_transaction_id AND o.user_id = c.user_id WHERE c.user_id = ? AND c.type = ? AND (o.id IS NULL OR o.type NOT IN (?, ?))", [userId, FinanceTransactionType.CORRECTION, FinanceTransactionType.INCOME, FinanceTransactionType.EXPENSE]); for (const row of badCorrections as any[]) add("CORRECTION_RELATION", "更正原流水关系无效", Number(row.id));
    const [badRecurring] = await connection.query("SELECT o.id FROM finance_recurring_occurrences o LEFT JOIN finance_transactions t ON t.id = o.posted_transaction_id AND t.user_id = o.user_id WHERE o.user_id = ? AND o.status = 1 AND t.id IS NULL", [userId]); for (const row of badRecurring as any[]) add("RECURRING_POSTED_LINK", "已入账周期项缺少流水关系", Number(row.id));
    return { status: anomalies.length ? "ANOMALIES" : "ALL_CLEAR", period: { from: from ?? null, to: to ?? null }, anomalyCount: anomalies.length, anomalies, accounts: (accounts as any[]).map((row) => ({ accountId: Number(row.id), accountName: row.name, currency: row.currency, startBalanceCents: String(row.start_cents), signedMovementCents: String(row.movement_cents), endBalanceCents: String(row.end_cents), derivedBalanceCents: String(row.end_cents), entryCount: Number(row.entry_count), latestTransactionDate: row.latest_transaction_date, reconciled: true })) };
  } finally { connection.release(); }
}
