import { type FormEvent, useRef, useState } from "react";
import type { Request } from "../../app/api";
import { tx } from "../../app/i18n";
import { Button } from "../../shared/ui";
import { type LibraryItem, statuses, typeLabels } from "./item";

export function LibraryItemEditor({ item: initialItem, request, businessToday, onSaved, onCancel, onError }: {
  item: LibraryItem; request: Request; businessToday: string; onSaved: () => Promise<void>; onCancel: () => void; onError: (message: string, title?: string) => void;
}) {
  // Keep this intentional edit snapshot stable during background refetches.
  const [item] = useState(initialItem);
  const [finishedOn, setFinishedOn] = useState(item.finishedOn ?? "");
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    const data = new FormData(event.currentTarget);
    busy.current = true; setPending(true);
    try {
      await request(`/api/library/items/${item.id}`, {
        method: "PUT",
        body: JSON.stringify({
          expectedVersion: item.version,
          type: data.get("type"),
          title: data.get("title"),
          originalTitle: String(data.get("originalTitle") || "").trim() || null,
          creator: String(data.get("creator") || "").trim() || null,
          status: data.get("status"),
          rating: data.get("rating") ? Number(data.get("rating")) : null,
          startedOn: data.get("startedOn") || null,
          finishedOn: data.get("finishedOn") || (data.get("status") === "FINISHED" ? businessToday : null),
          coverRef: String(data.get("coverRef") || "").trim() || null,
          externalRef: String(data.get("externalRef") || "").trim() || null,
          shortNote: String(data.get("shortNote") || "").trim() || null,
          releaseYear:data.get("releaseYear") ? Number(data.get("releaseYear")) : null,
          description:String(data.get("description") || "").trim() || null,
        }),
      });
      await onSaved();
    } catch (error) {
      onError(error instanceof Error ? error.message : tx("操作失败"), tx("作品没有保存"));
    } finally { busy.current = false; setPending(false); }
  }
  return (
        <form className="library-editor" onSubmit={save} aria-label={tx("编辑作品")}>
          <fieldset disabled={pending}>
          <h2>{tx("编辑作品")}</h2>
          <label>
            {tx("标题")}
            <input
              className="field"
              aria-label={tx("作品名称")} name="title"
              defaultValue={item.title}
              required
              maxLength={200}
            />
          </label>
          <label>
            {tx("原名")}
            <input
              className="field"
              aria-label={tx("原名（可选）")} name="originalTitle"
              maxLength={200}
              defaultValue={item.originalTitle ?? ""}
            />
          </label>
          <div className="library-form-row">
            <label>
              {tx("类型")}
              <select className="field" aria-label={tx("作品类型")} name="type" defaultValue={item.type}>
                {Object.entries(typeLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {tx(label)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {tx("状态")}
              <select
                className="field"
                aria-label={tx("作品状态")} name="status"
                defaultValue={item.status}
                onChange={event => { if (event.target.value === "FINISHED" && !finishedOn) setFinishedOn(businessToday); }}
              >
                {statuses.slice(1).map((entry) => (
                  <option key={entry.key} value={entry.key}>
                    {tx(entry.label)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            {tx("创作者")}
            <input
              className="field"
              aria-label={tx("作者、导演或工作室")} name="creator"
              maxLength={160}
              defaultValue={item.creator ?? ""}
            />
          </label>
          <label>{tx("发行年份")}<input className="field" name="releaseYear" type="number" min={1} max={9999} defaultValue={item.releaseYear ?? ""}/></label>
          <label>{tx("作品简介")}
            <textarea key={`description:${item.version}`} className="field" name="description" rows={7} maxLength={10000} defaultValue={item.description ?? ""}/>
          </label>
          <label>
            {tx("评分")}
            <select
              className="field"
              name="rating"
              defaultValue={item.rating ?? ""}
            >
              <option value="">{tx("未评分")}</option>
              {[1, 2, 3, 4, 5].map((value) => (
                <option key={value} value={value}>
                  {value} / 5
                </option>
              ))}
            </select>
          </label>
          <div className="library-form-row">
            <label>
              {tx("开始日期")}
              <input
                className="field"
                type="date"
                name="startedOn"
                defaultValue={item.startedOn ?? ""}
              />
            </label>
            <label>
              {tx("完成日期")}
              <input
                className="field"
                type="date"
                name="finishedOn"
                value={finishedOn}
                onChange={event => setFinishedOn(event.target.value)}
              />
            </label>
          </div>
          <label>
            {tx("封面 URL")}
            <input
              className="field"
              type="url"
              aria-label={tx("封面 URL（可选）")} name="coverRef"
              defaultValue={item.coverRef ?? ""}
            />
          </label>
          <label>
            {tx("外部链接")}
            <input
              className="field"
              type="url"
              aria-label={tx("外部链接（可选）")} name="externalRef"
              defaultValue={item.externalRef ?? ""}
            />
          </label>
          <label>
            {tx("简短备注")}
            <textarea
              className="field"
              aria-label={tx("简短备注（长笔记请写入 Notebook）")} name="shortNote"
              maxLength={1000}
              defaultValue={item.shortNote ?? ""}
            />
          </label>
          <footer className="library-actions"><Button type="button" onClick={onCancel}>{tx("取消")}</Button><Button variant="primary" type="submit">
            {tx("保存更改")}
          </Button></footer>
          </fieldset>
        </form>
  );
}
