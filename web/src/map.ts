import {
  Map as MapLibreMap,
  NavigationControl,
  Popup,
  setWorkerUrl,
  type GeoJSONSource,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// MapLibre ships its worker as a separate file, which the bundler only emits if imported.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { buildRegions, stripePattern, type RegionInput } from "./regions";
import type { Point } from "./sightings";
import { splitAtAntimeridian } from "./tracks";

setWorkerUrl(workerUrl);

// OpenFreeMap needs no API key or account, which keeps the map at $0.
const STYLE_URL = "https://tiles.openfreemap.org/styles/dark";
const LOAD_TIMEOUT_MS = 15000;
const FAILED_MESSAGE = "The map could not be loaded. Check your connection and reload the page.";

export type LayerKind = "sightings" | "tracks";

export interface SightingsMap {
  /** Shows where a species has been seen, as a filled area shared with others. */
  showSightings(id: string, name: string, color: string, points: Point[]): void;
  showTracks(id: string, name: string, color: string, tracks: Point[][]): void;
  /** Removes both kinds of layer for a species. */
  hideSpecies(id: string): void;
  setKindVisible(kind: LayerKind, visible: boolean): void;
}

function layerId(kind: LayerKind, id: string): string {
  return `${kind}-${id}`;
}

// All sightings share one layer, because overlaps between animals are drawn
// differently from areas only one animal uses.
const REGIONS = layerId("sightings", "regions");

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

  const addHoverLabel = (layer: string, label: (event: MapLayerMouseEvent) => string) => {
    // Naming the animals on hover means identity never depends on colour alone.
    map.on("mousemove", layer, (event) => {
      map.getCanvas().style.cursor = "pointer";
      popup.setLngLat(event.lngLat).setText(label(event)).addTo(map);
    });
    map.on("mouseleave", layer, () => {
      map.getCanvas().style.cursor = "";
      popup.remove();
    });
  };

  // Our layers go beneath the basemap's place names, so those stay readable.
  const firstLabelLayer = () => map.getStyle().layers.find((layer) => layer.type === "symbol")?.id;

  const addTracks = (id: string, label: string, color: string, features: GeoJSON.Feature[]) => {
    const layer = layerId("tracks", id);
    map.addSource(layer, { type: "geojson", data: { type: "FeatureCollection", features } });
    map.addLayer(
      {
        id: layer,
        type: "line",
        source: layer,
        paint: { "line-color": color, "line-width": 2, "line-opacity": 0.9, "line-blur": 0.5 },
        layout: { visibility: visible.tracks ? "visible" : "none" },
      },
      firstLabelLayer(),
    );
    layers.add(layer);
    addHoverLabel(layer, () => label);
  };

  const regionInputs = new Map<string, RegionInput>();

  const drawRegions = () => {
    const { features, patterns } = buildRegions([...regionInputs.values()]);
    for (const [name, colors] of patterns) {
      if (!map.hasImage(name)) {
        // Twice the pixels for a crisp pattern on high-density screens.
        map.addImage(name, stripePattern(colors), { pixelRatio: 2 });
      }
    }
    const data: GeoJSON.FeatureCollection = { type: "FeatureCollection", features };
    const source = map.getSource<GeoJSONSource>(REGIONS);
    if (source) {
      source.setData(data);
      return;
    }
    map.addSource(REGIONS, { type: "geojson", data });
    // Areas go under every track, so lines stay readable on top of them.
    const firstTracks = [...layers].find((name) => name.startsWith("tracks-"));
    map.addLayer(
      {
        id: REGIONS,
        type: "fill",
        source: REGIONS,
        paint: {
          "fill-pattern": ["get", "pattern"],
          "fill-opacity": 0.55,
          // Antialiasing draws faint seams between neighbouring cells.
          "fill-antialias": false,
        },
        layout: { visibility: visible.sightings ? "visible" : "none" },
      },
      firstTracks ?? firstLabelLayer(),
    );
    layers.add(REGIONS);
    addHoverLabel(REGIONS, (event) => String(event.features?.[0]?.properties.names ?? ""));
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
      regionInputs.set(id, { id, name, color, points });
      whenReady(REGIONS, drawRegions);
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
        addTracks(id, `${name} (tracked animal)`, color, features),
      );
    },
    hideSpecies(id) {
      const tracks = layerId("tracks", id);
      pending.delete(tracks);
      if (layers.delete(tracks)) {
        map.removeLayer(tracks);
        map.removeSource(tracks);
      }
      if (regionInputs.delete(id)) {
        whenReady(REGIONS, drawRegions);
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
