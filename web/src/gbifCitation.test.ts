import { afterEach, describe, expect, it, vi } from "vitest";
import { citationNodes, GBIF_FALLBACK, loadGbifCitation, parseGbifCitation } from "./gbifCitation";

const valid = {
  doi: "10.15468/dd.abc",
  url: "https://doi.org/10.15468/dd.abc",
  citation: "GBIF.org (5 November 2026) Derived dataset https://doi.org/10.15468/dd.abc",
  registered: "2026-11-05",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

function answer(body: string, init: ResponseInit) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(body, init)));
}

describe("parseGbifCitation", () => {
  it("accepts a citation with a DOI link", () => {
    expect(parseGbifCitation(valid)).toEqual(valid);
  });

  it.each([[null], [{ ...valid, url: "https://example.com" }], [{ ...valid, citation: 1 }]])(
    "rejects %j",
    (data) => {
      expect(() => parseGbifCitation(data)).toThrow();
    },
  );
});

describe("loadGbifCitation", () => {
  it("loads a registered citation", async () => {
    answer(JSON.stringify(valid), { headers: { "content-type": "application/json" } });
    await expect(loadGbifCitation()).resolves.toEqual(valid);
  });

  it("is null before registration, including the dev server's page fallback", async () => {
    answer("", { status: 404 });
    await expect(loadGbifCitation()).resolves.toBeNull();
    answer("<!doctype html>", { headers: { "content-type": "text/html" } });
    await expect(loadGbifCitation()).resolves.toBeNull();
  });

  it("fails on server errors", async () => {
    answer("", { status: 503 });
    await expect(loadGbifCitation()).rejects.toThrow("HTTP 503");
  });
});

describe("citationNodes", () => {
  it("links the DOI inside the citation", () => {
    const paragraph = document.createElement("p");
    paragraph.append(...citationNodes(valid));
    expect(paragraph.textContent).toBe(valid.citation);
    expect(paragraph.querySelector("a")?.href).toBe(valid.url);
  });

  it("falls back to a plain credit", () => {
    expect(citationNodes(null)).toEqual([GBIF_FALLBACK]);
  });
});
