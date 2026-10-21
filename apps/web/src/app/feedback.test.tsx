// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ApplicationFeedback } from "./feedback";
import { I18nProvider, useI18n } from "./i18n";
import { ModalPortal } from "../features/tasks/task-ui";

afterEach(() => { cleanup(); vi.useRealTimers(); });
it.each(["notice", "confirm", "reward"] as const)("owns focus/dismiss for %s without closing underlying Tasks", (kind) => {
  const closeTask = vi.fn(), confirmed = vi.fn();
  render(<ApplicationFeedback>{(feedback) => <ModalPortal onClose={closeTask} label="Task parent"><button onClick={() => kind === "notice" ? feedback.notice("Saved", "Notice") : kind === "confirm" ? feedback.confirm("Confirm", "Sure?", confirmed) : feedback.taskReward({ id: 1, title: "Task" }, [])}>trigger</button><button>last</button></ModalPortal>}</ApplicationFeedback>);
  const trigger = screen.getByText("trigger"); trigger.focus(); fireEvent.click(trigger);
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByRole("heading")).toBeTruthy();
  const buttons = within(dialog).getAllByRole("button"); expect(document.activeElement).toBe(buttons[0]);
  buttons.at(-1)!.focus(); fireEvent.keyDown(document, { key: "Tab" }); expect(document.activeElement).toBe(buttons[0]);
  fireEvent.keyDown(document, { key: "Tab", shiftKey: true }); expect(document.activeElement).toBe(buttons.at(-1));
  fireEvent.keyDown(document, { key: "Escape" });
  expect(closeTask).not.toHaveBeenCalled(); expect(confirmed).not.toHaveBeenCalled(); expect(document.activeElement).toBe(trigger);
  expect(screen.getByRole("dialog", { name: "Task parent" })).toBeTruthy();
  if (kind === "confirm") { fireEvent.click(trigger); fireEvent.click(screen.getByRole("button", { name: "确认" })); expect(confirmed).toHaveBeenCalledOnce(); }
});

it("shows successful-operation feedback as a non-modal status", () => {
  render(<ApplicationFeedback>{(feedback) => <button onClick={() => feedback.success("Saved")}>save</button>}</ApplicationFeedback>);
  fireEvent.click(screen.getByRole("button", { name: "save" }));
  expect(screen.getByRole("status").textContent).toContain("Saved");
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("restarts visible feedback and its lifetime when the same action succeeds again", () => {
  vi.useFakeTimers();
  render(<ApplicationFeedback>{(feedback) => <button onClick={() => feedback.success()}>save</button>}</ApplicationFeedback>);
  fireEvent.click(screen.getByText("save"));
  const first = screen.getByRole("status");
  act(() => vi.advanceTimersByTime(3000));
  fireEvent.click(screen.getByText("save"));
  expect(screen.getByRole("status")).not.toBe(first);
  act(() => vi.advanceTimersByTime(3000));
  expect(screen.getByRole("status").textContent).toContain("操作已完成");
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.queryByRole("status")).toBeNull();
});

it("localizes Wallet reward feedback using the selected interface language", () => {
  function Controls() {
    const { setLocale } = useI18n();
    return <ApplicationFeedback>{(feedback) => <><button onClick={() => setLocale("en")}>English</button><button onClick={() => setLocale("zh-CN")}>Chinese</button><button onClick={() => feedback.recordReward("财务记录", { xp: 5, coins: 2, reason: "财务记录" })}>save</button></>}</ApplicationFeedback>;
  }
  render(<I18nProvider><Controls /></I18nProvider>);
  fireEvent.click(screen.getByText("English"));
  fireEvent.click(screen.getByText("save"));
  expect(screen.getByRole("heading", { name: "Financial record saved" })).toBeTruthy();
  expect(screen.getByText("This record also contributes to your growth.")).toBeTruthy();
  fireEvent.click(screen.getByText("Chinese"));
});
