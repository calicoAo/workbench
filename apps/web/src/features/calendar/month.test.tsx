// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import { MonthActivityCalendar } from "./month";
import type { Request } from "../../app/api";
afterEach(cleanup);
const item = { id: "TIMER_SEGMENT:1:2026-10-01", kind: "ACTUAL", businessDate: "2026-10-01", title: "写方案", taskId: 7, startedAt: "2026-10-01T01:00:00Z", endedAt: "2026-10-01T02:00:00Z", durationSeconds: 3600, completed: false, color: "#ff4400" };
function view(request: Request, date = "2026-10-01") { return <MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MonthActivityCalendar request={request} userId={1} date={date} timezone="Asia/Tokyo" /></QueryClientProvider></MemoryRouter>; }
it("reads exactly 42 visible days and displays activity identity, time, color and task links", async () => {
  const request = vi.fn(async () => ({ activities: [item, { ...item, id: "completion:2", kind: "COMPLETION", title: "不用计时也完成", durationSeconds: 0, completed: true, businessDate: "2026-11-08" }] }));
  render(view(request as Request));
  await screen.findAllByText("写方案");
  expect(request.mock.calls).toHaveLength(1);
  expect((request.mock.calls as unknown as [string][])[0][0]).toContain("from=2026-09-28&to=2026-11-08");
  expect(screen.getAllByRole("gridcell")).toHaveLength(42);
  const link = screen.getAllByRole("link", { name: /写方案/ })[0];
  expect(link.getAttribute("href")).toBe("/tasks/7?date=2026-10-01");
  expect(link.getAttribute("style")).toContain("rgb(255, 68, 0)");
  expect(link.textContent).toContain("10:00");
  fireEvent.click(screen.getByRole("button", { name: "2026-11-08" }));
  expect(within(screen.getByRole("region", { name: "所选日期事项" })).getByText("不用计时也完成")).toBeTruthy();
});
it("overflow opens all selected-day items while planned records stay distinct", async () => {
  const request = vi.fn(async () => ({ activities: Array.from({ length: 6 }, (_, n) => ({ ...item, id: String(n), title: `事项${n}`, kind: n === 5 ? "PLANNED" : "ACTUAL" })) }));
  const { container } = render(view(request as Request));
  fireEvent.click(await screen.findByRole("button", { name: "还有 2 项" }));
  expect(within(screen.getByRole("region", { name: "所选日期事项" })).getByText("事项5")).toBeTruthy();
  expect(container.querySelector(".activity-day-detail .is-planned")).toBeTruthy();
});
it("empty day and failed query offer honest empty state and retry", async () => {
  let fail = true;
  const request = vi.fn(async () => { if (fail) throw new Error("offline"); return { activities: [] }; });
  render(view(request as Request)); await screen.findByRole("alert");
  fail = false; fireEvent.click(screen.getByRole("button", { name: "重试" }));
  expect(await screen.findByText("这一天还没有事项记录。")).toBeTruthy();
});
