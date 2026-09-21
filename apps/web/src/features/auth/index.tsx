import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import type { Request } from "../../app/api";

export type AuthUser = { id: number; username: string; displayName: string; timezone: string };
export type AuthSession = { user: AuthUser; logout: () => void; updateUser?: (user: AuthUser) => void };

type AuthPayload = { token: string; user: AuthUser };
type AuthMode = "login" | "register";
type TokenStorage = { read: () => string | null; write: (token: string) => void; clear: () => void };

export function AuthGate({ request, tokenStorage, onError, onSessionClear, children }: {
  request: Request;
  tokenStorage: TokenStorage;
  onError: (message: string, title?: string) => void;
  onSessionClear?: () => void;
  children: (session: AuthSession) => ReactNode;
}) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<AuthMode>("login");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (!tokenStorage.read()) {
      setLoading(false);
      return;
    }
    request<AuthUser>("/api/auth/me")
      .then(setUser)
      .catch(() => {
        tokenStorage.clear();
        onSessionClear?.();
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, [onSessionClear, request, tokenStorage]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const payload = await request<AuthPayload>(`/api/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify({
          username: username.trim(),
          displayName: mode === "register" ? displayName.trim() || username.trim() : undefined,
          password
        })
      });
      tokenStorage.write(payload.token);
      onSessionClear?.();
      setUser(payload.user);
      setPassword("");
    } catch (error) {
      onError(errorMessage(error), "操作没有成功");
    }
  }

  function logout() {
    tokenStorage.clear();
    onSessionClear?.();
    setUser(null);
  }

  if (loading) return <AuthLoading />;
  if (user) return children({ user, logout, updateUser: setUser });
  return (
    <AuthPage
      mode={mode}
      username={username}
      displayName={displayName}
      password={password}
      onModeChange={setMode}
      onUsernameChange={setUsername}
      onDisplayNameChange={setDisplayName}
      onPasswordChange={setPassword}
      onSubmit={submit}
    />
  );
}

function AuthLoading() {
  return (
    <main className="page-shell min-h-screen p-4 text-ink">
      <div className="mx-auto flex min-h-[calc(100vh-32px)] max-w-md items-center">
        <section className="glass-panel w-full p-5 text-center"><p className="text-xs text-soft">个人工作台</p><h1 className="mt-1 text-lg font-bold">正在同步登录状态</h1></section>
      </div>
    </main>
  );
}

function AuthPage({ mode, username, displayName, password, onModeChange, onUsernameChange, onDisplayNameChange, onPasswordChange, onSubmit }: {
  mode: AuthMode;
  username: string;
  displayName: string;
  password: string;
  onModeChange: (mode: AuthMode) => void;
  onUsernameChange: (value: string) => void;
  onDisplayNameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const isRegister = mode === "register";
  return (
    <main className="page-shell min-h-screen p-4 text-ink">
      <div className="mx-auto grid min-h-[calc(100vh-32px)] max-w-5xl items-center gap-4 lg:grid-cols-[1fr_420px]">
        <section className="hidden lg:block">
          <p className="text-xs font-semibold text-mint-700">Personal Workbench</p>
          <h1 className="mt-2 text-3xl font-bold leading-tight">同一套记录，多端实时同步</h1>
          <p className="mt-3 max-w-xl text-sm leading-7 text-soft">每个人都有独立账号和独立数据。登录后，任务、时间轴、睡眠、喝水、晨写、日记和复盘都会保存到服务器数据库。</p>
          <div className="mt-5 grid max-w-xl grid-cols-3 gap-2"><MiniStat label="数据" value="隔离" /><MiniStat label="同步" value="多端" /><MiniStat label="部署" value="自有服务器" /></div>
        </section>
        <form className="glass-panel p-5" onSubmit={onSubmit}>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div><p className="text-xs text-soft">欢迎回来</p><h2 className="text-xl font-bold">{isRegister ? "创建账号" : "登录工作台"}</h2></div>
            <div className="inline-flex rounded-full border border-white/80 bg-white/70 p-0.5">
              <button aria-label="切换到登录" className={`h-8 rounded-full px-3 text-[11px] font-semibold transition ${!isRegister ? "bg-mint-500 text-white" : "text-soft hover:text-ink"}`} type="button" onClick={() => onModeChange("login")}>登录</button>
              <button aria-label="切换到注册" className={`h-8 rounded-full px-3 text-[11px] font-semibold transition ${isRegister ? "bg-pink-400 text-white" : "text-soft hover:text-ink"}`} type="button" onClick={() => onModeChange("register")}>注册</button>
            </div>
          </div>
          <div className="space-y-2.5">
            <input aria-label="用户名" className="field" autoComplete="username" placeholder="用户名" value={username} onChange={(event) => onUsernameChange(event.target.value)} />
            {isRegister && <input aria-label="显示昵称" className="field" autoComplete="name" placeholder="显示昵称" value={displayName} onChange={(event) => onDisplayNameChange(event.target.value)} />}
            <input aria-label="密码" className="field" autoComplete={isRegister ? "new-password" : "current-password"} placeholder="密码" type="password" value={password} onChange={(event) => onPasswordChange(event.target.value)} />
          </div>
          <button className="primary-button mt-4 w-full" type="submit">{isRegister ? "注册并进入" : "登录"}</button>
        </form>
      </div>
    </main>
  );
}

function MiniStat({ label, value }: { label: string; value: ReactNode }) {
  return <div className="mini-stat"><p className="text-[11px] text-soft">{label}</p><p className="text-sm font-semibold">{value}</p></div>;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "操作失败";
}
