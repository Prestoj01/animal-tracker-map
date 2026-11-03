import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMap } from "./map";

type Handler = (event: { error?: Error }) => void;
interface FakeFeature {
  geometry: { type: string };
  properties: Record<string, string>;
}
interface FakeLayer {
  id: string;
  type: string;
  paint: Record<string, unknown>;
  layout: { visibility: string };
}

const mock = vi.hoisted(() => ({
  handlers: new Map<string, (event: { error?: Error }) => void>(),
  layerOrder: [] as string[],
  layers: new Map<string, FakeLayer>(),
  sources: new Map<string, { data: { features: FakeFeature[] } }>(),
  images: new Map<string, { width: number }>(),
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
    addSource(id: string, source: { data: { features: FakeFeature[] } }) {
      mock.sources.set(id, { data: source.data });
    }
    getSource(id: string) {
      const source = mock.sources.get(id);
      return (
        source && {
          setData(data: { features: FakeFeature[] }) {
            source.data = data;
          },
        }
      );
    }
    getStyle() {
      return { layers: mock.layerOrder.map((id) => ({ id, type: mock.layers.get(id)?.type })) };
    }
    hasImage(id: string) {
      return mock.images.has(id);
    }
    addImage(id: string, image: { width: number }) {
      mock.images.set(id, image);
    }
    addLayer(layer: FakeLayer, beforeId?: string) {
      mock.layers.set(layer.id, layer);
      const index = beforeId ? mock.layerOrder.indexOf(beforeId) : -1;
      mock.layerOrder.splice(index < 0 ? mock.layerOrder.length : index, 0, layer.id);
    }
    removeLayer(id: string) {
      mock.layers.delete(id);
      mock.layerOrder = mock.layerOrder.filter((layer) => layer !== id);
    }
    removeSource(id: string) {
      mock.sources.delete(id);
    }
    setLayoutProperty(id: string, _name: string, value: string) {
      const layer = mock.layers.get(id);
      if (layer) {
        layer.layout.visibility = value;
      }
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

function loadedMap() {
  const map = start();
  mock.handlers.get("load")?.({});
  return map;
}

beforeEach(() => {
  mock.handlers.clear();
  mock.layers.clear();
  mock.layerOrder = [];
  mock.sources.clear();
  mock.images.clear();
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
    expect(() => map.showTracks("lion", "Lion", "#000", [])).not.toThrow();
    expect(() => map.hideSpecies("lion")).not.toThrow();
    expect(() => map.setKindVisible("tracks", false)).not.toThrow();
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
    loadedMap();
    mock.handlers.get("error")?.({ error: new Error("tile failed") });

    expect(status.hidden).toBe(true);
  });

  it("draws sightings as a filled area and tracks as coloured lines", () => {
    const map = loadedMap();

    map.showSightings("lion", "Lion", "#123456", [[36.5, -1.5]]);
    map.showTracks("lion", "Lion", "#123456", [
      [
        [1, 2],
        [3, 4],
      ],
    ]);

    expect(mock.layers.get("sightings-regions")?.paint["fill-pattern"]).toEqual([
      "get",
      "pattern",
    ]);
    const [area] = mock.sources.get("sightings-regions")?.data.features ?? [];
    expect(area.geometry.type).toBe("MultiPolygon");
    expect(area.properties.names).toBe("Lion");
    expect(mock.images.has(area.properties.pattern)).toBe(true);
    expect(mock.layers.get("tracks-lion")?.paint["line-color"]).toBe("#123456");
    expect(mock.sources.get("tracks-lion")?.data.features[0].geometry.type).toBe("LineString");
  });

  it("stripes an area two animals share", () => {
    const map = loadedMap();

    map.showSightings("lion", "Lion", "#123456", [[36.5, -1.5]]);
    map.showSightings("leopard", "Leopard", "#654321", [[36.5, -1.5]]);

    const names = mock.sources
      .get("sightings-regions")
      ?.data.features.map((feature) => feature.properties.names);
    expect(names).toEqual(["Lion & Leopard"]);
    expect(mock.images.size).toBe(2);
  });

  it("removes a species' area and tracks when it is hidden", () => {
    const map = loadedMap();
    map.showSightings("lion", "Lion", "#123456", [[36.5, -1.5]]);
    map.showSightings("leopard", "Leopard", "#654321", [[50.5, 10.5]]);
    map.showTracks("lion", "Lion", "#123456", [
      [
        [1, 2],
        [3, 4],
      ],
    ]);

    map.hideSpecies("lion");

    const names = mock.sources
      .get("sightings-regions")
      ?.data.features.map((feature) => feature.properties.names);
    expect(names).toEqual(["Leopard"]);
    expect(mock.layers.has("tracks-lion")).toBe(false);
  });

  it("draws areas and tracks beneath the basemap's place names", () => {
    const map = loadedMap();
    mock.layers.set("place-labels", { id: "place-labels", type: "symbol", paint: {}, layout: { visibility: "visible" } });
    mock.layerOrder.push("place-labels");

    map.showTracks("wolf", "Wolf", "#654321", [
      [
        [1, 2],
        [3, 4],
      ],
    ]);
    map.showSightings("lion", "Lion", "#123456", [[1, 2]]);

    expect(mock.layerOrder).toEqual(["sightings-regions", "tracks-wolf", "place-labels"]);
  });

  it("draws areas underneath tracks", () => {
    const map = loadedMap();

    map.showTracks("wolf", "Wolf", "#654321", [
      [
        [1, 2],
        [3, 4],
      ],
    ]);
    map.showSightings("lion", "Lion", "#123456", [[1, 2]]);

    expect(mock.layerOrder).toEqual(["sightings-regions", "tracks-wolf"]);
  });

  it("splits tracks that cross the 180° meridian", () => {
    const map = loadedMap();

    map.showTracks("whale", "Whale", "#000", [
      [
        [170, 0],
        [179, 0],
        [-179, 0],
        [-170, 0],
      ],
    ]);

    expect(mock.sources.get("tracks-whale")?.data.features).toHaveLength(2);
  });

  it("hides and shows each kind of layer, including ones added later", () => {
    const map = loadedMap();
    map.showTracks("lion", "Lion", "#000", [
      [
        [1, 2],
        [3, 4],
      ],
    ]);

    map.setKindVisible("tracks", false);
    expect(mock.layers.get("tracks-lion")?.layout.visibility).toBe("none");

    map.showTracks("wolf", "Wolf", "#000", [
      [
        [1, 2],
        [3, 4],
      ],
    ]);
    map.showSightings("wolf", "Wolf", "#000", [[1, 2]]);
    expect(mock.layers.get("tracks-wolf")?.layout.visibility).toBe("none");
    expect(mock.layers.get("sightings-regions")?.layout.visibility).toBe("visible");

    map.setKindVisible("tracks", true);
    expect(mock.layers.get("tracks-lion")?.layout.visibility).toBe("visible");
  });

  it("waits for the map to load before adding layers", () => {
    const map = start();

    map.showSightings("lion", "Lion", "#123456", [[1, 2]]);
    expect(mock.layers.size).toBe(0);

    mock.handlers.get("load")?.({});
    expect(mock.layers.has("sightings-regions")).toBe(true);
  });

  it("drops waiting layers if the species is hidden before the map loads", () => {
    const map = start();

    map.showSightings("lion", "Lion", "#123456", [[1, 2]]);
    map.showTracks("lion", "Lion", "#123456", [
      [
        [1, 2],
        [3, 4],
      ],
    ]);
    map.hideSpecies("lion");
    mock.handlers.get("load")?.({});

    expect(mock.layers.has("tracks-lion")).toBe(false);
    expect(mock.sources.get("sightings-regions")?.data.features ?? []).toEqual([]);
  });
});
