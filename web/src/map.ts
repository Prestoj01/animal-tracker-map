import { Map as MapLibreMap, NavigationControl, Popup, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// MapLibre ships its worker as a separate file, which the bundler only emits if imported.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import type { Point } from "./sightings";

setWorkerUrl(workerUrl);

// OpenFreeMap needs no API key or account, which keeps the map at $0.
const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
const LOAD_TIMEOUT_MS = 15000;
const FAILED_MESSAGE = "The map could not be loaded. Check your connection and reload the page.";

export interface SightingsMap {
  showSightings(id: string, name: string, color: string, points: Point[]): void;
  hideSightings(id: string): void;
}

function layerId(id: string): string {
  return `sightings-${id}`;
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
      attributionControl: { customAttribution: "Sightings: GBIF.org" },
    });
  } catch (error) {
    // The constructor throws when the browser has no WebGL.
    console.error("Could not create the map", error);
    show(FAILED_MESSAGE);
    return { showSightings() {}, hideSightings() {} };
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
  // Layers added before the map loads wait here, and can be cancelled by a deselect.
  const pending = new Map<string, () => void>();

  const add = (id: string, name: string, color: string, points: Point[]) => {
    const layer = layerId(id);
    map.addSource(layer, {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: points.map((coordinates) => ({
          type: "Feature",
          properties: {},
          geometry: { type: "Point", coordinates },
        })),
      },
    });
    map.addLayer({
      id: layer,
      type: "circle",
      source: layer,
      paint: {
        "circle-color": color,
        "circle-radius": 4,
        "circle-opacity": 0.85,
        "circle-stroke-color": "#fcfcfb",
        "circle-stroke-width": 1,
      },
    });
    // Naming the species on hover means identity never depends on colour alone.
    map.on("mousemove", layer, (event) => {
      map.getCanvas().style.cursor = "pointer";
      popup.setLngLat(event.lngLat).setText(name).addTo(map);
    });
    map.on("mouseleave", layer, () => {
      map.getCanvas().style.cursor = "";
      popup.remove();
    });
  };

  return {
    showSightings(id, name, color, points) {
      const run = () => add(id, name, color, points);
      if (loaded) {
        run();
      } else {
        pending.set(id, run);
        whenLoaded.push(() => {
          if (pending.get(id) === run) {
            pending.delete(id);
            run();
          }
        });
      }
    },
    hideSightings(id) {
      pending.delete(id);
      const layer = layerId(id);
      if (loaded && map.getLayer(layer)) {
        map.removeLayer(layer);
        map.removeSource(layer);
        popup.remove();
      }
    },
  };
}
