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
      onError(message(error), account ? "账户没有更新" : "账户没有创建");
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
      onError(message(error), "账户状态没有更新");
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
            <p className="route-eyebrow">{account ? "账户设置" : "建立账本"}</p>
            <h2>{account ? account.name : "创建账户"}</h2>
          </div>
          <IconButton label="关闭" type="button" onClick={onClose}>
            <X size={17} />
          </IconButton>
        </header>
        <label>
          账户名称
          <input
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
          <label>
            账户类型
            <select
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
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            币种
            <input className="field" disabled value="CNY" />
          </label>
        </div>
        {!account ? (
          <div className="finance-form-grid">
            <label>
              期初日期
              <input
                required
                className="field"
                type="date"
                value={draft.openingDate}
                onChange={(event) =>
                  setDraft({ ...draft, openingDate: event.target.value })
                }
              />
            </label>
            <label>
              期初余额（元）
              <input
                required
                className="field"
                inputMode="decimal"
                aria-label="期初余额"
                value={draft.openingBalance}
                onChange={(event) =>
                  setDraft({ ...draft, openingBalance: event.target.value })
                }
              />
              <small>期初只在创建时写入；后续更正将在下一阶段提供。</small>
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
          />
          计入总览净值
        </label>
        <footer>
          {account ? (
            <Button
              type="button"
              variant="danger"
              disabled={pending}
              onClick={() => void archive()}
            >
              <Archive size={15} />
              {account.archivedAt ? "恢复账户" : "归档账户"}
            </Button>
          ) : (
            <span />
          )}
          <div>
            <Button type="button" onClick={onClose}>
              取消
            </Button>
            <Button variant="primary" loading={pending} type="submit">
              保存
            </Button>
          </div>
        </footer>
      </form>
    </div>
  );
}

function message(error: unknown) {
  return error instanceof Error ? error.message : "操作失败";
}
