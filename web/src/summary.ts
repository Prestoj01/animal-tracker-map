import { fetchJson } from "./fetchJson";

/** How much data each species has: sighting places and tracked animals. */
export type Summary = Record<string, { sightings: number; tracks: number }>;

export function parseSummary(data: unknown): Summary {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error("summary.json must be an object");
  }
  for (const [id, entry] of Object.entries(data)) {
    const counts = (entry ?? {}) as Record<string, unknown>;
    if (!Number.isInteger(counts.sightings) || !Number.isInteger(counts.tracks)) {
      throw new Error(`Malformed summary for ${id}`);
    }
  }
  return data as Summary;
}

export async function loadSummary(): Promise<Summary> {
  return parseSummary(await fetchJson(`${import.meta.env.BASE_URL}summary.json`));
}
