import type { ButtonHTMLAttributes, HTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export function buttonClass({ variant = "secondary", size = "md", className }: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  return ["ui-button", `ui-button-${variant}`, `ui-button-${size}`, className].filter(Boolean).join(" ");
}

export function Button({ variant = "secondary", size = "md", loading = false, iconOnly = false, className, disabled, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; loading?: boolean; iconOnly?: boolean }) {
  return <button className={iconOnly ? iconButtonClass({ size, className }) : buttonClass({ variant, size, className })} disabled={disabled || loading} aria-busy={loading || undefined} {...props}><span className={iconOnly ? "ui-icon-button-visual" : "ui-button-visual"}>{children}</span></button>;
}

export function iconButtonClass({ size = "md", className }: { size?: ButtonSize; className?: string } = {}) {
  return ["ui-icon-button", `ui-icon-button-${size}`, className].filter(Boolean).join(" ");
}

export function IconButton({ label, size = "md", className, children, ...props }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & { label: string; size?: ButtonSize }) {
  return <button className={iconButtonClass({ size, className })} aria-label={label} title={props.title ?? label} {...props}><span className="ui-icon-button-visual" aria-hidden="true">{children}</span></button>;
}

export function Badge({ tone = "neutral", className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" | "success" | "warning" | "danger" }) {
  return <span className={["ui-badge", `ui-badge-${tone}`, className].filter(Boolean).join(" ")} {...props} />;
}

export function FilterChip({ active = false, count, dotColor, children, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; count?: number; dotColor?: string }) {
  return <button className={["ui-filter-chip", active ? "is-active" : "", className].filter(Boolean).join(" ")} type="button" aria-pressed={active} {...props}>{dotColor ? <i style={{ backgroundColor: dotColor }} /> : null}{children}{count === undefined ? null : <Badge>{count}</Badge>}</button>;
}
