import { afterEach, describe, expect, it, vi } from "vitest";
import { copyText, readAnimals, withAnimals } from "./shareLink";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("readAnimals", () => {
  it("reads ids in order, skipping blanks and repeats", () => {
    expect(readAnimals("?animals=lion,tiger")).toEqual(["lion", "tiger"]);
    expect(readAnimals("?animals=lion,,tiger,lion, ")).toEqual(["lion", "tiger"]);
    expect(readAnimals("?animals=lion%2Ctiger")).toEqual(["lion", "tiger"]);
  });

  it("returns nothing without the parameter", () => {
    expect(readAnimals("")).toEqual([]);
    expect(readAnimals("?other=1")).toEqual([]);
  });
});

describe("withAnimals", () => {
  it("sets the animals with readable commas and keeps other parameters", () => {
    expect(withAnimals("https://example.org/?x=1", ["lion", "tiger"])).toBe(
      "https://example.org/?x=1&animals=lion,tiger",
    );
  });

  it("replaces existing animals and removes the parameter when none are picked", () => {
    expect(withAnimals("https://example.org/?animals=lion", ["tiger"])).toBe(
      "https://example.org/?animals=tiger",
    );
    expect(withAnimals("https://example.org/?animals=lion", [])).toBe("https://example.org/");
  });

  it("round-trips through readAnimals", () => {
    const url = new URL(withAnimals("https://example.org/", ["polar-bear", "caribou"]));
    expect(readAnimals(url.search)).toEqual(["polar-bear", "caribou"]);
  });
});

describe("copyText", () => {
  it("copies with the clipboard", async () => {
    const writeText = vi.fn(async () => {});
    await expect(copyText("link", { writeText })).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("link");
  });

  it("reports failure when the clipboard is missing or refuses", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(copyText("link", undefined)).resolves.toBe(false);
    const writeText = vi.fn(async () => {
      throw new Error("denied");
    });
    await expect(copyText("link", { writeText })).resolves.toBe(false);
  });
});
