import { useState } from "react";
import type { Request } from "../../app/api";
import { tx } from "../../app/i18n";
import { Button } from "../../shared/ui";
import { MediaImportWorkflow, type LibrarySource } from "./import-workflow";
export function LibrarySourcePanel({ request, userId, item, source, onSaved }: {
    request: Request;
    userId: number;
    item: {
        id: number;
        version: number;
        type: string;
    };
    source?: LibrarySource;
    onSaved: () => Promise<void>;
}) {
    const [open, setOpen] = useState(false), [pending, setPending] = useState(false), [error, setError] = useState("");
    const [operationId] = useState(() => crypto.randomUUID());
    async function unlink() { if (pending || !source || !window.confirm(tx("解除来源关联并保留当前作品信息？")))
        return; setPending(true); try {
        await request(`/api/library/items/${item.id}/sources/${source.id}`, { method: "DELETE", body: JSON.stringify({ operationId, expectedVersion: item.version }) });
        await onSaved();
    }
    catch (e) {
        setError(e instanceof Error ? e.message : tx("操作失败"));
    }
    finally {
        setPending(false);
    } }
    return <section className="media-source glass-panel">{source ? <><a href={source.canonicalUrl} target="_blank" rel="noopener noreferrer">{source.provider} · {source.stableSourceId}</a><small>{source.attribution} · {source.language || tx("语言未标注")}</small><Button disabled={pending} onClick={() => void unlink()}>{tx("解除来源关联")}</Button></> : null}{item.type !== "GAME" ? <Button onClick={() => setOpen(!open)}>{(source ? tx("预览来源更新") : tx("关联来源资料"))}</Button> : null}{error ? <p role="alert">{error}</p> : null}{open ? <MediaImportWorkflow key={`${userId}:${item.id}`} request={request} userId={userId} target={{ id: item.id, version: item.version, type: item.type, source }} onSaved={onSaved}/> : null}</section>;
}
