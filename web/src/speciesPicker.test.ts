import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Species } from "./species";
import { renderSpeciesPicker } from "./speciesPicker";

const wolf: Species = {
  id: "grey-wolf",
  commonName: "Grey wolf",
  scientificName: "Canis lupus",
};

let container: HTMLElement;

beforeEach(() => {
  container = document.createElement("div");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("renderSpeciesPicker", () => {
  it("shows a loading state until species arrive", async () => {
    let resolve: (species: Species[]) => void = () => {};
    const rendering = renderSpeciesPicker(
      container,
      () => new Promise((r) => (resolve = r)),
    );
    expect(container.textContent).toContain("Loading species");

    resolve([wolf]);
    await rendering;
    expect(container.textContent).not.toContain("Loading species");
    expect(container.querySelector("select")).not.toBeNull();
  });

  it("shows an empty state", async () => {
    await renderSpeciesPicker(container, async () => []);

    expect(container.textContent).toContain("No species available");
    expect(container.querySelector("select")).toBeNull();
  });

  it("shows a failed state that can retry", async () => {
    const load = vi
      .fn<() => Promise<Species[]>>()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce([wolf]);

    await renderSpeciesPicker(container, load);
    expect(container.textContent).toContain("Could not load species");

    container.querySelector("button")?.click();
    await vi.waitFor(() =>
      expect(container.querySelector("select")).not.toBeNull(),
    );
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("shows the chosen species", async () => {
    await renderSpeciesPicker(container, async () => [wolf]);

    const select = container.querySelector("select") as HTMLSelectElement;
    select.value = wolf.id;
    select.dispatchEvent(new Event("change"));
    expect(container.textContent).toContain("Grey wolf (Canis lupus)");

    select.value = "";
    select.dispatchEvent(new Event("change"));
    expect(container.textContent).not.toContain("Canis lupus");
  });
});
