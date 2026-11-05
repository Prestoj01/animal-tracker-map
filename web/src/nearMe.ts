import { speciesIcon } from "./catalog";
import type { Point } from "./sightings";
import type { Species } from "./species";

const EARTH_RADIUS_KM = 6371;
const LOCATE_TIMEOUT_MS = 15000;
/** How many of the nearest animals are listed. */
export const NEARBY_COUNT = 5;

/** Great-circle distance between two [longitude, latitude] points. */
export function distanceKm([lon1, lat1]: Point, [lon2, lat2]: Point): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

export interface Nearby {
  species: Species;
  km: number;
}

/** Each species' closest recorded place to `here`, nearest first. */
export function nearestSightings(
  here: Point,
  sightings: { species: Species; points: readonly (readonly number[])[] }[],
): Nearby[] {
  return sightings
    .filter(({ points }) => points.length > 0)
    .map(({ species, points }) => ({
      species,
      km: Math.min(...points.map(([lon, lat]) => distanceKm(here, [lon, lat]))),
    }))
    .sort((a, b) => a.km - b.km);
}

/** Sightings are rounded to about 10 km, so nearer than that isn't meaningful. */
export function formatDistance(km: number): string {
  if (km < 10) {
    return "within 10 km";
  }
  const rounded = km < 100 ? Math.round(km / 5) * 5 : Math.round(km / 10) * 10;
  return `about ${rounded.toLocaleString("en")} km away`;
}

export class LocationError extends Error {}

/** Asks the browser where the reader is. The location never leaves the device. */
export function locate(geolocation: Geolocation | undefined = navigator.geolocation): Promise<Point> {
  return new Promise((resolve, reject) => {
    if (!geolocation) {
      reject(new LocationError("Your browser can't share your location."));
      return;
    }
    geolocation.getCurrentPosition(
      ({ coords }) => resolve([coords.longitude, coords.latitude]),
      (error) =>
        reject(
          new LocationError(
            error.code === error.PERMISSION_DENIED
              ? "Location access was blocked. Allow it for this site in your browser to try again."
              : "Could not find your location. Try again in a moment.",
          ),
        ),
      { timeout: LOCATE_TIMEOUT_MS, maximumAge: 10 * 60 * 1000 },
    );
  });
}

export interface NearMeOptions {
  locate: () => Promise<Point>;
  loadSpecies: () => Promise<Species[]>;
  loadPoints: (speciesId: string) => Promise<readonly (readonly number[])[]>;
  /** Called with the reader's location once found, to mark it on the map. */
  onLocated: (here: Point) => void;
  /** Puts these animals on the map. */
  onShow: (ids: string[]) => void;
}

export interface NearMe {
  /** Finds the reader and lists the animals recorded closest to them. */
  start(): Promise<void>;
}

function button(text: string, onClick: () => void, className = ""): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.className = className;
  element.textContent = text;
  element.addEventListener("click", onClick);
  return element;
}

/** The "Near me" panel, through its locating, loading, empty, failed and ready states. */
export function createNearMe(container: HTMLElement, options: NearMeOptions): NearMe {
  const message = (text: string, retry = false) => {
    const paragraph = document.createElement("p");
    paragraph.className = "nearby-message";
    paragraph.setAttribute("role", "status");
    paragraph.textContent = text;
    if (retry) {
      paragraph.append(" ", button("Try again", () => void start()));
    }
    container.replaceChildren(paragraph);
    container.hidden = false;
  };

  const showResults = (nearby: Nearby[], someFailed: boolean) => {
    const heading = document.createElement("h2");
    heading.textContent = "Recorded nearest to you";
    const list = document.createElement("ol");
    list.className = "nearby-list";
    for (const { species, km } of nearby) {
      const item = document.createElement("li");
      const name = document.createElement("span");
      name.className = "nearby-name";
      name.textContent = `${speciesIcon(species.id)} ${species.commonName}`;
      const distance = document.createElement("span");
      distance.className = "nearby-distance";
      distance.textContent = formatDistance(km);
      item.append(
        name,
        distance,
        button("Show", () => options.onShow([species.id]), "nearby-show"),
      );
      list.append(item);
    }
    const actions = document.createElement("div");
    actions.className = "nearby-actions";
    actions.append(
      button("Show the nearest 4", () =>
        options.onShow(nearby.slice(0, 4).map(({ species }) => species.id)),
      ),
      button("Close", () => {
        container.hidden = true;
      }),
    );
    const note = document.createElement("p");
    note.className = "nearby-note";
    note.textContent = someFailed
      ? "Some animals could not be checked, so they are missing from this list."
      : "Your location stays on your device.";
    container.replaceChildren(heading, list, actions, note);
    container.hidden = false;
  };

  let running: Promise<void> | null = null;

  const run = async () => {
    message("Finding where you are…");
    let here: Point;
    try {
      here = await options.locate();
    } catch (error) {
      console.error("Could not get the location", error);
      message(
        error instanceof LocationError ? error.message : "Could not find your location.",
        true,
      );
      return;
    }
    options.onLocated(here);
    message("Looking for animals near you…");
    try {
      const species = await options.loadSpecies();
      const results = await Promise.allSettled(
        species.map(async (entry) => ({
          species: entry,
          points: await options.loadPoints(entry.id),
        })),
      );
      const loaded = results.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : [],
      );
      if (results.length > 0 && loaded.length === 0) {
        throw new Error("No sightings could be loaded");
      }
      const nearby = nearestSightings(here, loaded).slice(0, NEARBY_COUNT);
      if (nearby.length === 0) {
        message("No animal sightings are available yet.");
        return;
      }
      showResults(nearby, loaded.length < results.length);
    } catch (error) {
      console.error("Could not load sightings for Near me", error);
      message("Could not load the animal sightings.", true);
    }
  };

  const start = () => {
    running ??= run().finally(() => (running = null));
    return running;
  };

  return { start };
}
