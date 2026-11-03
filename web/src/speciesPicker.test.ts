import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Species } from "./species";
import { speciesIcon } from "./speciesIcons";
import { renderSpeciesPicker, SERIES_COLORS } from "./speciesPicker";

const manySpecies: Species[] = Array.from({ length: 10 }, (_, index) => ({
  id: `s${index}`,
  commonName: `Species ${index}`,
  scientificName: `Scientific ${index}`,
}));

let container: HTMLElement;
const handlers = { onSelect: vi.fn(), onDeselect: vi.fn() };

function checkbox(id: string): HTMLInputElement {
  return container.querySelector(`input[value="${id}"]`) as HTMLInputElement;
}

function toggle(id: string): void {
  checkbox(id).click();
}

function clearButton(): HTMLButtonElement {
  return Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent === "Clear all",
  ) as HTMLButtonElement;
}

beforeEach(() => {
  container = document.createElement("div");
  // Clicks only toggle checkboxes that are attached to the document.
  document.body.replaceChildren(container);
  handlers.onSelect.mockReset();
  handlers.onDeselect.mockReset();
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
      handlers,
    );
    expect(container.textContent).toContain("Loading animals");

    resolve(manySpecies);
    await rendering;
    expect(container.textContent).not.toContain("Loading animals");
    expect(container.querySelectorAll("input[type=checkbox]")).toHaveLength(10);
  });

  it("shows an empty state", async () => {
    await renderSpeciesPicker(container, async () => [], handlers);

    expect(container.textContent).toContain("No animals available");
    expect(container.querySelector("input")).toBeNull();
  });

  it("shows a failed state that can retry", async () => {
    const load = vi
      .fn<() => Promise<Species[]>>()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(manySpecies);

    await renderSpeciesPicker(container, load, handlers);
    expect(container.textContent).toContain("Could not load animals");

    container.querySelector("button")?.click();
    await vi.waitFor(() => expect(container.querySelector("input")).not.toBeNull());
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("gives each selected species its own colour", async () => {
    await renderSpeciesPicker(container, async () => manySpecies, handlers);

    toggle("s0");
    toggle("s1");

    const colors = handlers.onSelect.mock.calls.map((call) => call[1]);
    expect(colors).toEqual(SERIES_COLORS.slice(0, 2));
  });

  it("keeps colours stable and reuses freed ones", async () => {
    await renderSpeciesPicker(container, async () => manySpecies, handlers);

    toggle("s0");
    toggle("s1");
    toggle("s0");
    expect(handlers.onDeselect).toHaveBeenCalledWith(manySpecies[0]);

    toggle("s2");
    expect(handlers.onSelect.mock.lastCall?.[1]).toBe(SERIES_COLORS[0]);
    // s1 was never repainted.
    expect(handlers.onSelect.mock.calls[1][1]).toBe(SERIES_COLORS[1]);
  });

  it("stops at the colour limit and frees up after a deselect", async () => {
    await renderSpeciesPicker(container, async () => manySpecies, handlers);

    expect(container.textContent).toContain(`pick up to ${SERIES_COLORS.length}`);
    SERIES_COLORS.forEach((_, index) => toggle(`s${index}`));
    expect(checkbox("s9").disabled).toBe(true);
    expect(container.textContent).toContain(
      `${SERIES_COLORS.length} of ${SERIES_COLORS.length} picked`,
    );
    expect(checkbox("s0").disabled).toBe(false);

    toggle("s0");
    expect(checkbox("s9").disabled).toBe(false);
  });

  it("shows status text and a retry button for a row", async () => {
    await renderSpeciesPicker(container, async () => manySpecies, handlers);
    toggle("s0");
    const status = handlers.onSelect.mock.calls[0][2];
    const retry = vi.fn();

    status.set("Could not load", retry);
    expect(container.textContent).toContain("Could not load");
    (container.querySelector(".species-status button") as HTMLButtonElement).click();
    expect(retry).toHaveBeenCalled();

    toggle("s0");
    expect(container.textContent).not.toContain("Could not load");
  });

  it("shows each species as a card with an icon, outlined in its colour when picked", async () => {
    await renderSpeciesPicker(container, async () => manySpecies, handlers);

    const card = checkbox("s0").closest(".species-card") as HTMLElement;
    expect(card.querySelector(".card-icon")?.textContent).toBe(speciesIcon("s0"));
    toggle("s0");
    expect(card.style.getPropertyValue("--series")).toBe(SERIES_COLORS[0]);
    toggle("s0");
    expect(card.style.getPropertyValue("--series")).toBe("");
  });

  it("clears the whole selection", async () => {
    await renderSpeciesPicker(container, async () => manySpecies, handlers);
    expect(clearButton().disabled).toBe(true);

    toggle("s0");
    toggle("s1");
    clearButton().click();

    expect(handlers.onDeselect).toHaveBeenCalledTimes(2);
    expect(checkbox("s0").checked).toBe(false);
    expect(clearButton().disabled).toBe(true);
  });
});
