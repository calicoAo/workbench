import { Check, Plus } from "lucide-react";
import { useId } from "react";
import { tx } from "../../app/i18n";

export const CATEGORY_PALETTE = ["#3B82F6", "#8B5CF6", "#EC4899", "#10B981", "#EF4444", "#F59E0B", "#64748B"];
export const validCategoryColor = (value: string) => /^#[0-9a-fA-F]{6}$/.test(value);

/** The visible HEX draft is also the save value; invalid text cannot save an old color. */
export function CategoryColorControl({ color, onChange }: { color: string; onChange: (value: string) => void }) {
  const errorId = useId();
  const valid = validCategoryColor(color);
  return <fieldset className="category-color-control"><legend>{tx("颜色")}</legend>
    <div className="category-current-color"><i style={{ background: valid ? color : "transparent" }} /><strong>{color.toUpperCase()}</strong></div>
    <div className="color-presets">{CATEGORY_PALETTE.map((value) => <button aria-label={tx("使用颜色 {value0}", { value0: value })} aria-pressed={value === color.toUpperCase()} className={value === color.toUpperCase() ? "is-active" : ""} key={value} style={{ background: value }} type="button" onClick={() => onChange(value)}>{value === color.toUpperCase() ? <Check size={16} aria-hidden="true" /> : null}</button>)}
      <label className="color-custom-trigger" title={tx("自定义颜色")}><Plus size={14} /><input aria-label={tx("自定义分类颜色")} type="color" value={valid ? color : CATEGORY_PALETTE[0]} onChange={(event) => onChange(event.target.value.toUpperCase())} /></label>
    </div>
    <label>{tx("HEX")}<input aria-label={tx("分类 Hex 颜色")} className="field" value={color} aria-invalid={!valid} aria-describedby={!valid ? errorId : undefined} onChange={(event) => onChange(event.target.value)} /></label>
    {!valid ? <p id={errorId} className="notes-error" role="alert">{tx("请输入有效的 #RRGGBB 颜色")}</p> : null}
  </fieldset>;
}
