import { type FormEvent, useState } from "react";
import type { Request } from "../../app/api";
import { Button, IconButton } from "../../shared/ui";
import { decimalToCents, financeMonthRange, yuan, type FinanceAccount, type FinanceCategory, type FinanceRecurringOccurrence, type FinanceRecurringTemplate } from "./model";
import { financeErrorMessage } from "./error";
import { tx } from "../../app/i18n";
import { Pencil, X } from "lucide-react";

type Draft = {
  name: string;
  type: "INCOME" | "EXPENSE";
  amount: string;
  accountId: string;
  categoryId: string;
  frequency: "MONTHLY" | "WEEKLY";
  scheduleValue: string;
  scheduledTime: string;
  startDate: string;
  endDate: string;
};

function emptyDraft(date: string): Draft {
  return { name: "", type: "EXPENSE", amount: "", accountId: "", categoryId: "", frequency: "MONTHLY", scheduleValue: "1", scheduledTime: "09:00", startDate: date, endDate: "" };
}

function centsInput(value: string) {
  const amount = BigInt(value);
  const absolute = amount < 0n ? -amount : amount;
  return `${amount < 0n ? "-" : ""}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}

function recurrenceLabel(item: FinanceRecurringTemplate) {
  if (item.frequency === "MONTHLY") return tx("每月 {value0} 日", { value0: item.scheduleValue });
  const weekdays = [tx("周日"), tx("周一"), tx("周二"), tx("周三"), tx("周四"), tx("周五"), tx("周六")];
  return tx("每周 {value0}", { value0: weekdays[item.scheduleValue] ?? weekdays[1] });
}

export function Recurring({ request, date, accounts, categories, templates, occurrences, onChanged, onReward, onGrowthChanged, onError }: {
  request: Request;
  date: string;
  accounts: FinanceAccount[];
  categories: FinanceCategory[];
  templates: FinanceRecurringTemplate[];
  occurrences: FinanceRecurringOccurrence[];
  onChanged: () => Promise<void>;
  onReward?: (label: string, reward: { xp: number; coins: number; reason: string } | null) => void;
  onGrowthChanged?: () => Promise<void>;
  onError: (message: string, title?: string) => void;
}) {
  const [draft, setDraft] = useState(() => emptyDraft(date));
  const [editing, setEditing] = useState<FinanceRecurringTemplate | null>(null);
  const [pending, setPending] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [preparation, setPreparation] = useState<{ created: number; existing: number } | null>(null);
  const enabledTemplates = templates.filter((item) => item.enabled);
  const selected = enabledTemplates.filter((item) => selectedIds.includes(item.id)).map((item) => item.id);
  async function save(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      const payload = {
        type: draft.type,
        name: draft.name.trim(),
        amountCents: decimalToCents(draft.amount),
        accountId: Number(draft.accountId),
        categoryId: Number(draft.categoryId),
        frequency: draft.frequency,
        scheduleValue: Number(draft.scheduleValue),
        scheduledTime: draft.scheduledTime,
        startDate: draft.startDate || date,
        endDate: draft.endDate || null,
      };
      await request(editing ? `/api/finance/recurring-templates/${editing.id}` : "/api/finance/recurring-templates", {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify({ operationId: crypto.randomUUID(), ...(editing ? { expectedVersion: editing.version } : {}), ...payload }),
      });
      setDraft(emptyDraft(date));
      setEditing(null);
      await onChanged();
    } catch (error) {
      onError(financeErrorMessage(error), editing ? tx("周期模板没有更新") : tx("周期模板没有创建"));
    } finally {
      setPending(false);
    }
  }
  function edit(item: FinanceRecurringTemplate) {
    setEditing(item);
    setDraft({ name: item.name, type: item.type, amount: centsInput(item.amountCents), accountId: String(item.accountId), categoryId: String(item.categoryId), frequency: item.frequency, scheduleValue: String(item.scheduleValue), scheduledTime: item.scheduledTime, startDate: item.startDate, endDate: item.endDate ?? "" });
  }
  async function toggleEnabled(item: FinanceRecurringTemplate) {
    try {
      await request(`/api/finance/recurring-templates/${item.id}`, { method: "PUT", body: JSON.stringify({ operationId: crypto.randomUUID(), expectedVersion: item.version, enabled: !item.enabled }) });
      setSelectedIds((ids) => ids.filter((id) => id !== item.id));
      await onChanged();
    } catch (error) {
      onError(financeErrorMessage(error), tx("周期模板没有更新"));
    }
  }
  async function prepare() {
    if (preparing || selected.length === 0) return;
    setPreparing(true);
    setPreparation(null);
    try {
      const result = await request<{ created: number; existing: number }>("/api/finance/recurring-occurrences/prepare", { method: "POST", body: JSON.stringify({ operationId: crypto.randomUUID(), ...financeMonthRange(date), templateIds: selected }) });
      setPreparation(result);
      await onChanged();
    } catch (error) {
      onError(financeErrorMessage(error), tx("周期发生项没有准备"));
    } finally {
      setPreparing(false);
    }
  }
  async function act(item: FinanceRecurringOccurrence, action: "confirm" | "skip") {
    try {
      const result = await request<{ reward?: { xp: number; coins: number; reason: string } | null }>(`/api/finance/recurring-occurrences/${item.id}/${action}`, { method: "POST", body: JSON.stringify({ operationId: crypto.randomUUID(), expectedVersion: item.version }) });
      if (action === "confirm" && result.reward) {
        onReward?.("财务记录", result.reward);
        await onGrowthChanged?.();
      }
      await onChanged();
    } catch (error) {
      onError(financeErrorMessage(error), tx("周期发生项操作失败"));
    }
  }
  return <section className="finance-panel finance-recurring-page">
    <header>
      <div><p className="route-eyebrow">{tx("周期计划")}</p><h2>{tx("周期收支")}</h2><p className="finance-recurring-note">{tx("确认入账后会影响真实余额；跳过不会入账。")}</p></div>
    </header>
    <h3 className="finance-step-title"><span>1</span>{tx("周期模板")}</h3>
    <form className="finance-form-grid finance-recurring-form" onSubmit={save}>
      <input aria-label={tx("模板名称")} className="field" required placeholder={tx("模板名称")} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
      <input aria-label={tx("金额")} className="field" required inputMode="decimal" placeholder={tx("金额")} value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} />
      <select aria-label={tx("收支类型")} className="field" value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as Draft["type"] })}><option value="EXPENSE">{tx("支出")}</option><option value="INCOME">{tx("收入")}</option></select>
      <select aria-label={tx("账户")} className="field" required value={draft.accountId} onChange={(event) => setDraft({ ...draft, accountId: event.target.value })}><option value="">{tx("账户")}</option>{accounts.filter((item) => !item.archivedAt).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select>
      <select aria-label={tx("分类")} className="field" required value={draft.categoryId} onChange={(event) => setDraft({ ...draft, categoryId: event.target.value })}><option value="">{tx("分类")}</option>{categories.filter((item) => item.kind === draft.type && item.enabled).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select>
      <select aria-label={tx("周期") } className="field" value={draft.frequency} onChange={(event) => setDraft({ ...draft, frequency: event.target.value as Draft["frequency"], scheduleValue: "1" })}><option value="MONTHLY">{tx("每月")}</option><option value="WEEKLY">{tx("每周")}</option></select>
      {draft.frequency === "MONTHLY" ? <label>{tx("发生日")}<input aria-label={tx("发生日")} className="field" type="number" min="1" max="31" required value={draft.scheduleValue} onChange={(event) => setDraft({ ...draft, scheduleValue: event.target.value })} /></label> : <label>{tx("星期")}<select aria-label={tx("星期")} className="field" value={draft.scheduleValue} onChange={(event) => setDraft({ ...draft, scheduleValue: event.target.value })}><option value="0">{tx("周日")}</option><option value="1">{tx("周一")}</option><option value="2">{tx("周二")}</option><option value="3">{tx("周三")}</option><option value="4">{tx("周四")}</option><option value="5">{tx("周五")}</option><option value="6">{tx("周六")}</option></select></label>}
      <label>{tx("发生时间提醒")}<input aria-label={tx("发生时间提醒")} className="field" type="time" required value={draft.scheduledTime} onChange={(event) => setDraft({ ...draft, scheduledTime: event.target.value })} /></label>
      <label>{tx("开始日期")}<input aria-label={tx("开始日期")} className="field" type="date" required value={draft.startDate} onChange={(event) => setDraft({ ...draft, startDate: event.target.value })} /></label>
      <label>{tx("结束日期")}<input aria-label={tx("结束日期")} className="field" type="date" value={draft.endDate} onChange={(event) => setDraft({ ...draft, endDate: event.target.value })} /></label>
      <div className="finance-recurring-form-actions"><Button loading={pending} type="submit">{editing ? tx("保存模板") : tx("创建模板")}</Button>{editing ? <Button type="button" onClick={() => { setEditing(null); setDraft(emptyDraft(date)); }}><X size={14} />{tx("取消")}</Button> : null}</div>
    </form>
    <section className="finance-prepare-step" aria-label={tx("选择模板并生成")}>
      <h3 className="finance-step-title"><span>2</span>{tx("选择模板并生成")}</h3>
      <p>{tx("勾选要生成的模板，再生成 {value0} 待确认项；此操作不会入账。", { value0: date.slice(0, 7) })}</p>
      {enabledTemplates.length > 0 ? <label className="finance-template-select-all"><input type="checkbox" disabled={preparing} checked={selected.length === enabledTemplates.length} onChange={(event) => setSelectedIds(event.target.checked ? enabledTemplates.map((item) => item.id) : [])} />{tx("全选启用模板")}</label> : null}
      {templates.map((item) => <div className="finance-recurring-template" key={item.id}>
        <label className="finance-template-choice"><input type="checkbox" aria-label={tx("选择模板：{value0}", { value0: item.name })} disabled={!item.enabled || preparing} checked={selected.includes(item.id)} onChange={(event) => setSelectedIds((ids) => event.target.checked ? [...ids, item.id] : ids.filter((id) => id !== item.id))} /><span><strong>{item.name}</strong><small>{item.type === "INCOME" ? tx("收入") : tx("支出")} · {recurrenceLabel(item)} · {item.scheduledTime} · {item.accountName}{item.enabled ? null : <> · {tx("已停用")}</>}</small></span></label>
        <b>{yuan(item.amountCents)}</b><div className="finance-recurring-template-actions"><IconButton disabled={preparing} label={tx("编辑模板")} onClick={() => edit(item)}><Pencil size={15} /></IconButton><Button disabled={preparing} onClick={() => void toggleEnabled(item)}>{item.enabled ? tx("停用模板") : tx("启用模板")}</Button></div>
      </div>)}
      {templates.length === 0 ? <p>{tx("先创建周期模板，再选择要生成的项目。")}</p> : null}
      <div className="finance-prepare-actions"><span>{tx("已选择 {value0} 个模板", { value0: selected.length })}</span><Button disabled={selected.length === 0} loading={preparing} onClick={() => void prepare()}>{tx("生成本月待确认项")}</Button></div>
    </section>
    <h3 className="finance-step-title"><span>3</span>{tx("待确认发生项")}</h3>
    {preparation ? <p className="finance-prepare-result" role="status">{preparation.created + preparation.existing === 0
      ? tx("所选模板本月没有匹配的发生日期，请检查发生日和起止日期。")
      : tx("新增 {value0} 项，已有 {value1} 项未重复生成。请在下方待确认项中确认入账；已入账或跳过的项目不会再次出现。", { value0: preparation.created, value1: preparation.existing })}</p> : null}
    <div className="finance-occurrence-list">{occurrences.filter((item) => item.status === "PENDING").map((item) => <article key={item.id}><div><strong>{item.templateName}</strong><small>{tx("预计入账 · 未入账 ·")} {item.scheduledDate} {item.scheduledTime} · {item.categoryName} · {yuan(item.amountCentsSnapshot)}</small></div><div><Button onClick={() => void act(item, "confirm")}>{tx("确认入账")}</Button><Button onClick={() => void act(item, "skip")}>{tx("跳过")}</Button></div></article>)}</div>
    {occurrences.filter((item) => item.status === "PENDING").length === 0 ? <p className="finance-empty">{tx("没有待确认发生项。准备后才会出现，不会自动影响余额。")}</p> : null}
  </section>;
}
