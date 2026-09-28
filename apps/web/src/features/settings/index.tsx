import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ChevronRight, Download, Eye, EyeOff, FileJson, LogOut, Plus, Save, Search, Trash2, Upload, Sparkles, X } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import type { Request } from "../../app/api";
import { type Locale, useI18n } from "../../app/i18n";
import { Badge, Button, IconButton } from "../../shared/ui";
import { yuan } from "../finance";
import { tx } from "../../app/i18n";

type Category = {
  id: number;
  name: string;
  color: string;
  dimensionKey: string | null;
  targetMinutes: number;
  enabled: number;
};
export type WritingSlot = {
  slotKey: "MORNING_WRITING" | "JOURNAL" | "STOCK_REVIEW";
  enabled: boolean;
  sortOrder: number;
};
export type FontScale = 90 | 100 | 110;
export type SettingsSnapshot = {
  profile: {
    id: number;
    username: string;
    displayName: string;
    timezone: string;
  };
  appearance: {
    theme: "light";
    reducedMotion: boolean;
    fontScale: FontScale;
    locale: Locale;
  };
  rewards: { show: boolean };
  continuation: { mode: "manual"; automaticAvailable: false };
  categories: Category[];
  writingSlots: WritingSlot[];
};
type ExportFormat = "json" | "csv" | "markdown";
type ExportPayload = {
  fileName: string;
  contentType: string;
  recordCount: number;
  content: string;
};
const financeImportStatuses = {
  READY: { label: "可导入", tone: "success" },
  NEEDS_MAPPING: { label: "需要映射", tone: "warning" },
  INVALID: { label: "需要修正", tone: "danger" },
  EXACT_DUPLICATE: { label: "完全重复", tone: "danger" },
  POSSIBLE_DUPLICATE: { label: "可能重复", tone: "warning" },
  IMPORTED: { label: "已导入", tone: "success" },
  FAILED: { label: "导入失败", tone: "danger" },
} as const;
const SETTINGS_TOPICS = ["hero", "general", "appearance", "adventure", "notebook", "growth", "wallet", "ai", "data", "help", "account"] as const;
type SettingsTopic = (typeof SETTINGS_TOPICS)[number];
const TOPIC_LABELS: Record<SettingsTopic, string> = {
  hero: "Hero",
  general: "通用",
  appearance: "外观",
  adventure: "冒险",
  notebook: "笔记本",
  growth: "成长",
  wallet: "钱包",
  ai: "AI",
  data: "数据",
  help: "帮助",
  account: "账号",
};

export function useSettings(request: Request, userId: number) {
  return useQuery({
    queryKey: ["settings", userId],
    queryFn: () => request<SettingsSnapshot>("/api/settings"),
  });
}

export function SettingsFeature({ request, userId, logout, onProfileChanged, onError }: { request: Request; userId: number; logout: () => void; onProfileChanged: (profile: SettingsSnapshot["profile"]) => void; onError: (message: string, title?: string) => void }) {
  const { setLocale, t } = useI18n();
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const query = useSettings(request, userId);
  const [displayName, setDisplayName] = useState("");
  const [timezone, setTimezone] = useState("");
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (query.data) {
      setDisplayName(query.data.profile.displayName);
      setTimezone(query.data.profile.timezone);
    }
  }, [query.data]);
  async function patch(values: Record<string, unknown>) {
    const updated = await request<SettingsSnapshot>("/api/settings", {
      method: "PATCH",
      body: JSON.stringify(values),
    });
    queryClient.setQueryData(["settings", userId], updated);
    onProfileChanged(updated.profile);
    setLocale(updated.appearance.locale);
    return updated;
  }
  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      await patch({ displayName: displayName.trim(), timezone });
    } catch (error) {
      onError(message(error), t("设置没有保存"));
    } finally {
      setPending(false);
    }
  }
  if (query.isPending)
    return (
      <section className="settings-route">
        <p className="route-state">{t("正在加载设置...")}</p>
      </section>
    );
  if (!query.data || query.isError)
    return (
      <section className="settings-route">
        <div className="notes-error">
          <p>{query.error instanceof Error ? query.error.message : t("设置加载失败")}</p>
          <Button onClick={() => void query.refetch()}>{t("重试")}</Button>
        </div>
      </section>
    );
  const data = query.data;
  const requested = params.get("topic");
  const topic: SettingsTopic = SETTINGS_TOPICS.includes(requested as SettingsTopic) ? (requested as SettingsTopic) : "general";
  const selectTopic = (next: SettingsTopic) => {
    const copy = new URLSearchParams(params);
    if (next === "general") copy.delete("topic");
    else copy.set("topic", next);
    setParams(copy, { replace: true });
  };
  const refreshCategories = async () => {
    await query.refetch();
    await Promise.all([queryClient.invalidateQueries({ queryKey: ["today", userId] }), queryClient.invalidateQueries({ queryKey: ["tasks", userId] }), queryClient.invalidateQueries({ queryKey: ["growth-config", userId] })]);
  };
  let content: React.ReactNode;
  if (topic === "hero")
    content = (
      <section className="settings-section">
        <h2>{tx("Hero Identity")}</h2>
        <p className="settings-note">{tx("英雄展示资料、出生日期与每日状态由 Hero Profile 独立管理。")}</p>
        <Link className="settings-topic-link" to="/hero">
          <span>
            <strong>{tx("打开 Hero Profile")}</strong>
            <small>{tx("编辑身份与查看 Earth Online")}</small>
          </span>
          <ChevronRight size={16} />
        </Link>
      </section>
    );
  else if (topic === "general")
    content = (
      <section className="settings-section">
        <h2>{t("通用")}</h2>
        <form className="settings-form" onSubmit={saveProfile}>
          <label>
            {t("显示名")}
            <input className="field" maxLength={64} value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
          </label>
          <label>
            {t("时区")}
            <input className="field" list="timezone-options" value={timezone} onChange={(event) => setTimezone(event.target.value)} />
            <datalist id="timezone-options">
              <option value="Asia/Shanghai" />
              <option value="Asia/Tokyo" />
              <option value="Europe/London" />
              <option value="America/New_York" />
              <option value="UTC" />
            </datalist>
          </label>
          <LanguageControl
            value={data.appearance.locale}
            onChange={async (locale) => {
              try {
                await patch({ locale });
              } catch (error) {
                onError(message(error), t("设置没有保存"));
              }
            }}
          />
          <div className="settings-line">
            <span>
              <strong>{tx("日期与时间")}</strong>
              <small>
                {new Intl.DateTimeFormat(data.appearance.locale, {
                  dateStyle: "long",
                  timeStyle: "short",
                  timeZone: data.profile.timezone,
                }).format(new Date())}
              </small>
            </span>
          </div>
          <p className="settings-note">{t("新的记录将使用此时区；已有历史日期不会重新归属。")}</p>
          <Button variant="primary" loading={pending} type="submit">
            <Save size={15} />
            {t("保存资料")}
          </Button>
        </form>
      </section>
    );
  else if (topic === "appearance")
    content = (
      <section className="settings-section">
        <h2>{t("外观")}</h2>
        <div className="settings-line">
          <span>
            <strong>{tx("主题")}</strong>
            <small>{t("当前使用工作台浅色主题。")}</small>
          </span>
          <Badge tone="success">Light</Badge>
        </div>
        <Toggle
          checked={data.appearance.reducedMotion}
          label={t("减少动效")}
          onChange={async (checked) => {
            try {
              await patch({ reducedMotion: checked });
            } catch (error) {
              onError(message(error));
            }
          }}
        />
        <FontScaleControl
          value={data.appearance.fontScale}
          onChange={async (fontScale) => {
            try {
              await patch({ fontScale });
            } catch (error) {
              onError(message(error), tx("字体大小没有保存"));
            }
          }}
        />
      </section>
    );
  else if (topic === "adventure")
    content = (
      <>
        <CategorySettings categories={data.categories} request={request} onError={onError} onChanged={refreshCategories} />
        <section className="settings-section">
          <h2>{tx("续接与时间线")}</h2>
          <div className="settings-line">
            <span>
              <strong>{tx("手动决定")}</strong>
              <small>{tx("未完成项由你选择续接、延后或忽略。")}</small>
            </span>
            <Badge tone="success">{tx("当前")}</Badge>
          </div>
          <p className="settings-note">{tx("饮水目标沿用每日 8 杯；当前没有独立覆盖设置。")}</p>
        </section>
      </>
    );
  else if (topic === "notebook")
    content = (
      <WritingSettings
        slots={data.writingSlots}
        onSave={async (writingSlots) => {
          try {
            await patch({ writingSlots });
          } catch (error) {
            onError(message(error), tx("文字设置没有保存"));
          }
        }}
      />
    );
  else if (topic === "growth")
    content = (
      <section className="settings-section">
        <h2>{tx("成长")}</h2>
        <Link className="settings-topic-link" to="/growth#dimensions">
          <span>
            <strong>{tx("成长维度")}</strong>
            <small>{tx("管理维度与分类映射")}</small>
          </span>
          <ChevronRight size={16} />
        </Link>
        <Toggle
          checked={data.rewards.show}
          label={tx("显示奖励界面")}
          icon={data.rewards.show ? <Eye size={16} /> : <EyeOff size={16} />}
          onChange={async (checked) => {
            try {
              await patch({ showRewards: checked });
            } catch (error) {
              onError(message(error));
            }
          }}
        />
        <p className="settings-note">{tx("隐藏只改变界面展示，不会停止奖励结算。")}</p>
      </section>
    );
  else if (topic === "wallet")
    content = (
      <section className="settings-section">
        <h2>{tx("钱包")}</h2>
        <p className="settings-note">{tx("完整账户、预算与交易仍由 Wallet 管理；这里不复制财务业务。")}</p>
        <Link className="settings-topic-link" to="/finance">
          <span>
            <strong>{tx("打开钱包")}</strong>
            <small>{tx("账户、交易、预算与报表")}</small>
          </span>
          <ChevronRight size={16} />
        </Link>
      </section>
    );
  else if (topic === "ai") content = <AiSettings request={request} userId={userId} onError={onError} />;
  else if (topic === "data")
    content = (
      <section className="settings-section settings-data">
        <h2>{tx("数据")}</h2>
        <div className="settings-data-links">
          <Link className="settings-topic-link" to="/search">
            <span>
              <strong>{tx("搜索")}</strong>
              <small>{tx("跨领域查找记录")}</small>
            </span>
            <ChevronRight size={16} />
          </Link>
          <Link className="settings-topic-link" to="/settings/trash">
            <span>
              <strong>{tx("回收站")}</strong>
              <small>{tx("查看并恢复已删除的随手记")}</small>
            </span>
            <ChevronRight size={16} />
          </Link>
        </div>
        <h3>{tx("备份、恢复与导出")}</h3>
        <p className="settings-note">{tx("财务导出包含敏感数据，只在你主动确认后生成。")}</p>
        <FinanceDataMaintenance request={request} timezone={data.profile.timezone} onError={onError} />
        <ExportRows request={request} onError={onError} />
      </section>
    );
  else if (topic === "help")
    content = (
      <section className="settings-help-stack">
        <OnboardingSettings request={request} queryClient={queryClient} userId={userId} onError={onError} />
        <section className="settings-section">
          <h2>{tx("产品指南与关于")}</h2>
          <p className="settings-note">Personal Workbench · vNext</p>
          <Link className="settings-topic-link" to="/today">
            <span>
              <strong>{tx("返回冒险")}</strong>
              <small>{tx("从今日工作台继续")}</small>
            </span>
            <ChevronRight size={16} />
          </Link>
        </section>
      </section>
    );
  else
    content = (
      <section className="settings-section">
        <h2>{tx("账号与会话")}</h2>
        <p className="settings-note">
          {tx("当前账号：")}
          {data.profile.username}
        </p>
        <Button variant="danger" onClick={logout}>
          <LogOut size={15} />
          {tx("退出登录")}
        </Button>
      </section>
    );
  return (
    <section className="settings-route">
      <header className="route-panel-heading">
        <div>
          <p className="route-eyebrow">{t("养成系统")}</p>
          <h1>{t("设置")}</h1>
          <p>{t("偏好只改变入口和新记录，历史数据始终保留。")}</p>
        </div>
      </header>
      <label className="settings-mobile-topic">
        <span>{tx("设置主题")}</span>
        <select className="field" value={topic} onChange={(event) => selectTopic(event.target.value as SettingsTopic)}>
          {SETTINGS_TOPICS.map((item) => (
            <option key={item} value={item}>
              {tx(TOPIC_LABELS[item])}
            </option>
          ))}
        </select>
      </label>
      <div className="settings-layout">
        <nav className="settings-secondary-nav" aria-label={tx("设置主题")}>
          {SETTINGS_TOPICS.map((item) => (
            <button type="button" className={item === topic ? "is-active" : ""} aria-current={item === topic ? "page" : undefined} key={item} onClick={() => selectTopic(item)}>
              {tx(TOPIC_LABELS[item])}
              <ChevronRight size={14} />
            </button>
          ))}
        </nav>
        <main className="settings-topic-content">
          <header>
            <p className="route-eyebrow">Settings</p>
            <h2>{tx(TOPIC_LABELS[topic])}</h2>
          </header>
          {content}
        </main>
      </div>
    </section>
  );
}

type AiSettingsSnapshot = {
  userId: number;
  enabled: number;
  allowAdventure: number;
  allowNotebook: number;
  allowGrowth: number;
  allowLibrary: number;
  allowWallet: number;
  version: number;
};
type AiUsageSnapshot = {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  costMicrounits: number | null;
};
function AiSettings({ request, userId, onError }: { request: Request; userId: number; onError: (message: string, title?: string) => void }) {
  const queryClient = useQueryClient();
  const settings = useQuery({
    queryKey: ["ai-settings", userId],
    queryFn: () => request<AiSettingsSnapshot>("/api/ai/settings"),
  });
  const usage = useQuery({
    queryKey: ["ai-usage", userId],
    queryFn: () => request<AiUsageSnapshot>("/api/ai/usage"),
  });
  const [pending, setPending] = useState<keyof AiSettingsSnapshot | null>(null);
  async function update(key: "enabled" | "allowAdventure" | "allowNotebook" | "allowGrowth" | "allowLibrary" | "allowWallet", checked: boolean) {
    if (!settings.data) return;
    setPending(key);
    try {
      const next = await request<AiSettingsSnapshot>("/api/ai/settings", {
        method: "PUT",
        body: JSON.stringify({
          expectedVersion: settings.data.version,
          [key]: checked,
        }),
      });
      queryClient.setQueryData(["ai-settings", userId], next);
    } catch (error) {
      onError(message(error), tx("AI 设置没有保存"));
    } finally {
      setPending(null);
    }
  }
  if (settings.isPending)
    return (
      <section className="settings-section">
        <p className="route-state">{tx("正在加载 AI 设置...")}</p>
      </section>
    );
  if (!settings.data || settings.isError)
    return (
      <section className="settings-section">
        <div className="notes-error">
          <p>{settings.error instanceof Error ? settings.error.message : tx("AI 设置加载失败")}</p>
          <Button onClick={() => void settings.refetch()}>{tx("重试")}</Button>
        </div>
      </section>
    );
  const data = settings.data;
  const permissions = [
    ["allowAdventure", "冒险", "今日状态、周期事实与时间记录"],
    ["allowNotebook", "笔记本", "仅在主动触发时读取已保存的私人文字"],
    ["allowGrowth", "成长", "成长维度与确定性汇总"],
    ["allowLibrary", "Library", "收藏条目与状态"],
    ["allowWallet", "钱包", "财务数据；默认关闭"],
  ] as const;
  return (
    <section className="settings-section ai-settings">
      <h2>{tx("AI 权限与用量")}</h2>
      <p className="settings-note">{tx("AI 默认关闭。只有你主动触发功能且允许对应领域时，数据才会发送给服务器配置的提供方。")}</p>
      <Toggle checked={Boolean(data.enabled)} label={pending === "enabled" ? tx("正在保存...") : tx("启用 AI 功能")} onChange={(checked) => void update("enabled", checked)} />
      <div className="ai-permission-list">
        {permissions.map(([key, label, description]) => (
          <div key={key}>
            <span>
              <strong>{tx(label)}</strong>
              <small>{tx(description)}</small>
            </span>
            <Toggle checked={Boolean(data[key])} label={tx("允许 {value0}", { value0: label })} onChange={(checked) => void update(key, checked)} />
          </div>
        ))}
      </div>
      <div className="ai-usage">
        <h3>{tx("本地记录的用量")}</h3>
        {usage.isPending ? (
          <small>{tx("正在加载用量...")}</small>
        ) : usage.data ? (
          <>
            <span>
              <strong>{usage.data.requests}</strong>
              <small>{tx("请求")}</small>
            </span>
            <span>
              <strong>{usage.data.inputTokens + usage.data.outputTokens}</strong>
              <small>Tokens</small>
            </span>
            <span>
              <strong>{usage.data.costMicrounits === null ? tx("未知") : `${(usage.data.costMicrounits / 1_000_000).toFixed(4)}`}</strong>
              <small>{usage.data.costMicrounits === null ? tx("提供方未返回费用") : tx("费用记录")}</small>
            </span>
          </>
        ) : (
          <small>{tx("用量加载失败")}</small>
        )}
      </div>
      <p className="settings-note">{tx("AI 结果是独立产物，不会直接修改任务、钱包或其他业务记录。")}</p>
    </section>
  );
}

function OnboardingSettings({ request, queryClient, userId, onError }: { request: Request; queryClient: ReturnType<typeof useQueryClient>; userId: number; onError: (message: string, title?: string) => void }) {
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  async function restart() {
    setPending(true);
    try {
      const result = await request<{ status: string }>("/api/onboarding/flows/core-loop/restart", { method: "POST" });
      await queryClient.invalidateQueries({ queryKey: ["onboarding", userId] });
      setStatus(result.status === "IN_PROGRESS" ? "新手教学已重置，下次进入今日时会重新开始。" : "新手教学状态已更新。");
    } catch (error) {
      onError(message(error), tx("新手教学没有重置"));
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="settings-section">
      <h2>
        <Sparkles size={17} />
        {tx("帮助与引导")}
      </h2>
      <p className="settings-note">{tx("只重置新手教学状态，不会删除任务、时间或任何业务数据。")}</p>
      <Button size="sm" loading={pending} onClick={() => void restart()}>
        {tx("重新开始新手教学")}
      </Button>
      {status ? (
        <p className="settings-note" role="status">
          {status}
        </p>
      ) : null}
    </section>
  );
}

const PALETTE = ["#3B82F6", "#8B5CF6", "#EC4899", "#10B981", "#EF4444", "#F59E0B", "#64748B"];
type CategoryDraft = {
  id: number | null;
  name: string;
  color: string;
  dimensionKey: string;
  enabled: boolean;
};
function CategorySettings({ categories, request, onError, onChanged }: { categories: Category[]; request: Request; onError: (message: string, title?: string) => void; onChanged: () => Promise<void> }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "disabled" | "unmapped">("all");
  const [draft, setDraft] = useState<CategoryDraft | null>(null);
  const [pending, setPending] = useState(false);
  const visible = categories.filter((category) => category.name.toLowerCase().includes(search.trim().toLowerCase()) && (filter === "all" || (filter === "active" && Boolean(category.enabled)) || (filter === "disabled" && !category.enabled) || (filter === "unmapped" && category.dimensionKey === null)));
  function edit(category?: Category) {
    setDraft(
      category
        ? {
            id: category.id,
            name: category.name,
            color: category.color,
            dimensionKey: category.dimensionKey ?? "",
            enabled: Boolean(category.enabled),
          }
        : {
            id: null,
            name: "",
            color: PALETTE[0],
            dimensionKey: "",
            enabled: true,
          },
    );
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || !/^#[0-9a-fA-F]{6}$/.test(draft.color)) return;
    setPending(true);
    try {
      const payload = {
        name: draft.name.trim(),
        color: draft.color.toUpperCase(),
        dimensionKey: draft.dimensionKey || null,
        targetMinutes: 6000,
        ...(draft.id ? { enabled: draft.enabled } : {}),
      };
      await request(draft.id ? `/api/task-categories/${draft.id}` : "/api/task-categories", { method: draft.id ? "PUT" : "POST", body: JSON.stringify(payload) });
      setDraft(null);
      await onChanged();
    } catch (error) {
      onError(message(error), draft.id ? tx("分类没有更新") : tx("分类没有创建"));
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="settings-section settings-categories">
      <div className="settings-section-head">
        <div>
          <h2>{tx("任务分类")}</h2>
          <p className="settings-note">{tx("颜色只用于展示；成长维度可暂不映射。")}</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => edit()}>
          <Plus size={14} />
          {tx("新增分类")}
        </Button>
      </div>
      <div className="settings-category-tools">
        <label>
          <Search size={15} />
          <input aria-label={tx("搜索分类")} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tx("搜索分类")} />
        </label>
        <select aria-label={tx("分类状态筛选")} className="field" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}>
          <option value="all">{tx("全部")}</option>
          <option value="active">{tx("启用中")}</option>
          <option value="disabled">{tx("已停用")}</option>
          <option value="unmapped">{tx("未映射")}</option>
        </select>
      </div>
      <div className="settings-category-list">
        {visible.map((category) => (
          <button type="button" aria-label={tx("编辑分类 {value0}", { value0: category.name })} className={!category.enabled ? "is-disabled" : ""} key={category.id} onClick={() => edit(category)}>
            <i style={{ backgroundColor: category.color }} />
            <span>
              <strong>{category.name}</strong>
              <small>
                {category.enabled
                  ? category.dimensionKey
                    ? dimensionLabel(category.dimensionKey)
                    : tx("未映射")
                  : tx("{value0} · 已停用", {
                      value0: category.dimensionKey ? dimensionLabel(category.dimensionKey) : tx("未映射"),
                    })}
              </small>
            </span>
            <ChevronRight size={16} />
          </button>
        ))}
      </div>
      {draft ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setDraft(null)}>
          <div className="modal-shell settings-category-dialog" role="dialog" aria-modal="true" aria-labelledby="category-editor-title" onMouseDown={(event) => event.stopPropagation()}>
            <form onSubmit={save}>
              <header>
                <h3 id="category-editor-title">{draft.id ? tx("编辑分类") : tx("新增分类")}</h3>
                <button type="button" aria-label={tx("关闭")} onClick={() => setDraft(null)}>
                  <X size={16} />
                </button>
              </header>
              <label>
                {tx("名称")}
                <input aria-label={draft.id ? tx("分类名称") : tx("新分类名称")} className="field" required maxLength={64} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
              </label>
              <label>
                {tx("成长维度")}
                <select aria-label={draft.id ? tx("分类成长维度") : tx("新分类成长维度")} className="field" value={draft.dimensionKey} onChange={(event) => setDraft({ ...draft, dimensionKey: event.target.value })}>
                  <option value="">{tx("暂不映射")}</option>
                  {dimensionOptions()}
                </select>
              </label>
              <ColorControl color={draft.color} onChange={(color) => setDraft({ ...draft, color })} />
              {draft.id ? <Toggle checked={draft.enabled} label={draft.enabled ? tx("分类已启用") : tx("分类已停用")} onChange={(enabled) => setDraft({ ...draft, enabled })} /> : null}
              <div className="category-form-actions">
                <Button type="button" onClick={() => setDraft(null)}>
                  {tx("取消")}
                </Button>
                <Button variant="primary" loading={pending} type="submit">
                  {tx("保存分类")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}
function ColorControl({ color, onChange }: { color: string; onChange: (value: string) => void }) {
  const [hex, setHex] = useState(color);
  useEffect(() => setHex(color), [color]);
  const applyHex = () => {
    if (/^#[0-9a-fA-F]{6}$/.test(hex)) onChange(hex.toUpperCase());
  };
  return (
    <fieldset className="category-color-control">
      <legend>{tx("颜色")}</legend>
      <div className="category-current-color">
        <i style={{ background: color }} />
        <strong>{color.toUpperCase()}</strong>
      </div>
      <div className="color-presets">
        {PALETTE.map((value) => (
          <button
            aria-label={tx("使用颜色 {value0}", { value0: value })}
            className={value === color ? "is-active" : ""}
            key={value}
            style={{ background: value }}
            type="button"
            onClick={() => {
              setHex(value);
              onChange(value);
            }}
          />
        ))}
        <label className="color-custom-trigger" title={tx("自定义颜色")}>
          <Plus size={14} />
          <input
            aria-label={tx("自定义分类颜色")}
            type="color"
            value={color}
            onChange={(event) => {
              setHex(event.target.value.toUpperCase());
              onChange(event.target.value.toUpperCase());
            }}
          />
        </label>
      </div>
      <label>
        {tx("HEX")}
        <input aria-label={tx("分类 Hex 颜色")} className="field" value={hex} onChange={(event) => setHex(event.target.value)} onBlur={applyHex} />
      </label>
    </fieldset>
  );
}
function WritingSettings({ slots = [], onSave }: { slots?: WritingSlot[]; onSave: (slots: WritingSlot[]) => Promise<void> }) {
  const source = slots.length
    ? slots
    : [
        { slotKey: "MORNING_WRITING" as const, enabled: false, sortOrder: 10 },
        { slotKey: "JOURNAL" as const, enabled: false, sortOrder: 20 },
        { slotKey: "STOCK_REVIEW" as const, enabled: false, sortOrder: 30 },
      ];
  const ordered = [...source].sort((a, b) => a.sortOrder - b.sortOrder);
  async function change(index: number, patch: Partial<WritingSlot>, move = 0) {
    const next = ordered.map((slot) => ({ ...slot }));
    Object.assign(next[index], patch);
    if (move && next[index + move]) [next[index], next[index + move]] = [next[index + move], next[index]];
    await onSave(
      next.map((slot, position) => ({
        ...slot,
        sortOrder: (position + 1) * 10,
      })),
    );
  }
  return (
    <section className="settings-section">
      <h2>{tx("文字与复盘")}</h2>
      <p className="settings-note">{tx("选择你想使用的书写模块。")}</p>
      <p className="settings-note">{tx("关闭只移除主要入口；历史、搜索和导出保持可用。")}</p>
      <div className="writing-slot-list">
        {ordered.map((slot, index) => (
          <div key={slot.slotKey}>
            <span>
              <strong>{slotLabel(slot.slotKey)}</strong>
              <small>{slot.enabled ? tx("显示在今日与快捷入口") : tx("入口已隐藏")}</small>
            </span>
            <IconButton label={tx("{value0}上移", { value0: slotLabel(slot.slotKey) })} disabled={index === 0} onClick={() => void change(index, {}, -1)}>
              <ArrowUp size={15} />
            </IconButton>
            <IconButton label={tx("{value0}下移", { value0: slotLabel(slot.slotKey) })} disabled={index === ordered.length - 1} onClick={() => void change(index, {}, 1)}>
              <ArrowDown size={15} />
            </IconButton>
            <Toggle
              checked={slot.enabled}
              label={tx("{value0}：{value1}", {
                value0: slotLabel(slot.slotKey),
                value1: slot.enabled ? tx("开启") : tx("关闭"),
              })}
              onChange={(enabled) => void change(index, { enabled })}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
function slotLabel(key: WritingSlot["slotKey"]) {
  return tx(key === "MORNING_WRITING" ? "晨写" : key === "JOURNAL" ? "日记" : "股市复盘");
}
function dimensionOptions() {
  return ["career", "creative", "learning", "life", "body", "social", "leisure", "foundation"].map((value) => (
    <option key={value} value={value}>
      {dimensionLabel(value)}
    </option>
  ));
}

function Toggle({ checked, label, icon, onChange }: { checked: boolean; label: string; icon?: React.ReactNode; onChange: (checked: boolean) => void }) {
  return (
    <label className="settings-toggle">
      {icon}
      <span>{tx(label)}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}
function LanguageControl({ value, onChange }: { value: Locale; onChange: (value: Locale) => void }) {
  const { t } = useI18n();
  return (
    <div className="settings-font-scale">
      <span>{t("语言")}</span>
      <div className="segmented-control" aria-label={t("语言")}>
        <button className={value === "zh-CN" ? "is-active" : ""} type="button" aria-pressed={value === "zh-CN"} onClick={() => onChange("zh-CN")}>
          {t("中文")}
        </button>
        <button className={value === "en" ? "is-active" : ""} type="button" aria-pressed={value === "en"} onClick={() => onChange("en")}>
          {t("English")}
        </button>
      </div>
    </div>
  );
}
function FontScaleControl({ value, onChange }: { value: FontScale; onChange: (value: FontScale) => void }) {
  const { t } = useI18n();
  return (
    <div className="settings-font-scale">
      <span>{t("字体大小")}</span>
      <div className="segmented-control" aria-label={t("字体大小")}>
        {([90, 100, 110] as const).map((scale) => (
          <button className={value === scale ? "is-active" : ""} key={scale} type="button" aria-pressed={value === scale} onClick={() => onChange(scale)}>
            {scale}%
          </button>
        ))}
      </div>
    </div>
  );
}
function ExportRows({ request, onError }: { request: Request; onError: (message: string, title?: string) => void }) {
  const rows: Array<{
    domain: string;
    label: string;
    formats: ExportFormat[];
  }> = [
    { domain: "projects", label: "项目", formats: ["json", "csv"] },
    { domain: "tasks", label: "任务", formats: ["json", "csv"] },
    { domain: "habits", label: "习惯", formats: ["json", "csv"] },
    {
      domain: "writing",
      label: "个人文字",
      formats: ["json", "csv", "markdown"],
    },
    { domain: "calendar", label: "日历与时间", formats: ["json", "csv"] },
    { domain: "rewards", label: "奖励记录", formats: ["json", "csv"] },
    { domain: "life", label: "睡眠与饮水", formats: ["json", "csv"] },
  ];
  const [includeTrash, setIncludeTrash] = useState(false);
  return (
    <div className="export-list">
      <label className="settings-toggle">
        <span>{tx("包括回收站")}</span>
        <input type="checkbox" checked={includeTrash} onChange={(event) => setIncludeTrash(event.target.checked)} />
      </label>
      {rows.map((row) => (
        <ExportRow key={row.domain} {...row} includeTrash={includeTrash} request={request} onError={onError} />
      ))}
    </div>
  );
}
function ExportRow({ domain, label, formats, includeTrash, request, onError }: { domain: string; label: string; formats: ExportFormat[]; includeTrash: boolean; request: Request; onError: (message: string, title?: string) => void }) {
  const [format, setFormat] = useState<ExportFormat>(formats[0]);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  async function run() {
    setPending(true);
    setResult(null);
    try {
      const payload = await request<ExportPayload>(`/api/exports/${domain}?format=${format}&includeTrash=${includeTrash}`);
      const blob = new Blob([payload.content], {
        type: `${payload.contentType};charset=utf-8`,
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = payload.fileName;
      anchor.click();
      URL.revokeObjectURL(url);
      setResult(`${payload.recordCount} 条`);
    } catch (error) {
      onError(message(error), tx("导出失败"));
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="export-row">
      <span>
        <strong>{tx(label)}</strong>
        {result ? <small>{result}</small> : null}
      </span>
      <select aria-label={tx("{value0}导出格式", { value0: label })} value={format} onChange={(event) => setFormat(event.target.value as ExportFormat)}>
        {formats.map((item) => (
          <option key={item} value={item}>
            {item === "markdown" ? "Markdown" : item.toUpperCase()}
          </option>
        ))}
      </select>
      <Button size="sm" loading={pending} onClick={() => void run()}>
        <Download size={14} />
        {tx("导出")}
      </Button>
    </div>
  );
}
function FinanceDataMaintenance({ request, timezone, onError }: { request: Request; timezone: string; onError: (message: string, title?: string) => void }) {
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [importPreview, setImportPreview] = useState<any>(null);
  const [restorePreview, setRestorePreview] = useState<any>(null);
  const [restorePayload, setRestorePayload] = useState<any>(null);
  function download(payload: ExportPayload) {
    const url = URL.createObjectURL(
      new Blob([payload.content], {
        type: `${payload.contentType};charset=utf-8`,
      }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = payload.fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }
  async function exportFinance(path: string) {
    if (!window.confirm(tx("财务数据属于敏感信息，确认主动导出吗？"))) return;
    setPending(true);
    try {
      download(
        await request<ExportPayload>(path, {
          method: "POST",
          body: JSON.stringify({ operationId: crypto.randomUUID() }),
        }),
      );
      setNotice(tx("财务数据已生成并下载"));
    } catch (error) {
      onError(message(error), tx("财务导出失败"));
    } finally {
      setPending(false);
    }
  }
  async function previewCsv(file: File) {
    setPending(true);
    try {
      const csv = await file.text();
      const headers = csv
        .split(/\r?\n/, 1)[0]
        .split(",")
        .map((item) => item.trim());
      const find = (names: string[]) => headers.find((header) => names.some((name) => header === name || header.toLowerCase() === name.toLowerCase())) ?? "";
      setImportPreview(
        await request("/api/finance/imports/external/preview", {
          method: "POST",
          body: JSON.stringify({
            operationId: crypto.randomUUID(),
            sourceName: file.name,
            csv,
            timezone,
            mapping: {
              date: find(["日期", "发生日期", "date"]),
              time: find(["时间", "发生时间", "time"]),
              amount: find(["金额", "amount"]),
              direction: find(["方向", "收支", "direction"]),
              account: find(["账户", "account"]),
              category: find(["分类", "category"]),
              note: find(["备注", "note"]),
              externalId: find(["流水号", "外部流水ID", "id"]),
            },
          }),
        }),
      );
    } catch (error) {
      onError(message(error), tx("流水预览失败"));
    } finally {
      setPending(false);
    }
  }
  async function confirmImport() {
    if (!importPreview || !window.confirm(tx("预览中的可导入行将写入真实账本，确认继续吗？"))) return;
    setPending(true);
    try {
      const result = await request<any>(`/api/finance/imports/${importPreview.id}/confirm`, {
        method: "POST",
        body: JSON.stringify({
          operationId: crypto.randomUUID(),
          allowPossibleDuplicates: true,
        }),
      });
      setImportPreview({ ...importPreview, result });
    } catch (error) {
      onError(message(error), tx("流水导入失败"));
    } finally {
      setPending(false);
    }
  }
  async function previewRestore(file: File) {
    setPending(true);
    try {
      const payload = JSON.parse(await file.text());
      setRestorePayload(payload);
      setRestorePreview(
        await request("/api/finance/maintenance/restore/preview", {
          method: "POST",
          body: JSON.stringify(payload),
        }),
      );
    } catch (error) {
      onError(message(error), tx("备份预览失败"));
    } finally {
      setPending(false);
    }
  }
  async function confirmRestore() {
    if (!restorePayload || !restorePreview?.valid || !window.confirm(tx("完整恢复只允许写入空账本，确认恢复吗？"))) return;
    setPending(true);
    try {
      setRestorePreview({
        ...restorePreview,
        result: await request("/api/finance/maintenance/restore/confirm", {
          method: "POST",
          body: JSON.stringify({
            operationId: crypto.randomUUID(),
            backup: restorePayload,
          }),
        }),
      });
    } catch (error) {
      onError(message(error), tx("备份恢复失败"));
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="finance-data-maintenance">
      <div className="finance-data-actions">
        <Button size="sm" loading={pending} onClick={() => void exportFinance("/api/finance/maintenance/export/json")}>
          <FileJson size={14} />
          {tx("导出财务备份 JSON")}
        </Button>
        <Button size="sm" loading={pending} onClick={() => void exportFinance("/api/finance/maintenance/export/csv")}>
          <Download size={14} />
          {tx("导出财务 CSV")}
        </Button>
        <Button
          size="sm"
          loading={pending}
          onClick={async () => {
            try {
              const result = await request<any>("/api/finance/maintenance/reconciliation", {
                method: "POST",
                body: JSON.stringify({ operationId: crypto.randomUUID() }),
              });
              setNotice(
                result.status === "ALL_CLEAR"
                  ? tx("账本核对：全部正常")
                  : tx("账本核对：发现 {value0} 个问题", {
                      value0: result.anomalyCount,
                    }),
              );
            } catch (error) {
              onError(message(error), tx("账本核对失败"));
            }
          }}
        >
          <span>{tx("账本核对")}</span>
        </Button>
      </div>
      <p className="settings-note">{tx("JSON 用于 Workbench Finance 备份/恢复；CSV 用于人工查看和外部分析，不保证完整关系恢复。")}</p>
      <label className="finance-data-upload">
        <Upload size={15} />
        <span>{tx("导入外部 CSV")}</span>
        <input
          aria-label={tx("导入外部流水 CSV")}
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void previewCsv(file);
          }}
        />
      </label>
      {importPreview ? (
        <div className="finance-import-preview">
          <strong>{tx("导入预览 · 尚未入账")}</strong>
          <small>
            {importPreview.rows?.length ?? 0} {tx("行 ·")} {importPreview.sourceName}
          </small>
          {(importPreview.rows ?? []).slice(0, 8).map((row: any) => {
            const status = financeImportStatus(row.status);
            return (
              <div key={row.id}>
                <span>
                  <strong>
                    {row.date ?? tx("日期无效")} · {row.amountCents === null || row.amountCents === undefined ? tx("金额无效") : yuan(row.amountCents)}
                  </strong>
                  <small>
                    {row.kind === "INCOME" ? tx("收入") : row.kind === "EXPENSE" ? tx("支出") : tx("方向无效")} · {importField(row, [tx("账户"), "account"]) ?? row.accountId ?? tx("账户待映射")} · {importField(row, [tx("分类"), "category"]) ?? row.categoryId ?? tx("分类待映射")}
                  </small>
                </span>
                <Badge tone={status.tone}>{tx(status.label)}</Badge>
              </div>
            );
          })}
          {!importPreview.result ? (
            <Button size="sm" variant="primary" loading={pending} onClick={() => void confirmImport()}>
              {tx("确认导入可用行")}
            </Button>
          ) : (
            <small>
              {tx("结果：成功")} {importPreview.result.summary?.imported ?? 0} {tx("行；跳过重复")} {importPreview.result.summary?.exactDuplicate ?? 0} {tx("行；确认可能重复")} {importPreview.rows?.filter((row: any) => row.status === "POSSIBLE_DUPLICATE").length ?? 0} {tx("行；失败或待修正")} {importPreview.rows?.filter((row: any) => ["INVALID", "NEEDS_MAPPING", "FAILED"].includes(row.status)).length ?? 0} {tx("行")}
            </small>
          )}
        </div>
      ) : null}
      <label className="finance-data-upload">
        <Upload size={15} />
        <span>{tx("预览 Workbench Finance JSON 恢复")}</span>
        <input
          aria-label={tx("恢复 Finance JSON")}
          type="file"
          accept=".json,application/json"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void previewRestore(file);
          }}
        />
      </label>
      {restorePreview ? (
        <div className="finance-import-preview">
          <strong>{tx("备份恢复预览")}</strong>
          <small>
            {tx("备份版本")} {restorePreview.schemaVersion ?? tx("未知")} · {Object.values(restorePreview.counts ?? {}).reduce((total: number, value) => total + Number(value), 0)} {tx("个对象")}
          </small>
          <small>{restorePreview.valid ? tx("可以在空账本中恢复") : restorePreview.errors?.join("；")}</small>
          {restorePreview.valid && !restorePreview.result ? (
            <Button size="sm" variant="primary" loading={pending} onClick={() => void confirmRestore()}>
              {tx("确认恢复")}
            </Button>
          ) : null}
          {restorePreview.result ? <small>{tx("恢复完成")}</small> : null}
        </div>
      ) : null}
      {notice ? (
        <p className="settings-note" role="status">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
function dimensionLabel(value: string | null) {
  return value
    ? tx(
        (
          {
            career: "事业力",
            creative: "创造力",
            learning: "学习力",
            life: "生活力",
            body: "身体力",
            social: "社交力",
            leisure: "兴趣成长",
            foundation: "基础状态",
          } as Record<string, string>
        )[value] ?? value,
      )
    : tx("暂不映射");
}
function importField(row: any, names: string[]) {
  const source =
    typeof row.source === "string"
      ? (() => {
          try {
            return JSON.parse(row.source);
          } catch {
            return {};
          }
        })()
      : (row.source ?? {});
  return Object.entries(source).find(([key]) => names.some((name) => key.toLowerCase() === name.toLowerCase()))?.[1] as string | undefined;
}
function financeImportStatus(status: string) {
  return (
    financeImportStatuses[status as keyof typeof financeImportStatuses] ?? {
      label: "未知状态",
      tone: "warning" as const,
    }
  );
}
function message(error: unknown) {
  return error instanceof Error ? error.message : tx("操作失败");
}
