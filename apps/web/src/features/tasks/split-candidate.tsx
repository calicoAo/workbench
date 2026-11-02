import { Link } from "react-router";
import { tx } from "../../app/i18n";
import { Button } from "../../shared/ui";
import type { SplitCandidate } from "./split-draft";
export function SplitCandidateEditor({ candidate: c, index, categories, projects, duplicate, pending, onChange, onRemove, onManage }: {
    candidate: SplitCandidate;
    index: number;
    categories: Array<{
        id: number;
        name: string;
    }>;
    projects: Array<{
        id: number;
        name: string;
    }>;
    duplicate: boolean;
    pending: boolean;
    onChange: (patch: Partial<SplitCandidate>) => void;
    onRemove: () => void;
    onManage: (kind: "category" | "project", name: string) => void;
}) {
    return <article className="split-candidate">
    <label><input type="checkbox" checked={c.selected} disabled={pending || Boolean(c.publishedId)} onChange={e => onChange({ selected: e.target.checked })}/>{tx("任务 {value0}", { value0: index + 1 })}</label>
    {c.publishedId ? <p><Link to={`/tasks/${c.publishedId}`}>{tx("已发布，查看任务")}</Link></p> : null}
    {duplicate ? <p className="text-soft">{tx("存在同名未完成任务，请核对是否重复。")}</p> : null}
    {c.publishError ? <p role="alert">{c.publishError}</p> : null}
    <fieldset disabled={pending || Boolean(c.frozen) || Boolean(c.publishedId)}>
      <label>{tx("标题")}<input className="field" maxLength={200} value={c.title} onChange={e => onChange({ title: e.target.value })}/></label>
      <label>{tx("详情")}<textarea className="field" rows={2} maxLength={2000} value={c.description} onChange={e => onChange({ description: e.target.value })}/></label>
      <div className="split-grid"><label>{tx("优先级")}<select className="field" value={c.priority} onChange={e => onChange({ priority: Number(e.target.value) })}>{[tx("低"), tx("中"), tx("高")].map((v, i) => <option key={v} value={i + 1}>{tx(v)}</option>)}</select></label><label>{tx("难度")}<select className="field" value={c.difficulty} onChange={e => onChange({ difficulty: Number(e.target.value) })}>{[tx("轻松"), tx("普通"), tx("困难"), tx("硬仗")].map((v, i) => <option key={v} value={i + 1}>{tx(v)}</option>)}</select></label></div>
      <div className="split-grid">{(["category", "project"] as const).map(kind => { const id = kind === "category" ? c.categoryId : c.projectId, options = kind === "category" ? categories : projects, suggestion = kind === "category" ? c.categorySuggestion : c.projectSuggestion; return <label key={kind}>{(kind === "category" ? tx("分类") : tx("项目"))}<select className="field" value={id ?? ""} onChange={e => onChange(kind === "category" ? { categoryId: e.target.value ? Number(e.target.value) : null } : { projectId: e.target.value ? Number(e.target.value) : null })}><option value="">{tx("暂不分配")}</option>{id && !options.some(v => v.id === id) ? <option value={id} disabled>{tx("所选项已不可用")}</option> : null}{options.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select>{suggestion ? <small>{tx("推荐新建：")}{suggestion}</small> : null}<Button type="button" size="sm" onClick={() => onManage(kind, suggestion ?? "")}>{tx("核对已有 / 新建")}</Button></label>; })}</div>
      <label>{tx("截止日期与时间（需要核对原文）")}<input className="field" type="datetime-local" value={c.dueAtLocal?.includes("T") ? c.dueAtLocal : ""} onChange={e => onChange({ dueAtLocal: e.target.value || null })}/>{c.dueAtLocal && !c.dueAtLocal.includes("T") ? <small>{tx("原文仅给出日期：")}{c.dueAtLocal}{tx("；请选择时间，或清空后发布。")}</small> : null}<small>{tx("日期证据：")}{c.dueEvidence || tx("无；手动填写将视为你的选择")}</small>{c.dueAtLocal ? <Button type="button" size="sm" onClick={() => onChange({ dueAtLocal: null })}>{tx("清空日期")}</Button> : null}</label>
      <label>{tx("预计分钟")}<input className="field" type="number" min={1} max={10080} value={c.estimatedMinutes ?? ""} onChange={e => onChange({ estimatedMinutes: e.target.value ? Number(e.target.value) : null })}/><small>{tx("用时证据：")}{c.durationEvidence || tx("无")}</small>{c.suggestedMinutes ? <small>{tx("模型建议（尚未采纳）：")}{c.suggestedMinutes}<Button type="button" size="sm" onClick={() => onChange({ estimatedMinutes: c.suggestedMinutes })}>{tx("采纳建议时长")}</Button></small> : null}</label>
      {c.warnings?.length ? <p>{tx("部分日期或用时未通过证据校验，已清空，请人工核对。")}</p> : null}
      <Button type="button" variant="ghost" onClick={onRemove}>{tx("移除此草稿")}</Button>
    </fieldset>
    {c.frozen && !c.publishedId ? <p>{tx("发布结果待确认；重试会查询回执并使用原操作 ID。")}</p> : null}
  </article>;
}
