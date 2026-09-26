import { type ReactNode, useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { Coins, Gift, Sparkles, X } from "lucide-react";
import type { RewardGrant } from "../features/rewards";
import { tx } from "./i18n";

type TaskSummary = { id: number; title: string };
type Popup =
  | { kind: "notice"; title: string; message: string }
  | { kind: "reward"; title: string; message: string; rewards: RewardGrant[] }
  | { kind: "confirm"; title: string; message: string; confirmText: string; onConfirm: () => void | Promise<void> };

export type FeedbackActions = {
  notice: (message: string, title?: string) => void;
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

export function ApplicationFeedback({ children }: { children: (actions: FeedbackActions) => ReactNode }) {
  const [popup, setPopup] = useState<Popup | null>(null);
  const notice = useCallback((message: string, title = "需要看一下") => setPopup({ kind: "notice", title, message }), []);
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
      message: "这次整理也计入成长记录。能把模糊的东西写清楚，本身就是一种推进。",
      rewards: reward ? [reward] : []
    });
  }, []);

  return <>
    {children({ notice, confirm, taskReward, recordReward })}
    {popup && <FeedbackPopup popup={popup} onClose={() => setPopup(null)} />}
  </>;
}

function FeedbackPopup({ popup, onClose }: { popup: Popup; onClose: () => void }) {
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
        <article className={`feedback-modal ${popup.kind === "reward" ? "feedback-modal-reward" : ""}`}>
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="feedback-icon">{popup.kind === "reward" ? <Gift size={22} /> : <Sparkles size={22} />}</span>
              <div><h3 className="text-base font-bold">{tx(popup.title)}</h3><p className="mt-1 text-xs leading-5 text-soft">{tx(popup.message)}</p></div>
            </div>
            <button className="icon-button h-8 w-8 shrink-0" type="button" aria-label={tx("关闭")} onClick={onClose}><X size={15} /></button>
          </div>
          {popup.kind === "reward" && (hasReward ? (
            <div className="grid grid-cols-2 gap-2"><div className="reward-pop-card"><Sparkles size={17} /><span>+{totalXp} XP</span></div><div className="reward-pop-card"><Coins size={17} /><span>+{totalCoins} {tx("金币")}</span></div></div>
          ) : <p className="rounded-card border border-white/80 bg-white/65 p-3 text-xs text-soft">{tx("这次奖励之前已经发放过，不会重复计算。")}</p>)}
          {popup.kind === "confirm" ? (
            <div className="mt-4 grid grid-cols-2 gap-2"><button className="icon-button w-full px-4" type="button" aria-label={tx("取消")} onClick={onClose}>{tx("取消")}</button><button className="primary-button w-full" type="button" onClick={confirm}>{popup.confirmText}</button></div>
          ) : <button className="primary-button mt-4 w-full" type="button" onClick={onClose}>{tx("收下")}</button>}
        </article>
      </div>
    </div>,
    document.body
  );
}
