export type Request = <T>(path: string, init?: RequestInit) => Promise<T>;

type ApiResponse<T> = { code: number; message: string; data: T };

const AUTH_TOKEN_KEY = "personal_workbench_token";

export const sessionToken = {
  read: () => localStorage.getItem(AUTH_TOKEN_KEY),
  write: (token: string) => localStorage.setItem(AUTH_TOKEN_KEY, token),
  clear: () => localStorage.removeItem(AUTH_TOKEN_KEY)
};

export const api: Request = async <T,>(path: string, init?: RequestInit) => {
  const token = sessionToken.read();
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers
    }
  });
  const json = (await response.json()) as ApiResponse<T>;
  if (!response.ok || json.code !== 0) throw new Error(json.message || "request failed");
  return json.data;
};
