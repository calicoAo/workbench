import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import { Bell, Hourglass } from "lucide-react";
import { tx } from "../../app/i18n";
import { IconButton } from "../../shared/ui";
import type { FinanceUpcomingReminder } from "../finance";

type TaskReminder = { id: number; title: string; dueAt: string | null; status: number; pinned: number };

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

function taskDeadlines(tasks: TaskReminder[], date: string) {
  return tasks.filter((task) => task.pinned && task.status < 2 && task.dueAt && Number.isFinite(Date.parse(task.dueAt))).map((task) => ({ key: `task:${task.id}`, title: task.title, detail: tx("截止倒数"), dueAt: Date.parse(task.dueAt!), to: `/tasks/${task.id}?date=${date}` }));
}

export function ReminderBell({ tasks, recurring, date, loading = false, error = false, onRetry }: { tasks: TaskReminder[]; recurring: FinanceUpcomingReminder[]; date: string; loading?: boolean; error?: boolean; onRetry?: () => void }) {
  const now = useNow();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const location = useLocation();
  useEffect(() => { setOpen(false); }, [location.pathname, location.search]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); root.current?.querySelector("button")?.focus(); } };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  const items = [
    ...taskDeadlines(tasks, date),
    ...recurring.map((item) => ({ key: `finance:${item.templateId}:${item.scheduledDate}`, title: item.name, detail: `${item.scheduledDate} ${item.scheduledTime} · ${item.categoryName} · ${item.accountName}`, dueAt: Date.parse(item.dueAt), to: "/finance?tab=recurring" }))
  ].sort((a, b) => a.dueAt - b.dueAt);
  return <div className="reminder-bell" ref={root}>
    <IconButton label={tx("主页提醒")} aria-expanded={open} aria-controls="header-reminders" onClick={() => setOpen(!open)}><Bell size={18} />{items.length ? <span className="reminder-badge">{items.length}</span> : null}</IconButton>
    {open ? <section id="header-reminders" className="reminder-popover" aria-label={tx("主页提醒")}>
      <header><h2>{tx("主页提醒")}</h2><small>{date}</small></header>
      {loading ? <p role="status">{tx("加载中...")}</p> : null}
      {error ? <p role="alert">{tx("提醒加载失败")} <button type="button" onClick={onRetry}>{tx("重试")}</button></p> : null}
      <ReminderList items={items} now={now} />
      {!items.length && !loading && !error ? <p>{tx("没有固定截止事项或近期周期缴费。")}</p> : null}
    </section> : null}
  </div>;
}

export function DeadlineCountdown({ tasks, date }: { tasks: TaskReminder[]; date: string }) {
  const now = useNow();
  const items = taskDeadlines(tasks, date).sort((a, b) => a.dueAt - b.dueAt);
  return <section className="today-countdown" aria-label={tx("截止倒数")}>
    <header><Hourglass size={16} aria-hidden="true" /><h2>{tx("截止倒数")}</h2></header>
    {items.length ? <ReminderList items={items} now={now} /> : <p>{tx("固定有截止日期的任务，即可在这里查看倒数。")}</p>}
  </section>;
}

function ReminderList({ items, now }: { items: Array<{ key: string; title: string; detail: string; dueAt: number; to: string }>; now: number }) {
  return <div className="today-reminder-list">{items.map((item) => <Link className="today-reminder-row" key={item.key} to={item.to}><span><strong>{item.title}</strong><small>{item.detail}</small></span><b className="today-reminder-countdown">{countdown(item.dueAt - now)}</b></Link>)}</div>;
}

function countdown(milliseconds: number) {
  const minutes = Math.max(1, Math.ceil(Math.abs(milliseconds) / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const remainingMinutes = minutes % 60;
  const value = days ? `${days}${tx("天")} ${hours}${tx("小时")}` : hours ? `${hours}${tx("小时")} ${remainingMinutes}${tx("分钟")}` : `${remainingMinutes}${tx("分钟")}`;
  return tx(milliseconds < 0 ? "逾期 {value0}" : "还剩 {value0}", { value0: value });
}
