import { speciesIcon } from "./catalog";
import { distanceKm } from "./nearMe";
import { countPlaces, pointYear, type Sightings } from "./sightings";
import type { Species } from "./species";
import type { Tracks } from "./tracks";

export interface Picked {
  species: Species;
  color: string;
}

export interface Stats {
  places: number;
  records: number;
  north: number | null;
  south: number | null;
  firstYear: number | null;
  lastYear: number | null;
  tracked: number;
  /** The farthest any one animal travelled while tracked, in km, or null with no tracks. */
  longestKm: number | null;
}

/** The figures compared for one animal. */
export function computeStats(sightings: Sightings, tracks: Tracks): Stats {
  const latitudes = sightings.points.map(([, latitude]) => latitude);
  const years = sightings.points.map(pointYear).filter((year) => year !== null);
  const journeys = tracks.tracks.map((track) =>
    track.points.reduce(
      (total, point, index) =>
        index === 0 ? 0 : total + distanceKm(track.points[index - 1], point),
      0,
    ),
  );
  return {
    places: countPlaces(sightings.points),
    records: sightings.totalRecords,
    north: latitudes.length ? Math.max(...latitudes) : null,
    south: latitudes.length ? Math.min(...latitudes) : null,
    firstYear: years.length ? Math.min(...years) : null,
    lastYear: years.length ? Math.max(...years) : null,
    tracked: tracks.tracks.length,
    longestKm: journeys.length ? Math.max(...journeys) : null,
  };
}

const number = (value: number) => value.toLocaleString("en");

/** E.g. 62.3 → "62°N", -34.9 → "35°S". */
export function formatLatitude(latitude: number | null): string {
  if (latitude === null) {
    return "–";
  }
  const degrees = Math.round(Math.abs(latitude));
  return degrees === 0 ? "0°" : `${degrees}°${latitude > 0 ? "N" : "S"}`;
}

const ROWS: { label: string; value: (stats: Stats) => string }[] = [
  { label: "Places recorded", value: (stats) => number(stats.places) },
  { label: "GBIF records", value: (stats) => number(stats.records) },
  { label: "Farthest north", value: (stats) => formatLatitude(stats.north) },
  { label: "Farthest south", value: (stats) => formatLatitude(stats.south) },
  {
    label: "Years recorded",
    value: ({ firstYear, lastYear }) =>
      firstYear === null ? "–" : firstYear === lastYear ? `${firstYear}` : `${firstYear}–${lastYear}`,
  },
  { label: "Animals tracked", value: (stats) => (stats.tracked ? number(stats.tracked) : "None") },
  {
    label: "Most distance tracked",
    value: (stats) =>
      stats.longestKm === null ? "–" : `${number(Math.round(stats.longestKm / 10) * 10)} km`,
  },
];

export interface CompareLoaders {
  sightings: (id: string) => Promise<Sightings>;
  tracks: (id: string) => Promise<Tracks>;
}

export interface ComparePanel {
  open(): void;
  close(): void;
  /** Keeps an open panel in step with the animals on the map. */
  update(picked: Picked[]): void;
  readonly isOpen: boolean;
}

/** A side-by-side table of the picked animals, through loading, empty and failed states. */
export function createComparePanel(
  panel: HTMLElement,
  load: CompareLoaders,
  onOpen: () => void = () => {},
): ComparePanel {
  let picked: Picked[] = [];
  let version = 0;

  const close = document.createElement("button");
  close.type = "button";
  close.className = "profile-close";
  close.setAttribute("aria-label", "Close");
  close.textContent = "✕";
  const heading = document.createElement("h2");
  heading.textContent = "Compare";
  const body = document.createElement("div");
  body.className = "compare-body";
  panel.replaceChildren(close, heading, body);
  panel.hidden = true;

  const message = (text: string, retry?: () => void) => {
    const paragraph = document.createElement("p");
    paragraph.className = "compare-message";
    paragraph.setAttribute("role", "status");
    paragraph.textContent = text;
    if (retry) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Try again";
      button.addEventListener("click", retry);
      paragraph.append(" ", button);
    }
    body.replaceChildren(paragraph);
  };

  const table = (results: (Stats | null)[]) => {
    const element = document.createElement("table");
    element.className = "compare-table";
    const head = element.createTHead().insertRow();
    head.append(document.createElement("td"));
    for (const { species, color } of picked) {
      const cell = document.createElement("th");
      cell.scope = "col";
      const swatch = document.createElement("span");
      swatch.className = "swatch";
      swatch.style.backgroundColor = color;
      cell.append(swatch, `${speciesIcon(species.id)} ${species.commonName}`);
      head.append(cell);
    }
    const rows = element.createTBody();
    for (const { label, value } of ROWS) {
      const row = rows.insertRow();
      const name = document.createElement("th");
      name.scope = "row";
      name.textContent = label;
      row.append(name);
      for (const stats of results) {
        row.insertCell().textContent = stats ? value(stats) : "Couldn't load";
      }
    }
    return element;
  };

  const render = async () => {
    const current = ++version;
    if (picked.length < 2) {
      message("Pick at least two animals to compare them side by side.");
      return;
    }
    message("Loading…");
    const results = await Promise.allSettled(
      picked.map(async ({ species }) => {
        const [sightings, tracks] = await Promise.all([
          load.sightings(species.id),
          load.tracks(species.id),
        ]);
        return computeStats(sightings, tracks);
      }),
    );
    if (current !== version) {
      return;
    }
    const stats = results.map((result) => (result.status === "fulfilled" ? result.value : null));
    if (stats.every((entry) => entry === null)) {
      console.error("Could not load any animal to compare", results);
      message("Could not load the animals' data.", () => void render());
      return;
    }
    const note = document.createElement("p");
    note.className = "compare-note";
    note.textContent =
      "Places are spots about 10 km across with at least one sighting. Latitudes come from those places.";
    body.replaceChildren(table(stats), note);
  };

  const api: ComparePanel = {
    open() {
      onOpen();
      panel.hidden = false;
      void render();
      close.focus();
    },
    close() {
      version += 1;
      panel.hidden = true;
    },
    update(next) {
      picked = next;
      if (!panel.hidden) {
        void render();
      }
    },
    get isOpen() {
      return !panel.hidden;
    },
  };
  close.addEventListener("click", api.close);
  panel.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      api.close();
    }
  });
  return api;
}
