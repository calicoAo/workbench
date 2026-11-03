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
import { type FormEvent, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router";
import type { Request } from "../../app/api";
import type { FeedbackActions } from "../../app/feedback";
import { tx } from "../../app/i18n";
import { Button, IconButton } from "../../shared/ui";

import { LibrarySourcePanel } from "./source-panel";
import tmdbLogo from "./assets/tmdb.svg";
import { MediaImportWorkflow, type LibrarySource } from "./import-workflow";
import { type LibraryItem, type LibraryStatus, type LibraryType, type Relation, statuses, typeLabels, statusLabels } from "./item";
import { LibraryItemEditor } from "./item-editor";
export { clearLibraryImportDrafts } from "./import-workflow";

export function LibraryPage({
  businessToday,
  onConfirm,
  request,
  userId,
  onError,
}: {
  businessToday: string;
  onConfirm: FeedbackActions["confirm"];
  request: Request;
  userId: number;
  onError: (message: string, title?: string) => void;
}) {
  const client = useQueryClient();
  const [status, setStatus] = useState<"ALL" | LibraryStatus>("ALL");
  const [type, setType] = useState<"ALL" | LibraryType>("ALL");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [importing,setImporting]=useState(false);
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
      await request<LibraryItem>("/api/library/items", {
        method: "POST",
        body: JSON.stringify({
          type: data.get("type"),
          title: data.get("title"),
          originalTitle: String(data.get("originalTitle") || "").trim() || null,
          creator: String(data.get("creator") || "").trim() || null,
          status: data.get("status"),
          finishedOn: data.get("status") === "FINISHED" ? businessToday : null,
          coverRef: String(data.get("coverRef") || "").trim() || null,
          externalRef: String(data.get("externalRef") || "").trim() || null,
          shortNote: String(data.get("shortNote") || "").trim() || null,
          releaseYear:data.get("releaseYear") ? Number(data.get("releaseYear")) : null,
          description:String(data.get("description") || "").trim() || null,
        }),
      });
      await client.invalidateQueries({ queryKey: ["library", userId] });
      setAdding(false);
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
        <div className="flex gap-2"><Button onClick={()=>setImporting(!importing)}>{tx("导入资料")}</Button><Button variant="primary" onClick={() => setAdding(true)}>
          <Plus size={15} />
          {tx("添加作品")}
        </Button></div>
      </header>
      {importing?<MediaImportWorkflow key={userId} request={request} userId={userId} onConfirm={onConfirm} onSaved={async ()=>{await client.invalidateQueries({queryKey:["library",userId]});setImporting(false);}}/>:null}
      <details className="media-source"><summary>{tx("资料来源与致谢")}</summary><img src={tmdbLogo} alt="TMDB" width={150}/><p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p><a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer">TMDB</a><a href="https://openlibrary.org" target="_blank" rel="noopener noreferrer">Open Library / Internet Archive</a></details>
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
              <Cover key={item.coverRef} item={item} />
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
                {item.finishedOn ? <small className="library-finished-on">{tx("完成日期")} · <time dateTime={item.finishedOn}>{item.finishedOn}</time></small> : item.status === "FINISHED" ? <small>{tx("完成日期未填写")}</small> : null}
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
          <form className="ui-dialog modal-shell library-create-dialog" onSubmit={create}>
            <header>
              <h2>{tx("添加作品")}</h2>
              <IconButton label={tx("关闭")} onClick={() => setAdding(false)}>
                <X size={16} />
              </IconButton>
            </header>
            <input
              className="field"
              aria-label={tx("作品名称")} name="title"
              required
              maxLength={200}
              placeholder={tx("作品名称")}
            />
            <input
              className="field"
              aria-label={tx("原名（可选）")} name="originalTitle"
              maxLength={200}
              placeholder={tx("原名（可选）")}
            />
            <div className="library-form-row">
              <select className="field" aria-label={tx("作品类型")} name="type">
                {Object.entries(typeLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {tx(label)}
                  </option>
                ))}
              </select>
              <select className="field" aria-label={tx("作品状态")} name="status">
                {statuses.slice(1).map((item) => (
                  <option key={item.key} value={item.key}>
                    {tx(item.label)}
                  </option>
                ))}
              </select>
            </div>
            <input
              className="field"
              aria-label={tx("作者、导演或工作室")} name="creator"
              maxLength={160}
              placeholder={tx("作者、导演或工作室")}
            />
            <input
              className="field"
              aria-label={tx("封面 URL（可选）")} name="coverRef"
              type="url"
              placeholder={tx("封面 URL（可选）")}
            />
            <input
              className="field"
              aria-label={tx("外部链接（可选）")} name="externalRef"
              type="url"
              placeholder={tx("外部链接（可选）")}
            />
            <input className="field" aria-label={tx("发行年份")} name="releaseYear" type="number" min={1} max={9999} placeholder={tx("发行年份")}/>
            <textarea className="field" aria-label={tx("作品简介")} name="description" maxLength={10000} rows={4} placeholder={tx("作品简介")}/>
            <textarea
              className="field"
              aria-label={tx("简短备注（长笔记请写入 Notebook）")} name="shortNote"
              maxLength={1000}
              placeholder={tx("简短备注（长笔记请写入 Notebook）")}
            />
            <footer><Button type="button" onClick={() => setAdding(false)}>{tx("取消")}</Button><Button variant="primary" type="submit">
              {tx("保存作品")}
            </Button></footer>
          </form>
        </div>
      ) : null}
    </section>
  );
}

export function LibraryDetailPage({
  businessToday,
  onConfirm,
  request,
  userId,
  itemId,
  onError,
}: {
  businessToday: string;
  onConfirm: FeedbackActions["confirm"];
  request: Request;
  userId: number;
  itemId: number;
  onError: (message: string, title?: string) => void;
}) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const editing = params.get("edit") === "1";
  const saving = useRef(false);
  const [pending, setPending] = useState(false);
  async function refresh() {
    await Promise.all([client.invalidateQueries({ queryKey: ["library-item", userId, itemId] }), client.invalidateQueries({ queryKey: ["library", userId] })]);
  }
  function returnToDetail() {
    if (location.state?.libraryEditor) navigate(-1);
    else navigate(`/library/${itemId}`, { replace: true });
  }
  const query = useQuery({
    queryKey: ["library-item", userId, itemId],
    queryFn: () =>
      request<{ item: LibraryItem; relations: Relation[]; sources:LibrarySource[] }>(
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
  async function quickSave(values: Partial<Pick<LibraryItem, "status" | "rating">>) {
    if (saving.current) return;
    saving.current = true; setPending(true);
    try {
      await request(`/api/library/items/${itemId}`, { method: "PUT", body: JSON.stringify({
        expectedVersion: item.version, ...values,
        ...(values.status === "FINISHED" && !item.finishedOn ? { finishedOn: businessToday } : {}),
      }) });
      await refresh();
    } catch (error) {
      onError(message(error), tx("作品没有保存"));
      await refresh();
    } finally { saving.current = false; setPending(false); }
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
        <Cover key={item.coverRef} item={item} />
        <div>
          <p className="route-eyebrow">{tx(typeLabels[item.type])}</p>
          <h1>{item.title}</h1>
          <p>{item.creator || tx("创作者未填写")}</p>
        </div>
        {!editing ? <Link className="ui-button ui-button-primary ui-button-md library-edit-link" to="?edit=1" state={{ libraryEditor: true }}><span className="ui-button-visual">{tx("编辑作品")}</span></Link> : null}
      </header>
      {!editing ? <section className="library-quick-record" aria-label={tx("个人记录")}>
        <label>{tx("状态")}<select className="field" aria-label={tx("作品状态")} value={item.status} disabled={pending} onChange={event => void quickSave({ status: event.target.value as LibraryStatus })}>{statuses.slice(1).map(entry => <option key={entry.key} value={entry.key}>{tx(entry.label)}</option>)}</select></label>
        <label>{tx("评分")}<select className="field" aria-label={tx("评分")} value={item.rating ?? ""} disabled={pending} onChange={event => void quickSave({ rating: event.target.value ? Number(event.target.value) : null })}><option value="">{tx("未评分")}</option>{[1,2,3,4,5].map(value => <option key={value} value={value}>{value} / 5</option>)}</select></label>
      </section> : null}
      {!editing ? <LibrarySourcePanel key={`${userId}:${itemId}:${query.data.sources?.[0]?.id ?? "manual"}`} request={request} userId={userId} item={item} source={query.data.sources?.[0]} onSaved={refresh} onConfirm={onConfirm} onError={onError}/> : null}
      <div className="library-detail-grid">
        {editing ? <LibraryItemEditor key={item.id} item={item} request={request} businessToday={businessToday} onError={onError} onCancel={returnToDetail} onSaved={async () => { await refresh(); returnToDetail(); }}/> : <article className="library-reading">
          <section><h2>{tx("作品信息")}</h2><dl className="library-facts">
            <div><dt>{tx("原名")}</dt><dd>{item.originalTitle || "—"}</dd></div>
            <div><dt>{tx("发行年份")}</dt><dd>{item.releaseYear || "—"}</dd></div>
            <div><dt>{tx("开始日期")}</dt><dd>{item.startedOn || "—"}</dd></div>
            <div><dt>{tx("完成日期")}</dt><dd>{item.finishedOn || "—"}</dd></div>
          </dl></section>
          <section><h2>{tx("作品简介")}</h2><p className="library-prose">{item.description || tx("暂无简介")}</p></section>
          <section><h2>{tx("简短备注")}</h2><p className="library-prose">{item.shortNote || tx("暂无备注")}</p></section>
          {item.externalRef ? <a className="library-external-link" href={item.externalRef} target="_blank" rel="noopener noreferrer">{tx("外部链接")} <ExternalLink size={14}/></a> : null}
        </article>}
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
  const [failed,setFailed]=useState(false);
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
      {item.coverRef && !failed ? (
        <img src={item.coverRef} referrerPolicy="no-referrer" onError={()=>setFailed(true)} alt="" />
      ) : (
        <Icon size={30} aria-hidden="true" />
      )}
    </span>
  );
}
function message(error: unknown) {
  return error instanceof Error ? error.message : tx("操作失败");
}
