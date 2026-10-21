import { IconButton } from "../shared/ui";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Coins, Gift, Sparkles, X } from "lucide-react";
import type { RewardGrant } from "../features/rewards";
import { tx } from "./i18n";

type TaskSummary = { id: number; title: string };
type Popup =
  | { kind: "notice"; title: string; message: string }
  | { kind: "reward"; title: string; message: string; rewards: RewardGrant[] }
  | { kind: "confirm"; title: string; message: string; confirmText: string; onConfirm: () => void | Promise<void> };

export type FeedbackActions = {
  notice: (message: string, title?: string) => void;
  success: (message?: string) => void;
  confirm: (title: string, message: string, onConfirm: () => void | Promise<void>, confirmText?: string) => void;
  taskReward: (task: TaskSummary | null | undefined, rewards: Array<RewardGrant | null | undefined>, mode?: "done" | "partial") => void;
  recordReward: (label: string, reward: RewardGrant | null | undefined) => void;
};

const TASK_ENCOURAGEMENTS = [
  "你把想法变成了真实进度，这一步很扎实。",
  "完成就是最好的证据，今天的你又往前走了一格。",
  "这件事已经落袋了，可以安心给自己记上一笔。",
  "你没有只停在计划里，行动已经被记录下来了。",
  "很好，这种稳定的小完成会慢慢叠成很大的底气。"
] as const;

const FeedbackPresentation = createContext(false);
/** Derived presentation only; the popup still has one ApplicationFeedback owner. */
export function useFeedbackPresentation() { return useContext(FeedbackPresentation); }

export function ApplicationFeedback({ children }: { children: (actions: FeedbackActions) => ReactNode }) {
  const [popup, setPopup] = useState<Popup | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const notice = useCallback((message: string, title = "需要看一下") => setPopup({ kind: "notice", title, message }), []);
  const success = useCallback((message = "操作已完成") => setSuccessMessage(message), []);
  const confirm = useCallback((title: string, message: string, onConfirm: () => void | Promise<void>, confirmText = "确认") => {
    setPopup({ kind: "confirm", title, message, confirmText, onConfirm });
  }, []);
  const taskReward = useCallback((task: TaskSummary | null | undefined, rewards: Array<RewardGrant | null | undefined>, mode: "done" | "partial" = "done") => {
    const validRewards = rewards.filter((reward): reward is RewardGrant => Boolean(reward && (reward.xp || reward.coins)));
    const line = task ? TASK_ENCOURAGEMENTS[task.id % TASK_ENCOURAGEMENTS.length] : TASK_ENCOURAGEMENTS[0];
    const taskTitle = task?.title ?? "这个任务";
    setPopup({
      kind: "reward",
      title: mode === "partial" ? "阶段完成，奖励到账" : "任务完成，奖励到账",
      message: mode === "partial" ? `${taskTitle} 已记录一段投入。${line}` : `${taskTitle} 已完成。${line}`,
      rewards: validRewards
    });
  }, []);
  const recordReward = useCallback((label: string, reward: RewardGrant | null | undefined) => {
    setPopup({
      kind: "reward",
      title: `${label}已保存`,
      message: "这条记录也计入成长。",
      rewards: reward ? [reward] : []
    });
  }, []);
  useEffect(() => {
    if (!successMessage) return;
    const timer = window.setTimeout(() => setSuccessMessage(null), 2600);
    return () => window.clearTimeout(timer);
  }, [successMessage]);

  return <FeedbackPresentation.Provider value={popup !== null}>
    {children({ notice, success, confirm, taskReward, recordReward })}
    {successMessage ? <div className="app-success-toast" role="status" aria-live="polite"><Check size={16} />{tx(successMessage)}</div> : null}
    {popup && <FeedbackPopup popup={popup} onClose={() => setPopup(null)} />}
  </FeedbackPresentation.Provider>;
}

function FeedbackPopup({ popup, onClose }: { popup: Popup; onClose: () => void }) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const buttons = () => [...(dialog?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
    buttons()[0]?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); closeRef.current(); }
      if (event.key === "Tab") {
        const items = buttons(), first = items[0], last = items[items.length - 1];
        if (!first || !last) return;
        if (event.shiftKey && (document.activeElement === first || !dialog?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
        if (!event.shiftKey && (document.activeElement === last || !dialog?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", keydown, true);
    return () => { document.removeEventListener("keydown", keydown, true); if (trigger?.isConnected && !trigger.closest("[inert], [hidden]")) trigger.focus(); };
  }, [popup]);
  const totalXp = popup.kind === "reward" ? popup.rewards.reduce((sum, reward) => sum + reward.xp, 0) : 0;
  const totalCoins = popup.kind === "reward" ? popup.rewards.reduce((sum, reward) => sum + reward.coins, 0) : 0;
  const hasReward = popup.kind === "reward" && (totalXp > 0 || totalCoins > 0);
  const confirm = async () => {
    if (popup.kind !== "confirm") return;
    const action = popup.onConfirm;
    onClose();
    await action();
  };

  return createPortal(
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="modal-shell" onMouseDown={(event) => event.stopPropagation()}>
        <article ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="feedback-popup-title" className={`ui-dialog feedback-modal ${popup.kind === "reward" ? "feedback-modal-reward" : ""}`}>
          <header className="mb-3 flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="feedback-icon">{popup.kind === "reward" ? <Gift size={22} /> : <Sparkles size={22} />}</span>
              <h3 id="feedback-popup-title" className="text-base font-bold">{tx(popup.title)}</h3>
            </div>
            <IconButton type="button" label={tx("关闭")} onClick={onClose}><X size={15} /></IconButton>
          </header>
          <p className="text-xs leading-5 text-soft">{tx(popup.message)}</p>
          {popup.kind === "reward" && (hasReward ? (
            <div className="grid grid-cols-2 gap-2"><div className="reward-pop-card"><Sparkles size={17} /><span>+{totalXp} XP</span></div><div className="reward-pop-card"><Coins size={17} /><span>+{totalCoins} {tx("金币")}</span></div></div>
          ) : <p className="rounded-card border border-white/80 bg-white/65 p-3 text-xs text-soft">{tx("这次奖励之前已经发放过，不会重复计算。")}</p>)}
          <footer>{popup.kind === "confirm" ? (
            <><button className="icon-button px-4" type="button" aria-label={tx("取消")} onClick={onClose}>{tx("取消")}</button><button className="primary-button px-4" type="button" onClick={confirm}>{popup.confirmText}</button></>
          ) : <button className="primary-button" type="button" onClick={onClose}>{tx("收下")}</button>}</footer>
        </article>
      </div>
    </div>,
    document.body
  );
}
