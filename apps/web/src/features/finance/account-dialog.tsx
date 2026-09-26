import { type FormEvent, useEffect, useState } from "react";
import { Archive, X } from "lucide-react";
import type { Request } from "../../app/api";
import { Button, IconButton } from "../../shared/ui";
import {
  accountTypeLabel,
  decimalToCents,
  type FinanceAccount,
  type FinanceAccountType,
} from "./model";
import { tx } from "../../app/i18n";

export function AccountDialog({
  account,
  date,
  request,
  onClose,
  onSaved,
  onError,
}: {
  account: FinanceAccount | null;
  date: string;
  request: Request;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onError: (message: string, title?: string) => void;
}) {
  const [draft, setDraft] = useState({
    name: "",
    type: "BANK" as FinanceAccountType,
    openingDate: date,
    openingBalance: "0.00",
    includeInOverview: true,
  });
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (account)
      setDraft({
        name: account.name,
        type: account.type,
        openingDate: account.openingDate,
        openingBalance: "0.00",
        includeInOverview: account.includeInOverview,
      });
  }, [account]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      await request(
        account
          ? `/api/finance/accounts/${account.id}`
          : "/api/finance/accounts",
        {
          method: account ? "PUT" : "POST",
          body: JSON.stringify(
            account
              ? {
                  expectedVersion: account.version,
                  name: draft.name.trim(),
                  includeInOverview: draft.includeInOverview,
                }
              : {
                  operationId: crypto.randomUUID(),
                  name: draft.name.trim(),
                  type: draft.type,
                  currency: "CNY",
                  openingDate: draft.openingDate,
                  openingBalanceCents: decimalToCents(draft.openingBalance),
                  includeInOverview: draft.includeInOverview,
                },
          ),
        },
      );
      await onSaved();
      onClose();
    } catch (error) {
      onError(message(error), account ? tx("账户没有更新") : tx("账户没有创建"));
    } finally {
      setPending(false);
    }
  }
  async function archive() {
    if (!account) return;
    setPending(true);
    try {
      const action = account.archivedAt ? "unarchive" : "archive";
      await request(`/api/finance/accounts/${account.id}/${action}`, {
        method: "POST",
        body: JSON.stringify({
          operationId: crypto.randomUUID(),
          expectedVersion: account.version,
        }),
      });
      await onSaved();
      onClose();
    } catch (error) {
      onError(message(error), tx("账户状态没有更新"));
    } finally {
      setPending(false);
    }
  }
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form className="time-modal finance-dialog" onSubmit={submit}>
        <header>
          <div>
            <p className="route-eyebrow">{account ? tx("账户设置") : tx("建立账本")}</p>
            <h2>{account ? account.name : tx("创建账户")}</h2>
          </div>
          <IconButton label={tx("关闭")} type="button" onClick={onClose}>
            <X size={17} />
          </IconButton>
        </header>
        <label>{tx("账户名称")}<input
            autoFocus
            required
            className="field"
            maxLength={120}
            value={draft.name}
            onChange={(event) =>
              setDraft({ ...draft, name: event.target.value })
            }
          />
        </label>
        <div className="finance-form-grid">
          <label>{tx("账户类型")}<select
              className="field"
              disabled={Boolean(account)}
              value={draft.type}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  type: event.target.value as FinanceAccountType,
                })
              }
            >
              {Object.entries(accountTypeLabel).map(([value, label]) => (
                <option value={value} key={value}>
                  {tx(label)}
                </option>
              ))}
            </select>
          </label>
          <label>{tx("币种")}<input className="field" disabled value="CNY" />
          </label>
        </div>
        {!account ? (
          <div className="finance-form-grid">
            <label>{tx("期初日期")}<input
                required
                className="field"
                type="date"
                value={draft.openingDate}
                onChange={(event) =>
                  setDraft({ ...draft, openingDate: event.target.value })
                }
              />
            </label>
            <label>{tx("期初余额（元）")}<input
                required
                className="field"
                inputMode="decimal"
                aria-label={tx("期初余额")}
                value={draft.openingBalance}
                onChange={(event) =>
                  setDraft({ ...draft, openingBalance: event.target.value })
                }
              />
              <small>{tx("期初只在创建时写入；后续更正将在下一阶段提供。")}</small>
            </label>
          </div>
        ) : null}
        <label className="finance-check">
          <input
            type="checkbox"
            checked={draft.includeInOverview}
            onChange={(event) =>
              setDraft({ ...draft, includeInOverview: event.target.checked })
            }
          />{tx("计入总览净值")}</label>
        <footer>
          {account ? (
            <Button
              type="button"
              variant="danger"
              disabled={pending}
              onClick={() => void archive()}
            >
              <Archive size={15} />
              {account.archivedAt ? tx("恢复账户") : tx("归档账户")}
            </Button>
          ) : (
            <span />
          )}
          <div>
            <Button type="button" onClick={onClose}>{tx("取消")}</Button>
            <Button variant="primary" loading={pending} type="submit">{tx("保存")}</Button>
          </div>
        </footer>
      </form>
    </div>
  );
}

function message(error: unknown) {
  return error instanceof Error ? error.message : tx("操作失败");
}
