// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MarkdownContent, MarkdownInput } from ".";
afterEach(cleanup);
it("renders Markdown and GFM without allowing raw HTML or script URLs", () => {
  const { container } = render(<MarkdownContent content={'# Heading\n\n**bold**\n\n- [x] done\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n```js\nconst n = 1;\n```\n\n<script>alert(1)</script>\n\n[bad](javascript:alert)'} />);
  expect(screen.getByRole("heading", { name: "Heading" })).toBeTruthy();
  expect(container.querySelector("strong")?.textContent).toBe("bold");
  expect(screen.getByRole("table")).toBeTruthy();
  expect(screen.getByRole<HTMLInputElement>("checkbox").disabled).toBe(true);
  expect(container.querySelector("pre code")?.textContent).toContain("const n = 1;");
  expect(container.querySelector("script")).toBeNull();
  expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
});
it("previews the exact controlled source without changing or submitting it", () => {
  const change = vi.fn(), submit = vi.fn();
  render(<form onSubmit={submit}><MarkdownInput aria-label="source" value="# Draft" onChange={change} /></form>);
  fireEvent.click(screen.getByRole("button", { name: "预览" }));
  expect(screen.getByRole("heading", { name: "Draft" })).toBeTruthy();
  expect(screen.getByLabelText<HTMLTextAreaElement>("source").value).toBe("# Draft");
  expect(change).not.toHaveBeenCalled(); expect(submit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "继续编辑" }));
  expect(screen.getByLabelText<HTMLTextAreaElement>("source").hidden).toBe(false);
});
