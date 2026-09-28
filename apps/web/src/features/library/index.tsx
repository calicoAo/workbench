import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  ExternalLink,
  Film,
  Gamepad2,
  LibraryBig,
  Plus,
  Star,
  Tv,
  X,
} from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router";
import type { Request } from "../../app/api";
import { tx } from "../../app/i18n";
import { Button, IconButton } from "../../shared/ui";

type LibraryType = "BOOK" | "MOVIE" | "SERIES" | "GAME";
type LibraryStatus = "WANT" | "IN_PROGRESS" | "FINISHED" | "DROPPED";
type LibraryItem = {
  id: number;
  type: LibraryType;
  title: string;
  originalTitle: string | null;
  creator: string | null;
  coverRef: string | null;
  status: LibraryStatus;
  rating: number | null;
  startedOn: string | null;
  finishedOn: string | null;
  externalRef: string | null;
  shortNote: string | null;
  version: number;
  relationCount?: number;
};
type Relation = {
  id: number;
  targetType: string;
  targetId: number;
  summary: { title: string; date: string; deepLink: string } | null;
};
const statuses: Array<{ key: "ALL" | LibraryStatus; label: string }> = [
  { key: "ALL", label: "全部" },
  { key: "WANT", label: "想体验" },
  { key: "IN_PROGRESS", label: "进行中" },
  { key: "FINISHED", label: "已完成" },
  { key: "DROPPED", label: "已放下" },
];
const typeLabels: Record<LibraryType, string> = {
  BOOK: "书籍",
  MOVIE: "电影",
  SERIES: "剧集",
  GAME: "游戏",
};
const statusLabels: Record<LibraryStatus, string> = {
  WANT: "想体验",
  IN_PROGRESS: "进行中",
  FINISHED: "已完成",
  DROPPED: "已放下",
};

export function LibraryPage({
  request,
  userId,
  onError,
}: {
  request: Request;
  userId: number;
  onError: (message: string, title?: string) => void;
}) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"ALL" | LibraryStatus>("ALL");
  const [type, setType] = useState<"ALL" | LibraryType>("ALL");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const query = useQuery({
    queryKey: ["library", userId, status, type, q],
    queryFn: () =>
      request<{ items: LibraryItem[] }>(
        `/api/library/items?${new URLSearchParams({ ...(status === "ALL" ? {} : { status }), ...(type === "ALL" ? {} : { type }), ...(q ? { q } : {}) })}`,
      ),
  });
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const item = await request<LibraryItem>("/api/library/items", {
        method: "POST",
        body: JSON.stringify({
          type: data.get("type"),
          title: data.get("title"),
          originalTitle: String(data.get("originalTitle") || "").trim() || null,
          creator: String(data.get("creator") || "").trim() || null,
          status: data.get("status"),
          coverRef: String(data.get("coverRef") || "").trim() || null,
          externalRef: String(data.get("externalRef") || "").trim() || null,
          shortNote: String(data.get("shortNote") || "").trim() || null,
        }),
      });
      await client.invalidateQueries({ queryKey: ["library", userId] });
      navigate(`/library/${item.id}`);
    } catch (error) {
      onError(message(error), tx("作品没有保存"));
    }
  }
  const items = query.data?.items ?? [];
  if (query.isError) return <section className="library-route"><div className="notes-error" role="alert"><p>{message(query.error)}</p><Button onClick={() => void query.refetch()}>{tx("重试")}</Button></div></section>;
  return (
    <section className="library-route">
      <header className="library-head">
        <div>
          <p className="route-eyebrow">Library</p>
          <h1>{tx("图书馆")}</h1>
          <p>{tx("记录读过、看过、玩过和想体验的作品。")}</p>
        </div>
        <Button variant="primary" onClick={() => setAdding(true)}>
          <Plus size={15} />
          {tx("添加作品")}
        </Button>
      </header>
      <nav className="library-status-tabs" aria-label={tx("作品状态")}>
        {statuses.map((item) => (
          <button
            type="button"
            className={status === item.key ? "is-active" : ""}
            key={item.key}
            onClick={() => setStatus(item.key)}
          >
            {tx(item.label)}
          </button>
        ))}
      </nav>
      <div className="library-tools">
        <input
          className="field"
          aria-label={tx("搜索作品")}
          placeholder={tx("搜索标题或创作者")}
          value={q}
          onChange={(event) => setQ(event.target.value)}
        />
        <select
          className="field"
          aria-label={tx("作品类型")}
          value={type}
          onChange={(event) => setType(event.target.value as typeof type)}
        >
          <option value="ALL">{tx("全部类型")}</option>
          {Object.entries(typeLabels).map(([key, label]) => (
            <option key={key} value={key}>
              {tx(label)}
            </option>
          ))}
        </select>
      </div>
      {query.isPending ? (
        <p className="route-state">{tx("正在读取图书馆...")}</p>
      ) : items.length ? (
        <div className="library-grid">
          {items.map((item) => (
            <Link
              key={item.id}
              to={`/library/${item.id}`}
              className="library-item-card"
            >
              <Cover item={item} />
              <span>
                <small>
                  {tx(typeLabels[item.type])} · {tx(statusLabels[item.status])}
                </small>
                <strong>{item.title}</strong>
                <em>{item.creator || tx("创作者未填写")}</em>
                <span>
                  {item.rating ? (
                    <>
                      {Array.from({ length: item.rating }, (_, index) => (
                        <Star key={index} size={12} fill="currentColor" />
                      ))}
                    </>
                  ) : (
                    tx("未评分")
                  )}
                </span>
                <small>
                  {tx("关联记录 {value0} 条", {
                    value0: item.relationCount ?? 0,
                  })}
                </small>
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <section className="library-empty">
          <LibraryBig size={32} />
          <h2>{tx("这里还没有作品")}</h2>
          <p>{tx("从一本书、一部电影或一个游戏开始。")}</p>
        </section>
      )}
      {adding ? (
        <div className="modal-backdrop" role="presentation">
          <form className="modal-shell library-create-dialog" onSubmit={create}>
            <header>
              <h2>{tx("添加作品")}</h2>
              <IconButton label={tx("关闭")} onClick={() => setAdding(false)}>
                <X size={16} />
              </IconButton>
            </header>
            <input
              className="field"
              name="title"
              required
              maxLength={200}
              placeholder={tx("作品名称")}
            />
            <input
              className="field"
              name="originalTitle"
              maxLength={200}
              placeholder={tx("原名（可选）")}
            />
            <div className="library-form-row">
              <select className="field" name="type">
                {Object.entries(typeLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {tx(label)}
                  </option>
                ))}
              </select>
              <select className="field" name="status">
                {statuses.slice(1).map((item) => (
                  <option key={item.key} value={item.key}>
                    {tx(item.label)}
                  </option>
                ))}
              </select>
            </div>
            <input
              className="field"
              name="creator"
              maxLength={160}
              placeholder={tx("作者、导演或工作室")}
            />
            <input
              className="field"
              name="coverRef"
              type="url"
              placeholder={tx("封面 URL（可选）")}
            />
            <input
              className="field"
              name="externalRef"
              type="url"
              placeholder={tx("外部链接（可选）")}
            />
            <textarea
              className="field"
              name="shortNote"
              maxLength={1000}
              placeholder={tx("简短备注（长笔记请写入 Notebook）")}
            />
            <Button variant="primary" type="submit">
              {tx("保存作品")}
            </Button>
          </form>
        </div>
      ) : null}
    </section>
  );
}

export function LibraryDetailPage({
  request,
  userId,
  itemId,
  onError,
}: {
  request: Request;
  userId: number;
  itemId: number;
  onError: (message: string, title?: string) => void;
}) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["library-item", userId, itemId],
    queryFn: () =>
      request<{ item: LibraryItem; relations: Relation[] }>(
        `/api/library/items/${itemId}`,
      ),
  });
  const [relationType, setRelationType] = useState("QUICK_NOTE");
  const sources = useQuery({
    queryKey: ["library-relation-options", userId, relationType],
    queryFn: async () =>
      relationType === "QUICK_NOTE"
        ? (await request<any>("/api/quick-notes?state=active&limit=50")).items
        : relationType === "JOURNAL"
          ? await request<any[]>("/api/journals/list?limit=50")
          : (
              await request<any>(
                "/api/writing/inspirations?state=active&limit=50",
              )
            ).items,
  });
  if (query.isError)
    return <section className="library-route"><div className="notes-error" role="alert"><p>{message(query.error)}</p><Button onClick={() => void query.refetch()}>{tx("重试")}</Button></div></section>;
  if (!query.data)
    return (
      <section className="library-route">
        <p className="route-state">{tx("正在读取作品...")}</p>
      </section>
    );
  const { item, relations } = query.data;
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await request(`/api/library/items/${itemId}`, {
        method: "PUT",
        body: JSON.stringify({
          expectedVersion: item.version,
          type: data.get("type"),
          title: data.get("title"),
          originalTitle: String(data.get("originalTitle") || "").trim() || null,
          creator: String(data.get("creator") || "").trim() || null,
          status: data.get("status"),
          rating: data.get("rating") ? Number(data.get("rating")) : null,
          startedOn: data.get("startedOn") || null,
          finishedOn: data.get("finishedOn") || null,
          coverRef: String(data.get("coverRef") || "").trim() || null,
          externalRef: String(data.get("externalRef") || "").trim() || null,
          shortNote: String(data.get("shortNote") || "").trim() || null,
        }),
      });
      await client.invalidateQueries({
        queryKey: ["library-item", userId, itemId],
      });
      await client.invalidateQueries({ queryKey: ["library", userId] });
    } catch (error) {
      onError(message(error), tx("作品没有保存"));
    }
  }
  async function relate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (!data.get("targetId")) return;
    try {
      await request(`/api/library/items/${itemId}/relations`, {
        method: "POST",
        body: JSON.stringify({
          targetType: relationType,
          targetId: Number(data.get("targetId")),
        }),
      });
      await client.invalidateQueries({
        queryKey: ["library-item", userId, itemId],
      });
    } catch (error) {
      onError(message(error), tx("关联没有保存"));
    }
  }
  return (
    <section className="library-route">
      <Link className="route-back-link" to="/library">
        {tx("返回图书馆")}
      </Link>
      <header className="library-detail-head">
        <Cover item={item} />
        <div>
          <p className="route-eyebrow">{tx(typeLabels[item.type])}</p>
          <h1>{item.title}</h1>
          <p>{item.creator || tx("创作者未填写")}</p>
        </div>
      </header>
      <div className="library-detail-grid">
        <form className="library-editor" onSubmit={save}>
          <h2>{tx("作品信息")}</h2>
          <label>
            {tx("标题")}
            <input
              className="field"
              name="title"
              defaultValue={item.title}
              required
            />
          </label>
          <label>
            {tx("原名")}
            <input
              className="field"
              name="originalTitle"
              defaultValue={item.originalTitle ?? ""}
            />
          </label>
          <div className="library-form-row">
            <label>
              {tx("类型")}
              <select className="field" name="type" defaultValue={item.type}>
                {Object.entries(typeLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {tx(label)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {tx("状态")}
              <select
                className="field"
                name="status"
                defaultValue={item.status}
              >
                {statuses.slice(1).map((entry) => (
                  <option key={entry.key} value={entry.key}>
                    {tx(entry.label)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            {tx("创作者")}
            <input
              className="field"
              name="creator"
              defaultValue={item.creator ?? ""}
            />
          </label>
          <label>
            {tx("评分")}
            <select
              className="field"
              name="rating"
              defaultValue={item.rating ?? ""}
            >
              <option value="">{tx("未评分")}</option>
              {[1, 2, 3, 4, 5].map((value) => (
                <option key={value} value={value}>
                  {value} / 5
                </option>
              ))}
            </select>
          </label>
          <div className="library-form-row">
            <label>
              {tx("开始日期")}
              <input
                className="field"
                type="date"
                name="startedOn"
                defaultValue={item.startedOn ?? ""}
              />
            </label>
            <label>
              {tx("完成日期")}
              <input
                className="field"
                type="date"
                name="finishedOn"
                defaultValue={item.finishedOn ?? ""}
              />
            </label>
          </div>
          <label>
            {tx("封面 URL")}
            <input
              className="field"
              type="url"
              name="coverRef"
              defaultValue={item.coverRef ?? ""}
            />
          </label>
          <label>
            {tx("外部链接")}
            <input
              className="field"
              type="url"
              name="externalRef"
              defaultValue={item.externalRef ?? ""}
            />
          </label>
          <label>
            {tx("简短备注")}
            <textarea
              className="field"
              name="shortNote"
              defaultValue={item.shortNote ?? ""}
            />
          </label>
          <Button variant="primary" type="submit">
            {tx("保存更改")}
          </Button>
        </form>
        <section className="library-relations">
          <h2>{tx("Notebook 关联")}</h2>
          <p>{tx("只保存引用，不复制笔记正文。")}</p>
          <form onSubmit={relate}>
            <select
              className="field"
              value={relationType}
              onChange={(event) => setRelationType(event.target.value)}
            >
              <option value="QUICK_NOTE">{tx("随手记")}</option>
              <option value="JOURNAL">{tx("日记")}</option>
              <option value="INSPIRATION">{tx("灵感")}</option>
            </select>
            <select
              className="field"
              name="targetId"
              aria-label={tx("选择 Notebook 记录")}
            >
              <option value="">{tx("选择记录")}</option>
              {(sources.data ?? []).map((row: any) => (
                <option key={row.id} value={row.id}>
                  {row.title || row.journalDate || row.noteDate || `#${row.id}`}
                </option>
              ))}
            </select>
            <Button type="submit">
              <Plus size={14} />
              {tx("添加关联")}
            </Button>
          </form>
          <div>
            {relations.map((relation) =>
              relation.summary ? (
                <Link key={relation.id} to={relation.summary.deepLink}>
                  <span>
                    <strong>{relation.summary.title}</strong>
                    <small>
                      {relation.targetType} · {relation.summary.date}
                    </small>
                  </span>
                  <ExternalLink size={15} />
                </Link>
              ) : (
                <div className="library-relation-unavailable" key={relation.id}>
                  {tx("来源不可用")}
                </div>
              ),
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

function Cover({ item }: { item: LibraryItem }) {
  const Icon =
    item.type === "BOOK"
      ? BookOpen
      : item.type === "MOVIE"
        ? Film
        : item.type === "SERIES"
          ? Tv
          : Gamepad2;
  return (
    <span className="library-cover">
      {item.coverRef ? (
        <img src={item.coverRef} alt="" />
      ) : (
        <Icon size={30} aria-hidden="true" />
      )}
    </span>
  );
}
function message(error: unknown) {
  return error instanceof Error ? error.message : tx("操作失败");
}
