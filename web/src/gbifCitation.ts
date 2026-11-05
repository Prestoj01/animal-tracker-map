export interface GbifCitation {
  doi: string;
  url: string;
  citation: string;
  registered: string;
}

/** How GBIF is credited until the sightings are registered as a derived dataset. */
export const GBIF_FALLBACK = "Occurrence data from GBIF.org, accessed through its search API.";

/** Validates data/gbif-citation.json; see docs/data-format.md. */
export function parseGbifCitation(data: unknown): GbifCitation {
  const record = (data ?? {}) as Partial<GbifCitation>;
  if (
    typeof record.citation !== "string" ||
    typeof record.url !== "string" ||
    !record.url.startsWith("https://doi.org/")
  ) {
    throw new Error("Malformed GBIF citation");
  }
  return record as GbifCitation;
}

const TIMEOUT_MS = 15000;

/** The registered citation, or null before one exists. */
export async function loadGbifCitation(): Promise<GbifCitation | null> {
  const response = await fetch(`${import.meta.env.BASE_URL}gbif-citation.json`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  // The dev server answers a missing file with the page itself.
  const isJson = response.headers.get("content-type")?.includes("json") ?? false;
  if (response.status === 404 || (response.ok && !isJson)) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for the GBIF citation`);
  }
  return parseGbifCitation(await response.json());
}

/** The citation as text and a link to its DOI. */
export function citationNodes(citation: GbifCitation | null): (string | Node)[] {
  if (!citation) {
    return [GBIF_FALLBACK];
  }
  const link = document.createElement("a");
  link.href = citation.url;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = citation.url;
  const [before, after = ""] = citation.citation.split(citation.url);
  return [before, link, after];
}
