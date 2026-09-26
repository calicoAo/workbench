import { Pencil, Plus, WalletCards } from "lucide-react";
import { type FormEvent, useState } from "react";
import type { Request } from "../../app/api";
import { Badge, Button, IconButton } from "../../shared/ui";
import { accountTypeLabel, yuan, type FinanceAccount, type FinanceCategory, type FinanceCategoryKind } from "./model";
import { financeErrorMessage } from "./error";
import { tx } from "../../app/i18n";

export function Accounts({
  accounts,
  categories,
  hidden,
  request,
  onCreate,
  onEdit,
  onChanged,
  onError,
}: {
  accounts: FinanceAccount[];
  categories: FinanceCategory[];
  hidden: boolean;
  request: Request;
  onCreate: () => void;
  onEdit: (account: FinanceAccount) => void;
  onChanged: () => Promise<void>;
  onError: (message: string, title?: string) => void;
}) {
  const [showArchived, setShowArchived] = useState(false);
  const shown = accounts.filter((item) => showArchived || !item.archivedAt);
  return (
    <div className="finance-accounts-layout">
      <main className="finance-panel">
        <header>
          <div>
            <p className="route-eyebrow">{tx("账户余额")}</p>
            <h2>{tx("账户")}</h2>
          </div>
          <Button variant="primary" onClick={onCreate}>
            <Plus size={16} />{tx("创建账户")}</Button>
        </header>
        <label className="finance-check">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(event) => setShowArchived(event.target.checked)}
          />{tx("显示已归档")}</label>
        <div className="finance-account-list">
          {shown.map((account) => (
            <article
              key={account.id}
              className={account.archivedAt ? "is-archived" : ""}
            >
              <span className="finance-account-icon">
                <WalletCards size={20} />
              </span>
              <div>
                <strong>{account.name}</strong>
                <small>
                  {tx(accountTypeLabel[account.type])} {tx("· CNY · 期初")}{" "}
                  {account.openingDate}
                </small>
              </div>
              <div className="finance-account-balance">
                <strong
                  className={
                    account.type === "CREDIT" &&
                    BigInt(account.balanceCents) < 0n
                      ? "is-debt"
                      : ""
                  }
                >
                  {account.type === "CREDIT" &&
                  BigInt(account.balanceCents) < 0n
                    ? tx("欠款 {value0}", { value0: yuan((-BigInt(account.balanceCents)).toString(), hidden) })
                    : yuan(account.balanceCents, hidden)}
                </strong>
                <small>
                  {account.includeInOverview ? tx("计入总览") : tx("不计入总览")}
                  {account.archivedAt ? tx(" · 已归档") : ""}
                </small>
              </div>
              <IconButton
                label={tx("编辑 {value0}", { value0: account.name })}
                onClick={() => onEdit(account)}
              >
                <Pencil size={16} />
              </IconButton>
            </article>
          ))}
        </div>
        {!shown.length ? (
          <p className="finance-empty">{tx("还没有账户。创建账户时可以同时写入期初分录。")}</p>
        ) : null}
      </main>
      <CategoryManager
        request={request}
        categories={categories}
        onChanged={onChanged}
        onError={onError}
      />
    </div>
  );
}

function CategoryManager({
  request,
  categories,
  onChanged,
  onError,
}: {
  request: Request;
  categories: FinanceCategory[];
  onChanged: () => Promise<void>;
  onError: (message: string, title?: string) => void;
}) {
  const [draft, setDraft] = useState({
    kind: "EXPENSE" as FinanceCategoryKind,
    name: "",
  });
  const [editing, setEditing] = useState<FinanceCategory | null>(null);
  const [pending, setPending] = useState(false);
  async function create(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      await request("/api/finance/categories", {
        method: "POST",
        body: JSON.stringify({
          kind: draft.kind,
          name: draft.name.trim(),
          sortOrder:
            categories.filter((item) => item.kind === draft.kind).length * 10 +
            10,
        }),
      });
      setDraft({ ...draft, name: "" });
      await onChanged();
    } catch (error) {
      onError(financeErrorMessage(error), tx("分类没有创建"));
    } finally {
      setPending(false);
    }
  }
  async function save(category: FinanceCategory, changes: object) {
    setPending(true);
    try {
      await request(`/api/finance/categories/${category.id}`, {
        method: "PUT",
        body: JSON.stringify({ expectedVersion: category.version, ...changes }),
      });
      setEditing(null);
      await onChanged();
    } catch (error) {
      onError(financeErrorMessage(error), tx("分类没有更新"));
    } finally {
      setPending(false);
    }
  }
  return (
    <aside className="finance-panel finance-categories">
      <header>
        <div>
          <p className="route-eyebrow">{tx("分类管理")}</p>
          <h2>{tx("收支分类")}</h2>
        </div>
      </header>
      <form onSubmit={create}>
        <select
          aria-label={tx("新分类类型")}
          className="field"
          value={draft.kind}
          onChange={(event) =>
            setDraft({
              ...draft,
              kind: event.target.value as FinanceCategoryKind,
            })
          }
        >
          <option value="EXPENSE">{tx("支出")}</option>
          <option value="INCOME">{tx("收入")}</option>
        </select>
        <input
          required
          aria-label={tx("新财务分类")}
          className="field"
          maxLength={64}
          placeholder={tx("分类名称")}
          value={draft.name}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
        />
        <Button loading={pending} type="submit">{tx("添加")}</Button>
      </form>
      {(["EXPENSE", "INCOME"] as const).map((kind) => (
        <section key={kind}>
          <h3>{kind === "EXPENSE" ? tx("支出") : tx("收入")}</h3>
          {categories
            .filter((item) => item.kind === kind)
            .map((item) => (
              <div className="finance-category-row" key={item.id}>
                {editing?.id === item.id ? (
                  <input
                    autoFocus
                    aria-label={tx("编辑 {value0}", { value0: item.name })}
                    className="field"
                    defaultValue={item.name}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void save(item, {
                          name: event.currentTarget.value.trim(),
                        });
                      }
                    }}
                  />
                ) : (
                  <span>
                    {item.name}
                    {!item.enabled ? (
                      <Badge tone="warning">{tx("已停用")}</Badge>
                    ) : null}
                  </span>
                )}
                <div>
                  <IconButton
                    label={tx("编辑分类 {value0}", { value0: item.name })}
                    onClick={() => setEditing(item)}
                  >
                    <Pencil size={14} />
                  </IconButton>
                  <button
                    disabled={pending}
                    onClick={() => void save(item, { enabled: !item.enabled })}
                  >
                    {item.enabled ? tx("停用") : tx("启用")}
                  </button>
                </div>
              </div>
            ))}
        </section>
      ))}
    </aside>
  );
}
