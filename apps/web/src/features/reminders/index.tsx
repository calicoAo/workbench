import { useEffect, useState } from "react";
import { Link } from "react-router";
import { BellRing } from "lucide-react";
import { tx } from "../../app/i18n";
import type { FinanceUpcomingReminder } from "../finance";

type TaskReminder = { id: number; title: string; dueAt: string | null; status: number; pinned: number };

export function TodayReminders({ tasks, recurring, date }: { tasks: TaskReminder[]; recurring: FinanceUpcomingReminder[]; date: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const items = [
    ...tasks.filter((task) => task.pinned && task.status < 2 && task.dueAt && Number.isFinite(Date.parse(task.dueAt))).map((task) => ({ key: `task:${task.id}`, title: task.title, detail: tx("截止倒数"), dueAt: new Date(task.dueAt!).getTime(), to: `/tasks/${task.id}?date=${date}` })),
    ...recurring.map((item) => ({ key: `finance:${item.templateId}:${item.scheduledDate}`, title: item.name, detail: `${item.scheduledDate} ${item.scheduledTime} · ${item.categoryName} · ${item.accountName}`, dueAt: Date.parse(item.dueAt), to: "/finance?tab=recurring" }))
  ].sort((a, b) => a.dueAt - b.dueAt);
  return <section className="today-reminders" aria-labelledby="today-reminders-title">
    <header className="flex items-center gap-2"><BellRing size={16} aria-hidden="true" /><h2 id="today-reminders-title" className="text-xs font-bold">{tx("主页提醒")}</h2></header>
    {items.length ? <div className="today-reminder-list">{items.map((item) => <Link className="today-reminder-row" key={item.key} to={item.to}><span><strong>{item.title}</strong><small>{item.detail}</small></span><b className="today-reminder-countdown">{countdown(item.dueAt - now)}</b></Link>)}</div> : <p className="text-[11px] text-soft">{tx("没有固定截止事项或近期周期缴费。")}</p>}
  </section>;
}

function countdown(milliseconds: number) {
  const minutes = Math.max(1, Math.ceil(Math.abs(milliseconds) / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const remainingMinutes = minutes % 60;
  const value = days ? `${days}${tx("天")} ${hours}${tx("小时")}` : hours ? `${hours}${tx("小时")} ${remainingMinutes}${tx("分钟")}` : `${remainingMinutes}${tx("分钟")}`;
  return tx(milliseconds < 0 ? "逾期 {value0}" : "还剩 {value0}", { value0: value });
}
