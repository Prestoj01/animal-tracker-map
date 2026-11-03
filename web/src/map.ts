import {
  Map as MapLibreMap,
  NavigationControl,
  Popup,
  setWorkerUrl,
  type LayerSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// MapLibre ships its worker as a separate file, which the bundler only emits if imported.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import type { Point } from "./sightings";
import { splitAtAntimeridian } from "./tracks";

setWorkerUrl(workerUrl);

// OpenFreeMap needs no API key or account, which keeps the map at $0.
const STYLE_URL = "https://tiles.openfreemap.org/styles/dark";
const LOAD_TIMEOUT_MS = 15000;
const FAILED_MESSAGE = "The map could not be loaded. Check your connection and reload the page.";

export type LayerKind = "sightings" | "tracks";

export interface SightingsMap {
  showSightings(id: string, name: string, color: string, points: Point[]): void;
  showTracks(id: string, name: string, color: string, tracks: Point[][]): void;
  /** Removes both kinds of layer for a species. */
  hideSpecies(id: string): void;
  setKindVisible(kind: LayerKind, visible: boolean): void;
}

function layerId(kind: LayerKind, id: string): string {
  return `${kind}-${id}`;
}

/** Creates the map, reporting its loading and failed states in `status`. */
export function createMap(container: HTMLElement, status: HTMLElement): SightingsMap {
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
      zoom: 1,
      attributionControl: { customAttribution: "Sightings: GBIF.org | Tracks: Movebank" },
    });
  } catch (error) {
    // The constructor throws when the browser has no WebGL.
    console.error("Could not create the map", error);
    show(FAILED_MESSAGE);
    return { showSightings() {}, showTracks() {}, hideSpecies() {}, setKindVisible() {} };
  }

  map.addControl(new NavigationControl());

  let loaded = false;
  const whenLoaded: (() => void)[] = [];
  const timer = setTimeout(() => {
    console.error("The map did not load in time");
    show(FAILED_MESSAGE);
  }, LOAD_TIMEOUT_MS);

  map.on("load", () => {
    loaded = true;
    clearTimeout(timer);
    status.hidden = true;
    whenLoaded.splice(0).forEach((run) => run());
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
  const visible: Record<LayerKind, boolean> = { sightings: true, tracks: true };
  const layers = new Set<string>();
  // Layers added before the map loads wait here, and can be cancelled by a hide.
  const pending = new Map<string, () => void>();

  const add = (
    kind: LayerKind,
    id: string,
    label: string,
    features: GeoJSON.Feature[],
    paint: LayerSpecification["paint"],
  ) => {
    const layer = layerId(kind, id);
    map.addSource(layer, { type: "geojson", data: { type: "FeatureCollection", features } });
    // Tracks go under every sightings layer, so dots stay on top of lines.
    const firstSightings = [...layers].find((name) => name.startsWith("sightings-"));
    map.addLayer(
      {
        id: layer,
        type: kind === "sightings" ? "circle" : "line",
        source: layer,
        paint,
        layout: { visibility: visible[kind] ? "visible" : "none" },
      } as LayerSpecification,
      kind === "tracks" ? firstSightings : undefined,
    );
    layers.add(layer);
    // Naming the species on hover means identity never depends on colour alone.
    map.on("mousemove", layer, (event) => {
      map.getCanvas().style.cursor = "pointer";
      popup.setLngLat(event.lngLat).setText(label).addTo(map);
    });
    map.on("mouseleave", layer, () => {
      map.getCanvas().style.cursor = "";
      popup.remove();
    });
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
          "circle-radius": 4,
          "circle-opacity": 0.9,
          // A dark ring keeps overlapping dots apart.
          "circle-stroke-color": "#0c0c0c",
          "circle-stroke-width": 1,
        }),
      );
    },
    showTracks(id, name, color, tracks) {
      const features = tracks.flatMap(splitAtAntimeridian).map(
        (coordinates): GeoJSON.Feature => ({
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates },
        }),
      );
      whenReady(layerId("tracks", id), () =>
        add("tracks", id, `${name} (tracked animal)`, features, {
          "line-color": color,
          "line-width": 2,
          "line-opacity": 0.9,
          "line-blur": 0.5,
        }),
      );
    },
    hideSpecies(id) {
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
