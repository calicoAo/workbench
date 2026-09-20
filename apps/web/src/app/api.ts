export type Request = <T>(path: string, init?: RequestInit) => Promise<T>;

type ApiResponse<T> = { code: number; message: string; data: T; requestId?: string; errors?: Record<string, string[]> };

export class ApiError extends Error {
  readonly conflict: boolean;
  readonly retryable: boolean;

  constructor(
    message: string,
    readonly status: number,
    readonly code: number,
    readonly requestId: string | null,
    readonly fieldErrors: Record<string, string[]> = {}
  ) {
    super(message);
    this.name = "ApiError";
    this.conflict = status === 409 || code === 40900;
    this.retryable = status === 0 || status === 408 || status === 429 || status >= 500;
  }
}

const AUTH_TOKEN_KEY = "personal_workbench_token";

export const sessionToken = {
  read: () => localStorage.getItem(AUTH_TOKEN_KEY),
  write: (token: string) => localStorage.setItem(AUTH_TOKEN_KEY, token),
  clear: () => localStorage.removeItem(AUTH_TOKEN_KEY)
};

export const api: Request = async <T,>(path: string, init?: RequestInit) => {
  const token = sessionToken.read();
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers
      }
    });
  } catch (error) {
    throw new ApiError(error instanceof Error ? error.message : "network request failed", 0, 0, null);
  }

  const requestId = response.headers.get("x-request-id");
  let json: ApiResponse<T>;
  try {
    json = (await response.json()) as ApiResponse<T>;
  } catch {
    throw new ApiError(`invalid API response (${response.status})`, response.status, response.status, requestId);
  }
  if (!response.ok || json.code !== 0) {
    throw new ApiError(json.message || "request failed", response.status, json.code, json.requestId ?? requestId, json.errors);
  }
  return json.data;
};
