import { beforeEach, describe, expect, it, vi } from "vitest";
import { computeStats, createComparePanel, formatLatitude, type CompareLoaders } from "./compare";
import type { Sightings } from "./sightings";
import type { Tracks } from "./tracks";

const lion = { id: "lion", commonName: "Lion", scientificName: "Panthera leo" };
const tiger = { id: "tiger", commonName: "Tiger", scientificName: "Panthera tigris" };

const lionSightings: Sightings = {
  speciesId: "lion",
  totalRecords: 12345,
  points: [
    [36.8, -1.3, 2001],
    [36.8, -1.3, 2019],
    [20, 15.4, null],
    [25, -33.9],
  ],
};
const noTracks = (speciesId: string): Tracks => ({ speciesId, study: null, tracks: [] });
const tigerTracks: Tracks = {
  speciesId: "tiger",
  study: null,
  tracks: [
    // About 111 km due north, then back.
    { animal: "Stripes", start: "2020-01-01", points: [[80, 20, 0], [80, 21, 1], [80, 20, 2]] },
    { animal: "Short", start: "2020-01-01", points: [[80, 20, 0], [80, 20.5, 1]] },
  ],
};

let panel: HTMLElement;

beforeEach(() => {
  panel = document.createElement("aside");
  document.body.replaceChildren(panel);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

function loaders(overrides: Partial<CompareLoaders> = {}): CompareLoaders {
  return {
    sightings: async (id) => (id === "lion" ? lionSightings : { ...lionSightings, speciesId: id }),
    tracks: async (id) => (id === "tiger" ? tigerTracks : noTracks(id)),
    ...overrides,
  };
}

const picked = [
  { species: lion, color: "#3987e5" },
  { species: tiger, color: "#d55181" },
];

function cells() {
  return [...panel.querySelectorAll("tbody tr")].map((row) =>
    [...row.children].map((cell) => cell.textContent),
  );
}

describe("computeStats", () => {
  it("summarises sightings and tracks", () => {
    const stats = computeStats(lionSightings, tigerTracks);
    expect(stats).toMatchObject({
      places: 3,
      records: 12345,
      north: 15.4,
      south: -33.9,
      firstYear: 2001,
      lastYear: 2019,
      tracked: 2,
    });
    expect(stats.longestKm).toBeCloseTo(222.4, 0);
  });

  it("handles no data", () => {
    const stats = computeStats({ speciesId: "x", totalRecords: 0, points: [] }, noTracks("x"));
    expect(stats).toMatchObject({ places: 0, north: null, firstYear: null, longestKm: null });
  });
});

describe("formatLatitude", () => {
  it("names the hemisphere", () => {
    expect(formatLatitude(62.3)).toBe("62°N");
    expect(formatLatitude(-34.9)).toBe("35°S");
    expect(formatLatitude(0.2)).toBe("0°");
    expect(formatLatitude(null)).toBe("–");
  });
});

describe("createComparePanel", () => {
  it("asks for two animals before comparing", () => {
    const compare = createComparePanel(panel, loaders());
    compare.update([picked[0]]);
    compare.open();
    expect(panel.hidden).toBe(false);
    expect(panel.textContent).toContain("Pick at least two animals");
  });

  it("shows loading, then a row per figure and a column per animal", async () => {
    const onOpen = vi.fn();
    const compare = createComparePanel(panel, loaders(), onOpen);
    compare.update(picked);
    compare.open();
    expect(onOpen).toHaveBeenCalled();
    expect(panel.textContent).toContain("Loading…");

    await vi.waitFor(() => expect(panel.querySelector("table")).not.toBeNull());
    const headers = [...panel.querySelectorAll("thead th")].map((cell) => cell.textContent);
    expect(headers).toEqual(["🦁 Lion", "🐅 Tiger"]);
    expect(cells()).toContainEqual(["Places recorded", "3", "3"]);
    expect(cells()).toContainEqual(["GBIF records", "12,345", "12,345"]);
    expect(cells()).toContainEqual(["Farthest north", "15°N", "15°N"]);
    expect(cells()).toContainEqual(["Years recorded", "2001–2019", "2001–2019"]);
    expect(cells()).toContainEqual(["Animals tracked", "None", "2"]);
    expect(cells()).toContainEqual(["Most distance tracked", "–", "220 km"]);
  });

  it("follows the selection while open, and not while closed", async () => {
    const sightings = vi.fn(loaders().sightings);
    const compare = createComparePanel(panel, loaders({ sightings }));
    compare.update(picked);
    expect(sightings).not.toHaveBeenCalled();

    compare.open();
    await vi.waitFor(() => expect(panel.querySelector("table")).not.toBeNull());
    compare.update([picked[1]]);
    expect(panel.textContent).toContain("Pick at least two animals");

    compare.close();
    expect(compare.isOpen).toBe(false);
  });

  it("marks one animal that failed, and offers a retry if all did", async () => {
    let fail = true;
    const compare = createComparePanel(
      panel,
      loaders({
        sightings: async (id) => {
          if (fail || id === "tiger") {
            throw new Error("offline");
          }
          return lionSightings;
        },
      }),
    );
    compare.update(picked);
    compare.open();
    await vi.waitFor(() =>
      expect(panel.textContent).toContain("Could not load the animals' data"),
    );

    fail = false;
    panel.querySelector<HTMLButtonElement>(".compare-message button")?.click();
    await vi.waitFor(() => expect(panel.querySelector("table")).not.toBeNull());
    expect(cells()[0]).toEqual(["Places recorded", "3", "Couldn't load"]);
  });

  it("closes with the button or Escape", () => {
    const compare = createComparePanel(panel, loaders());
    compare.open();
    panel.querySelector<HTMLButtonElement>(".profile-close")?.click();
    expect(panel.hidden).toBe(true);

    compare.open();
    panel.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(panel.hidden).toBe(true);
  });
});
