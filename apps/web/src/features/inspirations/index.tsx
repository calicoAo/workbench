import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Heart, Lightbulb, Pin, Plus, Search, Tag, X } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link } from "react-router";
import type { Request } from "../../app/api";
import { queryKeys } from "../../app/query";
import { Button } from "../../shared/ui";
import { tx } from "../../app/i18n";

export type InspirationTag = { id: number; name: string; normalizedName: string; usageCount?: number };
export type Inspiration = { id: number; quickNoteId: number; favorite: number; pinned: number; archivedAt: string | null; version: number; createdAt: string; updatedAt: string; note: { id: number; title: string | null; content: string; noteDate: string; projectId: number | null; version: number }; tags: InspirationTag[] };

type InspirationList = { items: Inspiration[] };
type TagList = { items: InspirationTag[] };

function operationId() { return crypto.randomUUID(); }
function apiError(error: unknown) { return error instanceof Error ? error.message : tx("操作没有成功"); }
function titleOf(item: Inspiration) { return item.note.title?.trim() || item.note.content.trim().split(/\r?\n/, 1)[0].slice(0, 80) || tx("未命名灵感"); }
function excerptOf(item: Inspiration) { return item.note.content.replace(/\s+/g, " ").trim().slice(0, 180); }
function tagInputNames(value: string) { return value.trim().split(/\s+(?=#)/u).map((item) => item.replace(/^#+/u, "").trim()).filter(Boolean); }

export function TagPicker({ request, userId, selected, onChange, allowCreate = true }: { request: Request; userId: number; selected: InspirationTag[]; onChange: (tags: InspirationTag[]) => void; allowCreate?: boolean }) {
  const query = useQuery({ queryKey: queryKeys.inspirationTags(userId), queryFn: () => request<TagList>("/api/writing/inspiration-tags") });
  const [value, setValue] = useState("");
  const normalized = value.replace(/^#/, "").trim().toLocaleLowerCase();
  const suggestions = (query.data?.items ?? []).filter((tag) => !selected.some((item) => item.id === tag.id) && (!normalized || tag.name.toLocaleLowerCase().includes(normalized))).slice(0, 8);
  async function choose(tag: InspirationTag) { onChange([...selected, tag]); setValue(""); }
  async function commitInput() {
    const names = tagInputNames(value);
    if (!names.length) return;
    if (!allowCreate && names.length > 1) return;
    const added: InspirationTag[] = [];
    const used = new Set(selected.map((tag) => tag.id));
    for (const name of names) {
      const identity = name.toLocaleLowerCase();
      const existing = (query.data?.items ?? []).find((tag) => tag.name.toLocaleLowerCase() === identity && !used.has(tag.id));
      if (existing) { used.add(existing.id); added.push(existing); continue; }
      if (!allowCreate) continue;
      const created = await request<InspirationTag>("/api/writing/inspiration-tags", { method: "POST", body: JSON.stringify({ operationId: operationId(), name }) });
      if (!used.has(created.id)) { used.add(created.id); added.push(created); }
    }
    if (added.length) onChange([...selected, ...added]);
    setValue("");
  }
  return <div className="inspiration-tag-picker"><div className="inspiration-tag-chips">{selected.map((tag) => <span className="inspiration-tag-chip" key={tag.id}>#{tag.name}<button type="button" aria-label={tx("移除标签{value0}", { value0: tag.name })} onClick={() => onChange(selected.filter((item) => item.id !== tag.id))}><X size={12} /></button></span>)}</div><input data-guide-anchor="inspiration.tag-input" className="inspiration-tag-input" aria-label={tx("灵感标签")} value={value} placeholder={tx("# 添加标签")} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void commitInput(); } }} />{value.trim() ? <div className="inspiration-tag-suggestions">{suggestions.map((tag) => <button type="button" key={tag.id} onClick={() => void choose(tag)}>#{tag.name}</button>)}{allowCreate ? <button type="button" onClick={() => void commitInput()}><Plus size={13} />{tx("创建 #")}{value.replace(/^#+/u, "").trim()}</button> : null}</div> : null}</div>;
}

type InspirationProject = { id: number; name: string; archivedAt: string | null };

export function InspirationLibraryPage({ request, userId, selectedDate, projects = [], onError }: { request: Request; userId: number; selectedDate: string; projects?: InspirationProject[]; onError: (message: string, title?: string) => void }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<"active" | "favorite" | "pinned" | "untagged" | "archived">("active");
  const [keyword, setKeyword] = useState("");
  const [selectedTags, setSelectedTags] = useState<InspirationTag[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [tagManageOpen, setTagManageOpen] = useState(false);
  const list = useQuery({ queryKey: queryKeys.inspirations(userId, state, keyword, selectedTags.map((tag) => tag.normalizedName).join(",")), queryFn: () => request<InspirationList>(`/api/writing/inspirations?state=${state}&keyword=${encodeURIComponent(keyword)}&tags=${encodeURIComponent(selectedTags.map((tag) => tag.name).join(","))}`) });
  const tags = useQuery({ queryKey: queryKeys.inspirationTags(userId), queryFn: () => request<TagList>("/api/writing/inspiration-tags") });
  async function refresh() { await Promise.all([queryClient.invalidateQueries({ queryKey: ["inspirations", userId] }), queryClient.invalidateQueries({ queryKey: queryKeys.inspirationTags(userId) })]); }
  async function mutate(item: Inspiration, body: Record<string, unknown>, path = `/api/writing/inspirations/${item.id}`) { try { const method = /\/(?:un)?archive$/.test(path) ? "POST" : "PUT"; await request(path, { method, body: JSON.stringify({ operationId: operationId(), expectedVersion: item.version, ...body }) }); await refresh(); } catch (error) { onError(apiError(error), tx("灵感没有更新")); } }
  return <section className="inspiration-route"><header className="inspiration-head"><div><p className="route-eyebrow">Writing</p><h1>{tx("灵感库")}</h1><p>{tx("收藏、整理和重新使用值得保留的想法。")}</p></div><Button variant="primary" onClick={() => setCreateOpen((open) => !open)}><Plus size={15} />{tx("新建灵感")}</Button></header><div className="inspiration-toolbar"><label className="inspiration-search"><Search size={16} /><input aria-label={tx("搜索灵感")} value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder={tx("搜索标题、正文或标签")} /></label><div className="inspiration-states" aria-label={tx("灵感状态")}>{[["active", tx("全部")], ["favorite", tx("收藏")], ["pinned", tx("置顶")], ["untagged", tx("未打标签")], ["archived", tx("归档")]].map(([key, label]) => <button type="button" className={state === key ? "is-active" : ""} key={key} onClick={() => setState(key as typeof state)}>{tx(label)}</button>)}</div><button type="button" className="inspiration-tag-manage-toggle" onClick={() => setTagManageOpen((open) => !open)}><Tag size={15} />{tx("标签管理")}</button></div><div className="inspiration-filter-row"><TagPicker request={request} userId={userId} selected={selectedTags} onChange={setSelectedTags} allowCreate={false} />{selectedTags.length ? <button type="button" onClick={() => setSelectedTags([])}>{tx("清除标签")}</button> : null}</div>{tagManageOpen ? <TagManager request={request} userId={userId} tags={tags.data?.items ?? []} onError={onError} onChanged={refresh} /> : null}{createOpen ? <CreateInspirationForm request={request} userId={userId} selectedDate={selectedDate} projects={projects} onError={onError} onCreated={async () => { setCreateOpen(false); await refresh(); }} /> : null}<div className="inspiration-list">{list.isPending ? <p className="route-state">{tx("正在整理灵感...")}</p> : list.data?.items.length ? list.data.items.map((item) => <InspirationCard key={item.id} item={item} onMutate={mutate} />) : <section className="inspiration-empty"><Lightbulb size={24} /><h2>{tx("还没有符合条件的灵感")}</h2><p>{tx("从随手记加入，或直接新建一条灵感。")}</p></section>}</div></section>;
}

function InspirationCard({ item, onMutate }: { item: Inspiration; onMutate: (item: Inspiration, body: Record<string, unknown>, path?: string) => Promise<void> }) {
  return <article className={`inspiration-card ${item.pinned ? "is-pinned" : ""}`}><div className="inspiration-card-main"><div className="inspiration-card-title"><h2>{titleOf(item)}</h2>{item.pinned ? <Pin size={14} /> : null}</div><p>{excerptOf(item)}</p><div className="inspiration-card-meta"><span>{item.note.noteDate}</span>{item.note.projectId ? <span>{tx("已关联项目")}</span> : null}{item.tags.map((tag) => <span className="inspiration-tag-chip is-static" key={tag.id}>#{tag.name}</span>)}</div></div><div className="inspiration-card-actions"><button type="button" aria-label={item.favorite ? tx("取消收藏") : tx("收藏")} className={item.favorite ? "is-active" : ""} onClick={() => void onMutate(item, { favorite: !item.favorite })}><Heart fill={item.favorite ? "currentColor" : "none"} size={16} /></button><button type="button" aria-label={item.pinned ? tx("取消置顶") : tx("置顶")} className={item.pinned ? "is-active" : ""} onClick={() => void onMutate(item, { pinned: !item.pinned })}><Pin size={16} /></button><Link to={`/notes/${item.quickNoteId}?date=${item.note.noteDate}`}>{tx("查看原文")}</Link>{item.archivedAt ? <button type="button" onClick={() => void onMutate(item, {}, `/api/writing/inspirations/${item.id}/unarchive`)}>{tx("取消归档")}</button> : <button type="button" onClick={() => void onMutate(item, {}, `/api/writing/inspirations/${item.id}/archive`)}>{tx("归档")}</button>}</div></article>;
}

function CreateInspirationForm({ request, userId, selectedDate, projects, onError, onCreated }: { request: Request; userId: number; selectedDate: string; projects: InspirationProject[]; onError: (message: string) => void; onCreated: () => Promise<void> }) {
  const [title, setTitle] = useState(""); const [content, setContent] = useState(""); const [projectId, setProjectId] = useState(""); const [tags, setTags] = useState<InspirationTag[]>([]); const [pending, setPending] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); if (!content.trim() || pending) return; setPending(true); try { await request("/api/writing/inspirations", { method: "POST", body: JSON.stringify({ operationId: operationId(), noteDate: selectedDate, title, content, projectId: projectId ? Number(projectId) : null, tagNames: tags.map((tag) => tag.name) }) }); await onCreated(); } catch (error) { onError(apiError(error)); } finally { setPending(false); } }
  return <form className="inspiration-create" onSubmit={submit}><div className="inspiration-create-head"><h2>{tx("新建灵感")}</h2><span>{tx("正文仍由随手记保存")}</span></div><input aria-label={tx("灵感标题")} className="field" value={title} onChange={(event) => setTitle(event.target.value)} placeholder={tx("标题（可选）")} /><textarea aria-label={tx("灵感正文")} className="field inspiration-create-body" required value={content} onChange={(event) => setContent(event.target.value)} placeholder={tx("写下值得长期保留的想法...")} /><label>{tx("关联项目")}<select aria-label={tx("灵感关联项目")} className="field" value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">{tx("无项目")}</option>{projects.filter((project) => !project.archivedAt).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><TagPicker request={request} userId={userId} selected={tags} onChange={setTags} /><Button type="submit" variant="primary" loading={pending}>{tx("保存灵感")}</Button></form>;
}

function TagManager({ request, userId, tags, onError, onChanged }: { request: Request; userId: number; tags: InspirationTag[]; onError: (message: string) => void; onChanged: () => Promise<void> }) {
  const [editing, setEditing] = useState<number | null>(null); const [name, setName] = useState(""); const [mergeTarget, setMergeTarget] = useState<Record<number, string>>({});
  async function rename(tag: InspirationTag) { if (!name.trim()) return; try { await request(`/api/writing/inspiration-tags/${tag.id}`, { method: "PUT", body: JSON.stringify({ operationId: operationId(), name }) }); setEditing(null); await onChanged(); } catch (error) { onError(apiError(error)); } }
  async function merge(tag: InspirationTag) { const target = Number(mergeTarget[tag.id]); if (!target) return; try { await request(`/api/writing/inspiration-tags/${tag.id}/merge`, { method: "POST", body: JSON.stringify({ operationId: operationId(), targetTagId: target }) }); await onChanged(); } catch (error) { onError(apiError(error)); } }
  async function remove(tag: InspirationTag) { if (!window.confirm(tx("删除 #{value0} 的关系？", { value0: tag.name }))) return; try { await request(`/api/writing/inspiration-tags/${tag.id}`, { method: "DELETE", body: JSON.stringify({ operationId: operationId() }) }); await onChanged(); } catch (error) { onError(apiError(error)); } }
  return <section className="inspiration-tag-manager"><header><h2>{tx("标签管理")}</h2><small>{tx("删除标签不会删除灵感或原文。")}</small></header>{tags.length ? tags.map((tag) => <div className="inspiration-tag-row" key={tag.id}><strong>#{tag.name}</strong><small>{tag.usageCount ?? 0} {tx("条灵感")}</small>{editing === tag.id ? <><input aria-label={tx("重命名{value0}", { value0: tag.name })} value={name} onChange={(event) => setName(event.target.value)} /><button type="button" onClick={() => void rename(tag)}><Check size={14} /></button></> : <button type="button" onClick={() => { setEditing(tag.id); setName(tag.name); }}>{tx("重命名")}</button>}<select aria-label={tx("合并{value0}", { value0: tag.name })} value={mergeTarget[tag.id] ?? ""} onChange={(event) => setMergeTarget({ ...mergeTarget, [tag.id]: event.target.value })}><option value="">{tx("合并到...")}</option>{tags.filter((other) => other.id !== tag.id).map((other) => <option key={other.id} value={other.id}>#{other.name}</option>)}</select><button type="button" disabled={!mergeTarget[tag.id]} onClick={() => void merge(tag)}>{tx("合并")}</button><button type="button" onClick={() => void remove(tag)}>{tx("删除")}</button></div>) : <p>{tx("还没有标签。")}</p>}</section>;
}

export function QuickNoteInspirationDialog({ request, userId, noteId, onClose, onDone }: { request: Request; userId: number; noteId: number; onClose: () => void; onDone: (id: number) => void }) {
  const [tags, setTags] = useState<InspirationTag[]>([]); const [pending, setPending] = useState(false); const [error, setError] = useState<string | null>(null);
  async function submit() { setPending(true); setError(null); try { const result = await request<Inspiration>(`/api/quick-notes/${noteId}/inspiration`, { method: "POST", body: JSON.stringify({ operationId: operationId(), tagNames: tags.map((tag) => tag.name) }) }); onDone(result.id); } catch (caught) { setError(apiError(caught)); } finally { setPending(false); } }
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><div className="modal-shell" onMouseDown={(event) => event.stopPropagation()}><section className="inspiration-dialog" role="dialog" aria-modal="true" aria-labelledby="inspiration-dialog-title"><header><div><p className="route-eyebrow">Writing</p><h2 id="inspiration-dialog-title">{tx("加入灵感库")}</h2></div><Button iconOnly aria-label={tx("关闭")} onClick={onClose}><X size={16} /></Button></header><p>{tx("正文继续由随手记保存；这里仅增加收藏和标签。")}</p><TagPicker request={request} userId={userId} selected={tags} onChange={setTags} />{error ? <p className="notes-error" role="alert">{error}</p> : null}<footer><Button onClick={onClose}>{tx("取消")}</Button><Button variant="primary" loading={pending} onClick={() => void submit()}><Lightbulb size={15} />{tx("确认加入")}</Button></footer></section></div></div>;
}

export function InspirationWritingPanel({ request, userId, onInsert }: { request: Request; userId: number; onInsert: (content: string) => void }) {
  const [open, setOpen] = useState(false); const [keyword, setKeyword] = useState("");
  const query = useQuery({ queryKey: queryKeys.inspirations(userId, "active", keyword, ""), enabled: open, queryFn: () => request<InspirationList>(`/api/writing/inspirations?state=active&keyword=${encodeURIComponent(keyword)}`) });
  if (!open) return <button type="button" className="writing-inspiration-launch" onClick={() => setOpen(true)}><Lightbulb size={15} />{tx("灵感库")}</button>;
  return <aside className="writing-inspiration-panel" aria-label={tx("灵感库面板")}><header><strong>{tx("灵感库")}</strong><button type="button" aria-label={tx("关闭灵感库")} onClick={() => setOpen(false)}><X size={15} /></button></header><input aria-label={tx("搜索灵感面板")} value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder={tx("搜索灵感")} />{(query.data?.items ?? []).slice(0, 8).map((item) => <article key={item.id}><div><strong>{titleOf(item)}</strong><small>{item.tags.map((tag) => `#${tag.name}`).join(" ") || tx("未打标签")}</small></div><div><button type="button" onClick={() => onInsert(item.note.content)}>{tx("插入正文")}</button><Link to={`/notes/${item.quickNoteId}`}>{tx("查看原灵感")}</Link></div></article>)}{query.data?.items.length === 0 ? <p>{tx("还没有可用灵感。")}</p> : null}</aside>;
}
