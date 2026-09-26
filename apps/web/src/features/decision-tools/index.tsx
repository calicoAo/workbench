import { type FormEvent, type ReactNode, useState } from "react";
import { createPortal } from "react-dom";
import { Scale, Sparkles, X } from "lucide-react";
import type { RewardGrant } from "../rewards";
import { tx } from "../../app/i18n";

type Request = <T>(path: string, init?: RequestInit) => Promise<T>;

type DecisionRecord = {
  id: number;
  decisionDate: string;
  theme: string;
  benefits: string;
  drawbacks: string;
  benefitScore: number;
  drawbackScore: number;
  conclusion: string | null;
};

type PsychologicalBridgeRecord = {
  id: number;
  bridgeDate: string;
  desiredEffect: string;
  resistance: string;
  bridgeText: string;
  nextStep: string | null;
  reassurance: string | null;
};

type DecisionSaveResult = DecisionRecord & { reward: RewardGrant | null };
type BridgeSaveResult = PsychologicalBridgeRecord & { reward: RewardGrant | null };

export function DecisionToolsFeature({
  request,
  selectedDate,
  onError,
  onChanged,
  onReward
}: {
  request: Request;
  selectedDate: string;
  onError: (message: string, title?: string) => void;
  onChanged: () => void | Promise<void>;
  onReward: (label: string, reward: RewardGrant | null) => void;
}) {
  const [toolModal, setToolModal] = useState<"decision" | "bridge" | null>(null);
  const [decisionRecords, setDecisionRecords] = useState<DecisionRecord[]>([]);
  const [bridgeRecords, setBridgeRecords] = useState<PsychologicalBridgeRecord[]>([]);
  const [decisionTheme, setDecisionTheme] = useState("");
  const [decisionBenefits, setDecisionBenefits] = useState("");
  const [decisionDrawbacks, setDecisionDrawbacks] = useState("");
  const [decisionBenefitScore, setDecisionBenefitScore] = useState("3");
  const [decisionDrawbackScore, setDecisionDrawbackScore] = useState("3");
  const [decisionConclusion, setDecisionConclusion] = useState("");
  const [bridgeDesiredEffect, setBridgeDesiredEffect] = useState("");
  const [bridgeResistance, setBridgeResistance] = useState("");
  const [bridgeResult, setBridgeResult] = useState<PsychologicalBridgeRecord | null>(null);
  const [bridgeLoading, setBridgeLoading] = useState(false);

  async function loadRecords() {
    try {
      const [decisions, bridges] = await Promise.all([
        request<DecisionRecord[]>("/api/decision-tools/decisions?limit=8"),
        request<PsychologicalBridgeRecord[]>("/api/decision-tools/bridges?limit=8")
      ]);
      setDecisionRecords(decisions);
      setBridgeRecords(bridges);
    } catch (error) {
      onError(error instanceof Error ? error.message : tx("小工具记录加载失败"), tx("小工具记录加载失败"));
    }
  }

  function openTool(kind: "decision" | "bridge") {
    setToolModal(kind);
    void loadRecords();
  }

  async function saveDecision(event: FormEvent) {
    event.preventDefault();
    if (!decisionTheme.trim() || !decisionBenefits.trim() || !decisionDrawbacks.trim()) {
      onError(tx("主题、好处和坏处都需要填写。"));
      return;
    }
    try {
      const result = await request<DecisionSaveResult>("/api/decision-tools/decisions", {
        method: "POST",
        body: JSON.stringify({
          decisionDate: selectedDate,
          theme: decisionTheme,
          benefits: decisionBenefits,
          drawbacks: decisionDrawbacks,
          benefitScore: Number(decisionBenefitScore),
          drawbackScore: Number(decisionDrawbackScore),
          conclusion: decisionConclusion.trim() || undefined
        })
      });
      setDecisionTheme("");
      setDecisionBenefits("");
      setDecisionDrawbacks("");
      setDecisionBenefitScore("3");
      setDecisionDrawbackScore("3");
      setDecisionConclusion("");
      await Promise.all([loadRecords(), onChanged()]);
      onReward("决策记录", result.reward);
    } catch (error) {
      onError(error instanceof Error ? error.message : tx("操作失败"), tx("操作没有成功"));
    }
  }

  async function generateBridge(event: FormEvent) {
    event.preventDefault();
    if (!bridgeDesiredEffect.trim() || !bridgeResistance.trim()) {
      onError(tx("想达成的效果和阻力都需要填写。"));
      return;
    }
    setBridgeLoading(true);
    try {
      const result = await request<BridgeSaveResult>("/api/decision-tools/bridges/generate", {
        method: "POST",
        body: JSON.stringify({ bridgeDate: selectedDate, desiredEffect: bridgeDesiredEffect, resistance: bridgeResistance })
      });
      setBridgeResult(result);
      await Promise.all([loadRecords(), onChanged()]);
      onReward("心理桥梁", result.reward);
    } catch (error) {
      onError(error instanceof Error ? error.message : tx("操作失败"), tx("操作没有成功"));
    } finally {
      setBridgeLoading(false);
    }
  }

  return (
    <>
      <div className="grid gap-2">
        <button className="tool-entry" type="button" onClick={() => openTool("decision")}>
          <span className="tool-entry-icon"><Scale size={15} /></span>
          <span><strong>{tx("辅助决策")}</strong><small>{tx("好处 / 坏处 / 分数")}</small></span>
        </button>
        <button className="tool-entry" type="button" onClick={() => openTool("bridge")}>
          <span className="tool-entry-icon"><Sparkles size={15} /></span>
          <span><strong>{tx("心理桥梁")}</strong><small>{tx("目标 / 阻力 / 下一步")}</small></span>
        </button>
      </div>
      {toolModal === "decision" && (
        <DecisionToolModal
          records={decisionRecords}
          selectedDate={selectedDate}
          theme={decisionTheme}
          benefits={decisionBenefits}
          drawbacks={decisionDrawbacks}
          benefitScore={decisionBenefitScore}
          drawbackScore={decisionDrawbackScore}
          conclusion={decisionConclusion}
          onThemeChange={setDecisionTheme}
          onBenefitsChange={setDecisionBenefits}
          onDrawbacksChange={setDecisionDrawbacks}
          onBenefitScoreChange={setDecisionBenefitScore}
          onDrawbackScoreChange={setDecisionDrawbackScore}
          onConclusionChange={setDecisionConclusion}
          onSubmit={saveDecision}
          onClose={() => setToolModal(null)}
        />
      )}
      {toolModal === "bridge" && (
        <PsychologicalBridgeModal
          records={bridgeRecords}
          selectedDate={selectedDate}
          desiredEffect={bridgeDesiredEffect}
          resistance={bridgeResistance}
          result={bridgeResult}
          loading={bridgeLoading}
          onDesiredEffectChange={setBridgeDesiredEffect}
          onResistanceChange={setBridgeResistance}
          onSubmit={generateBridge}
          onClose={() => setToolModal(null)}
        />
      )}
    </>
  );
}

function FeatureModal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return createPortal(
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="modal-shell" onMouseDown={(event) => event.stopPropagation()}>{children}</div>
    </div>,
    document.body
  );
}

function DecisionToolModal(props: {
  records: DecisionRecord[];
  selectedDate: string;
  theme: string;
  benefits: string;
  drawbacks: string;
  benefitScore: string;
  drawbackScore: string;
  conclusion: string;
  onThemeChange: (value: string) => void;
  onBenefitsChange: (value: string) => void;
  onDrawbacksChange: (value: string) => void;
  onBenefitScoreChange: (value: string) => void;
  onDrawbackScoreChange: (value: string) => void;
  onConclusionChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onClose: () => void;
}) {
  const balance = Number(props.benefitScore) - Number(props.drawbackScore);
  return (
    <FeatureModal onClose={props.onClose}>
      <form className="tool-modal" onSubmit={props.onSubmit}>
        <ToolModalHeader eyebrow={props.selectedDate} title={tx("辅助决策")} onClose={props.onClose} />
        <div className="tool-modal-grid">
          <div className="space-y-2">
            <input className="field" placeholder={tx("这次要决定什么？")} value={props.theme} onChange={(event) => props.onThemeChange(event.target.value)} />
            <div className="grid gap-2 md:grid-cols-2">
              <label className="space-y-1"><span className="tool-label">{tx("好处")}</span><textarea className="journal-input min-h-36" placeholder={tx("会带来什么收益、成长、轻松感？")} value={props.benefits} onChange={(event) => props.onBenefitsChange(event.target.value)} /></label>
              <label className="space-y-1"><span className="tool-label">{tx("坏处")}</span><textarea className="journal-input min-h-36" placeholder={tx("会付出什么成本、风险、精力？")} value={props.drawbacks} onChange={(event) => props.onDrawbacksChange(event.target.value)} /></label>
            </div>
            <div className="grid gap-2 md:grid-cols-[1fr_1fr_120px]">
              <label className="space-y-1"><span className="tool-label">{tx("好处权重")}</span><select className="field" value={props.benefitScore} onChange={(event) => props.onBenefitScoreChange(event.target.value)}><ScoreSelectOptions /></select></label>
              <label className="space-y-1"><span className="tool-label">{tx("坏处权重")}</span><select className="field" value={props.drawbackScore} onChange={(event) => props.onDrawbackScoreChange(event.target.value)}><ScoreSelectOptions /></select></label>
              <div className={`decision-score ${balance >= 0 ? "decision-score-positive" : "decision-score-negative"}`}><span>{tx("倾向")}</span><strong>{balance > 0 ? `+${balance}` : balance}</strong></div>
            </div>
            <input className="field" placeholder={tx("当前倾向/结论，可不填")} value={props.conclusion} onChange={(event) => props.onConclusionChange(event.target.value)} />
            <div className="flex justify-end gap-2"><button className="icon-button w-auto px-4" type="button" aria-label={tx("取消")} onClick={props.onClose}>{tx("取消")}</button><button className="primary-button px-5" type="submit">{tx("保存决策")}</button></div>
          </div>
          <ToolRecordList emptyText={tx("保存后会在这里看到决策记录。")} items={props.records.map((item) => ({ id: item.id, title: item.theme, meta: tx("{value0} · 好处 {value1} / 坏处 {value2}", { value0: item.decisionDate, value1: item.benefitScore, value2: item.drawbackScore }), body: item.conclusion || item.benefits }))} />
        </div>
      </form>
    </FeatureModal>
  );
}

function PsychologicalBridgeModal(props: {
  records: PsychologicalBridgeRecord[];
  selectedDate: string;
  desiredEffect: string;
  resistance: string;
  result: PsychologicalBridgeRecord | null;
  loading: boolean;
  onDesiredEffectChange: (value: string) => void;
  onResistanceChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onClose: () => void;
}) {
  const latest = props.result ?? props.records[0] ?? null;
  return (
    <FeatureModal onClose={props.onClose}>
      <form className="tool-modal" onSubmit={props.onSubmit}>
        <ToolModalHeader eyebrow={props.selectedDate} title={tx("心理桥梁")} onClose={props.onClose} />
        <div className="tool-modal-grid">
          <div className="space-y-2">
            <label className="space-y-1"><span className="tool-label">{tx("想达成的效果")}</span><textarea className="journal-input min-h-28" placeholder={tx("比如：我想稳定开始画画，不再只停留在想法里。")} value={props.desiredEffect} onChange={(event) => props.onDesiredEffectChange(event.target.value)} /></label>
            <label className="space-y-1"><span className="tool-label">{tx("现在的阻力")}</span><textarea className="journal-input min-h-28" placeholder={tx("比如：一想到要开始就觉得麻烦，怕画得不好。")} value={props.resistance} onChange={(event) => props.onResistanceChange(event.target.value)} /></label>
            <button className="primary-button w-full px-5" type="submit" disabled={props.loading}>{props.loading ? tx("生成中...") : tx("生成心理桥梁")}</button>
            {latest && <article className="bridge-result"><p className="whitespace-pre-wrap text-[12px] leading-6 text-ink">{latest.bridgeText}</p>{latest.nextStep && <p className="mt-2 text-[12px] font-semibold text-mint-700">{tx("下一步：")}{latest.nextStep}</p>}{latest.reassurance && <p className="mt-2 text-[12px] text-soft">{latest.reassurance}</p>}</article>}
          </div>
          <ToolRecordList emptyText={tx("生成后会在这里看到心理桥梁记录。")} items={props.records.map((item) => ({ id: item.id, title: item.desiredEffect, meta: item.bridgeDate, body: item.nextStep || item.bridgeText }))} />
        </div>
      </form>
    </FeatureModal>
  );
}

function ToolModalHeader({ eyebrow, title, onClose }: { eyebrow: string; title: string; onClose: () => void }) {
  return <div className="mb-3 flex items-center justify-between gap-2"><div><p className="text-[11px] text-soft">{tx(eyebrow)}</p><h3 className="text-sm font-semibold">{tx(title)}</h3></div><button className="icon-button h-8 w-8" type="button" aria-label={tx("关闭")} onClick={onClose}><X size={15} /></button></div>;
}

function ToolRecordList({ items, emptyText }: { items: Array<{ id: number; title: string; meta: string; body: string }>; emptyText: string }) {
  return <aside className="tool-records"><h4 className="mb-2 text-[11px] font-semibold text-soft">{tx("最近记录")}</h4>{items.length ? items.map((item) => <article className="tool-record-card" key={item.id}><div className="flex items-start justify-between gap-2"><h5 className="line-clamp-2 text-[12px] font-semibold text-ink">{item.title}</h5><span className="shrink-0 text-[10px] text-soft">{item.meta}</span></div><p className="mt-1 line-clamp-3 text-[11px] leading-5 text-soft">{item.body}</p></article>) : <p className="text-[11px] text-soft">{emptyText}</p>}</aside>;
}

function ScoreSelectOptions() {
  return <><option value="1">{tx("1 · 很小")}</option><option value="2">{tx("2 · 偏小")}</option><option value="3">{tx("3 · 中等")}</option><option value="4">{tx("4 · 重要")}</option><option value="5">{tx("5 · 很关键")}</option></>;
}
