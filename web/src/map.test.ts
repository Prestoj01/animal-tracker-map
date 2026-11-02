import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMap } from "./map";

type Handler = (event: { error?: Error }) => void;

const mock = vi.hoisted(() => ({
  handlers: new Map<string, (event: { error?: Error }) => void>(),
  layers: new Map<string, { paint: Record<string, unknown> }>(),
  sources: new Map<string, { data: { features: unknown[] } }>(),
  failToConstruct: false,
}));

// jsdom has no WebGL, so the real library cannot run here.
vi.mock("maplibre-gl", () => ({
  Map: class {
    constructor() {
      if (mock.failToConstruct) {
        throw new Error("WebGL unavailable");
      }
    }
    addControl() {}
    on(event: string, ...rest: [Handler] | [string, Handler]) {
      if (rest.length === 1) {
        mock.handlers.set(event, rest[0]);
      }
    }
    addSource(id: string, source: { data: { features: unknown[] } }) {
      mock.sources.set(id, source);
    }
    addLayer(layer: { id: string; paint: Record<string, unknown> }) {
      mock.layers.set(layer.id, layer);
    }
    getLayer(id: string) {
      return mock.layers.get(id);
    }
    removeLayer(id: string) {
      mock.layers.delete(id);
    }
    removeSource(id: string) {
      mock.sources.delete(id);
    }
  },
  NavigationControl: class {},
  Popup: class {
    remove() {}
  },
  setWorkerUrl: () => {},
}));
vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));

let status: HTMLElement;

function start() {
  return createMap(document.createElement("div"), status);
}

beforeEach(() => {
  mock.handlers.clear();
  mock.layers.clear();
  mock.sources.clear();
  mock.failToConstruct = false;
  status = document.createElement("p");
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("createMap", () => {
  it("shows loading until the map loads", () => {
    start();
    expect(status.hidden).toBe(false);
    expect(status.textContent).toContain("Loading map");

    mock.handlers.get("load")?.({});
    expect(status.hidden).toBe(true);
  });

  it("shows the failed state when the map errors before loading", () => {
    start();
    mock.handlers.get("error")?.({ error: new Error("style failed") });

    expect(status.textContent).toContain("could not be loaded");
  });

  it("shows the failed state when WebGL is unavailable, and ignores layers", () => {
    mock.failToConstruct = true;
    const map = start();

    expect(status.textContent).toContain("could not be loaded");
    expect(() => map.showSightings("lion", "Lion", "#000", [[1, 2]])).not.toThrow();
    expect(() => map.hideSightings("lion")).not.toThrow();
  });

  it("shows the failed state when loading times out", () => {
    start();
    vi.advanceTimersByTime(15000);

    expect(status.textContent).toContain("could not be loaded");
  });

  it("clears a timed-out failure if the map loads late", () => {
    start();
    vi.advanceTimersByTime(15000);
    mock.handlers.get("load")?.({});

    expect(status.hidden).toBe(true);
  });

  it("stays visible through errors after loading", () => {
    start();
    mock.handlers.get("load")?.({});
    mock.handlers.get("error")?.({ error: new Error("tile failed") });

    expect(status.hidden).toBe(true);
  });

  it("adds and removes a coloured layer", () => {
    const map = start();
    mock.handlers.get("load")?.({});

    map.showSightings("lion", "Lion", "#123456", [
      [1, 2],
      [3, 4],
    ]);
    const layer = mock.layers.get("sightings-lion");
    expect(layer?.paint["circle-color"]).toBe("#123456");
    expect(mock.sources.get("sightings-lion")?.data.features).toHaveLength(2);

    map.hideSightings("lion");
    expect(mock.layers.size).toBe(0);
    expect(mock.sources.size).toBe(0);
  });

  it("waits for the map to load before adding layers", () => {
    const map = start();

    map.showSightings("lion", "Lion", "#123456", [[1, 2]]);
    expect(mock.layers.size).toBe(0);

    mock.handlers.get("load")?.({});
    expect(mock.layers.has("sightings-lion")).toBe(true);
  });

  it("drops a waiting layer if it is hidden before the map loads", () => {
    const map = start();

    map.showSightings("lion", "Lion", "#123456", [[1, 2]]);
    map.hideSightings("lion");
    mock.handlers.get("load")?.({});

    expect(mock.layers.size).toBe(0);
  });
});
