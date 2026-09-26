import { CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { tx } from "../../app/i18n";

export type ChecklistTruth = { published: boolean; accepted: boolean; started: boolean; completed: boolean; note: boolean; growth: boolean };

export function NewcomerChecklist({ truth, onDismiss }: { truth: ChecklistTruth; onDismiss: () => void }) {
  const [collapsed, setCollapsed] = useState(false);
  const items = [
    ["发布第一个悬赏", truth.published],
    ["接取一个悬赏", truth.accepted],
    ["开始一次行动", truth.started],
    ["完成第一个任务", truth.completed],
    ["写下一条随手记", truth.note],
    ["查看一次成长记录", truth.growth]
  ] as const;
  return <section className="onboarding-checklist" aria-label={tx("新手冒险指南")}><header><div><p className="route-eyebrow">{tx("新手冒险指南")}</p><h2>{tx("把工作台用起来")}</h2></div><button type="button" aria-expanded={!collapsed} aria-label={collapsed ? tx("展开新手冒险指南") : tx("收起新手冒险指南")} onClick={() => setCollapsed((value) => !value)}>{collapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}</button></header>{!collapsed ? <ul>{items.map(([label, done]) => <li key={tx(label)} className={done ? "is-done" : ""}><CheckCircle2 size={17} aria-hidden="true" /><span>{tx(label)}</span></li>)}</ul> : null}<button className="onboarding-checklist-hide" type="button" onClick={onDismiss}>{tx("稍后再看")}</button></section>;
}
