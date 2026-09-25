import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Heart, Lightbulb, Pin, Plus, Search, Tag, X } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link } from "react-router";
import type { Request } from "../../app/api";
import { queryKeys } from "../../app/query";
import { Button } from "../../shared/ui";

export type InspirationTag = { id: number; name: string; normalizedName: string; usageCount?: number };
export type Inspiration = { id: number; quickNoteId: number; favorite: number; pinned: number; archivedAt: string | null; version: number; createdAt: string; updatedAt: string; note: { id: number; title: string | null; content: string; noteDate: string; projectId: number | null; version: number }; tags: InspirationTag[] };

type InspirationList = { items: Inspiration[] };
type TagList = { items: InspirationTag[] };

function operationId() { return crypto.randomUUID(); }
function apiError(error: unknown) { return error instanceof Error ? error.message : "操作没有成功"; }
function titleOf(item: Inspiration) { return item.note.title?.trim() || item.note.content.trim().split(/\r?\n/, 1)[0].slice(0, 80) || "未命名灵感"; }
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
  return <div className="inspiration-tag-picker"><div className="inspiration-tag-chips">{selected.map((tag) => <span className="inspiration-tag-chip" key={tag.id}>#{tag.name}<button type="button" aria-label={`移除标签${tag.name}`} onClick={() => onChange(selected.filter((item) => item.id !== tag.id))}><X size={12} /></button></span>)}</div><input data-guide-anchor="inspiration.tag-input" className="inspiration-tag-input" aria-label="灵感标签" value={value} placeholder="# 添加标签" onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void commitInput(); } }} />{value.trim() ? <div className="inspiration-tag-suggestions">{suggestions.map((tag) => <button type="button" key={tag.id} onClick={() => void choose(tag)}>#{tag.name}</button>)}{allowCreate ? <button type="button" onClick={() => void commitInput()}><Plus size={13} />创建 #{value.replace(/^#+/u, "").trim()}</button> : null}</div> : null}</div>;
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
  async function mutate(item: Inspiration, body: Record<string, unknown>, path = `/api/writing/inspirations/${item.id}`) { try { const method = /\/(?:un)?archive$/.test(path) ? "POST" : "PUT"; await request(path, { method, body: JSON.stringify({ operationId: operationId(), expectedVersion: item.version, ...body }) }); await refresh(); } catch (error) { onError(apiError(error), "灵感没有更新"); } }
  return <section className="inspiration-route"><header className="inspiration-head"><div><p className="route-eyebrow">Writing</p><h1>灵感库</h1><p>收藏、整理和重新使用值得保留的想法。</p></div><Button variant="primary" onClick={() => setCreateOpen((open) => !open)}><Plus size={15} />新建灵感</Button></header><div className="inspiration-toolbar"><label className="inspiration-search"><Search size={16} /><input aria-label="搜索灵感" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索标题、正文或标签" /></label><div className="inspiration-states" aria-label="灵感状态">{[["active", "全部"], ["favorite", "收藏"], ["pinned", "置顶"], ["untagged", "未打标签"], ["archived", "归档"]].map(([key, label]) => <button type="button" className={state === key ? "is-active" : ""} key={key} onClick={() => setState(key as typeof state)}>{label}</button>)}</div><button type="button" className="inspiration-tag-manage-toggle" onClick={() => setTagManageOpen((open) => !open)}><Tag size={15} />标签管理</button></div><div className="inspiration-filter-row"><TagPicker request={request} userId={userId} selected={selectedTags} onChange={setSelectedTags} allowCreate={false} />{selectedTags.length ? <button type="button" onClick={() => setSelectedTags([])}>清除标签</button> : null}</div>{tagManageOpen ? <TagManager request={request} userId={userId} tags={tags.data?.items ?? []} onError={onError} onChanged={refresh} /> : null}{createOpen ? <CreateInspirationForm request={request} userId={userId} selectedDate={selectedDate} projects={projects} onError={onError} onCreated={async () => { setCreateOpen(false); await refresh(); }} /> : null}<div className="inspiration-list">{list.isPending ? <p className="route-state">正在整理灵感...</p> : list.data?.items.length ? list.data.items.map((item) => <InspirationCard key={item.id} item={item} onMutate={mutate} />) : <section className="inspiration-empty"><Lightbulb size={24} /><h2>还没有符合条件的灵感</h2><p>从随手记加入，或直接新建一条灵感。</p></section>}</div></section>;
}

function InspirationCard({ item, onMutate }: { item: Inspiration; onMutate: (item: Inspiration, body: Record<string, unknown>, path?: string) => Promise<void> }) {
  return <article className={`inspiration-card ${item.pinned ? "is-pinned" : ""}`}><div className="inspiration-card-main"><div className="inspiration-card-title"><h2>{titleOf(item)}</h2>{item.pinned ? <Pin size={14} /> : null}</div><p>{excerptOf(item)}</p><div className="inspiration-card-meta"><span>{item.note.noteDate}</span>{item.note.projectId ? <span>已关联项目</span> : null}{item.tags.map((tag) => <span className="inspiration-tag-chip is-static" key={tag.id}>#{tag.name}</span>)}</div></div><div className="inspiration-card-actions"><button type="button" aria-label={item.favorite ? "取消收藏" : "收藏"} className={item.favorite ? "is-active" : ""} onClick={() => void onMutate(item, { favorite: !item.favorite })}><Heart fill={item.favorite ? "currentColor" : "none"} size={16} /></button><button type="button" aria-label={item.pinned ? "取消置顶" : "置顶"} className={item.pinned ? "is-active" : ""} onClick={() => void onMutate(item, { pinned: !item.pinned })}><Pin size={16} /></button><Link to={`/notes/${item.quickNoteId}?date=${item.note.noteDate}`}>查看原文</Link>{item.archivedAt ? <button type="button" onClick={() => void onMutate(item, {}, `/api/writing/inspirations/${item.id}/unarchive`)}>取消归档</button> : <button type="button" onClick={() => void onMutate(item, {}, `/api/writing/inspirations/${item.id}/archive`)}>归档</button>}</div></article>;
}

function CreateInspirationForm({ request, userId, selectedDate, projects, onError, onCreated }: { request: Request; userId: number; selectedDate: string; projects: InspirationProject[]; onError: (message: string) => void; onCreated: () => Promise<void> }) {
  const [title, setTitle] = useState(""); const [content, setContent] = useState(""); const [projectId, setProjectId] = useState(""); const [tags, setTags] = useState<InspirationTag[]>([]); const [pending, setPending] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); if (!content.trim() || pending) return; setPending(true); try { await request("/api/writing/inspirations", { method: "POST", body: JSON.stringify({ operationId: operationId(), noteDate: selectedDate, title, content, projectId: projectId ? Number(projectId) : null, tagNames: tags.map((tag) => tag.name) }) }); await onCreated(); } catch (error) { onError(apiError(error)); } finally { setPending(false); } }
  return <form className="inspiration-create" onSubmit={submit}><div className="inspiration-create-head"><h2>新建灵感</h2><span>正文仍由随手记保存</span></div><input aria-label="灵感标题" className="field" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="标题（可选）" /><textarea aria-label="灵感正文" className="field inspiration-create-body" required value={content} onChange={(event) => setContent(event.target.value)} placeholder="写下值得长期保留的想法..." /><label>关联项目<select aria-label="灵感关联项目" className="field" value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">无项目</option>{projects.filter((project) => !project.archivedAt).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><TagPicker request={request} userId={userId} selected={tags} onChange={setTags} /><Button type="submit" variant="primary" loading={pending}>保存灵感</Button></form>;
}

function TagManager({ request, userId, tags, onError, onChanged }: { request: Request; userId: number; tags: InspirationTag[]; onError: (message: string) => void; onChanged: () => Promise<void> }) {
  const [editing, setEditing] = useState<number | null>(null); const [name, setName] = useState(""); const [mergeTarget, setMergeTarget] = useState<Record<number, string>>({});
  async function rename(tag: InspirationTag) { if (!name.trim()) return; try { await request(`/api/writing/inspiration-tags/${tag.id}`, { method: "PUT", body: JSON.stringify({ operationId: operationId(), name }) }); setEditing(null); await onChanged(); } catch (error) { onError(apiError(error)); } }
  async function merge(tag: InspirationTag) { const target = Number(mergeTarget[tag.id]); if (!target) return; try { await request(`/api/writing/inspiration-tags/${tag.id}/merge`, { method: "POST", body: JSON.stringify({ operationId: operationId(), targetTagId: target }) }); await onChanged(); } catch (error) { onError(apiError(error)); } }
  async function remove(tag: InspirationTag) { if (!window.confirm(`删除 #${tag.name} 的关系？`)) return; try { await request(`/api/writing/inspiration-tags/${tag.id}`, { method: "DELETE", body: JSON.stringify({ operationId: operationId() }) }); await onChanged(); } catch (error) { onError(apiError(error)); } }
  return <section className="inspiration-tag-manager"><header><h2>标签管理</h2><small>删除标签不会删除灵感或原文。</small></header>{tags.length ? tags.map((tag) => <div className="inspiration-tag-row" key={tag.id}><strong>#{tag.name}</strong><small>{tag.usageCount ?? 0} 条灵感</small>{editing === tag.id ? <><input aria-label={`重命名${tag.name}`} value={name} onChange={(event) => setName(event.target.value)} /><button type="button" onClick={() => void rename(tag)}><Check size={14} /></button></> : <button type="button" onClick={() => { setEditing(tag.id); setName(tag.name); }}>重命名</button>}<select aria-label={`合并${tag.name}`} value={mergeTarget[tag.id] ?? ""} onChange={(event) => setMergeTarget({ ...mergeTarget, [tag.id]: event.target.value })}><option value="">合并到...</option>{tags.filter((other) => other.id !== tag.id).map((other) => <option key={other.id} value={other.id}>#{other.name}</option>)}</select><button type="button" disabled={!mergeTarget[tag.id]} onClick={() => void merge(tag)}>合并</button><button type="button" onClick={() => void remove(tag)}>删除</button></div>) : <p>还没有标签。</p>}</section>;
}

export function QuickNoteInspirationDialog({ request, userId, noteId, onClose, onDone }: { request: Request; userId: number; noteId: number; onClose: () => void; onDone: (id: number) => void }) {
  const [tags, setTags] = useState<InspirationTag[]>([]); const [pending, setPending] = useState(false); const [error, setError] = useState<string | null>(null);
  async function submit() { setPending(true); setError(null); try { const result = await request<Inspiration>(`/api/quick-notes/${noteId}/inspiration`, { method: "POST", body: JSON.stringify({ operationId: operationId(), tagNames: tags.map((tag) => tag.name) }) }); onDone(result.id); } catch (caught) { setError(apiError(caught)); } finally { setPending(false); } }
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><div className="modal-shell" onMouseDown={(event) => event.stopPropagation()}><section className="inspiration-dialog" role="dialog" aria-modal="true" aria-labelledby="inspiration-dialog-title"><header><div><p className="route-eyebrow">Writing</p><h2 id="inspiration-dialog-title">加入灵感库</h2></div><Button iconOnly aria-label="关闭" onClick={onClose}><X size={16} /></Button></header><p>正文继续由随手记保存；这里仅增加收藏和标签。</p><TagPicker request={request} userId={userId} selected={tags} onChange={setTags} />{error ? <p className="notes-error" role="alert">{error}</p> : null}<footer><Button onClick={onClose}>取消</Button><Button variant="primary" loading={pending} onClick={() => void submit()}><Lightbulb size={15} />确认加入</Button></footer></section></div></div>;
}

export function InspirationWritingPanel({ request, userId, onInsert }: { request: Request; userId: number; onInsert: (content: string) => void }) {
  const [open, setOpen] = useState(false); const [keyword, setKeyword] = useState("");
  const query = useQuery({ queryKey: queryKeys.inspirations(userId, "active", keyword, ""), enabled: open, queryFn: () => request<InspirationList>(`/api/writing/inspirations?state=active&keyword=${encodeURIComponent(keyword)}`) });
  if (!open) return <button type="button" className="writing-inspiration-launch" onClick={() => setOpen(true)}><Lightbulb size={15} />灵感库</button>;
  return <aside className="writing-inspiration-panel" aria-label="灵感库面板"><header><strong>灵感库</strong><button type="button" aria-label="关闭灵感库" onClick={() => setOpen(false)}><X size={15} /></button></header><input aria-label="搜索灵感面板" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索灵感" />{(query.data?.items ?? []).slice(0, 8).map((item) => <article key={item.id}><div><strong>{titleOf(item)}</strong><small>{item.tags.map((tag) => `#${tag.name}`).join(" ") || "未打标签"}</small></div><div><button type="button" onClick={() => onInsert(item.note.content)}>插入正文</button><Link to={`/notes/${item.quickNoteId}`}>查看原灵感</Link></div></article>)}{query.data?.items.length === 0 ? <p>还没有可用灵感。</p> : null}</aside>;
}
