import { Archive, Check, Grid2X2, List, MoreHorizontal, Play, Plus, Search, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Badge, Button } from "../../shared/ui";
import type { Category } from "../categories";
import type { Task } from "./model";
import { difficultyLabel } from "./model";
import { CategoryTag } from "./task-ui";

type BoardView = "available" | "accepted" | "completed" | "archived";

export function BountyBoard({ tasks, categories, acceptedIds, activeTaskId, date, loading, pending, onCreate, onAccept, onStart, onEdit, onComplete, onArchive }: {
  tasks: Task[];
  categories: Category[];
  acceptedIds: number[];
  activeTaskId: number | null;
  date: string;
  loading: boolean;
  pending: boolean;
  onCreate: () => void;
  onAccept: () => void;
  onStart: (task: Task, accepted: boolean) => void;
  onEdit: (task: Task) => void;
  onComplete: (task: Task) => void;
  onArchive: (task: Task) => void;
}) {
  const [view, setView] = useState<BoardView>("available");
  const [layout, setLayout] = useState<"cards" | "list">("cards");
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState("all");
  const [priority, setPriority] = useState("all");
  const [dueSoon, setDueSoon] = useState(false);
  const categoriesById = useMemo(() => new Map(categories.map((item) => [item.id, item])), [categories]);
  const accepted = useMemo(() => new Set(acceptedIds), [acceptedIds]);
  const visible = tasks.filter((task) => {
    const inView = view === "archived" ? task.status === 3 : view === "completed" ? task.status === 2 : view === "accepted" ? accepted.has(task.id) && task.status < 2 : task.status < 2;
    const text = `${task.title} ${task.description ?? ""}`.toLowerCase();
    const deadlineMatch = !dueSoon || (Boolean(task.dueAt) && new Date(task.dueAt!).getTime() <= Date.now() + 7 * 86400000);
    return inView && (!keyword.trim() || text.includes(keyword.trim().toLowerCase())) && (category === "all" || (category === "none" ? !task.categoryId : String(task.categoryId) === category)) && (priority === "all" || String(task.priority) === priority) && deadlineMatch;
  });

  return <section className="bounty-board" aria-labelledby="bounty-heading">
    <header className="bounty-board-head"><div><p className="route-eyebrow">完整 Task pool</p><h1 id="bounty-heading" aria-label="任务">悬赏板</h1></div><div className="bounty-actions"><Button variant="secondary" type="button" onClick={onAccept}>接取到今天</Button><Button variant="primary" type="button" onClick={onCreate}><Plus size={16} />发布悬赏</Button></div></header>
    <div className="bounty-toolbar">
      <div className="segmented-control" aria-label="悬赏视图">{(["available", "accepted", "completed", "archived"] as const).map((item) => <button type="button" className={view === item ? "is-active" : ""} key={item} onClick={() => setView(item)}>{({ available: "可接取", accepted: "已接取", completed: "已完成", archived: "已归档" })[item]}</button>)}</div>
      <div className="layout-toggle"><button aria-label="卡片视图" className={layout === "cards" ? "is-active" : ""} onClick={() => setLayout("cards")}><Grid2X2 size={16} /></button><button aria-label="紧凑列表" className={layout === "list" ? "is-active" : ""} onClick={() => setLayout("list")}><List size={17} /></button></div>
    </div>
    <div className="bounty-filters"><label className="search-field"><Search size={15} /><input aria-label="搜索悬赏" placeholder="搜索悬赏" value={keyword} onChange={(event) => setKeyword(event.target.value)} /></label><select aria-label="分类" value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">全部分类</option><option value="none">Inbox / 未分类</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select aria-label="优先级" value={priority} onChange={(event) => setPriority(event.target.value)}><option value="all">全部优先级</option><option value="3">高</option><option value="2">中</option><option value="1">低</option></select><label className="filter-check"><input type="checkbox" checked={dueSoon} onChange={(event) => setDueSoon(event.target.checked)} /><SlidersHorizontal size={14} />7 天内到期</label></div>
    {loading ? <p className="route-state" role="status">正在加载悬赏...</p> : null}
    {!loading && !visible.length ? <div className="bounty-empty"><strong>这里暂时没有悬赏</strong><span>切换视图或调整筛选条件。</span></div> : null}
    <div className={`bounty-grid ${layout === "list" ? "is-list" : ""}`}>{visible.map((task) => {
      const categoryItem = task.categoryId ? categoriesById.get(task.categoryId) : null;
      const overdue = Boolean(task.dueAt) && new Date(task.dueAt!).getTime() < Date.now() && task.status < 2;
      const isAccepted = accepted.has(task.id);
      const isActive = activeTaskId === task.id;
      return <article className={`bounty-card ${isActive ? "bounty-card-active" : ""}`} key={task.id}>
        <div className="bounty-card-primary"><div className="bounty-title-line"><Link to={`/tasks/${task.id}?date=${date}`}>{task.title}</Link>{categoryItem ? <CategoryTag category={categoryItem} /> : <Badge>Inbox</Badge>}{overdue ? <Badge tone="danger">已逾期</Badge> : null}</div><p>{task.description || "暂无详情"}</p></div>
        <div className="bounty-meta"><span>进度 {task.progressPercent}%</span><span>{task.estimatedMinutes ? `预计 ${task.estimatedMinutes}m` : "未估时"}</span><span>{task.dueAt ? `截止 ${formatDate(task.dueAt)}` : "无截止"}</span><span>{difficultyLabel(task.difficulty)}</span><span className="reward-secondary">预计奖励 · 次级</span></div>
        <div className="bounty-progress"><i style={{ width: `${task.progressPercent}%` }} /></div>
        <footer><div>{task.status < 2 ? isActive ? <Badge tone="success">正在进行</Badge> : <Button variant="primary" disabled={pending} onClick={() => isAccepted ? onStart(task, true) : onAccept()}>{isAccepted ? <><Play size={15} />开始</> : "接取到今天"}</Button> : <span className="complete-label"><Check size={15} />{task.status === 2 ? "已完成" : "已归档"}</span>}</div><details className="more-menu"><summary aria-label={`更多操作：${task.title}`}><MoreHorizontal size={18} /></summary><div><Link to={`/tasks/${task.id}?date=${date}`}>详情</Link><button onClick={() => onEdit(task)}>编辑</button>{task.status < 2 ? <button onClick={() => onComplete(task)}>直接完成</button> : null}{task.status !== 3 ? <button className="danger-command" onClick={() => onArchive(task)}><Archive size={14} />归档</button> : null}</div></details></footer>
      </article>;
    })}</div>
  </section>;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value.slice(0, 10) : new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(date);
}
