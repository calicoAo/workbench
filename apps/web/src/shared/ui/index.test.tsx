// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button, FilterChip, IconButton } from ".";

afterEach(cleanup);

describe("shared UI primitives", () => {
  it("keeps icon controls accessible while visual sizing stays internal", () => {
    const onClick = vi.fn();
    render(<IconButton label="暂停计时" onClick={onClick}><span>icon</span></IconButton>);
    const button = screen.getByRole("button", { name: "暂停计时" });
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
    expect(button.querySelector(".ui-icon-button-visual")).toBeTruthy();
  });

  it("exposes loading and selected states with native semantics", () => {
    render(<><Button loading>保存</Button><FilterChip active>事业力</FilterChip></>);
    const button = screen.getByRole("button", { name: "保存" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.querySelector(".ui-button-visual")?.textContent).toBe("保存");
    expect(screen.getByRole("button", { name: "事业力" }).getAttribute("aria-pressed")).toBe("true");
  });
});
