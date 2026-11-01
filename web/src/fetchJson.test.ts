import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchJson } from "./fetchJson";

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fetchJson", () => {
  it("returns parsed JSON", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));

    await expect(fetchJson("/x")).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries server errors and network failures", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockRejectedValueOnce(new TypeError("network down"))
      .mockResolvedValueOnce(jsonResponse([1]));

    await expect(fetchJson("/x", { backoffMs: 0 })).resolves.toEqual([1]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("gives up after the retry limit and logs the failure", async () => {
    fetchMock.mockImplementation(async () => jsonResponse({}, 500));

    await expect(fetchJson("/x", { retries: 1, backoffMs: 0 })).rejects.toThrow(
      "HTTP 500",
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(console.error).toHaveBeenCalled();
  });

  it("does not retry client errors", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 404));

    await expect(fetchJson("/x", { backoffMs: 0 })).rejects.toThrow("HTTP 404");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry malformed JSON", async () => {
    fetchMock.mockResolvedValueOnce(new Response("<html>"));

    await expect(fetchJson("/x", { backoffMs: 0 })).rejects.toThrow(SyntaxError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("aborts a request that exceeds the timeout", async () => {
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );

    await expect(
      fetchJson("/x", { timeoutMs: 1, retries: 0 }),
    ).rejects.toThrow("Aborted");
  });
});
