// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, type Request } from "../../app/api";
import { queryKeys } from "../../app/query";
import { netSeconds, retryableOperation, useTimerCommands, type CurrentSession } from ".";

afterEach(cleanup);

const session: CurrentSession = {
  id: 5,
  taskId: 11,
  startTime: "2026-09-19T09:00:00.000Z",
  durationMinutes: 20,
  status: 1,
  version: 3,
  recordTimezone: "Asia/Shanghai",
  segments: [
    { id: 1, timerSessionId: 5, taskId: 11, status: 1, startedAt: "2026-09-19 09:00:00", endedAt: "2026-09-19 09:10:00", businessDate: "2026-09-19" },
    { id: 2, timerSessionId: 5, taskId: 11, status: 1, startedAt: "2026-09-19 09:20:00", endedAt: "2026-09-19 09:30:00", businessDate: "2026-09-19" }
  ]
};

describe("R1C timer integration", () => {
  it("reuses one operationId when an automatic retry repeats pause", async () => {
    const request = vi.fn()
      .mockRejectedValueOnce(new ApiError("temporary", 503, 50000, "req-1"))
      .mockResolvedValueOnce({ id: 5, status: 1, version: 4 }) as unknown as Request;
    await retryableOperation(request, "/api/timer-sessions/5/pause", "PUT", { expectedVersion: 3 });
    const first = JSON.parse(String((request as ReturnType<typeof vi.fn>).mock.calls[0][1]?.body));
    const second = JSON.parse(String((request as ReturnType<typeof vi.fn>).mock.calls[1][1]?.body));
    expect(first.operationId).toBe(second.operationId);
    expect(first.expectedVersion).toBe(3);
  });

  it("creates a new operationId for a separate resume action", async () => {
    const request = vi.fn(async () => ({ id: 5 })) as unknown as Request;
    await retryableOperation(request, "/pause", "PUT", { expectedVersion: 1 });
    await retryableOperation(request, "/resume", "PUT", { expectedVersion: 2 });
    const ids = (request as ReturnType<typeof vi.fn>).mock.calls.map((call) => JSON.parse(String(call[1]?.body)).operationId);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it("excludes the pause gap from displayed net time", () => {
    expect(netSeconds(session)).toBe(1200);
  });

  it("surfaces 409 and refetches current session without false success", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(queryKeys.currentSession(7), session);
    const request = vi.fn(async () => { throw new ApiError("session version conflict", 409, 40900, "req-409"); }) as unknown as Request;
    const onError = vi.fn();
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const hook = renderHook(() => useTimerCommands({ request, userId: 7, date: "2026-09-19", timezone: "Asia/Shanghai", onError }), { wrapper });
    let result = true;
    await act(async () => { result = await hook.result.current.pause(session); });
    expect(result).toBe(false);
    expect(onError).toHaveBeenCalledWith(expect.stringContaining("重新同步"), "状态冲突");
    await waitFor(() => expect(client.getQueryState(queryKeys.currentSession(7))?.isInvalidated).toBe(true));
  });

  it("finish defaults to completeTask=false", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const request = vi.fn(async () => ({ id: 5, status: 2, version: 4 })) as unknown as Request;
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const hook = renderHook(() => useTimerCommands({ request, userId: 7, date: "2026-09-19", timezone: "Asia/Shanghai", onError: vi.fn() }), { wrapper });
    await act(async () => { await hook.result.current.finish(session); });
    const body = JSON.parse(String((request as ReturnType<typeof vi.fn>).mock.calls[0][1]?.body));
    expect(body).toMatchObject({ expectedVersion: 3, completeTask: false });
  });
});
