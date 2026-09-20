// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api, sessionToken } from "./api";

afterEach(() => {
  sessionToken.clear();
  vi.unstubAllGlobals();
});

describe("API client", () => {
  it("adds auth and decodes a success envelope", async () => {
    sessionToken.write("token-a");
    const fetchMock = vi.fn(async (_path: string, init?: RequestInit) => new Response(JSON.stringify({ code: 0, message: "ok", data: { id: 7 } }), { status: 200, headers: init?.headers }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(api<{ id: number }>("/api/example")).resolves.toEqual({ id: 7 });
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get("Authorization")).toBe("Bearer token-a");
  });

  it("normalizes 409, requestId, and field errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ code: 40900, message: "version conflict", data: null, errors: { expectedVersion: ["stale"] } }), { status: 409, headers: { "x-request-id": "req-409" } })));
    const error = await api("/api/example").catch((value) => value);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ conflict: true, retryable: false, requestId: "req-409", fieldErrors: { expectedVersion: ["stale"] } });
  });

  it("marks transport failures retryable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    const error = await api("/api/example").catch((value) => value);
    expect(error).toMatchObject({ status: 0, retryable: true });
  });
});
