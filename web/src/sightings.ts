import { fetchJson } from "./fetchJson";

export type Point = [longitude: number, latitude: number];

export interface Sightings {
  speciesId: string;
  totalRecords: number;
  points: Point[];
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
    if (!Array.isArray(point) || !point.every(Number.isFinite) || point.length !== 2) {
      throw new Error(`Malformed point for ${speciesId}`);
    }
  }
  return record as Sightings;
}

export async function loadSightings(speciesId: string): Promise<Sightings> {
  const url = `${import.meta.env.BASE_URL}sightings/${speciesId}.json.gz`;
  return parseSightings(await fetchJson(url), speciesId);
}
