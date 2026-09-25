import { type ReactNode, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Clock3, RefreshCw } from "lucide-react";
import type { AuthUser } from "../../features/auth";
import { GrowthSummary, type Growth } from "../../features/rewards";
import { WritingReflectionShortcuts } from "../../features/writing-reflection";

export type PageMode = "workspace" | "history" | "rewards";

export function WorkspaceHeader({ user, pageMode, selectedDate, growth, stats, onPageChange, onDateChange, onRefresh, onAccountView, onLogout }: {
  user: AuthUser;
  pageMode: PageMode;
  selectedDate: string;
  growth: Growth | undefined;
  stats: { totalMinutes: number; completedTasks: number } | undefined;
  onPageChange: (page: PageMode) => void;
  onDateChange: (date: string) => void;
  onRefresh: () => void;
  onAccountView: () => void;
  onLogout: () => void;
}) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <header className="glass-panel top-workbench-header sticky top-2.5 z-10">
      <div className="top-title-block"><p className="text-xs text-soft">养成系统</p><h1 className="text-lg font-bold leading-tight">今日记录</h1></div>
      <div className="top-control-bar">
        <div className="inline-flex rounded-full border border-white/80 bg-white/70 p-0.5">
          <NavButton active={pageMode === "workspace"} onClick={() => onPageChange("workspace")}>工作台</NavButton>
          <NavButton active={pageMode === "history"} tone="pink" onClick={() => onPageChange("history")}>回看统计</NavButton>
          <NavButton active={pageMode === "rewards"} tone="amber" onClick={() => onPageChange("rewards")}>奖励</NavButton>
        </div>
        <div className="time-chip" aria-label="现在时间"><Clock3 size={14} /><span>{currentTimeText()}</span></div>
        <button className="icon-button" type="button" aria-label="前一天" onClick={() => onDateChange(shiftDate(selectedDate, -1))}><ChevronLeft size={16} /></button>
        <input aria-label="工作日期" className="h-9 rounded-full border border-white/80 bg-white/70 px-3 text-[13px] outline-none focus:border-mint-300" type="date" value={selectedDate} onChange={(event) => onDateChange(event.target.value)} />
        <button className="icon-button" type="button" aria-label="后一天" onClick={() => onDateChange(shiftDate(selectedDate, 1))}><ChevronRight size={16} /></button>
        <button className="icon-button" type="button" aria-label="刷新" onClick={onRefresh}><RefreshCw size={16} /></button>
        {growth && <GrowthSummary growth={growth} />}
      </div>
      <div className="top-right-block">
        <AccountMenu user={user} onView={onAccountView} onLogout={onLogout} />
        <div className="grid grid-cols-2 gap-1.5"><MiniStat label="实际" value={formatDuration(stats?.totalMinutes ?? 0)} /><MiniStat label="完成" value={`${stats?.completedTasks ?? 0}`} /></div>
        <WritingReflectionShortcuts />
      </div>
    </header>
  );
}

function NavButton({ active, tone = "mint", onClick, children }: { active: boolean; tone?: "mint" | "pink" | "amber"; onClick: () => void; children: ReactNode }) {
  const activeClass = tone === "pink" ? "bg-pink-400 text-white" : tone === "amber" ? "bg-amber-300 text-ink" : "bg-mint-500 text-white";
  return <button className={`h-8 rounded-full px-3 text-[11px] font-semibold transition ${active ? activeClass : "text-soft hover:text-ink"}`} type="button" onClick={onClick}>{children}</button>;
}

function AccountMenu({ user, onView, onLogout }: { user: AuthUser; onView: () => void; onLogout: () => void }) {
  return (
    <details className="account-menu">
      <summary className="account-menu-trigger" title={user.username}><span className="account-avatar">{user.displayName.slice(0, 1).toUpperCase()}</span><span className="account-name">{user.displayName}</span></summary>
      <div className="account-dropdown">
        <button type="button" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); onView(); }}>查看账号</button>
        <button type="button" onClick={onLogout}>退出登录</button>
      </div>
    </details>
  );
}

function MiniStat({ label, value }: { label: string; value: ReactNode }) {
  return <div className="mini-stat"><p className="text-[11px] text-soft">{label}</p><p className="text-sm font-semibold">{value}</p></div>;
}

function todayAtNoon(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days, 12));
}

function shiftDate(date: string, days: number) {
  return todayAtNoon(date, days).toISOString().slice(0, 10);
}

function currentTimeText() {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date());
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}
