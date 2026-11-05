import {
  Map as MapLibreMap,
  NavigationControl,
  Popup,
  setWorkerUrl,
  type GeoJSONSource,
  type LayerSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// MapLibre ships its worker as a separate file, which the bundler only emits if imported.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import type { Point } from "./sightings";
import { splitAtAntimeridian, trackLabel, trackSoFar, type Track } from "./tracks";

setWorkerUrl(workerUrl);

// OpenFreeMap needs no API key or account, which keeps the map at $0.
const STYLE_URL = "https://tiles.openfreemap.org/styles/dark";
const LOAD_TIMEOUT_MS = 15000;
// Waits for an animal's sightings and tracks to both arrive before moving once.
const FIT_DELAY_MS = 250;
const PLAY_DURATION_MS = 12000;
// Redrawing every animal's line is costly, so the replay updates about 30 times a second.
const PLAY_FRAME_MS = 33;
const DOT_RADIUS = 4;
// One full turn of the globe on the start screen takes this long.
const SPIN_SECONDS_PER_TURN = 120;

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}
const FAILED_MESSAGE = "The map could not be loaded. Check your connection and reload the page.";

export type LayerKind = "sightings" | "tracks";

export interface SightingsMap {
  showSightings(id: string, name: string, color: string, points: Point[]): void;
  showTracks(id: string, name: string, color: string, tracks: Track[]): void;
  /** Removes both kinds of layer for a species. */
  hideSpecies(id: string): void;
  setKindVisible(kind: LayerKind, visible: boolean): void;
  /** Marks the reader's own location, and keeps it in view alongside the animals. */
  showYouAreHere(point: Point): void;
  /** Replays every track on the map from its start; returns a way to stop early. */
  playTracks(handlers: { onProgress(progress: number): void; onEnd(): void }): () => void;
}

export interface MapOptions {
  /** Called whenever the map gains its first track or loses its last. */
  onTracksChange?: (hasTracks: boolean) => void;
}

function layerId(kind: LayerKind, id: string): string {
  return `${kind}-${id}`;
}

/** Creates the map, reporting its loading and failed states in `status`. */
export function createMap(
  container: HTMLElement,
  status: HTMLElement,
  { onTracksChange = () => {} }: MapOptions = {},
): SightingsMap {
  const show = (text: string) => {
    status.textContent = text;
    status.hidden = false;
  };

  show("Loading map…");

  let map: MapLibreMap;
  try {
    map = new MapLibreMap({
      container,
      style: STYLE_URL,
      center: [0, 20],
      // Large enough for the globe to fill the view on the start screen.
      zoom: 1.6,
      attributionControl: { customAttribution: "Sightings: GBIF.org | Tracks: Movebank" },
    });
  } catch (error) {
    // The constructor throws when the browser has no WebGL.
    console.error("Could not create the map", error);
    show(FAILED_MESSAGE);
    return {
      showSightings() {},
      showTracks() {},
      hideSpecies() {},
      showYouAreHere() {},
      setKindVisible() {},
      playTracks: ({ onEnd }) => {
        onEnd();
        return () => {};
      },
    };
  }

  map.addControl(new NavigationControl());

  // Keeps the map filling its container when the sidebar opens, closes or moves.
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(() => map.resize()).observe(container);
  }

  let loaded = false;
  const whenLoaded: (() => void)[] = [];
  const timer = setTimeout(() => {
    console.error("The map did not load in time");
    show(FAILED_MESSAGE);
  }, LOAD_TIMEOUT_MS);

  // A slowly turning globe until someone touches the map or picks an animal.
  let spinning = !prefersReducedMotion();
  const stopSpin = () => {
    spinning = false;
  };
  const spin = () => {
    if (!spinning) {
      return;
    }
    const center = map.getCenter();
    center.lng -= 360 / SPIN_SECONDS_PER_TURN;
    map.easeTo({ center, duration: 1000, easing: (t) => t });
  };
  for (const event of ["mousedown", "touchstart", "wheel", "dragstart"] as const) {
    map.on(event, stopSpin);
  }
  map.on("moveend", spin);

  map.on("load", () => {
    loaded = true;
    clearTimeout(timer);
    status.hidden = true;
    // Zoomed out the world is a globe; it flattens into a normal map as you zoom in.
    map.setProjection({ type: "globe" });
    map.setSky({
      "sky-color": "#0c1a2e",
      "horizon-color": "#1c3354",
      "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 5, 1, 7, 0],
    });
    whenLoaded.splice(0).forEach((run) => run());
    spin();
  });

  map.on("error", ({ error }) => {
    console.error("Map error", error);
    // After the first load this is usually one missing tile, not a broken map.
    if (!loaded) {
      clearTimeout(timer);
      show(FAILED_MESSAGE);
    }
  });

  const popup = new Popup({ closeButton: false, closeOnClick: false });
  const YOU = "you-are-here";

  // Each species' west, south, east and north edges, so the map can frame them all.
  const extents = new Map<string, [number, number, number, number]>();
  let fitTimer: ReturnType<typeof setTimeout> | undefined;

  const extend = (id: string, points: Point[]) => {
    for (const [longitude, latitude] of points) {
      const box = extents.get(id) ?? [longitude, latitude, longitude, latitude];
      extents.set(id, [
        Math.min(box[0], longitude),
        Math.min(box[1], latitude),
        Math.max(box[2], longitude),
        Math.max(box[3], latitude),
      ]);
    }
    clearTimeout(fitTimer);
    stopSpin();
    const fit = () => {
      const boxes = [...extents.values()];
      if (boxes.length === 0) {
        return;
      }
      // Animals picked before the map is ready, such as from a shared link, are
      // framed once it is.
      if (!loaded) {
        whenLoaded.push(fit);
        return;
      }
      const reduceMotion = prefersReducedMotion();
      map.fitBounds(
        [
          [Math.min(...boxes.map((box) => box[0])), Math.min(...boxes.map((box) => box[1]))],
          [Math.max(...boxes.map((box) => box[2])), Math.max(...boxes.map((box) => box[3]))],
        ],
        { padding: 48, maxZoom: 5, duration: reduceMotion ? 0 : 1200 },
      );
    };
    fitTimer = setTimeout(fit, FIT_DELAY_MS);
  };
  const visible: Record<LayerKind, boolean> = { sightings: true, tracks: true };
  const layers = new Set<string>();
  // Layers added before the map loads wait here, and can be cancelled by a hide.
  const pending = new Map<string, () => void>();

  const add = (
    kind: LayerKind,
    id: string,
    label: string | null,
    features: GeoJSON.Feature[],
    paint: LayerSpecification["paint"],
  ) => {
    const layer = layerId(kind, id);
    map.addSource(layer, { type: "geojson", data: { type: "FeatureCollection", features } });
    // Tracks go under every sightings layer, so dots stay on top of lines, and
    // the reader's own marker stays on top of everything.
    const you = map.getLayer(YOU) ? YOU : undefined;
    const firstSightings = [...layers].find((name) => name.startsWith("sightings-")) ?? you;
    map.addLayer(
      {
        id: layer,
        type: kind === "sightings" ? "circle" : "line",
        source: layer,
        paint,
        layout: { visibility: visible[kind] ? "visible" : "none" },
      } as LayerSpecification,
      kind === "tracks" ? firstSightings : you,
    );
    layers.add(layer);
    if (kind === "sightings" && !prefersReducedMotion()) {
      // Dots start as points and grow to full size, rather than popping in. The
      // change waits a frame so the starting size is drawn first.
      requestAnimationFrame(() => {
        if (map.getLayer(layer)) {
          map.setPaintProperty(layer, "circle-radius", DOT_RADIUS);
        }
      });
    }
    // Naming the species on hover means identity never depends on colour alone.
    map.on("mousemove", layer, (event) => {
      map.getCanvas().style.cursor = "pointer";
      // Tracks carry their own label: the animal's name and dates.
      const text = label ?? String(event.features?.[0]?.properties?.label ?? "");
      popup.setLngLat(event.lngLat).setText(text).addTo(map);
    });
    map.on("mouseleave", layer, () => {
      map.getCanvas().style.cursor = "";
      popup.remove();
    });
  };

  const trackData = new Map<string, { name: string; tracks: Track[] }>();

  /** Lines for each track as far as `progress` through its own timespan. */
  const trackFeatures = (name: string, tracks: Track[], progress: number) =>
    tracks.flatMap((track) => {
      const label = trackLabel(name, track);
      const line =
        progress >= 1
          ? track.points.map(([lon, lat]): Point => [lon, lat])
          : trackSoFar(track, progress).line;
      return splitAtAntimeridian(line).map(
        (coordinates): GeoJSON.Feature => ({
          type: "Feature",
          properties: { label },
          geometry: { type: "LineString", coordinates },
        }),
      );
    });

  const HEADS = layerId("tracks", "replay-heads");
  const GLOW = layerId("tracks", "replay-glow");

  const drawFrame = (progress: number) => {
    const heads: GeoJSON.Feature[] = [];
    for (const [id, { name, tracks }] of trackData) {
      map
        .getSource<GeoJSONSource>(layerId("tracks", id))
        ?.setData({ type: "FeatureCollection", features: trackFeatures(name, tracks, progress) });
      const color = map.getPaintProperty(layerId("tracks", id), "line-color");
      if (progress < 1) {
        for (const track of tracks) {
          heads.push({
            type: "Feature",
            properties: { color },
            geometry: { type: "Point", coordinates: trackSoFar(track, progress).head },
          });
        }
      }
    }
    const data: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: heads };
    const source = map.getSource<GeoJSONSource>(HEADS);
    if (source) {
      source.setData(data);
      return;
    }
    map.addSource(HEADS, { type: "geojson", data });
    // A soft glow beneath each moving dot, which pulses while the replay runs.
    map.addLayer({
      id: GLOW,
      type: "circle",
      source: HEADS,
      paint: {
        "circle-color": ["get", "color"],
        "circle-radius": 14,
        "circle-blur": 0.8,
        "circle-opacity": 0.9,
      },
      layout: { visibility: visible.tracks ? "visible" : "none" },
    });
    map.addLayer({
      id: HEADS,
      type: "circle",
      source: HEADS,
      paint: {
        "circle-color": ["get", "color"],
        "circle-radius": 5,
        "circle-stroke-color": "#f0efec",
        "circle-stroke-width": 1.5,
      },
      layout: { visibility: visible.tracks ? "visible" : "none" },
    });
    layers.add(GLOW);
    layers.add(HEADS);
  };

  const pulse = (elapsed: number) => {
    if (map.getLayer(GLOW) && !prefersReducedMotion()) {
      map.setPaintProperty(GLOW, "circle-radius", 14 + 6 * Math.sin(elapsed / 150));
    }
  };

  const whenReady = (key: string, run: () => void) => {
    if (loaded) {
      run();
      return;
    }
    pending.set(key, run);
    whenLoaded.push(() => {
      if (pending.get(key) === run) {
        pending.delete(key);
        run();
      }
    });
  };

  return {
    showSightings(id, name, color, points) {
      extend(id, points);
      const features = points.map(
        (coordinates): GeoJSON.Feature => ({
          type: "Feature",
          properties: {},
          geometry: { type: "Point", coordinates },
        }),
      );
      whenReady(layerId("sightings", id), () =>
        add("sightings", id, name, features, {
          "circle-color": color,
          "circle-radius": prefersReducedMotion() ? DOT_RADIUS : 0,
          "circle-radius-transition": { duration: 600, delay: 0 },
          "circle-opacity": 0.9,
          // A dark ring keeps overlapping dots apart.
          "circle-stroke-color": "#0c0c0c",
          "circle-stroke-width": 1,
        }),
      );
    },
    showTracks(id, name, color, tracks) {
      extend(
        id,
        tracks.flatMap((track) => track.points.map(([lon, lat]): Point => [lon, lat])),
      );
      trackData.set(id, { name, tracks });
      onTracksChange(true);
      whenReady(layerId("tracks", id), () =>
        add("tracks", id, null, trackFeatures(name, tracks, 1), {
          "line-color": color,
          "line-width": 2,
          "line-opacity": 0.9,
          "line-blur": 0.5,
        }),
      );
    },
    hideSpecies(id) {
      if (trackData.delete(id) && trackData.size === 0) {
        onTracksChange(false);
      }
      // The view stays put, so removing an animal doesn't jolt the map.
      extents.delete(id);
      for (const kind of ["sightings", "tracks"] as const) {
        const layer = layerId(kind, id);
        pending.delete(layer);
        if (layers.delete(layer)) {
          map.removeLayer(layer);
          map.removeSource(layer);
        }
      }
      popup.remove();
    },
    showYouAreHere(point) {
      // Kept with the animals' areas, so the map frames the reader and them together.
      extend(YOU, [point]);
      const data: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: point } }],
      };
      whenReady(YOU, () => {
        const source = map.getSource<GeoJSONSource>(YOU);
        if (source) {
          source.setData(data);
          return;
        }
        map.addSource(YOU, { type: "geojson", data });
        // Not in `layers`, so it stays when sightings or tracks are switched off.
        map.addLayer({
          id: YOU,
          type: "circle",
          source: YOU,
          paint: {
            "circle-color": "#f0efec",
            "circle-radius": 6,
            "circle-stroke-color": "#3987e5",
            "circle-stroke-width": 3,
          },
        });
        map.on("mousemove", YOU, (event) => {
          popup.setLngLat(event.lngLat).setText("📍 You are here").addTo(map);
        });
        map.on("mouseleave", YOU, () => popup.remove());
      });
    },
    playTracks({ onProgress, onEnd }) {
      if (!loaded || trackData.size === 0) {
        onEnd();
        return () => {};
      }
      const started = Date.now();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = () => {
        clearTimeout(timer);
        drawFrame(1);
        onEnd();
      };
      const step = () => {
        const progress = Math.min(1, (Date.now() - started) / PLAY_DURATION_MS);
        onProgress(progress);
        if (progress >= 1) {
          finish();
          return;
        }
        drawFrame(progress);
        pulse(Date.now() - started);
        timer = setTimeout(step, PLAY_FRAME_MS);
      };
      step();
      return finish;
    },
    setKindVisible(kind, isVisible) {
      visible[kind] = isVisible;
      for (const layer of layers) {
        if (layer.startsWith(`${kind}-`)) {
          map.setLayoutProperty(layer, "visibility", isVisible ? "visible" : "none");
        }
      }
    },
  };
}
