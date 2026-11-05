import { afterEach, describe, expect, it, vi } from "vitest";
import { createLazyMap } from "./lazyMap";
import type { SightingsMap } from "./map";

function fakeMap() {
  return {
    showSightings: vi.fn(),
    showTracks: vi.fn(),
    hideSpecies: vi.fn(),
    setKindVisible: vi.fn(),
    showYouAreHere: vi.fn(),
    playTracks: vi.fn(() => () => {}),
  };
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createLazyMap", () => {
  it("holds calls until the map loads, then replays them in order", async () => {
    let resolve: (map: SightingsMap) => void = () => {};
    const lazy = createLazyMap(new Promise((r) => (resolve = r)), vi.fn());
    const real = fakeMap();
    const order: string[] = [];
    real.showSightings.mockImplementation(() => order.push("show"));
    real.hideSpecies.mockImplementation(() => order.push("hide"));

    lazy.showSightings("lion", "Lion", "#000", [[1, 2]]);
    lazy.hideSpecies("lion");
    expect(order).toEqual([]);

    resolve(real);
    await flush();
    expect(order).toEqual(["show", "hide"]);
    expect(real.showSightings).toHaveBeenCalledWith("lion", "Lion", "#000", [[1, 2]]);
  });

  it("forwards calls straight away once loaded", async () => {
    const real = fakeMap();
    const lazy = createLazyMap(Promise.resolve(real), vi.fn());
    await flush();

    lazy.setKindVisible("tracks", false);
    expect(real.setKindVisible).toHaveBeenCalledWith("tracks", false);
  });

  it("ends a replay at once if the map isn't there yet, and forwards it after", async () => {
    let resolve: (map: SightingsMap) => void = () => {};
    const lazy = createLazyMap(new Promise((r) => (resolve = r)), vi.fn());
    const onEnd = vi.fn();

    lazy.playTracks({ onProgress: vi.fn(), onEnd });
    expect(onEnd).toHaveBeenCalled();

    const real = fakeMap();
    resolve(real);
    await flush();
    lazy.playTracks({ onProgress: vi.fn(), onEnd });
    expect(real.playTracks).toHaveBeenCalled();
  });

  it("reports a map that fails to load, and drops waiting calls", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const onFail = vi.fn();
    const lazy = createLazyMap(Promise.reject(new Error("offline")), onFail);

    lazy.showSightings("lion", "Lion", "#000", [[1, 2]]);
    await flush();

    expect(onFail).toHaveBeenCalledWith(expect.objectContaining({ message: "offline" }));
    expect(() => lazy.hideSpecies("lion")).not.toThrow();
  });
});
