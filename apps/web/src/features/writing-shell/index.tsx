import { Archive, BookOpenText, Lightbulb, NotebookPen, SunMedium, TrendingUp } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { NavLink } from "react-router";

export type WritingPluginId = "morning" | "journal" | "review" | "notes" | "inspirations" | "archive";
export type WritingSlotKey = "MORNING_WRITING" | "JOURNAL" | "STOCK_REVIEW";

export type WritingPlugin = {
  id: WritingPluginId;
  label: string;
  icon: "sun" | "journal" | "review" | "notes" | "inspirations" | "archive";
  order: number;
  enabled: boolean;
  route: string;
  slotKey?: WritingSlotKey;
};

const LAST_TAB_PREFIX = "personal-workbench:writing-tab:v1";

const slotPluginMap: Record<WritingSlotKey, { id: WritingPluginId; label: string; icon: WritingPlugin["icon"] }> = {
  MORNING_WRITING: { id: "morning", label: "晨写", icon: "sun" },
  JOURNAL: { id: "journal", label: "日记", icon: "journal" },
  STOCK_REVIEW: { id: "review", label: "复盘", icon: "review" }
};

export function createWritingPlugins(date: string, enabledSlots: string[] = []): WritingPlugin[] {
  const enabled = new Set(enabledSlots);
  const dateQuery = `?date=${encodeURIComponent(date)}`;
  const slotPlugins = (Object.keys(slotPluginMap) as WritingSlotKey[]).map((slotKey) => {
    const item = slotPluginMap[slotKey];
    return { ...item, slotKey, order: slotKey === "MORNING_WRITING" ? 10 : slotKey === "JOURNAL" ? 20 : 30, enabled: enabled.has(slotKey), route: `/journal${dateQuery}&tab=${item.id}` };
  });
  const plugins: WritingPlugin[] = [
    ...slotPlugins,
    { id: "notes", label: "随手记", icon: "notes", order: 40, enabled: true, route: `/notes${dateQuery}` },
    { id: "inspirations", label: "灵感库", icon: "inspirations", order: 50, enabled: true, route: `/inspirations${dateQuery}` },
    { id: "archive", label: "归档", icon: "archive", order: 60, enabled: true, route: `/insights${dateQuery}` }
  ];
  return plugins.sort((a, b) => a.order - b.order);
}

export function enabledWritingPlugins(date: string, enabledSlots: string[]) {
  return createWritingPlugins(date, enabledSlots).filter((plugin) => plugin.enabled);
}

export function writingTabStorageKey(userId: number) {
  return `${LAST_TAB_PREFIX}:${userId}`;
}

export function readWritingTab(userId: number, enabled: WritingPlugin[] | WritingPluginId[]) {
  const enabledIds = new Set(enabled.map((plugin) => typeof plugin === "string" ? plugin : plugin.id));
  try {
    const value = localStorage.getItem(writingTabStorageKey(userId)) as WritingPluginId | null;
    return value && enabledIds.has(value) ? value : null;
  } catch {
    return null;
  }
}

export function rememberWritingTab(userId: number, tab: WritingPluginId) {
  try { localStorage.setItem(writingTabStorageKey(userId), tab); } catch { /* storage may be unavailable */ }
}

export function defaultWritingTab(userId: number, plugins: WritingPlugin[]) {
  const enabled = plugins.filter((plugin) => plugin.enabled);
  return readWritingTab(userId, enabled) ?? enabled[0]?.id ?? "journal";
}

const icons = {
  sun: SunMedium,
  journal: BookOpenText,
  review: TrendingUp,
  notes: NotebookPen,
  inspirations: Lightbulb,
  archive: Archive
} as const;

export function WritingShell({ userId, date, activeId, enabledSlots, children }: { userId: number; date: string; activeId: WritingPluginId; enabledSlots: string[]; children: ReactNode }) {
  const plugins = enabledWritingPlugins(date, enabledSlots);
  useEffect(() => { rememberWritingTab(userId, activeId); }, [activeId, userId]);
  return <div className="writing-shell" data-writing-date={date}>
    <nav className="writing-plugin-tabs" aria-label="文字记录导航" role="tablist">
      {plugins.map((plugin) => {
        const Icon = icons[plugin.icon];
        const active = plugin.id === activeId;
        return <NavLink key={plugin.id} className={`writing-plugin-tab ${active ? "is-active" : ""}`} to={plugin.route} role="tab" aria-selected={active} aria-current={active ? "page" : undefined}>
          <Icon size={15} aria-hidden="true" /><span>{plugin.label}</span>
        </NavLink>;
      })}
    </nav>
    {children}
  </div>;
}

export function pluginForTab(tab: string | null): WritingPluginId | null {
  return tab === "morning" || tab === "journal" || tab === "review" || tab === "notes" || tab === "inspirations" || tab === "archive" ? tab : null;
}
