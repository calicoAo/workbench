import { useState } from "react";
import type { Request } from "../../app/api";
import { tx } from "../../app/i18n";
import { Button } from "../../shared/ui";
import { MediaImportWorkflow, type LibrarySource } from "./import-workflow";
export function LibrarySourcePanel({ request, userId, item, source, onSaved, onConfirm, onError }: {
    request: Request;
    userId: number;
    item: {
        id: number;
        version: number;
        type: string;
    };
    source?: LibrarySource;
    onSaved: () => Promise<void>;
    onConfirm: (title: string, message: string, onConfirm: () => void | Promise<void>, confirmText?: string) => void;
    onError: (message: string, title?: string) => void;
}) {
    const [open, setOpen] = useState(false), [pending, setPending] = useState(false);
    const [operationId] = useState(() => crypto.randomUUID());
    async function unlink() { if (pending || !source) return;
        setPending(true); try {
        await request(`/api/library/items/${item.id}/sources/${source.id}`, { method: "DELETE", body: JSON.stringify({ operationId, expectedVersion: item.version }) });
        await onSaved();
    }
    catch (e) {
        onError(e instanceof Error ? e.message : tx("操作失败"), tx("来源关联没有解除"));
    }
    finally {
        setPending(false);
    } }
    return <section className="media-source glass-panel">{source ? <><div className="library-source-copy"><a href={source.canonicalUrl} target="_blank" rel="noopener noreferrer">{source.provider === "WEB_SEARCH" ? tx("AI 网页搜索") : source.provider}</a><small>{source.attribution} · {source.language || tx("语言未标注")}</small>{source.references?.map(reference => <a key={reference.url} href={reference.url} target="_blank" rel="noopener noreferrer">{reference.title}</a>)}</div><div className="library-source-actions"><Button disabled={pending} onClick={() => onConfirm(tx("解除来源关联"), tx("解除来源关联并保留当前作品信息？"), unlink, tx("解除关联"))}>{tx("解除来源关联")}</Button><Button disabled={pending} onClick={() => setOpen(!open)}>{tx("预览来源更新")}</Button></div></> : <Button onClick={() => setOpen(!open)}>{tx("关联来源资料")}</Button>}{open ? <MediaImportWorkflow key={`${userId}:${item.id}`} request={request} userId={userId} target={{ id: item.id, version: item.version, type: item.type, source }} onConfirm={onConfirm} onSaved={async () => { await onSaved(); setOpen(false); }}/> : null}</section>;
}
