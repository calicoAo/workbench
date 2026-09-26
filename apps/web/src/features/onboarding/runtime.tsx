import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { createPortal } from "react-dom";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import type { Request } from "../../app/api";
import type { CurrentSession } from "../timer";
import type { TaskSnapshot } from "../tasks";
import { coreLoopFlow, resolveGuideAnchor, type TutorialStep } from "./definition";
import { NewcomerChecklist, type ChecklistTruth } from "./checklist";
import { tx } from "../../app/i18n";

type Progress = { flowId: string; flowVersion: number; status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "SKIPPED"; currentStepId: string | null; startedAt?: string | null };
type HintState = { hintKey: string; hintVersion: number; seenAt: string | null; dismissedAt: string | null };
type Status = { eligible: boolean; flow: Progress | null; hints: HintState[]; checklist?: { published: boolean; accepted: boolean; started: boolean; completed: boolean; note: boolean } };
type Hint = { key: string; title: string; body: string; target?: string };

export function OnboardingFeature({ children, request, userId, tasks, assignments, currentSession, hasActualTime = false, onError }: { children: ReactNode; request: Request; userId: number; tasks: TaskSnapshot[]; assignments: number[]; currentSession: CurrentSession | null; hasActualTime?: boolean; onError: (message: string, title?: string) => void }) {
  if (import.meta.env.VITE_ONBOARDING_DISABLED === "true") return <>{children}</>;
  return <OnboardingRuntime request={request} userId={userId} tasks={tasks} assignments={assignments} currentSession={currentSession} hasActualTime={hasActualTime} onError={onError}>{children}</OnboardingRuntime>;
}

function OnboardingRuntime({ children, request, userId, tasks, assignments, currentSession, hasActualTime, onError }: { children: ReactNode; request: Request; userId: number; tasks: TaskSnapshot[]; assignments: number[]; currentSession: CurrentSession | null; hasActualTime: boolean; onError: (message: string, title?: string) => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const statusQuery = useQuery({ queryKey: ["onboarding", userId], queryFn: () => request<Status>("/api/onboarding/status"), staleTime: 15_000 });
  const status = statusQuery.data;
  const [progress, setProgress] = useState<Progress | null>(null);
  const [hint, setHint] = useState<Hint | null>(null);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  const [checklistHost, setChecklistHost] = useState<HTMLElement | null>(null);
  const initialTaskIds = useRef<Set<number>>(new Set());
  const tutorialStarted = useRef(false);
  const createdTaskId = useRef<number | null>(null);
  const previousSession = useRef<CurrentSession | null>(null);
  const previousCompleted = useRef<Set<number> | null>(null);

  useEffect(() => {
    if (!status?.flow) return;
    setProgress((current) => !current || (status.flow?.status === "IN_PROGRESS" && (current.status === "COMPLETED" || current.status === "SKIPPED")) ? status.flow : current);
  }, [status?.flow?.flowVersion, status?.flow?.status, status?.flow?.currentStepId]);

  useEffect(() => {
    setChecklistHost(document.querySelector<HTMLElement>('[data-guide-anchor="onboarding.checklist"]'));
  }, [location.pathname, progress?.status]);

  useEffect(() => {
    if (status?.flow?.status === "NOT_STARTED" && !tutorialStarted.current) initialTaskIds.current = new Set(tasks.map((task) => task.id));
  }, [status?.flow?.status, tasks]);

  const step = useMemo(() => coreLoopFlow.steps.find((item) => item.id === progress?.currentStepId) ?? null, [progress?.currentStepId]);
  const candidateTask = useMemo(() => {
    const startedAt = progress?.startedAt ? new Date(progress.startedAt).getTime() : 0;
    const eligible = tasks.filter((task) => !startedAt || new Date(task.createdAt).getTime() >= startedAt);
    return eligible.find((task) => task.id === currentSession?.taskId) ?? eligible.find((task) => assignments.includes(task.id)) ?? eligible.sort((a, b) => b.id - a.id)[0] ?? null;
  }, [assignments, currentSession?.taskId, progress?.startedAt, tasks]);
  useEffect(() => { if (candidateTask) createdTaskId.current = candidateTask.id; }, [candidateTask]);

  useEffect(() => {
    if (!step?.route || progress?.status !== "IN_PROGRESS" || location.pathname === step.route) return;
    navigate(`${step.route}${location.search || ""}`, { replace: true });
  }, [location.pathname, location.search, navigate, progress?.status, step?.route]);

  useEffect(() => {
    if (!step || progress?.status !== "IN_PROGRESS" || step.route !== location.pathname) { setTarget(null); return; }
    let attempts = 0;
    const find = () => {
      const next = step.target ? resolveGuideAnchor(step.target, step.id === "accept" || step.id === "start" ? createdTaskId.current : null) : null;
      setTarget((current) => current === next ? current : next);
      if (++attempts >= 25) { window.clearInterval(timer); if (!next && step.missingTargetPolicy === "skip") void advance(step.id); }
    };
    find();
    const timer = window.setInterval(find, 200);
    return () => window.clearInterval(timer);
  }, [location.pathname, progress?.status, step]);

  useEffect(() => {
    if (!step || progress?.status !== "IN_PROGRESS") return;
    const onClick = (event: MouseEvent) => {
      const element = (event.target as HTMLElement).closest<HTMLElement>("[data-guide-anchor]");
      const liveTarget = target ?? (step.target ? resolveGuideAnchor(step.target) : null);
      if (element && step.id === "publish" && element === liveTarget && !element.dataset.guideAnchor?.endsWith(".entry")) void advance("publish");
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [step, progress?.status, target]);

  useEffect(() => {
    if (progress?.status !== "IN_PROGRESS") return;
    if (step?.id === "create") {
      const created = tasks.find((task) => !initialTaskIds.current.has(task.id)) ?? candidateTask;
      if (created) { createdTaskId.current = created.id; void advance("create"); }
    }
    if (step?.id === "accept" && candidateTask && assignments.includes(candidateTask.id)) void advance("accept");
    if (step?.id === "start" && currentSession && (!candidateTask || currentSession.taskId === candidateTask.id)) void advance("start");
  }, [assignments, candidateTask, currentSession, progress?.status, step?.id, tasks]);

  useEffect(() => {
    const completed = new Set(tasks.filter((task) => task.status === 2).map((task) => task.id));
    if (previousCompleted.current && [...completed].some((id) => !previousCompleted.current!.has(id))) void showHint({ key: "completion", title: "任务完成 ✓", body: "这次完成已经进入完成记录，并参与 XP / 成长统计。" });
    previousCompleted.current = completed;
  }, [tasks]);

  useEffect(() => {
    if (previousSession.current && !currentSession) void showHint({ key: "timer-end", title: "计时结束 ≠ 任务完成", body: "这里只表示这次实际投入结束。如果事情真的完成了，再单独完成任务。" });
    previousSession.current = currentSession;
  }, [currentSession]);

  useEffect(() => {
    if (!status || statusQuery.isError || progress?.status !== "COMPLETED") return;
    const routeHints: Record<string, Hint> = { "/finance": { key: "finance-intro", title: "真实资金与 Workbench Coins", body: "Finance Money 与 Workbench Coins 是两个完全独立的系统。" }, "/growth": { key: "growth-intro", title: "成长投入", body: "这里展示的是成长投入，不是能力评分。" }, "/inspirations": { key: "inspiration-intro", title: "整理灵感", body: "用 # 整理灵感。输入 # 可以选择已有标签，也可以创建新的标签。", target: "inspiration.tag-input" } };
    const next = routeHints[location.pathname];
    if (next && !(status?.hints ?? []).some((item) => item.hintKey === next.key && (item.seenAt || item.dismissedAt))) void showHint(next);
  }, [location.pathname, progress?.status, status, statusQuery.isError]);

  async function advance(stepId: TutorialStep["id"]) {
    try {
      const next = await request<Progress>(`/api/onboarding/flows/${coreLoopFlow.id}/advance`, { method: "POST", body: JSON.stringify({ stepId }) });
      setProgress(next);
      if (next.status === "COMPLETED") setCelebrating(true);
      await queryClient.invalidateQueries({ queryKey: ["onboarding", userId] });
    } catch (error) { onError(error instanceof Error ? error.message : tx("新手教学状态没有保存"), tx("教学状态异常")); }
  }
  async function start() {
    try { const next = await request<Progress>(`/api/onboarding/flows/${coreLoopFlow.id}/start`, { method: "POST" }); tutorialStarted.current = true; setProgress(next); initialTaskIds.current = new Set(tasks.map((task) => task.id)); await queryClient.invalidateQueries({ queryKey: ["onboarding", userId] }); } catch (error) { onError(error instanceof Error ? error.message : tx("新手教学无法开始"), tx("新手教学异常")); }
  }
  async function skip() { try { const next = await request<Progress>(`/api/onboarding/flows/${coreLoopFlow.id}/skip`, { method: "POST" }); setProgress(next); await queryClient.invalidateQueries({ queryKey: ["onboarding", userId] }); } catch (error) { onError(error instanceof Error ? error.message : tx("新手教学无法跳过"), tx("新手教学异常")); } }
  async function showHint(next: Hint) { if (hint) return; setHint(next); try { await request(`/api/onboarding/hints/${next.key}/seen`, { method: "POST", body: JSON.stringify({ hintVersion: 1 }) }); await queryClient.invalidateQueries({ queryKey: ["onboarding", userId] }); } catch { /* hints never block the product */ } }
  async function dismissHint() { if (!hint) return; try { await request(`/api/onboarding/hints/${hint.key}/dismiss`, { method: "POST", body: JSON.stringify({ hintVersion: 1 }) }); await queryClient.invalidateQueries({ queryKey: ["onboarding", userId] }); } catch { /* hints never block the product */ } finally { setHint(null); } }
  async function dismissChecklist() { try { await request("/api/onboarding/hints/newcomer-checklist/dismiss", { method: "POST", body: JSON.stringify({ hintVersion: 1 }) }); await queryClient.invalidateQueries({ queryKey: ["onboarding", userId] }); } catch { /* checklist never blocks the product */ } }

  const truth: ChecklistTruth = { published: tasks.length > 0 || Boolean(status?.checklist?.published), accepted: assignments.length > 0 || Boolean(status?.checklist?.accepted), started: Boolean(currentSession) || hasActualTime || Boolean(status?.checklist?.started), completed: tasks.some((task) => task.status === 2) || Boolean(status?.checklist?.completed), note: Boolean(status?.checklist?.note), growth: location.pathname === "/growth" || (status?.hints ?? []).some((item) => item.hintKey === "growth-intro" && Boolean(item.seenAt || item.dismissedAt)) };
  const showWelcome = status?.eligible && progress?.status === "NOT_STARTED";
  const showChecklist = progress?.status === "COMPLETED" && !(status?.hints ?? []).some((item) => item.hintKey === "newcomer-checklist" && item.dismissedAt);
  return <>{children}{showWelcome ? <WelcomeDialog onStart={() => void start()} onSkip={() => void skip()} /> : null}{progress?.status === "IN_PROGRESS" && step && location.pathname === step.route ? <GuideOverlay step={step} target={target} onSkip={() => void skip()} /> : null}{celebrating ? <CelebrationDialog onClose={() => setCelebrating(false)} /> : null}{showChecklist && checklistHost ? createPortal(<NewcomerChecklist truth={truth} onDismiss={() => void dismissChecklist()} />, checklistHost) : null}{hint ? <HintDialog hint={hint} onClose={() => void dismissHint()} /> : null}</>;
}

function WelcomeDialog({ onStart, onSkip }: { onStart: () => void; onSkip: () => void }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { ref.current?.querySelector<HTMLButtonElement>("button")?.focus(); const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onSkip(); }; document.addEventListener("keydown", onKeyDown); return () => document.removeEventListener("keydown", onKeyDown); }, [onSkip]);
  return <div className="onboarding-backdrop" role="presentation"><section ref={ref} className="onboarding-welcome" role="dialog" aria-modal="true" aria-labelledby="onboarding-welcome-title"><p className="route-eyebrow">{tx("✨ 养成系统")}</p><h1 id="onboarding-welcome-title">{tx("欢迎来到养成系统")}</h1><p>{tx("这里不是普通的待办清单。")}<br />{tx("把想做的事发布成悬赏，接取它、真正开始行动，完成后的时间和行动会逐渐变成自己的成长记录。")}</p><div className="onboarding-actions"><button type="button" className="onboarding-secondary" onClick={onSkip}>{tx("直接进入")}</button><button type="button" className="onboarding-primary" onClick={onStart}>{tx("开始新手教学")}</button></div></section></div>;
}
function GuideOverlay({ step, target, onSkip }: { step: TutorialStep; target: HTMLElement | null; onSkip: () => void }) {
  useEffect(() => { const focusable = target?.matches("button, input, textarea, select, [tabindex]") ? target : target?.querySelector<HTMLElement>("button, input, textarea, select, [tabindex]"); focusable?.focus({ preventScroll: true }); const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onSkip(); }; document.addEventListener("keydown", onKeyDown); return () => document.removeEventListener("keydown", onKeyDown); }, [onSkip, target]);
  const rect = target?.getBoundingClientRect();
  const coachStyle = rect ? coachPosition(rect, step.placement ?? "bottom") : undefined;
  return <>{rect && step.interaction === "target-only" ? <div className="onboarding-target-blockers" aria-hidden="true"><span style={{ inset: `0 0 auto 0`, height: Math.max(0, rect.top) }} /><span style={{ inset: `${rect.bottom}px 0 0 0` }} /><span style={{ top: rect.top, left: 0, width: Math.max(0, rect.left), height: rect.height }} /><span style={{ top: rect.top, left: rect.right, right: 0, height: rect.height }} /></div> : null}<div className="onboarding-guide" aria-hidden="true">{rect ? <span className="onboarding-ring" style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }} /> : null}</div><aside className={`onboarding-coach ${rect ? "is-targeted" : `onboarding-placement-${step.placement ?? "bottom"}`}`} style={coachStyle} role="dialog" aria-label={tx(step.title)}><button type="button" className="onboarding-close" aria-label={tx("跳过教学")} onClick={onSkip}><X size={16} /></button><strong>{tx(step.title)}</strong><p>{tx(step.body)}</p><small>{tx("可随时跳过教学")}</small></aside></>;
}
function CelebrationDialog({ onClose }: { onClose: () => void }) { return <div className="onboarding-backdrop" role="presentation"><section className="onboarding-welcome" role="dialog" aria-modal="true" aria-labelledby="onboarding-complete-title"><Check className="onboarding-celebration-icon" size={30} /><h1 id="onboarding-complete-title">{tx("新手教学完成 ✓")}</h1><p>{tx("你已经学会：")}<br /><strong>{tx("发布 → 接取 → 开始")}</strong><br />{tx("接下来专心做你的事吧。")}</p><div className="onboarding-actions"><button type="button" className="onboarding-primary" autoFocus onClick={onClose}>{tx("开始行动")}</button></div></section></div>; }
function HintDialog({ hint, onClose }: { hint: Hint; onClose: () => void }) { const target = hint.target ? resolveGuideAnchor(hint.target) : null; return <>{target ? <span className="onboarding-hint-ring" aria-hidden="true" style={{ top: target.getBoundingClientRect().top - 5, left: target.getBoundingClientRect().left - 5, width: target.getBoundingClientRect().width + 10, height: target.getBoundingClientRect().height + 10 }} /> : null}<aside className="onboarding-hint" role="status"><div><strong>{tx(hint.title)}</strong><p>{tx(hint.body)}</p></div><button type="button" aria-label={tx("关闭提示")} onClick={onClose}>{hint.key === "completion" ? <Check size={16} /> : <X size={16} />}</button></aside></>; }

function coachPosition(rect: DOMRect, preferred: "top" | "bottom" | "left" | "right") {
  const width = Math.min(320, window.innerWidth - 32), estimatedHeight = 150, gap = 12;
  const below = rect.bottom + gap + estimatedHeight <= window.innerHeight - 12;
  const useTop = preferred === "top" || !below;
  return { top: Math.max(12, Math.min(window.innerHeight - estimatedHeight - 12, useTop ? rect.top - estimatedHeight - gap : rect.bottom + gap)), left: Math.max(16, Math.min(window.innerWidth - width - 16, rect.left + rect.width / 2 - width / 2)), width };
}
