import { speciesIcon } from "./catalog";
import type { SightingsMap } from "./map";
import type { Sightings } from "./sightings";
import type { Species } from "./species";
import type { PickerHandlers, RowStatus } from "./speciesPicker";
import { licenceName, type Tracks } from "./tracks";

export interface Loaders {
  sightings: (speciesId: string) => Promise<Sightings>;
  tracks: (speciesId: string) => Promise<Tracks>;
}

export interface Panels {
  legend: HTMLElement;
  /** Lists the citation of every track study on the map. */
  sources: HTMLElement;
}

type Part = "sightings" | "tracks";
type PartState =
  | { kind: "loading" }
  | { kind: "done"; text: string }
  | { kind: "failed" };

function cached<T>(load: (id: string) => Promise<T>): (id: string) => Promise<T> {
  const cache = new Map<string, Promise<T>>();
  return (id) => {
    let request = cache.get(id);
    if (!request) {
      request = load(id);
      // A failed request is forgotten, so "Try again" fetches again.
      request.catch(() => cache.delete(id));
      cache.set(id, request);
    }
    return request;
  };
}

/** How the map names an animal on hover, e.g. "🦁 Lion". */
function label(species: Species): string {
  return `${speciesIcon(species.id)} ${species.commonName}`;
}

function sourceEntry(species: Species, study: NonNullable<Tracks["study"]>): HTMLElement {
  const entry = document.createElement("li");
  const name = document.createElement("strong");
  name.textContent = species.commonName;
  const years =
    study.firstYear && study.lastYear ? `, ${study.firstYear}–${study.lastYear}` : "";
  const link = document.createElement("a");
  link.href = study.url;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = "Movebank study";
  entry.append(name, `: ${study.citation} (${licenceName(study.licenseType)}${years}). `, link);
  return entry;
}

/** Connects the picker to the map: loads, shows and hides each species' data. */
export function createSightingsController(
  map: SightingsMap,
  loaders: Loaders,
  { legend, sources }: Panels,
): PickerHandlers {
  const loadSightings = cached(loaders.sightings);
  const loadTracks = cached(loaders.tracks);
  // Checked against on arrival, so a slow response can't revive a deselected species.
  const active = new Map<string, symbol>();
  const legendEntries = new Map<string, HTMLElement>();
  const sourceEntries = new Map<string, HTMLElement>();
  // Each species' latest part states, so a retry keeps the parts that loaded.
  const previous = new Map<string, Map<Part, PartState>>();

  const renderPanels = () => {
    legend.replaceChildren(...legendEntries.values());
    legend.hidden = legendEntries.size === 0;
    const list = sources.querySelector("ul") as HTMLElement;
    list.replaceChildren(...sourceEntries.values());
    sources.hidden = sourceEntries.size === 0;
  };

  const addLegend = (species: Species, color: string) => {
    if (legendEntries.has(species.id)) {
      return;
    }
    const entry = document.createElement("li");
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.backgroundColor = color;
    entry.append(swatch, species.commonName);
    legendEntries.set(species.id, entry);
    renderPanels();
  };

  const select = (species: Species, color: string, status: RowStatus, parts: Part[]) => {
    const token = Symbol(species.id);
    active.set(species.id, token);
    const states = new Map<Part, PartState>();
    const isCurrent = () => active.get(species.id) === token;

    const render = () => {
      if ([...states.values()].some((state) => state.kind === "loading")) {
        status.set("Loading…");
        return;
      }
      const failed = (["sightings", "tracks"] as const).filter(
        (part) => states.get(part)?.kind === "failed",
      );
      const text = (["sightings", "tracks"] as const)
        .map((part) => {
          const state = states.get(part);
          return state?.kind === "done" ? state.text : `${part} failed`;
        })
        .join(" · ");
      status.set(
        text,
        failed.length ? () => select(species, color, status, failed) : undefined,
      );
    };

    const run = async (part: Part, load: () => Promise<void>) => {
      states.set(part, { kind: "loading" });
      render();
      try {
        await load();
      } catch (error) {
        if (!isCurrent()) {
          return;
        }
        console.error(`Could not load ${part} for ${species.id}`, error);
        states.set(part, { kind: "failed" });
      }
      if (isCurrent()) {
        render();
      }
    };

    for (const part of ["sightings", "tracks"] as const) {
      if (!parts.includes(part)) {
        states.set(part, previous.get(species.id)?.get(part) ?? { kind: "failed" });
      }
    }
    previous.set(species.id, states);

    if (parts.includes("sightings")) {
      void run("sightings", async () => {
        const { points } = await loadSightings(species.id);
        if (!isCurrent()) {
          return;
        }
        if (points.length > 0) {
          map.showSightings(species.id, label(species), color, points);
          addLegend(species, color);
        }
        states.set("sightings", {
          kind: "done",
          text: points.length ? `${points.length.toLocaleString()} places` : "no sightings",
        });
      });
    }
    if (parts.includes("tracks")) {
      void run("tracks", async () => {
        const { study, tracks } = await loadTracks(species.id);
        if (!isCurrent()) {
          return;
        }
        if (study && tracks.length > 0) {
          map.showTracks(species.id, label(species), color, tracks);
          addLegend(species, color);
          sourceEntries.set(species.id, sourceEntry(species, study));
          renderPanels();
        }
        states.set("tracks", {
          kind: "done",
          text: tracks.length ? `${tracks.length} tracked` : "no tracks",
        });
      });
    }
  };

  return {
    onSelect(species, color, status) {
      select(species, color, status, ["sightings", "tracks"]);
    },
    onDeselect(species) {
      active.delete(species.id);
      previous.delete(species.id);
      map.hideSpecies(species.id);
      legendEntries.delete(species.id);
      sourceEntries.delete(species.id);
      renderPanels();
    },
  };
}
