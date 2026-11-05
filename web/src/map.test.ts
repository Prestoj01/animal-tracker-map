import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMap } from "./map";
import { ALL_YEARS, PERIODS } from "./timeline";
import type { Track, TrackPoint } from "./tracks";

type Handler = (event: { error?: Error }) => void;
interface FakeFeature {
  geometry: { type: string; coordinates: unknown };
  properties: Record<string, unknown>;
}
interface FakeLayer {
  id: string;
  paint: Record<string, unknown>;
  layout: { visibility: string };
  filter?: unknown;
}

const mock = vi.hoisted(() => ({
  handlers: new Map<string, (event: { error?: Error }) => void>(),
  layerOrder: [] as string[],
  layers: new Map<string, FakeLayer>(),
  sources: new Map<string, { data: { features: FakeFeature[] } }>(),
  failToConstruct: false,
  fits: [] as unknown[],
  projection: null as unknown,
  center: 0,
  eases: 0,
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
    fitBounds(bounds: unknown) {
      mock.fits.push(bounds);
    }
    setPaintProperty(id: string, name: string, value: unknown) {
      const layer = mock.layers.get(id);
      if (layer) {
        layer.paint[name] = value;
      }
    }
    getLayer(id: string) {
      return mock.layers.get(id);
    }
    setProjection(projection: unknown) {
      mock.projection = projection;
    }
    setSky() {}
    getCenter() {
      return { lng: mock.center, lat: 0 };
    }
    easeTo({ center }: { center: { lng: number } }) {
      mock.center = center.lng;
      mock.eases += 1;
    }
    setFilter(id: string, filter: unknown) {
      const layer = mock.layers.get(id);
      if (layer) {
        layer.filter = filter;
      }
    }
    getPaintProperty(id: string, name: string) {
      return mock.layers.get(id)?.paint[name];
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

/** A track whose points are one day apart. */
function line(...points: [number, number][]): Track {
  return {
    animal: "Rain",
    start: "2020-01-01",
    points: points.map(([longitude, latitude], day): TrackPoint => [longitude, latitude, day]),
  };
}

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
  mock.failToConstruct = false;
  mock.fits = [];
  mock.projection = null;
  mock.center = 0;
  mock.eases = 0;
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

  it("adds coloured sightings and tracks, and removes both", () => {
    const map = loadedMap();

    map.showSightings("lion", "Lion", "#123456", [
      [1, 2],
      [3, 4],
    ]);
    map.showTracks("lion", "Lion", "#123456", [line([1, 2], [3, 4])]);
    expect(mock.layers.get("sightings-lion")?.paint["circle-color"]).toBe("#123456");
    expect(mock.layers.get("tracks-lion")?.paint["line-color"]).toBe("#123456");
    expect(mock.sources.get("sightings-lion")?.data.features).toHaveLength(2);
    expect(mock.sources.get("tracks-lion")?.data.features[0].geometry.type).toBe("LineString");

    map.hideSpecies("lion");
    expect(mock.layers.size).toBe(0);
    expect(mock.sources.size).toBe(0);
  });

  it("draws tracks underneath sightings", () => {
    const map = loadedMap();

    map.showSightings("lion", "Lion", "#123456", [[1, 2]]);
    map.showTracks("wolf", "Wolf", "#654321", [line([1, 2], [3, 4])]);

    expect(mock.layerOrder).toEqual(["tracks-wolf", "sightings-lion"]);
  });

  it("splits tracks that cross the 180° meridian", () => {
    const map = loadedMap();

    map.showTracks("whale", "Whale", "#000", [line([170, 0], [179, 0], [-179, 0], [-170, 0])]);

    expect(mock.sources.get("tracks-whale")?.data.features).toHaveLength(2);
  });

  it("hides and shows each kind of layer, including ones added later", () => {
    const map = loadedMap();
    map.showTracks("lion", "Lion", "#000", [line([1, 2], [3, 4])]);

    map.setKindVisible("tracks", false);
    expect(mock.layers.get("tracks-lion")?.layout.visibility).toBe("none");

    map.showTracks("wolf", "Wolf", "#000", [line([1, 2], [3, 4])]);
    map.showSightings("wolf", "Wolf", "#000", [[1, 2]]);
    expect(mock.layers.get("tracks-wolf")?.layout.visibility).toBe("none");
    expect(mock.layers.get("sightings-wolf")?.layout.visibility).toBe("visible");

    map.setKindVisible("tracks", true);
    expect(mock.layers.get("tracks-lion")?.layout.visibility).toBe("visible");
  });

  it("waits for the map to load before adding layers", () => {
    const map = start();

    map.showSightings("lion", "Lion", "#123456", [[1, 2]]);
    expect(mock.layers.size).toBe(0);

    mock.handlers.get("load")?.({});
    expect(mock.layers.has("sightings-lion")).toBe(true);
  });

  it("drops waiting layers if the species is hidden before the map loads", () => {
    const map = start();

    map.showSightings("lion", "Lion", "#123456", [[1, 2]]);
    map.showTracks("lion", "Lion", "#123456", [line([1, 2], [3, 4])]);
    map.hideSpecies("lion");
    mock.handlers.get("load")?.({});

    expect(mock.layers.size).toBe(0);
  });

  it("frames every picked animal once its data has arrived", () => {
    const map = loadedMap();

    map.showSightings("lion", "Lion", "#000", [
      [10, -5],
      [30, 5],
    ]);
    map.showTracks("lion", "Lion", "#000", [line([20, -20], [25, -10])]);
    map.showSightings("wolf", "Wolf", "#111", [[-100, 50]]);
    expect(mock.fits).toEqual([]);

    vi.advanceTimersByTime(250);
    expect(mock.fits).toEqual([
      [
        [-100, -20],
        [30, 50],
      ],
    ]);
  });

  it("forgets a hidden animal's area without moving the map", () => {
    const map = loadedMap();
    map.showSightings("lion", "Lion", "#000", [[10, -5]]);
    map.showSightings("wolf", "Wolf", "#111", [[-100, 50]]);
    vi.advanceTimersByTime(250);

    map.hideSpecies("wolf");
    vi.advanceTimersByTime(250);
    expect(mock.fits).toHaveLength(1);

    map.showSightings("tiger", "Tiger", "#222", [[80, 20]]);
    vi.advanceTimersByTime(250);
    expect(mock.fits.at(-1)).toEqual([
      [10, -5],
      [80, 20],
    ]);
  });

  it("labels each track with its animal and dates", () => {
    const map = loadedMap();

    map.showTracks("lion", "Lion", "#000", [
      { animal: "Rain", start: "2014-05-31", points: [[1, 2, 0], [3, 4, 400]] },
    ]);

    const [feature] = mock.sources.get("tracks-lion")?.data.features ?? [];
    expect(feature.properties.label).toBe("Lion · Rain · May 2014 – Jul 2015");
  });

  it("tells the page when the map gains its first track and loses its last", () => {
    const onTracksChange = vi.fn();
    const map = createMap(document.createElement("div"), status, { onTracksChange });
    mock.handlers.get("load")?.({});

    map.showTracks("lion", "Lion", "#000", [line([1, 2], [3, 4])]);
    map.showTracks("wolf", "Wolf", "#111", [line([1, 2], [3, 4])]);
    map.hideSpecies("lion");
    expect(onTracksChange.mock.calls).toEqual([[true], [true]]);

    map.hideSpecies("wolf");
    expect(onTracksChange).toHaveBeenLastCalledWith(false);
  });

  it("replays tracks from their start, with a moving dot, then restores them", () => {
    const map = loadedMap();
    map.showTracks("lion", "Lion", "#123456", [line([0, 0], [10, 0], [20, 0])]);
    const onProgress = vi.fn();
    const onEnd = vi.fn();

    map.playTracks({ onProgress, onEnd });
    vi.advanceTimersByTime(6000);

    // Frames land every 33 ms, so "halfway" is a hair short of the middle fix.
    const halfway = mock.sources.get("tracks-lion")?.data.features[0].geometry
      .coordinates as number[][];
    expect(halfway).toHaveLength(2);
    expect(halfway[1][0]).toBeCloseTo(10, 0);
    const [head] = mock.sources.get("tracks-replay-heads")?.data.features ?? [];
    expect((head.geometry.coordinates as number[])[0]).toBeCloseTo(10, 0);
    expect(head.properties.color).toBe("#123456");
    expect(onProgress.mock.lastCall?.[0]).toBeCloseTo(0.5, 1);

    vi.advanceTimersByTime(7000);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(mock.sources.get("tracks-lion")?.data.features[0].geometry.coordinates).toHaveLength(3);
    expect(mock.sources.get("tracks-replay-heads")?.data.features).toEqual([]);
  });

  it("can stop a replay early, and ends at once with nothing to play", () => {
    const map = loadedMap();
    const onEnd = vi.fn();
    map.playTracks({ onProgress: vi.fn(), onEnd });
    expect(onEnd).toHaveBeenCalledTimes(1);

    map.showTracks("lion", "Lion", "#000", [line([0, 0], [10, 0], [20, 0])]);
    const stop = map.playTracks({ onProgress: vi.fn(), onEnd });
    vi.advanceTimersByTime(1000);
    stop();
    expect(onEnd).toHaveBeenCalledTimes(2);
    expect(mock.sources.get("tracks-lion")?.data.features[0].geometry.coordinates).toHaveLength(3);
  });

  it("shows the world as a globe that turns until someone touches it", () => {
    loadedMap();
    expect(mock.projection).toEqual({ type: "globe" });
    expect(mock.eases).toBe(1);
    expect(mock.center).toBeLessThan(0);

    mock.handlers.get("moveend")?.({});
    expect(mock.eases).toBe(2);

    mock.handlers.get("mousedown")?.({});
    mock.handlers.get("moveend")?.({});
    expect(mock.eases).toBe(2);
  });

  it("stops turning once an animal is shown", () => {
    const map = loadedMap();
    map.showSightings("lion", "Lion", "#000", [[1, 2]]);

    mock.handlers.get("moveend")?.({});
    expect(mock.eases).toBe(1);
  });

  it("stays still for people who prefer reduced motion", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const map = loadedMap();
    map.showSightings("lion", "Lion", "#000", [[1, 2]]);

    expect(mock.eases).toBe(0);
    expect(mock.layers.get("sightings-lion")?.paint["circle-radius"]).toBe(4);
    vi.unstubAllGlobals();
  });

  it("grows new dots from nothing to full size", () => {
    const map = loadedMap();
    map.showSightings("lion", "Lion", "#000", [[1, 2]]);
    expect(mock.layers.get("sightings-lion")?.paint["circle-radius"]).toBe(0);

    vi.advanceTimersByTime(20);
    expect(mock.layers.get("sightings-lion")?.paint["circle-radius"]).toBe(4);
  });

  it("frames animals picked before the map has loaded once it loads", () => {
    const map = start();
    map.showSightings("lion", "Lion", "#000", [
      [10, -5],
      [30, 5],
    ]);
    vi.advanceTimersByTime(250);
    expect(mock.fits).toEqual([]);

    mock.handlers.get("load")?.({});
    expect(mock.fits).toEqual([
      [
        [10, -5],
        [30, 5],
      ],
    ]);
  });

  it("marks the reader's location above every animal and frames it", () => {
    const map = start();
    map.showYouAreHere([10, 20]);
    expect(mock.layers.has("you-are-here")).toBe(false);

    mock.handlers.get("load")?.({});
    expect(mock.layers.has("you-are-here")).toBe(true);
    map.showSightings("lion", "Lion", "#f00", [[1, 2]]);
    map.showTracks("lion", "Lion", "#f00", [line([1, 2], [3, 4])]);
    expect(mock.layerOrder.at(-1)).toBe("you-are-here");

    vi.advanceTimersByTime(1000);
    expect(mock.fits.at(-1)).toEqual([
      [1, 2],
      [10, 20],
    ]);

    // Switching animals' layers off leaves the marker.
    map.setKindVisible("sightings", false);
    expect(mock.layers.get("you-are-here")?.layout).toBeUndefined();
  });

  it("tags sightings with their year and filters them by period", () => {
    const map = loadedMap();
    map.showSightings("lion", "Lion", "#f00", [[1, 2, 1995], [3, 4, null], [5, 6]]);
    expect(
      mock.sources.get("sightings-lion")?.data.features.map((feature) => feature.properties),
    ).toEqual([{ year: 1995 }, {}, {}]);
    expect(mock.layers.get("sightings-lion")?.filter).toBeUndefined();

    const nineties = PERIODS.find((period) => period.label === "1990s")!;
    map.setPeriod(nineties);
    const filter = [
      "all",
      ["has", "year"],
      [">=", ["get", "year"], 1990],
      ["<=", ["get", "year"], 1999],
    ];
    expect(mock.layers.get("sightings-lion")?.filter).toEqual(filter);

    // Animals added later get the same filter; tracks never do.
    map.showSightings("tiger", "Tiger", "#0f0", [[7, 8, 2001]]);
    map.showTracks("tiger", "Tiger", "#0f0", [line([1, 2], [3, 4])]);
    expect(mock.layers.get("sightings-tiger")?.filter).toEqual(filter);
    expect(mock.layers.get("tracks-tiger")?.filter).toBeUndefined();

    map.setPeriod(ALL_YEARS);
    expect(mock.layers.get("sightings-lion")?.filter).toBeNull();
  });
});
