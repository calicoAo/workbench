// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Request } from "../../app/api";
import { HeroDailyEntry } from ".";

afterEach(cleanup);

const hero = {
  businessDate: "2026-09-28",
  timezone: "Asia/Shanghai",
  profile: { userId: 7, displayName: "Owner", avatarRef: null, portraitRef: null, title: null, birthDate: "2000-01-01", visualPreferences: null, version: 1 },
  progress: { level: 1, xpTotal: 0, coins: 0, xpInLevel: 0, xpForNextLevel: 100 },
  dailyStatus: null,
  earthOnlineDay: 9768
};

describe("Hero daily entry", () => {
  it("restores a claimed entry after the shell remounts during the request", async () => {
    let resolveClaim!: (value: { claimed: boolean; hero: typeof hero }) => void;
    const claimResult = new Promise<{ claimed: boolean; hero: typeof hero }>((resolve) => { resolveClaim = resolve; });
    const requestMock = vi.fn(async (path: string) => path === "/api/hero" ? hero : claimResult);
    const request = requestMock as unknown as Request;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const entry = <QueryClientProvider client={client}><HeroDailyEntry request={request} userId={7} onboardingResolved onError={vi.fn()} /></QueryClientProvider>;

    const first = render(entry);
    await waitFor(() => expect(request).toHaveBeenCalledWith("/api/hero/daily-entry/claim", expect.objectContaining({ method: "POST" })));
    first.unmount();
    resolveClaim({ claimed: true, hero });
    await waitFor(() => expect(client.getQueryData(["hero-daily-entry", 7, "2026-09-28"])).toEqual({ claimed: true, hero }));

    render(entry);
    expect(await screen.findByRole("dialog", { name: "欢迎您，Owner" })).toBeTruthy();
    expect(requestMock.mock.calls.filter(([path]) => path === "/api/hero/daily-entry/claim")).toHaveLength(1);
  });
});
