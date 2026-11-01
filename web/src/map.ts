import { Map as MapLibreMap, NavigationControl, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// MapLibre ships its worker as a separate file, which the bundler only emits if imported.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";

setWorkerUrl(workerUrl);

// OpenFreeMap needs no API key or account, which keeps the map at $0.
const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
const LOAD_TIMEOUT_MS = 15000;
const FAILED_MESSAGE = "The map could not be loaded. Check your connection and reload the page.";

/** Creates the map, reporting its loading and failed states in `status`. */
export function createMap(container: HTMLElement, status: HTMLElement): void {
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
      zoom: 1.5,
    });
  } catch (error) {
    // The constructor throws when the browser has no WebGL.
    console.error("Could not create the map", error);
    show(FAILED_MESSAGE);
    return;
  }

  map.addControl(new NavigationControl());

  let loaded = false;
  const timer = setTimeout(() => {
    console.error("The map did not load in time");
    show(FAILED_MESSAGE);
  }, LOAD_TIMEOUT_MS);

  map.on("load", () => {
    loaded = true;
    clearTimeout(timer);
    status.hidden = true;
  });

  map.on("error", ({ error }) => {
    console.error("Map error", error);
    // After the first load this is usually one missing tile, not a broken map.
    if (!loaded) {
      clearTimeout(timer);
      show(FAILED_MESSAGE);
    }
  });
}
