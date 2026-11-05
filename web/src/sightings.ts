import { fetchJson } from "./fetchJson";

export type Point = [longitude: number, latitude: number];

/** A place an animal was recorded, and the year if known. */
export type SightingPoint =
  | [longitude: number, latitude: number]
  | [longitude: number, latitude: number, year: number | null];

export interface Sightings {
  speciesId: string;
  totalRecords: number;
  points: SightingPoint[];
}

function isSightingPoint(point: unknown): point is SightingPoint {
  if (!Array.isArray(point) || (point.length !== 2 && point.length !== 3)) {
    return false;
  }
  const [longitude, latitude, year] = point as unknown[];
  return (
    Number.isFinite(longitude) &&
    Number.isFinite(latitude) &&
    (year === undefined || year === null || Number.isInteger(year))
  );
}

/** Validates the format described in docs/data-format.md. */
export function parseSightings(data: unknown, speciesId: string): Sightings {
  const record = (data ?? {}) as Partial<Sightings>;
  if (record.speciesId !== speciesId) {
    throw new Error(`Expected sightings for ${speciesId}`);
  }
  if (typeof record.totalRecords !== "number" || !Array.isArray(record.points)) {
    throw new Error(`Malformed sightings for ${speciesId}`);
  }
  for (const point of record.points) {
    if (!isSightingPoint(point)) {
      throw new Error(`Malformed point for ${speciesId}`);
    }
  }
  return record as Sightings;
}

/** The year a point was recorded, or null if unknown. */
export function pointYear(point: SightingPoint): number | null {
  return point[2] ?? null;
}

/** Distinct places, since a place recorded in several years appears once per year. */
export function countPlaces(points: SightingPoint[]): number {
  return new Set(points.map(([longitude, latitude]) => `${longitude},${latitude}`)).size;
}

export async function loadSightings(speciesId: string): Promise<Sightings> {
  const url = `${import.meta.env.BASE_URL}sightings/${speciesId}.json.gz`;
  return parseSightings(await fetchJson(url), speciesId);
}
