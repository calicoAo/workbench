import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarHeart, Pencil, Shield, X } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import type { Request } from "../../app/api";
import { tx } from "../../app/i18n";
import { Button, IconButton } from "../../shared/ui";
import { PixelAsset } from "../growth/pixel-assets";

export type HeroStatusKey = "GREAT" | "GOOD" | "OKAY" | "TIRED" | "LOW";
type HeroSummary = {
  businessDate: string;
  timezone: string;
  profile: { userId: number; displayName: string; avatarRef: string | null; portraitRef: string | null; title: string | null; birthDate: string | null; visualPreferences: unknown; version: number };
  progress: { level: number; xpTotal: number; coins: number; xpInLevel: number; xpForNextLevel: number };
  dailyStatus: { id: number; statusKey: HeroStatusKey; version: number } | null;
  earthOnlineDay: number | null;
};
const STATUS_OPTIONS: Array<{ key: HeroStatusKey; label: string }> = [{ key: "GREAT", label: "状态很好" }, { key: "GOOD", label: "还不错" }, { key: "OKAY", label: "普通" }, { key: "TIRED", label: "有点累" }, { key: "LOW", label: "低能量" }];
type DailyEntryClaim = { claimed: boolean; reason?: "ONBOARDING" | "ALREADY_ENTERED" | null; hero?: HeroSummary; automaticPresentation: "pending" | "consumed" };

function useHero(request: Request, userId: number, date?: string) {
  return useQuery({ queryKey: ["hero", userId, date ?? "current"], queryFn: () => request<HeroSummary>(`/api/hero${date ? `?date=${date}` : ""}`) });
}

async function updateHeroDailyStatus(request: Request, queryClient: ReturnType<typeof useQueryClient>, userId: number, hero: HeroSummary, statusKey: HeroStatusKey) {
  await request("/api/hero/daily-status", { method: "PUT", body: JSON.stringify({ businessDate: hero.businessDate, periodTimezone: hero.timezone, statusKey, expectedVersion: hero.dailyStatus?.version ?? 0 }) });
  await queryClient.invalidateQueries({ queryKey: ["hero", userId] });
}

export function HeroDailyEntry({ request, userId, businessDate, onboardingResolved, onError }: { request: Request; userId: number; businessDate: string; onboardingResolved: boolean; onError: (message: string, title?: string) => void }) {
  const queryClient = useQueryClient();
  const hero = useHero(request, userId, businessDate);
  const claimKey = ["hero-daily-entry", userId, businessDate] as const;
  const claim = useQuery({
    queryKey: claimKey,
    enabled: onboardingResolved && isHeroSummary(hero.data) && hero.data.businessDate === businessDate,
    staleTime: Infinity,
    retry: false,
    queryFn: async () => {
      const result = await request<{ claimed: boolean; hero?: HeroSummary }>("/api/hero/daily-entry/claim", { method: "POST", body: JSON.stringify({ businessDate }) });
      void queryClient.invalidateQueries({ queryKey: ["hero", userId] });
      return { ...result, automaticPresentation: "pending" as const };
    }
  });
  const [visibleEntry, setVisibleEntry] = useState<{ userId: number; businessDate: string; hero: HeroSummary } | null>(null);
  const [selected, setSelected] = useState<HeroStatusKey | null>(null);
  useEffect(() => {
    if (!claim.data?.claimed || claim.data.automaticPresentation !== "pending" || !claim.data.hero) return;
    const cached = queryClient.getQueryData<DailyEntryClaim>(claimKey);
    if (!cached?.claimed || cached.automaticPresentation !== "pending" || !cached.hero) return;
    queryClient.setQueryData<DailyEntryClaim>(claimKey, { ...cached, automaticPresentation: "consumed" });
    setSelected(cached.hero.dailyStatus?.statusKey ?? null);
    setVisibleEntry({ userId, businessDate, hero: cached.hero });
  }, [businessDate, claim.data, queryClient, userId]);
  useEffect(() => {
    if (claim.error) onError(claim.error instanceof Error ? claim.error.message : tx("每日启动页加载失败"));
  }, [claim.error, onError]);
  const entry = visibleEntry?.userId === userId && visibleEntry.businessDate === businessDate ? visibleEntry.hero : null;
  if (!entry) return claim.isError && onboardingResolved ? <div className="hero-entry-retry" role="alert"><span>{tx("每日启动页加载失败")}</span><Button size="sm" onClick={() => void claim.refetch()}>{tx("重试")}</Button></div> : null;
  const currentEntry = entry;
  async function begin() {
    if (selected) {
      try { await updateHeroDailyStatus(request, queryClient, userId, currentEntry, selected); }
      catch (error) { onError(error instanceof Error ? error.message : tx("今日状态没有保存")); return; }
    }
    setVisibleEntry(null);
  }
  return <EarthOnlineDialog hero={currentEntry} selected={selected} onSelect={setSelected} onClose={() => setVisibleEntry(null)} onBegin={() => void begin()} />;
}

function EarthOnlineDialog({ hero, selected, onSelect, onClose, onBegin }: { hero: HeroSummary; selected: HeroStatusKey | null; onSelect: (value: HeroStatusKey) => void; onClose: () => void; onBegin: () => void }) {
  return <div className="earth-entry-backdrop" role="presentation"><section className="earth-entry" role="dialog" aria-modal="true" aria-labelledby="earth-entry-title"><IconButton className="earth-entry-close" label={tx("关闭")} onClick={onClose}><X size={16} /></IconButton><p>EARTH ONLINE</p><PixelAsset slot="hero-half-body" label={tx("英雄肖像")} size={96} /><h1 id="earth-entry-title">{tx("欢迎您，{value0}", { value0: hero.profile.displayName })}</h1>{hero.earthOnlineDay ? <strong>{tx("您已进入地球 Online 第 {value0} 天", { value0: hero.earthOnlineDay })}</strong> : <strong>{tx("设置出生日期后显示 Earth Online 天数")}</strong>}<fieldset><legend>{tx("今天感觉怎么样？")}</legend>{STATUS_OPTIONS.map((item) => <button type="button" aria-pressed={selected === item.key} className={selected === item.key ? "is-active" : ""} key={item.key} onClick={() => onSelect(item.key)}>{tx(item.label)}</button>)}</fieldset><Button variant="primary" onClick={onBegin}>{tx("开始冒险")}</Button><small>{tx("每日状态可当天更正，不产生签到、连续天数或 EXP。")}</small></section></div>;
}

export function HeroHud({ request, userId, date }: { request: Request; userId: number; date: string }) {
  const hero = useHero(request, userId, date);
  if (!isHeroSummary(hero.data)) return null;
  const value = hero.data;
  const progress = Math.min(1, value.progress.xpInLevel / Math.max(1, value.progress.xpForNextLevel));
  return <Link className="hero-hud" to={`/hero?date=${date}`} aria-label={tx("打开 Hero Profile")}><span className="hero-hud-avatar"><PixelAsset slot="hero-avatar" label={tx("英雄头像")} size={34} /></span><span className="hero-hud-copy"><strong>{value.profile.displayName}</strong><small>Lv.{value.progress.level} · {value.progress.xpInLevel}/{value.progress.xpForNextLevel} EXP</small></span><span className="hero-hud-xp"><i style={{ width: `${progress * 100}%` }} /></span></Link>;
}

export function HeroDailyStatus({ request, userId, date, onError }: { request: Request; userId: number; date: string; onError: (message: string, title?: string) => void }) {
  const queryClient = useQueryClient();
  const hero = useHero(request, userId, date);
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState<HeroStatusKey | null>(null);
  if (!isHeroSummary(hero.data)) return null;
  const status = hero.data.dailyStatus;
  const label = status ? STATUS_OPTIONS.find((item) => item.key === status.statusKey)?.label ?? status.statusKey : null;
  async function selectStatus(statusKey: HeroStatusKey) {
    setPending(statusKey);
    try {
      await updateHeroDailyStatus(request, queryClient, userId, hero.data!, statusKey);
      setEditing(false);
    } catch (error) {
      onError(error instanceof Error ? error.message : tx("今日状态没有保存"));
    } finally {
      setPending(null);
    }
  }
  return <section className="hero-daily-status" aria-label={tx("今日状态")}><div className="hero-daily-status-head"><span><CalendarHeart size={14} />{tx("今日状态")}</span><button type="button" className="hero-daily-status-value" aria-label={label ? tx("编辑今日状态") : tx("设置今日状态")} onClick={() => setEditing((value) => !value)}>{label ? tx(label) : tx("设置今日状态")}</button></div>{editing ? <fieldset><legend>{tx("今天感觉怎么样？")}</legend>{STATUS_OPTIONS.map((item) => <button key={item.key} type="button" aria-pressed={status?.statusKey === item.key} disabled={pending !== null} className={status?.statusKey === item.key ? "is-active" : ""} onClick={() => void selectStatus(item.key)}>{tx(item.label)}</button>)}</fieldset> : null}</section>;
}

export function HeroProfilePage({ request, userId, date, onError }: { request: Request; userId: number; date: string; onError: (message: string, title?: string) => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const hero = useHero(request, userId, date);
  const [editing, setEditing] = useState(false);
  const [replay, setReplay] = useState(false);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [birthDate, setBirthDate] = useState("");
  useEffect(() => { if (isHeroSummary(hero.data)) { setName(hero.data.profile.displayName); setTitle(hero.data.profile.title ?? ""); setBirthDate(hero.data.profile.birthDate ?? ""); } }, [hero.data]);
  if (!isHeroSummary(hero.data)) return <section className="hero-profile-route"><p className="route-state">{tx("正在读取 Hero Profile...")}</p></section>;
  const data = hero.data;
  const returnPath = heroReturnPath(location.state);
  async function save(event: FormEvent) { event.preventDefault(); try { await request("/api/hero/profile", { method: "PUT", body: JSON.stringify({ expectedVersion: data.profile.version, displayName: name.trim(), title: title.trim() || null, birthDate: birthDate || null }) }); await queryClient.invalidateQueries({ queryKey: ["hero", userId] }); setEditing(false); } catch (error) { onError(error instanceof Error ? error.message : tx("Hero Profile 没有保存")); } }
  async function setStatus(statusKey: HeroStatusKey) { try { await updateHeroDailyStatus(request, queryClient, userId, data, statusKey); } catch (error) { onError(error instanceof Error ? error.message : tx("今日状态没有保存")); } }
  return <section className="hero-profile-route"><header><div><p className="route-eyebrow">Hero Identity</p><h1>{data.profile.displayName}</h1><p>{data.profile.title || tx("地球 Online 冒险者")}</p></div><div className="hero-profile-actions"><Button onClick={() => navigate(returnPath)}><ArrowLeft size={15} />{tx("返回设置")}</Button><Button onClick={() => setEditing((value) => !value)}><Pencil size={15} />{tx("编辑身份")}</Button></div></header><div className="hero-profile-grid"><section className="hero-portrait-panel"><PixelAsset slot="hero-half-body" label={tx("英雄肖像槽位")} size={128} /><strong>{data.earthOnlineDay ? tx("Earth Online · Day {value0}", { value0: data.earthOnlineDay }) : tx("尚未设置出生日期")}</strong><small>{tx("稳定 portrait/avatar slot，当前使用 fallback。")}</small></section><section className="hero-progress-panel"><div><Shield size={18} /><span><strong>Lv.{data.progress.level}</strong><small>{data.progress.xpTotal} XP</small></span></div><div className="hero-profile-xp"><i style={{ width: `${Math.min(1, data.progress.xpInLevel / Math.max(1, data.progress.xpForNextLevel)) * 100}%` }} /></div><p>{data.progress.xpInLevel}/{data.progress.xpForNextLevel} EXP</p><fieldset><legend><CalendarHeart size={16} />{tx("今日状态")}</legend>{STATUS_OPTIONS.map((item) => <button type="button" aria-pressed={data.dailyStatus?.statusKey === item.key} className={data.dailyStatus?.statusKey === item.key ? "is-active" : ""} key={item.key} onClick={() => void setStatus(item.key)}>{tx(item.label)}</button>)}</fieldset><Button size="sm" onClick={() => setReplay(true)}>{tx("重放今日启动页")}</Button></section></div>{editing ? <form className="hero-profile-form" onSubmit={save}><label>{tx("显示名")}<input className="field" required maxLength={64} value={name} onChange={(event) => setName(event.target.value)} /></label><label>{tx("称号")}<input className="field" maxLength={80} value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>{tx("出生日期")}<input className="field" type="date" value={birthDate} max={data.businessDate} onChange={(event) => setBirthDate(event.target.value)} /></label><Button variant="primary" type="submit">{tx("保存身份")}</Button></form> : null}{replay ? <EarthOnlineDialog hero={data} selected={data.dailyStatus?.statusKey ?? null} onSelect={(value) => void setStatus(value)} onClose={() => setReplay(false)} onBegin={() => setReplay(false)} /> : null}</section>;
}

function heroReturnPath(state: unknown) {
  if (state && typeof state === "object" && "returnTo" in state && typeof state.returnTo === "string" && state.returnTo.startsWith("/settings")) return state.returnTo;
  return "/settings?topic=hero";
}

function isHeroSummary(value: unknown): value is HeroSummary {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<HeroSummary>;
  return Boolean(candidate.profile?.displayName && candidate.progress && typeof candidate.progress.level === "number" && candidate.businessDate && candidate.timezone);
}
