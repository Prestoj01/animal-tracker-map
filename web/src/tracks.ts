import { fetchJson } from "./fetchJson";
import type { Point } from "./sightings";

export interface Study {
  id: number;
  name: string;
  citation: string;
  licenseType: string;
  url: string;
  firstYear: number | null;
  lastYear: number | null;
}

export interface Tracks {
  speciesId: string;
  study: Study | null;
  tracks: Point[][];
}

function isPoint(value: unknown): value is Point {
  return Array.isArray(value) && value.length === 2 && value.every(Number.isFinite);
}

/** Validates the format described in docs/data-format.md. */
export function parseTracks(data: unknown, speciesId: string): Tracks {
  const record = (data ?? {}) as Partial<Tracks>;
  if (record.speciesId !== speciesId) {
    throw new Error(`Expected tracks for ${speciesId}`);
  }
  if (!Array.isArray(record.tracks) || !record.tracks.every((t) => Array.isArray(t) && t.every(isPoint))) {
    throw new Error(`Malformed tracks for ${speciesId}`);
  }
  const study = record.study;
  if (study !== null && (typeof study?.citation !== "string" || typeof study.url !== "string")) {
    throw new Error(`Malformed study for ${speciesId}`);
  }
  return record as Tracks;
}

export async function loadTracks(speciesId: string): Promise<Tracks> {
  const url = `${import.meta.env.BASE_URL}tracks/${speciesId}.json.gz`;
  return parseTracks(await fetchJson(url), speciesId);
}

/**
 * Splits a track wherever it crosses the 180° meridian, so a whale crossing the
 * Pacific isn't drawn as a line across the whole world.
 */
export function splitAtAntimeridian(track: Point[]): Point[][] {
  const parts: Point[][] = [[]];
  track.forEach((point, index) => {
    const previous = track[index - 1];
    if (previous && Math.abs(point[0] - previous[0]) > 180) {
      parts.push([]);
    }
    parts[parts.length - 1].push(point);
  });
  return parts.filter((part) => part.length >= 2);
}

const LICENCE_NAMES: Record<string, string> = {
  CC_0: "CC0",
  CC_BY: "CC BY",
  CC_BY_NC: "CC BY-NC",
};

export function licenceName(licenseType: string): string {
  return LICENCE_NAMES[licenseType] ?? licenseType.replaceAll("_", " ");
}
