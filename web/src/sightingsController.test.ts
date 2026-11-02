import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Sightings } from "./sightings";
import { createSightingsController } from "./sightingsController";

const lion = { id: "lion", commonName: "Lion", scientificName: "Panthera leo" };
const result: Sightings = { speciesId: "lion", totalRecords: 9, points: [[1, 2]] };

const map = { showSightings: vi.fn(), hideSightings: vi.fn() };
const status = { set: vi.fn() };
let legend: HTMLElement;

function flush() {
  return new Promise((resolve) => setTimeout(resolve));
}

beforeEach(() => {
  map.showSightings.mockReset();
  map.hideSightings.mockReset();
  status.set.mockReset();
  legend = document.createElement("ul");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createSightingsController", () => {
  it("shows loading, then draws the sightings and a legend entry", async () => {
    const controller = createSightingsController(map, async () => result, legend);

    controller.onSelect(lion, "#123456", status);
    expect(status.set).toHaveBeenCalledWith("Loading…");

    await flush();
    expect(map.showSightings).toHaveBeenCalledWith("lion", "Lion", "#123456", [[1, 2]]);
    expect(status.set).toHaveBeenLastCalledWith("1 places");
    expect(legend.textContent).toBe("Lion");
    expect(legend.hidden).toBe(false);
  });

  it("shows an empty state when a species has no points", async () => {
    const controller = createSightingsController(
      map,
      async () => ({ ...result, points: [] }),
      legend,
    );

    controller.onSelect(lion, "#123456", status);
    await flush();

    expect(status.set).toHaveBeenLastCalledWith("No sightings");
    expect(map.showSightings).not.toHaveBeenCalled();
  });

  it("shows a failed state, and retrying fetches again", async () => {
    const load = vi
      .fn<() => Promise<Sightings>>()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(result);
    const controller = createSightingsController(map, load, legend);

    controller.onSelect(lion, "#123456", status);
    await flush();
    const [text, retry] = status.set.mock.lastCall as [string, () => void];
    expect(text).toBe("Could not load");

    retry();
    await flush();
    expect(load).toHaveBeenCalledTimes(2);
    expect(map.showSightings).toHaveBeenCalled();
  });

  it("ignores a response that arrives after deselecting", async () => {
    let resolve: (value: Sightings) => void = () => {};
    const controller = createSightingsController(
      map,
      () => new Promise((r) => (resolve = r)),
      legend,
    );

    controller.onSelect(lion, "#123456", status);
    controller.onDeselect(lion);
    resolve(result);
    await flush();

    expect(map.showSightings).not.toHaveBeenCalled();
    expect(legend.hidden).toBe(true);
  });

  it("removes the species on deselect and reuses cached data", async () => {
    const load = vi.fn(async () => result);
    const controller = createSightingsController(map, load, legend);

    controller.onSelect(lion, "#123456", status);
    await flush();
    controller.onDeselect(lion);
    expect(map.hideSightings).toHaveBeenCalledWith("lion");
    expect(legend.hidden).toBe(true);

    controller.onSelect(lion, "#abcdef", status);
    await flush();
    expect(load).toHaveBeenCalledTimes(1);
    expect(map.showSightings).toHaveBeenLastCalledWith("lion", "Lion", "#abcdef", [[1, 2]]);
  });
});
