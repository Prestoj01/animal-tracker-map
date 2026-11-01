import { fetchJson } from "./fetchJson";

export interface Species {
  id: string;
  commonName: string;
  scientificName: string;
}

const FIELDS = ["id", "commonName", "scientificName"] as const;

/** Validates the format described in docs/data-format.md. */
export function parseSpecies(data: unknown): Species[] {
  if (!Array.isArray(data)) {
    throw new Error("species.json must be an array");
  }
  const seen = new Set<string>();
  return data.map((entry: unknown, index) => {
    const record = (entry ?? {}) as Record<string, unknown>;
    for (const field of FIELDS) {
      const value = record[field];
      if (typeof value !== "string" || value.trim() === "") {
        throw new Error(`species[${index}].${field} must be a non-empty string`);
      }
    }
    const species = record as unknown as Species;
    if (seen.has(species.id)) {
      throw new Error(`Duplicate species id: ${species.id}`);
    }
    seen.add(species.id);
    return species;
  });
}

export async function loadSpecies(): Promise<Species[]> {
  return parseSpecies(await fetchJson(`${import.meta.env.BASE_URL}species.json`));
}
