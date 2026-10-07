// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { type ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Request } from "../../app/api";
import { HeroDailyEntry, HeroDailyStatus, HeroProfilePage } from ".";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const date = "2026-09-28";
const hero = {
  businessDate: date,
  timezone: "Asia/Shanghai",
  profile: { userId: 7, displayName: "Owner", avatarRef: null, portraitRef: null, title: null, birthDate: "2000-01-01", visualPreferences: null, version: 1 },
  progress: { level: 1, xpTotal: 0, coins: 0, xpInLevel: 0, xpForNextLevel: 100 },
  dailyStatus: null,
  earthOnlineDay: 9768
};

function client() { return new QueryClient({ defaultOptions: { queries: { retry: false } } }); }
function summary(businessDate = date, userId = 7) { return { ...hero, businessDate, profile: { ...hero.profile, userId, displayName: `Owner ${userId}` } }; }
function requestFor(claim: (businessDate: string) => unknown = (businessDate) => ({ claimed: true, hero: summary(businessDate) })) {
  return vi.fn(async (path: string, init?: RequestInit) => {
    if (path.startsWith("/api/hero?date=")) return summary(path.split("=")[1]);
    if (path === "/api/hero/daily-entry/claim") return claim(JSON.parse(String(init?.body)).businessDate);
    return {};
  }) as unknown as Request;
}
function entry(request: Request, businessDate = date, userId = 7) {
  return <HeroDailyEntry request={request} userId={userId} businessDate={businessDate} onboardingResolved onError={vi.fn()} />;
}
function withClient(queryClient: QueryClient, children: ReactNode, initialEntries: Array<string | { pathname: string; state?: unknown }> = ["/"]) {
  return <QueryClientProvider client={queryClient}><MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter></QueryClientProvider>;
}
function LocationProbe() { const location = useLocation(); return <output data-testid="location">{location.pathname}{location.search}</output>; }
function statusHero(statusKey: "GREAT" | "GOOD" | "OKAY" | "TIRED" | "LOW" | null, businessDate = date) {
  return { ...summary(businessDate), dailyStatus: statusKey ? { id: 4, statusKey, version: 1 } : null };
}

describe("Hero daily entry", () => {
  it("reflects a status selected in Welcome on the Today-facing Hero surface", async () => {
    let serverStatus: "GREAT" | null = null;
    const request = vi.fn(async (path: string, init?: RequestInit) => {
      if (path.startsWith("/api/hero?date=")) return { ...statusHero(serverStatus), profile: hero.profile };
      if (path === "/api/hero/daily-entry/claim") return { claimed: true, hero: { ...statusHero(serverStatus), profile: hero.profile } };
      if (path === "/api/hero/daily-status") { serverStatus = JSON.parse(String(init?.body)).statusKey; return {}; }
      return {};
    }) as unknown as Request;
    const queryClient = client();
    render(withClient(queryClient, <><HeroDailyEntry request={request} userId={7} businessDate={date} onboardingResolved onError={vi.fn()} /><HeroDailyStatus request={request} userId={7} date={date} onError={vi.fn()} /></>));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "状态很好" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "开始冒险" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "编辑今日状态" }).textContent).toContain("状态很好"));
    expect((request as ReturnType<typeof vi.fn>).mock.calls.some(([path, init]) => path === "/api/hero/daily-status" && String(init?.body).includes('"statusKey":"GREAT"'))).toBe(true);
  });

  it("shows the canonical status after refresh and remount", async () => {
    const request = vi.fn(async (path: string) => path.startsWith("/api/hero?date=") ? statusHero("GOOD") : { claimed: false, reason: "ALREADY_ENTERED" }) as unknown as Request;
    const queryClient = client();
    const first = render(withClient(queryClient, <HeroDailyStatus request={request} userId={7} date={date} onError={vi.fn()} />));
    expect(await screen.findByRole("button", { name: "编辑今日状态" })).toBeTruthy();
    first.unmount();
    render(withClient(queryClient, <HeroDailyStatus request={request} userId={7} date={date} onError={vi.fn()} />));
    expect(await screen.findByRole("button", { name: "编辑今日状态" })).toBeTruthy();
  });

  it("edits the canonical status from Today and keeps the previous value after a failed mutation", async () => {
    let fail = true;
    let serverStatus: "TIRED" | "GOOD" = "TIRED";
    const request = vi.fn(async (path: string, init?: RequestInit) => {
      if (path.startsWith("/api/hero?date=")) return statusHero(serverStatus);
      if (path === "/api/hero/daily-status") { if (fail) throw new Error("status unavailable"); serverStatus = JSON.parse(String(init?.body)).statusKey; return {}; }
      return {};
    }) as unknown as Request;
    const queryClient = client();
    render(withClient(queryClient, <HeroDailyStatus request={request} userId={7} date={date} onError={vi.fn()} />));
    fireEvent.click(await screen.findByRole("button", { name: "编辑今日状态" }));
    fireEvent.click(screen.getByRole("button", { name: "还不错" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "编辑今日状态" }).textContent).toContain("有点累"));
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "还不错" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "编辑今日状态" }).textContent).toContain("还不错"));
    expect((request as ReturnType<typeof vi.fn>).mock.calls.filter(([path]) => path === "/api/hero/daily-status")).toHaveLength(2);
  });

  it("shows a lightweight empty affordance without inventing a default status", async () => {
    const request = vi.fn(async (path: string) => path.startsWith("/api/hero?date=") ? statusHero(null) : {}) as unknown as Request;
    render(withClient(client(), <HeroDailyStatus request={request} userId={7} date={date} onError={vi.fn()} />));
    expect((await screen.findByRole("button", { name: "设置今日状态" })).textContent).toContain("设置今日状态");
    expect(screen.queryByText("状态很好")).toBeNull();
  });

  it("keeps status facts isolated between historical and current dates", async () => {
    const request = vi.fn(async (path: string) => path.includes("2026-09-27") ? statusHero("LOW", "2026-09-27") : statusHero("GOOD", "2026-09-28")) as unknown as Request;
    const queryClient = client();
    const view = render(withClient(queryClient, <HeroDailyStatus request={request} userId={7} date="2026-09-27" onError={vi.fn()} />));
    expect((await screen.findByRole("button", { name: "编辑今日状态" })).textContent).toContain("低能量");
    view.rerender(withClient(queryClient, <HeroDailyStatus request={request} userId={7} date="2026-09-28" onError={vi.fn()} />));
    await waitFor(() => expect(screen.getByRole("button", { name: "编辑今日状态" }).textContent).toContain("还不错"));
  });

  it("automatically presents the first successful claim once, including after an in-flight remount", async () => {
    let resolveClaim!: (value: { claimed: boolean; hero: typeof hero }) => void;
    const claimResult = new Promise<{ claimed: boolean; hero: typeof hero }>((resolve) => { resolveClaim = resolve; });
    const request = requestFor(() => claimResult);
    const queryClient = client();
    const first = render(withClient(queryClient, entry(request)));
    await waitFor(() => expect(request).toHaveBeenCalledWith("/api/hero/daily-entry/claim", expect.objectContaining({ method: "POST" })));
    first.unmount();
    resolveClaim({ claimed: true, hero });
    await waitFor(() => expect(queryClient.getQueryData(["hero-daily-entry", 7, date])).toMatchObject({ claimed: true, automaticPresentation: "pending" }));

    render(withClient(queryClient, entry(request)));
    expect(await screen.findByRole("dialog", { name: "欢迎您，Owner" })).toBeTruthy();
    expect(queryClient.getQueryData(["hero-daily-entry", 7, date])).toMatchObject({ automaticPresentation: "consumed" });
    expect((request as ReturnType<typeof vi.fn>).mock.calls.filter(([path]) => path === "/api/hero/daily-entry/claim")).toHaveLength(1);
  });

  it("does not automatically reopen after dismissal and remount on the same user/date", async () => {
    const request = requestFor();
    const queryClient = client();
    const first = render(withClient(queryClient, entry(request)));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    first.rerender(withClient(queryClient, entry(request)));
    await queryClient.invalidateQueries({ queryKey: ["hero", 7] });
    expect(screen.queryByRole("dialog")).toBeNull();
    first.unmount();
    render(withClient(queryClient, entry(request)));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect((request as ReturnType<typeof vi.fn>).mock.calls.filter(([path]) => path === "/api/hero/daily-entry/claim")).toHaveLength(1);
  });

  it("does not reopen when a route consumer goes away and back on the same date", async () => {
    const request = requestFor();
    const queryClient = client();
    const view = render(withClient(queryClient, entry(request)));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    view.rerender(withClient(queryClient, <div>Other route</div>));
    view.rerender(withClient(queryClient, entry(request)));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens once for a new canonical business date and never reopens the old date", async () => {
    const request = requestFor();
    const queryClient = client();
    const view = render(withClient(queryClient, entry(request)));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    view.rerender(withClient(queryClient, entry(request, "2026-09-29")));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    view.rerender(withClient(queryClient, entry(request, date)));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect((request as ReturnType<typeof vi.fn>).mock.calls.filter(([path]) => path === "/api/hero/daily-entry/claim")).toHaveLength(2);
  });

  it("allows explicit replay without another claim or resetting the automatic gate", async () => {
    const request = requestFor();
    const queryClient = client();
    const view = render(withClient(queryClient, <>{entry(request)}<HeroProfilePage request={request} userId={7} date={date} onError={vi.fn()} /></>));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    fireEvent.click(await screen.findByRole("button", { name: "重放今日启动页" }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    view.rerender(withClient(queryClient, entry(request)));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(queryClient.getQueryData(["hero-daily-entry", 7, date])).toMatchObject({ automaticPresentation: "consumed" });
    expect((request as ReturnType<typeof vi.fn>).mock.calls.filter(([path]) => path === "/api/hero/daily-entry/claim")).toHaveLength(1);
  });

  it("keeps a failed claim retryable without consuming automatic presentation", async () => {
    let attempts = 0;
    const request = requestFor((businessDate) => {
      if (++attempts === 1) throw new Error("temporary failure");
      return { claimed: true, hero: summary(businessDate) };
    });
    const queryClient = client();
    render(withClient(queryClient, entry(request)));
    fireEvent.click(await screen.findByRole("button", { name: "重试" }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(attempts).toBe(2);
  });

  it("does not automatically open an already-entered Daily Entry", async () => {
    const request = requestFor(() => ({ claimed: false, reason: "ALREADY_ENTERED" }));
    const queryClient = client();
    render(withClient(queryClient, entry(request)));
    await waitFor(() => expect(queryClient.getQueryData(["hero-daily-entry", 7, date])).toMatchObject({ claimed: false, reason: "ALREADY_ENTERED" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("isolates the automatic gate by authenticated user", async () => {
    let activeUserId = 7;
    const request = vi.fn(async (path: string, init?: RequestInit) => {
      if (path.startsWith("/api/hero?date=")) return summary(date, activeUserId);
      if (path === "/api/hero/daily-entry/claim") return { claimed: true, hero: summary(JSON.parse(String(init?.body)).businessDate, activeUserId) };
      return {};
    }) as unknown as Request;
    const queryClient = client();
    const view = render(withClient(queryClient, entry(request, date, 7)));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    activeUserId = 8;
    view.rerender(withClient(queryClient, entry(request, date, 8)));
    expect(await screen.findByRole("dialog", { name: "欢迎您，Owner 8" })).toBeTruthy();
    expect(queryClient.getQueryData(["hero-daily-entry", 7, date])).toMatchObject({ automaticPresentation: "consumed" });
    expect(queryClient.getQueryData(["hero-daily-entry", 8, date])).toMatchObject({ automaticPresentation: "consumed" });
  });
});

describe("Hero page navigation", () => {
  it("returns to the Settings Hero topic when opened from Settings", async () => {
    render(withClient(client(), <><HeroProfilePage request={requestFor() } userId={7} date={date} onError={vi.fn()} /><LocationProbe /></>, [{ pathname: "/hero", state: { returnTo: "/settings?topic=hero" } }]));
    await screen.findByRole("heading", { name: "Owner 7" });
    fireEvent.click(screen.getByRole("button", { name: "返回设置" }));
    expect(screen.getByTestId("location").textContent).toBe("/settings?topic=hero");
  });

  it("uses Settings Hero as the stable direct-link fallback", async () => {
    render(withClient(client(), <><HeroProfilePage request={requestFor()} userId={7} date={date} onError={vi.fn()} /><LocationProbe /></>, [{ pathname: "/hero" }]));
    await screen.findByRole("heading", { name: "Owner 7" });
    expect(screen.getByRole("button", { name: "返回设置" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "返回设置" }));
    expect(screen.getByTestId("location").textContent).toBe("/settings?topic=hero");
  });
});
