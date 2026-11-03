import { fetchJson } from "./fetchJson";

export interface Photo {
  url: string;
  author: string;
  licence: string;
  licenceUrl: string;
  sourceUrl: string;
}

export interface Profile {
  title: string;
  description: string;
  extract: string;
  url: string;
  photo: Photo | null;
}

export type Profiles = Record<string, Profile>;

/** Validates data/profiles.json.gz; see docs/data-format.md. */
export function parseProfiles(data: unknown): Profiles {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error("profiles must be an object");
  }
  for (const [id, value] of Object.entries(data)) {
    const profile = (value ?? {}) as Partial<Profile>;
    if (typeof profile.title !== "string" || typeof profile.url !== "string") {
      throw new Error(`Malformed profile for ${id}`);
    }
    const photo = profile.photo;
    if (photo !== null && (typeof photo?.url !== "string" || typeof photo.licence !== "string")) {
      throw new Error(`Malformed photo for ${id}`);
    }
  }
  return data as Profiles;
}

export async function loadProfiles(): Promise<Profiles> {
  return parseProfiles(await fetchJson(`${import.meta.env.BASE_URL}profiles.json.gz`));
}
