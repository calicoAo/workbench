import { useState, type TextareaHTMLAttributes } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { tx } from "../../app/i18n";
import { Button } from "../ui";

/** Presentation only: callers retain the original Markdown and own all writes. */
export function MarkdownContent({ content }: { content: string }) {
  return <div className="markdown-content"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{
    table: ({ children }) => <div className="markdown-table-scroll"><table>{children}</table></div>
  }}>{content}</ReactMarkdown></div>;
}

export function MarkdownInput(props: TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string }) {
  const [preview, setPreview] = useState(false);
  return <div className="markdown-input">
    <div className="markdown-input-toolbar"><span>{tx("支持 Markdown")}</span><Button type="button" aria-pressed={preview} onClick={() => setPreview(!preview)}>{preview ? tx("继续编辑") : tx("预览")}</Button></div>
    <textarea {...props} hidden={preview} onInvalid={(event) => {
      props.onInvalid?.(event);
      if (preview) { event.preventDefault(); const field = event.currentTarget; setPreview(false); requestAnimationFrame(() => field.focus()); }
    }} />
    {preview ? <div className="markdown-input-preview" aria-label={tx("Markdown 预览")}>{props.value.trim() ? <MarkdownContent content={props.value} /> : <p>{tx("暂无内容")}</p>}</div> : null}
  </div>;
}
