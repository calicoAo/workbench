import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Award, Flag, Gift, LockKeyhole, Plus, RefreshCw } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useSearchParams } from "react-router";
import type { Request } from "../../app/api";
import { tx } from "../../app/i18n";
import { Badge, Button } from "../../shared/ui";

type View = "overview" | "achievements" | "milestones" | "keepsakes";
type BackpackData = {
  achievements: Array<{
    id: number;
    title: string;
    description: string;
    iconKey: string;
    themeKey: string;
    unlock: {
      id: number;
      unlockedAt: string;
      sourceType: string;
      sourceId: number | null;
    } | null;
  }>;
  milestones: Array<{
    id: number;
    title: string;
    description: string | null;
    happenedOn: string;
    sourceType: string | null;
    sourceId: number | null;
    version: number;
  }>;
  keepsakes: Array<{
    id: number;
    title: string;
    description: string | null;
    happenedOn: string;
    sourceType: string | null;
    sourceId: number | null;
    sourceAvailable: boolean;
    iconKey: string;
    themeKey: string;
  }>;
  summary: {
    unlocked: number;
    achievementTotal: number;
    milestones: number;
    keepsakes: number;
  };
};

export function BackpackPage({
  request,
  userId,
  onError,
}: {
  request: Request;
  userId: number;
  onError: (message: string, title?: string) => void;
}) {
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const requestedView = params.get("view") as View | null;
  const view: View =
    requestedView &&
    ["overview", "achievements", "milestones", "keepsakes"].includes(
      requestedView,
    )
      ? requestedView
      : "overview";
  const [adding, setAdding] = useState<"milestone" | "keepsake" | null>(null);
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [source, setSource] = useState("");
  const query = useQuery({
    queryKey: ["backpack", userId],
    queryFn: () => request<BackpackData>("/api/backpack"),
  });
  const data = query.data;
  async function evaluate() {
    try {
      await request("/api/backpack/achievements/evaluate", { method: "POST" });
      await client.invalidateQueries({ queryKey: ["backpack", userId] });
    } catch (error) {
      onError(message(error));
    }
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const kind = adding!;
    try {
      await request(
        `/api/backpack/${kind === "milestone" ? "milestones" : "keepsakes"}`,
        {
          method: "POST",
          body: JSON.stringify({
            operationId: crypto.randomUUID(),
            title: values.get("title"),
            description: String(values.get("description") || "").trim() || null,
            happenedOn: values.get("happenedOn"),
            sourceType: "MANUAL_TEXT",
            ...(kind === "keepsake"
              ? {
                  iconKey: values.get("iconKey") || "gift",
                  themeKey: values.get("themeKey") || "mint",
                }
              : {}),
          }),
        },
      );
      setAdding(null);
      await client.invalidateQueries({ queryKey: ["backpack", userId] });
    } catch (error) {
      onError(message(error), tx("背包记录没有保存"));
    }
  }
  if (query.isError)
    return <section className="backpack-route"><div className="notes-error" role="alert"><p>{message(query.error)}</p><Button onClick={() => void query.refetch()}>{tx("重试")}</Button></div></section>;
  if (!data)
    return (
      <section className="backpack-route">
        <p className="route-state">{tx("正在整理背包...")}</p>
      </section>
    );
  const matches = (item: {
    title: string;
    description?: string | null;
    happenedOn?: string;
    sourceType?: string | null;
  }) =>
    (!q ||
      `${item.title} ${item.description ?? ""}`
        .toLocaleLowerCase()
        .includes(q.toLocaleLowerCase())) &&
    (!from || Boolean(item.happenedOn && item.happenedOn >= from)) &&
    (!to || Boolean(item.happenedOn && item.happenedOn <= to)) &&
    (!source || item.sourceType === source);
  const achievements = data.achievements.filter((item) =>
    matches({
      ...item,
      happenedOn: item.unlock?.unlockedAt.slice(0, 10),
      sourceType: item.unlock?.sourceType,
    }),
  );
  const milestones = data.milestones.filter(matches);
  const keepsakes = data.keepsakes.filter(matches);
  const selectedId = Number(params.get("id"));
  const selected =
    view === "achievements"
      ? achievements.find(
          (item) => item.unlock?.id === selectedId || item.id === selectedId,
        )
      : view === "milestones"
        ? milestones.find((item) => item.id === selectedId)
        : view === "keepsakes"
          ? keepsakes.find((item) => item.id === selectedId)
          : undefined;
  const setView = (next: View) => {
    const copy = new URLSearchParams(params);
    next === "overview" ? copy.delete("view") : copy.set("view", next);
    copy.delete("id");
    setParams(copy);
  };
  return (
    <section className="backpack-route">
      <header className="backpack-head">
        <div>
          <p className="route-eyebrow">Backpack</p>
          <h1>{tx("背包")}</h1>
          <p>{tx("长期保留成就、里程碑与纪念卡。")}</p>
        </div>
        <div>
          <Button onClick={() => setAdding("milestone")}>
            <Flag size={15} />
            {tx("新建里程碑")}
          </Button>
          <Button variant="primary" onClick={() => setAdding("keepsake")}>
            <Plus size={15} />
            {tx("制作纪念卡")}
          </Button>
        </div>
      </header>
      <nav className="backpack-tabs" aria-label={tx("背包视图")}>
        {(
          ["overview", "achievements", "milestones", "keepsakes"] as View[]
        ).map((key) => (
          <button
            type="button"
            className={view === key ? "is-active" : ""}
            key={key}
            onClick={() => setView(key)}
          >
              {
                {
                  overview: tx("总览"),
                  achievements: tx("成就"),
                  milestones: tx("里程碑"),
                  keepsakes: tx("纪念卡"),
                }[key]
              }
          </button>
        ))}
      </nav>
      <div className="backpack-filters">
        <input
          className="field"
          aria-label={tx("搜索背包")}
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder={tx("搜索标题或描述")}
        />
        <input
          className="field"
          aria-label={tx("开始日期")}
          type="date"
          value={from}
          onChange={(event) => setFrom(event.target.value)}
        />
        <input
          className="field"
          aria-label={tx("结束日期")}
          type="date"
          value={to}
          onChange={(event) => setTo(event.target.value)}
        />
        <select
          className="field"
          aria-label={tx("来源筛选")}
          value={source}
          onChange={(event) => setSource(event.target.value)}
        >
          <option value="">{tx("全部来源")}</option>
          {[
            "PROJECT",
            "MILESTONE",
            "ACHIEVEMENT",
            "LIBRARY",
            "ADVENTURE_LOG",
            "MANUAL_TEXT",
          ].map((value) => (
            <option key={value} value={value}>
              {sourceLabel(value)}
            </option>
          ))}
        </select>
      </div>
      {view === "overview" ? (
        <div className="backpack-summary">
          <Summary
            icon={<Award />}
            value={`${data.summary.unlocked}/${data.summary.achievementTotal}`}
            label={tx("成就解锁")}
          />
          <Summary
            icon={<Flag />}
            value={String(data.summary.milestones)}
            label={tx("里程碑")}
          />
          <Summary
            icon={<Gift />}
            value={String(data.summary.keepsakes)}
            label={tx("纪念卡")}
          />
        </div>
      ) : null}
      {view === "overview" || view === "achievements" ? (
        <section className="backpack-section">
          <header>
            <h2>{tx("成就")}</h2>
            <Button size="sm" onClick={() => void evaluate()}>
              <RefreshCw size={14} />
              {tx("检查新成就")}
            </Button>
          </header>
          <div className="achievement-grid">
            {achievements.map((item) => (
              <button
                type="button"
                className={item.unlock ? "is-unlocked" : ""}
                key={item.id}
                onClick={() =>
                  item.unlock &&
                  setParams({
                    view: "achievements",
                    id: String(item.unlock.id),
                  })
                }
              >
                <span>
                  {item.unlock ? (
                    <Award size={24} />
                  ) : (
                    <LockKeyhole size={22} />
                  )}
                </span>
                <strong>{tx(item.title)}</strong>
                <p>{tx(item.description)}</p>
                <Badge tone={item.unlock ? "success" : "neutral"}>
                  {item.unlock ? tx("已解锁") : tx("未解锁")}
                </Badge>
              </button>
            ))}
          </div>
        </section>
      ) : null}
      {view === "overview" || view === "milestones" ? (
        <section className="backpack-section">
          <header>
            <h2>{tx("里程碑")}</h2>
          </header>
          <div className="milestone-list">
            {milestones.map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() =>
                  setParams({ view: "milestones", id: String(item.id) })
                }
              >
                <Flag size={18} />
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.happenedOn}</small>
                  <p>{item.description}</p>
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}
      {view === "overview" || view === "keepsakes" ? (
        <section className="backpack-section">
          <header>
            <h2>{tx("纪念卡")}</h2>
          </header>
          <div className="keepsake-grid">
            {keepsakes.map((item) => (
              <button
                type="button"
                className={`keepsake-card theme-${item.themeKey}`}
                key={item.id}
                onClick={() =>
                  setParams({ view: "keepsakes", id: String(item.id) })
                }
              >
                <Gift size={22} />
                <small>{item.happenedOn}</small>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
                {item.sourceType && item.sourceType !== "MANUAL_TEXT" ? (
                  <Badge tone={item.sourceAvailable ? "success" : "warning"}>
                    {item.sourceAvailable ? tx("来源可用") : tx("来源不可用")}
                  </Badge>
                ) : null}
              </button>
            ))}
          </div>
        </section>
      ) : null}
      {selected ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setView(view)}
        >
          <section
            className="modal-shell backpack-detail"
            role="dialog"
            aria-modal="true"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2>{selected.title}</h2>
            <p>{selected.description}</p>
            {"happenedOn" in selected ? (
              <time>{selected.happenedOn}</time>
            ) : selected.unlock ? (
              <time>{selected.unlock.unlockedAt.slice(0, 10)}</time>
            ) : null}
            {"sourceType" in selected && selected.sourceType ? (
              <small>
                {tx("来源：{value0}", {
                  value0: sourceLabel(selected.sourceType),
                })}
              </small>
            ) : null}
            <Button onClick={() => setView(view)}>{tx("关闭")}</Button>
          </section>
        </div>
      ) : null}
      {adding ? (
        <div className="modal-backdrop" role="presentation">
          <form
            className="modal-shell backpack-create-dialog"
            onSubmit={create}
          >
            <h2>
              {adding === "milestone" ? tx("新建里程碑") : tx("制作纪念卡")}
            </h2>
            <input
              className="field"
              name="title"
              required
              maxLength={160}
              placeholder={tx("标题")}
            />
            <textarea
              className="field"
              name="description"
              maxLength={1000}
              placeholder={tx("简短描述")}
            />
            <label>
              {tx("发生日期")}
              <input
                className="field"
                name="happenedOn"
                type="date"
                required
                defaultValue={new Date().toISOString().slice(0, 10)}
              />
            </label>
            {adding === "keepsake" ? (
              <div className="library-form-row">
                <label>
                  {tx("图标")}
                  <select className="field" name="iconKey">
                    <option value="gift">Gift</option>
                    <option value="star">Star</option>
                    <option value="flag">Flag</option>
                  </select>
                </label>
                <label>
                  {tx("主题")}
                  <select className="field" name="themeKey">
                    <option value="mint">Mint</option>
                    <option value="violet">Violet</option>
                    <option value="amber">Amber</option>
                  </select>
                </label>
              </div>
            ) : null}
            <div className="category-form-actions">
              <Button type="button" onClick={() => setAdding(null)}>
                {tx("取消")}
              </Button>
              <Button variant="primary" type="submit">
                {tx("保存")}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}

function Summary({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
}) {
  return (
    <article>
      {icon}
      <strong>{value}</strong>
      <span>{label}</span>
    </article>
  );
}
function sourceLabel(value: string) {
  return tx(
    (
      {
        PROJECT: "项目",
        MILESTONE: "里程碑",
        ACHIEVEMENT: "成就",
        LIBRARY: "Library",
        ADVENTURE_LOG: "冒险日志",
        MANUAL_TEXT: "手动记录",
      } as Record<string, string>
    )[value] ?? value,
  );
}
function message(error: unknown) {
  return error instanceof Error ? error.message : tx("操作失败");
}
