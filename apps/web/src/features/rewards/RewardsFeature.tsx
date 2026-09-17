import { Coins, Gift, Sparkles, Trash2 } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

export type Growth = { level: number; xpTotal: number; coins: number; xpInLevel: number; xpForNextLevel: number };
export type RewardEvent = { id: number; reason: string; xpDelta: number; coinDelta: number; sourceType?: string; sourceId?: string; createdAt: string };
export type RewardGrant = { xp: number; coins: number; reason: string };

type RewardItem = { id: number; name: string; cost: number; description: string | null };
type RewardRedemption = { id: number; name: string; cost: number; createdAt: string };
type RewardsSnapshot = { growth: Growth; items: RewardItem[]; events: RewardEvent[]; redemptions: RewardRedemption[] };
type ApiRequest = <T>(path: string, init?: RequestInit) => Promise<T>;
type RewardableTask = { difficulty: number; pinned: number };
type PlannedSchedule = { startTime: string; endTime: string };

const TASK_REWARD_BASE: Record<number, { xp: number; coins: number }> = {
  1: { xp: 10, coins: 3 },
  2: { xp: 20, coins: 6 },
  3: { xp: 40, coins: 12 },
  4: { xp: 70, coins: 20 }
};

type RewardsFeatureProps = {
  request: ApiRequest;
  initialGrowth: Growth | null;
  initialEvents: RewardEvent[];
  onError: (message: string, title?: string) => void;
  onGrowthChanged: () => Promise<void>;
};

export function estimatePlannedTaskReward(task: RewardableTask, schedule: PlannedSchedule | null) {
  if (!schedule) return null;
  const [startHour, startMinute, startSecond = 0] = schedule.startTime.split(":").map(Number);
  const [endHour, endMinute, endSecond = 0] = schedule.endTime.split(":").map(Number);
  const seconds = Math.max(0, endHour * 3600 + endMinute * 60 + endSecond - (startHour * 3600 + startMinute * 60 + startSecond));
  const durationMinutes = seconds > 0 ? Math.max(1, Math.ceil(seconds / 60)) : 0;
  const base = TASK_REWARD_BASE[task.difficulty] ?? TASK_REWARD_BASE[2];
  const hours = Math.max(0.25, durationMinutes / 60);
  const multiplier = task.pinned ? 1.3 : 1;
  return {
    xp: Math.max(1, Math.round(base.xp * hours * multiplier)),
    coins: Math.max(1, Math.round(base.coins * hours * multiplier))
  };
}

export function GrowthSummary({ growth }: { growth: Growth }) {
  const percent = Math.min(100, Math.round((growth.xpInLevel / Math.max(1, growth.xpForNextLevel)) * 100));
  return (
    <div className="top-growth-card">
      <div className="top-growth-main">
        <span className="top-growth-level">Lv.{growth.level}</span>
        <span className="top-growth-coins">
          <Coins size={16} />
          {growth.coins}
        </span>
      </div>
      <div className="top-growth-meta">
        <span>经验 {growth.xpInLevel}/{growth.xpForNextLevel}</span>
        <span>{percent}%</span>
      </div>
      <div className="top-growth-track">
        <div className="top-growth-fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export function RewardsFeature({ request, initialGrowth, initialEvents, onError, onGrowthChanged }: RewardsFeatureProps) {
  const [snapshot, setSnapshot] = useState<RewardsSnapshot | null>(null);
  const [name, setName] = useState("");
  const [cost, setCost] = useState("120");
  const [description, setDescription] = useState("");

  async function refresh() {
    setSnapshot(await request<RewardsSnapshot>("/api/rewards"));
  }

  useEffect(() => {
    void request<RewardsSnapshot>("/api/rewards")
      .then(setSnapshot)
      .catch((error: unknown) => {
        onError(error instanceof Error ? error.message : "奖励中心加载失败", "奖励中心加载失败");
      });
  }, [request, onError]);

  async function run(action: () => Promise<void>) {
    try {
      await action();
    } catch (error) {
      onError(error instanceof Error ? error.message : "操作失败", "操作没有成功");
    }
  }

  async function createReward(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    await run(async () => {
      await request("/api/rewards/items", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), cost: Number(cost), description: description.trim() || undefined })
      });
      setName("");
      setCost("120");
      setDescription("");
      await refresh();
    });
  }

  async function deleteReward(item: RewardItem) {
    await run(async () => {
      await request(`/api/rewards/items/${item.id}`, { method: "DELETE" });
      await refresh();
    });
  }

  async function redeemReward(item: RewardItem) {
    await run(async () => {
      await request(`/api/rewards/items/${item.id}/redeem`, { method: "POST" });
      await Promise.all([refresh(), onGrowthChanged()]);
    });
  }

  const growth = snapshot?.growth ?? initialGrowth;
  const events = snapshot?.events ?? initialEvents;
  const items = snapshot?.items ?? [];
  const redemptions = snapshot?.redemptions ?? [];
  const percent = growth ? Math.min(100, Math.round((growth.xpInLevel / Math.max(1, growth.xpForNextLevel)) * 100)) : 0;

  return (
    <section className="grid gap-2.5 lg:grid-cols-[minmax(0,1.1fr)_360px]">
      <section className="glass-panel p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-mint-700"><Sparkles size={17} /></span>
            <h2 className="section-title">成长进度</h2>
          </div>
        </div>
        <div className="growth-hero">
          <div>
            <p className="text-xs text-soft">当前等级</p>
            <h2 className="mt-1 text-2xl font-bold">Lv.{growth?.level ?? 1}</h2>
          </div>
          <div className="text-right">
            <p className="text-xs text-soft">金币</p>
            <p className="mt-1 inline-flex items-center gap-1 text-2xl font-bold text-amber-500">
              <Coins size={20} />
              {growth?.coins ?? 0}
            </p>
          </div>
        </div>
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-[11px] text-soft">
            <span>经验</span>
            <span>{growth?.xpInLevel ?? 0}/{growth?.xpForNextLevel ?? 50}</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-white/70">
            <div className="h-full rounded-full bg-mint-500 transition-all duration-500" style={{ width: `${percent}%` }} />
          </div>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-2">
          <section className="reward-list">
            <h3 className="mb-2 text-xs font-semibold text-ink">最近获得</h3>
            {events.length ? (
              events.map((event) => (
                <div className="reward-row" key={event.id}>
                  <span>{event.reason}</span>
                  <span className="text-right text-mint-700">+{event.xpDelta} XP {event.coinDelta ? `+${event.coinDelta} 金币` : ""}</span>
                </div>
              ))
            ) : (
              <p className="rounded-card bg-white/50 p-3 text-sm text-soft">完成一次记录后，这里会亮起来。</p>
            )}
          </section>
          <section className="reward-list">
            <h3 className="mb-2 text-xs font-semibold text-ink">最近兑换</h3>
            {redemptions.length ? (
              redemptions.map((item) => (
                <div className="reward-row" key={item.id}>
                  <span>{item.name}</span>
                  <span className="text-right text-pink-500">-{item.cost}</span>
                </div>
              ))
            ) : (
              <p className="rounded-card bg-white/50 p-3 text-sm text-soft">还没有兑换奖励。</p>
            )}
          </section>
        </div>
      </section>

      <section className="glass-panel p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-mint-700"><Gift size={17} /></span>
            <h2 className="section-title">奖励中心</h2>
          </div>
        </div>
        <form className="space-y-2" onSubmit={createReward}>
          <input className="field" placeholder="奖励名称，比如：买一杯喜欢的饮料" value={name} onChange={(event) => setName(event.target.value)} />
          <input className="field" min={1} type="number" placeholder="金币价格" value={cost} onChange={(event) => setCost(event.target.value)} />
          <textarea className="journal-input min-h-20" placeholder="说明，可不填" value={description} onChange={(event) => setDescription(event.target.value)} />
          <button className="primary-button w-full" type="submit">添加奖励</button>
        </form>

        <div className="mt-3 space-y-2">
          {items.length ? (
            items.map((item) => (
              <article className="reward-item" key={item.id}>
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold">{item.name}</h3>
                  {item.description && <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-soft">{item.description}</p>}
                  <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-amber-500">
                    <Coins size={13} />
                    {item.cost}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button className="icon-button w-auto px-3 text-[11px]" type="button" aria-label={`兑换${item.name}`} onClick={() => redeemReward(item)} disabled={(growth?.coins ?? 0) < item.cost}>
                    兑换
                  </button>
                  <button className="icon-button h-8 w-8" type="button" aria-label="删除奖励" onClick={() => deleteReward(item)}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </article>
            ))
          ) : (
            <p className="rounded-card bg-white/50 p-3 text-sm text-soft">先添加一个想兑换的小奖励。</p>
          )}
        </div>
      </section>
    </section>
  );
}
