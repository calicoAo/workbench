// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ApplicationFeedback } from "./feedback";
import { ModalPortal } from "../features/tasks/task-ui";

afterEach(cleanup);
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
