import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderCredits, type CreditLists, type CreditLoaders } from "./credits";
import type { Tracks } from "./tracks";

const lion = { id: "lion", commonName: "Lion", scientificName: "Panthera leo" };
const tiger = { id: "tiger", commonName: "Tiger", scientificName: "Panthera tigris" };
const study = {
  id: 7,
  name: "Lions",
  citation: "Someone 2020",
  licenseType: "CC_BY",
  url: "https://www.movebank.org/study7",
  firstYear: 2010,
  lastYear: 2012,
};
const lionTracks: Tracks = {
  speciesId: "lion",
  study,
  tracks: [{ animal: "Rain", start: "2010-01-01", points: [[1, 2, 0]] }],
};
const noTracks: Tracks = { speciesId: "tiger", study: null, tracks: [] };
const photo = {
  url: "https://upload.wikimedia.org/lion.jpg",
  author: "A. Photographer",
  licence: "CC BY 4.0",
  licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
  sourceUrl: "https://commons.wikimedia.org/wiki/File:Lion.jpg",
};

let lists: CreditLists;

function loaders(overrides: Partial<CreditLoaders> = {}): CreditLoaders {
  return {
    species: async () => [lion, tiger],
    tracks: async (id) => (id === "lion" ? lionTracks : noTracks),
    profiles: async () => ({
      lion: { title: "Lion", description: "", extract: "", url: "", photo },
      tiger: { title: "Tiger", description: "", extract: "", url: "", photo: null },
    }),
    gbif: async () => null,
    ...overrides,
  };
}

beforeEach(() => {
  lists = {
    gbif: document.createElement("ul"),
    studies: document.createElement("ul"),
    photos: document.createElement("ul"),
  };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("renderCredits", () => {
  it("shows loading, then every study and photo credit", async () => {
    const rendering = renderCredits(lists, loaders());
    expect(lists.studies.textContent).toBe("Loading…");

    await rendering;
    expect(lists.gbif.textContent).toContain("GBIF.org");
    expect(lists.studies.textContent).toBe("Lion: Someone 2020 (CC BY). Movebank study");
    expect(lists.studies.querySelector("a")?.href).toBe(study.url);
    expect(lists.photos.textContent).toBe(
      "Lion: photo by A. Photographer, CC BY 4.0, via Wikimedia Commons",
    );
  });

  it("shows the registered GBIF citation with its DOI", async () => {
    const url = "https://doi.org/10.15468/dd.abc";
    await renderCredits(
      lists,
      loaders({
        gbif: async () => ({
          doi: "10.15468/dd.abc",
          url,
          citation: `GBIF.org (5 November 2026) Derived dataset ${url}`,
          registered: "2026-11-05",
        }),
      }),
    );
    expect(lists.gbif.querySelector("a")?.href).toBe(url);
  });

  it("has empty states", async () => {
    await renderCredits(
      lists,
      loaders({ tracks: async () => noTracks, profiles: async () => ({}) }),
    );
    expect(lists.studies.textContent).toBe("No tracking studies are shown yet.");
    expect(lists.photos.textContent).toBe("No photos are shown yet.");
  });

  it("shows a failure in one list with a retry, leaving the others", async () => {
    const tracks = vi
      .fn<CreditLoaders["tracks"]>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockImplementation(async (id) => (id === "lion" ? lionTracks : noTracks));
    await renderCredits(lists, loaders({ tracks }));
    expect(lists.studies.textContent).toContain("Could not load these credits");
    expect(lists.photos.textContent).toContain("A. Photographer");

    lists.studies.querySelector("button")?.click();
    await vi.waitFor(() => expect(lists.studies.textContent).toContain("Someone 2020"));
  });
});
