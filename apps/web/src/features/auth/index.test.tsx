// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthGate } from ".";
import type { Request } from "../../app/api";

afterEach(cleanup);

function tokenStorage(initial: string | null = null) {
  let token = initial;
  return {
    read: vi.fn(() => token),
    write: vi.fn((value: string) => { token = value; }),
    clear: vi.fn(() => { token = null; })
  };
}

describe("AuthGate ownership", () => {
  it("shows the login workflow without validating when no token exists", async () => {
    const request = vi.fn() as unknown as Request;
    render(<AuthGate request={request} tokenStorage={tokenStorage()} onError={vi.fn()}>{() => <p>workspace</p>}</AuthGate>);

    expect(await screen.findByRole("heading", { name: "登录工作台" })).toBeTruthy();
    expect(request).not.toHaveBeenCalled();
  });

  it("validates a persisted session before mounting the workspace", async () => {
    const request = vi.fn(async () => ({ id: 7, username: "owner", displayName: "Owner", timezone: "Asia/Shanghai" })) as unknown as Request;
    render(<AuthGate request={request} tokenStorage={tokenStorage("token")} onError={vi.fn()}>{({ user }) => <p>workspace:{user.displayName}</p>}</AuthGate>);

    expect(screen.getByText("正在同步登录状态")).toBeTruthy();
    expect(await screen.findByText("workspace:Owner")).toBeTruthy();
    expect(request).toHaveBeenCalledWith("/api/auth/me");
  });

  it("owns login persistence and logout session reset", async () => {
    const storage = tokenStorage();
    const onSessionClear = vi.fn();
    const request = vi.fn(async () => ({ token: "new-token", user: { id: 7, username: "owner", displayName: "Owner", timezone: "Asia/Shanghai" } })) as unknown as Request;
    render(
      <AuthGate request={request} tokenStorage={storage} onError={vi.fn()} onSessionClear={onSessionClear}>
        {({ user, logout }) => <div><p>workspace:{user.displayName}</p><button type="button" onClick={logout}>退出测试</button></div>}
      </AuthGate>
    );
    fireEvent.change(await screen.findByLabelText("用户名"), { target: { value: " owner " } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    expect(await screen.findByText("workspace:Owner")).toBeTruthy();
    expect(storage.write).toHaveBeenCalledWith("new-token");
    expect(JSON.parse(String((request as ReturnType<typeof vi.fn>).mock.calls[0][1]?.body))).toMatchObject({ username: "owner", password: "secret" });

    fireEvent.click(screen.getByRole("button", { name: "退出测试" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "登录工作台" })).toBeTruthy());
    expect(storage.clear).toHaveBeenCalledOnce();
    expect(onSessionClear).toHaveBeenCalledTimes(2);
  });

  it("clears an invalid persisted session", async () => {
    const storage = tokenStorage("expired");
    const request = vi.fn(async () => { throw new Error("unauthorized"); }) as unknown as Request;
    render(<AuthGate request={request} tokenStorage={storage} onError={vi.fn()}>{() => <p>workspace</p>}</AuthGate>);

    expect(await screen.findByRole("heading", { name: "登录工作台" })).toBeTruthy();
    expect(storage.clear).toHaveBeenCalledOnce();
  });
});
