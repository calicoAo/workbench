import { useEffect, useRef, useState } from "react";
import { Download, FileJson, Upload } from "lucide-react";
import type { Request } from "../../app/api";
import { tx } from "../../app/i18n";
import { Badge, Button } from "../../shared/ui";
import { yuan } from "./model";

type ExportPayload = { fileName: string; contentType: string; recordCount: number; content: string };
const financeImportStatuses = {
  READY: { label: "可导入", tone: "success" },
  NEEDS_MAPPING: { label: "需要映射", tone: "warning" },
  INVALID: { label: "需要修正", tone: "danger" },
  EXACT_DUPLICATE: { label: "完全重复", tone: "danger" },
  POSSIBLE_DUPLICATE: { label: "可能重复", tone: "warning" },
  IMPORTED: { label: "已导入", tone: "success" },
  FAILED: { label: "导入失败", tone: "danger" },
} as const;

export function FinanceDataMaintenance({ request, timezone, onChanged, onReward, onGrowthChanged, onError }: { request: Request; timezone: string; onChanged: () => Promise<void>; onReward?: (label: string, reward: { xp: number; coins: number; reason: string } | null) => void; onGrowthChanged?: () => Promise<void>; onError: (message: string, title?: string) => void }) {
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [importPreview, setImportPreview] = useState<any>(null);
  const [restorePreview, setRestorePreview] = useState<any>(null);
  const [restorePayload, setRestorePayload] = useState<any>(null);
  function download(payload: ExportPayload) {
    const url = URL.createObjectURL(
      new Blob([payload.content], {
        type: `${payload.contentType};charset=utf-8`,
      }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = payload.fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }
  async function exportFinance(path: string) {
    if (!window.confirm(tx("财务数据属于敏感信息，确认主动导出吗？"))) return;
    setPending(true);
    try {
      const payload = await request<ExportPayload>(path, {
          method: "POST",
          body: JSON.stringify({ operationId: crypto.randomUUID() }),
        });
      if (!active.current) return;
      download(payload);
      setNotice(tx("财务数据已生成并下载"));
    } catch (error) {
      if (active.current) onError(message(error), tx("财务导出失败"));
    } finally {
      if (active.current) setPending(false);
    }
  }
  async function previewCsv(file: File) {
    setPending(true);
    try {
      const csv = await file.text();
      if (!active.current) return;
      const headers = csv
        .split(/\r?\n/, 1)[0]
        .split(",")
        .map((item) => item.trim());
      const find = (names: string[]) => headers.find((header) => names.some((name) => header === name || header.toLowerCase() === name.toLowerCase())) ?? "";
      const preview = await request("/api/finance/imports/external/preview", {
          method: "POST",
          body: JSON.stringify({
            operationId: crypto.randomUUID(),
            sourceName: file.name,
            csv,
            timezone,
            mapping: {
              date: find(["日期", "发生日期", "date"]),
              time: find(["时间", "发生时间", "time"]),
              amount: find(["金额", "amount"]),
              direction: find(["方向", "收支", "direction"]),
              account: find(["账户", "account"]),
              category: find(["分类", "category"]),
              note: find(["备注", "note"]),
              externalId: find(["流水号", "外部流水ID", "id"]),
            },
          }),
        });
      if (active.current) setImportPreview(preview);
    } catch (error) {
      if (active.current) onError(message(error), tx("流水预览失败"));
    } finally {
      if (active.current) setPending(false);
    }
  }
  async function confirmImport() {
    if (!importPreview || !window.confirm(tx("预览中的可导入行将写入真实账本，确认继续吗？"))) return;
    setPending(true);
    try {
      const result = await request<any>(`/api/finance/imports/${importPreview.id}/confirm`, {
        method: "POST",
        body: JSON.stringify({
          operationId: crypto.randomUUID(),
          allowPossibleDuplicates: true,
        }),
      });
      if (!active.current) return;
      if (result.reward) {
        onReward?.("财务记录", result.reward);
        await onGrowthChanged?.();
      }
      setImportPreview({ ...importPreview, result });
      await onChanged();
    } catch (error) {
      if (active.current) onError(message(error), tx("流水导入失败"));
    } finally {
      if (active.current) setPending(false);
    }
  }
  async function previewRestore(file: File) {
    setPending(true);
    setRestorePayload(null);
    setRestorePreview(null);
    try {
      const payload = JSON.parse(await file.text());
      if (!active.current) return;
      setRestorePayload(payload);
      const preview = await request("/api/finance/maintenance/restore/preview", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      if (active.current) setRestorePreview(preview);
    } catch (error) {
      if (active.current) onError(message(error), tx("备份预览失败"));
    } finally {
      if (active.current) setPending(false);
    }
  }
  async function confirmRestore() {
    if (!restorePayload || !restorePreview?.valid || !window.confirm(tx("完整恢复只允许写入空账本，确认恢复吗？"))) return;
    setPending(true);
    try {
      const result = await request("/api/finance/maintenance/restore/confirm", {
        method: "POST",
        body: JSON.stringify({ operationId: crypto.randomUUID(), backup: restorePayload }),
      });
      if (!active.current) return;
      setRestorePreview({ ...restorePreview, result });
      await onChanged();
    } catch (error) {
      if (active.current) onError(message(error), tx("备份恢复失败"));
    } finally {
      if (active.current) setPending(false);
    }
  }
  return (
    <div className="finance-data-maintenance">
      <div className="finance-data-actions">
        <Button size="sm" loading={pending} onClick={() => void exportFinance("/api/finance/maintenance/export/json")}>
          <FileJson size={14} />
          {tx("导出财务备份 JSON")}
        </Button>
        <Button size="sm" loading={pending} onClick={() => void exportFinance("/api/finance/maintenance/export/csv")}>
          <Download size={14} />
          {tx("导出财务 CSV")}
        </Button>
        <Button
          size="sm"
          loading={pending}
          onClick={async () => {
            setPending(true);
            try {
              const result = await request<any>("/api/finance/maintenance/reconciliation", {
                method: "POST",
                body: JSON.stringify({ operationId: crypto.randomUUID() }),
              });
              if (!active.current) return;
              setNotice(
                result.status === "ALL_CLEAR"
                  ? tx("账本核对：全部正常")
                  : tx("账本核对：发现 {value0} 个问题", {
                      value0: result.anomalyCount,
                    }),
              );
            } catch (error) {
              if (active.current) onError(message(error), tx("账本核对失败"));
            } finally {
              if (active.current) setPending(false);
            }
          }}
        >
          <span>{tx("账本核对")}</span>
        </Button>
      </div>
      <p className="settings-note">{tx("JSON 用于 Workbench Finance 备份/恢复；CSV 用于人工查看和外部分析，不保证完整关系恢复。")}</p>
      <label className="finance-data-upload">
        <Upload size={15} />
        <span>{tx("导入外部 CSV")}</span>
        <input
          aria-label={tx("导入外部流水 CSV")}
          disabled={pending}
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void previewCsv(file);
          }}
        />
      </label>
      {importPreview ? (
        <div className="finance-import-preview">
          <strong>{tx("导入预览 · 尚未入账")}</strong>
          <small>
            {importPreview.rows?.length ?? 0} {tx("行 ·")} {importPreview.sourceName}
          </small>
          {(importPreview.rows ?? []).slice(0, 8).map((row: any) => {
            const status = financeImportStatus(row.status);
            return (
              <div key={row.id}>
                <span>
                  <strong>
                    {row.date ?? tx("日期无效")} · {row.amountCents === null || row.amountCents === undefined ? tx("金额无效") : yuan(row.amountCents)}
                  </strong>
                  <small>
                    {row.kind === "INCOME" ? tx("收入") : row.kind === "EXPENSE" ? tx("支出") : tx("方向无效")} · {importField(row, [tx("账户"), "account"]) ?? row.accountId ?? tx("账户待映射")} · {importField(row, [tx("分类"), "category"]) ?? row.categoryId ?? tx("分类待映射")}
                  </small>
                </span>
                <Badge tone={status.tone}>{tx(status.label)}</Badge>
              </div>
            );
          })}
          {!importPreview.result ? (
            <Button size="sm" variant="primary" loading={pending} onClick={() => void confirmImport()}>
              {tx("确认导入可用行")}
            </Button>
          ) : (
            <small>
              {tx("结果：成功")} {importPreview.result.summary?.imported ?? 0} {tx("行；跳过重复")} {importPreview.result.summary?.exactDuplicate ?? 0} {tx("行；确认可能重复")} {importPreview.rows?.filter((row: any) => row.status === "POSSIBLE_DUPLICATE").length ?? 0} {tx("行；失败或待修正")} {importPreview.rows?.filter((row: any) => ["INVALID", "NEEDS_MAPPING", "FAILED"].includes(row.status)).length ?? 0} {tx("行")}
            </small>
          )}
        </div>
      ) : null}
      <label className="finance-data-upload">
        <Upload size={15} />
        <span>{tx("预览 Workbench Finance JSON 恢复")}</span>
        <input
          aria-label={tx("恢复 Finance JSON")}
          disabled={pending}
          type="file"
          accept=".json,application/json"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void previewRestore(file);
          }}
        />
      </label>
      {restorePreview ? (
        <div className="finance-import-preview">
          <strong>{tx("备份恢复预览")}</strong>
          <small>
            {tx("备份版本")} {restorePreview.schemaVersion ?? tx("未知")} · {Object.values(restorePreview.counts ?? {}).reduce((total: number, value) => total + Number(value), 0)} {tx("个对象")}
          </small>
          <small>{restorePreview.valid ? tx("可以在空账本中恢复") : restorePreview.errors?.join("；")}</small>
          {restorePreview.valid && !restorePreview.result ? (
            <Button size="sm" variant="primary" loading={pending} onClick={() => void confirmRestore()}>
              {tx("确认恢复")}
            </Button>
          ) : null}
          {restorePreview.result ? <small>{tx("恢复完成")}</small> : null}
        </div>
      ) : null}
      {notice ? (
        <p className="settings-note" role="status">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
function importField(row: any, names: string[]) {
  const source =
    typeof row.source === "string"
      ? (() => {
          try {
            return JSON.parse(row.source);
          } catch {
            return {};
          }
        })()
      : (row.source ?? {});
  return Object.entries(source).find(([key]) => names.some((name) => key.toLowerCase() === name.toLowerCase()))?.[1] as string | undefined;
}
function financeImportStatus(status: string) {
  return (
    financeImportStatuses[status as keyof typeof financeImportStatuses] ?? {
      label: "未知状态",
      tone: "warning" as const,
    }
  );
}
function message(error: unknown) {
  return error instanceof Error ? error.message : tx("操作失败");
}
