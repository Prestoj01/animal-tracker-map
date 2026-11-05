import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Sightings } from "./sightings";
import { createSightingsController, sightingsText } from "./sightingsController";
import { ALL_YEARS, PERIODS } from "./timeline";
import type { Tracks } from "./tracks";

const lion = { id: "lion", commonName: "Lion", scientificName: "Panthera leo" };
const sightings: Sightings = { speciesId: "lion", totalRecords: 9, points: [[1, 2]] };
const study = {
  id: 7,
  name: "Lions",
  citation: "Someone 2020",
  licenseType: "CC_BY",
  url: "https://www.movebank.org/study7",
  firstYear: 2010,
  lastYear: 2012,
};
const tracks: Tracks = {
  speciesId: "lion",
  study,
  tracks: [
    {
      animal: "Rain",
      start: "2010-01-01",
      points: [
        [1, 2, 0],
        [3, 4, 5],
      ],
    },
  ],
};
const noTracks: Tracks = { speciesId: "lion", study: null, tracks: [] };

const map = {
  showSightings: vi.fn(),
  showTracks: vi.fn(),
  hideSpecies: vi.fn(),
  setKindVisible: vi.fn(),
  showYouAreHere: vi.fn(),
  setPeriod: vi.fn(),
  playTracks: vi.fn(),
};
const status = { set: vi.fn() };
let legend: HTMLElement;
let sources: HTMLElement;

function flush() {
  return new Promise((resolve) => setTimeout(resolve));
}

function controller(
  loadSightings: () => Promise<Sightings> = async () => sightings,
  loadTracks: () => Promise<Tracks> = async () => tracks,
) {
  return createSightingsController(
    map,
    { sightings: loadSightings, tracks: loadTracks },
    { legend, sources },
  );
}

beforeEach(() => {
  Object.values(map).forEach((fn) => fn.mockReset());
  status.set.mockReset();
  legend = document.createElement("ul");
  sources = document.createElement("section");
  sources.append(document.createElement("ul"));
  // As in index.html, both panels start hidden.
  legend.hidden = true;
  sources.hidden = true;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createSightingsController", () => {
  it("shows loading, then draws sightings, tracks, legend and citation", async () => {
    const handlers = controller();

    handlers.onSelect(lion, "#123456", status);
    expect(status.set).toHaveBeenCalledWith("Loading…");

    await flush();
    expect(map.showSightings).toHaveBeenCalledWith("lion", "🦁 Lion", "#123456", [[1, 2]]);
    expect(map.showTracks).toHaveBeenCalledWith("lion", "🦁 Lion", "#123456", tracks.tracks);
    expect(status.set).toHaveBeenLastCalledWith("1 place · 1 tracked", undefined);
    expect(legend.textContent).toBe("Lion");
    expect(sources.textContent).toContain("Someone 2020 (CC BY, 2010–2012)");
    expect(sources.querySelector("a")?.href).toBe(study.url);
    expect(sources.hidden).toBe(false);
  });

  it("shows empty states for species without sightings or tracks", async () => {
    const handlers = controller(
      async () => ({ ...sightings, points: [] }),
      async () => noTracks,
    );

    handlers.onSelect(lion, "#123456", status);
    await flush();

    expect(status.set).toHaveBeenLastCalledWith("no sightings · no tracks", undefined);
    expect(map.showSightings).not.toHaveBeenCalled();
    expect(map.showTracks).not.toHaveBeenCalled();
    expect(legend.hidden).toBe(true);
    expect(sources.hidden).toBe(true);
  });

  it("shows a failed part, and retrying fetches only that part", async () => {
    const loadTracks = vi
      .fn<() => Promise<Tracks>>()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(tracks);
    const loadSightings = vi.fn(async () => sightings);
    const handlers = controller(loadSightings, loadTracks);

    handlers.onSelect(lion, "#123456", status);
    await flush();
    const [text, retry] = status.set.mock.lastCall as [string, () => void];
    expect(text).toBe("1 place · tracks failed");
    expect(map.showSightings).toHaveBeenCalled();

    retry();
    await flush();
    expect(loadTracks).toHaveBeenCalledTimes(2);
    expect(loadSightings).toHaveBeenCalledTimes(1);
    expect(status.set).toHaveBeenLastCalledWith("1 place · 1 tracked", undefined);
  });

  it("ignores responses that arrive after deselecting", async () => {
    let resolve: (value: Sightings) => void = () => {};
    const handlers = controller(() => new Promise((r) => (resolve = r)));

    handlers.onSelect(lion, "#123456", status);
    handlers.onDeselect(lion);
    resolve(sightings);
    await flush();

    expect(map.showSightings).not.toHaveBeenCalled();
    expect(map.showTracks).not.toHaveBeenCalled();
    expect(legend.hidden).toBe(true);
  });

  it("removes the species on deselect and reuses cached data", async () => {
    const loadSightings = vi.fn(async () => sightings);
    const handlers = controller(loadSightings);

    handlers.onSelect(lion, "#123456", status);
    await flush();
    handlers.onDeselect(lion);
    expect(map.hideSpecies).toHaveBeenCalledWith("lion");
    expect(legend.hidden).toBe(true);
    expect(sources.hidden).toBe(true);

    handlers.onSelect(lion, "#abcdef", status);
    await flush();
    expect(loadSightings).toHaveBeenCalledTimes(1);
    expect(map.showSightings).toHaveBeenLastCalledWith("lion", "🦁 Lion", "#abcdef", [[1, 2]]);
  });

  it("recounts each card's sightings when the period changes", async () => {
    const handlers = controller(async () => ({
      ...sightings,
      points: [[1, 2, 1995], [1, 2, 1996], [3, 4, 2015]],
    }));
    handlers.onSelect(lion, "#123456", status);
    await flush();
    expect(status.set).toHaveBeenLastCalledWith("2 places · 1 tracked", undefined);

    const nineties = PERIODS.find((period) => period.label === "1990s")!;
    handlers.setPeriod(nineties);
    expect(map.setPeriod).toHaveBeenCalledWith(nineties);
    expect(status.set).toHaveBeenLastCalledWith("1 place in the 1990s · 1 tracked", undefined);

    // A deselected animal is left alone.
    handlers.onDeselect(lion);
    status.set.mockReset();
    handlers.setPeriod(ALL_YEARS);
    expect(status.set).not.toHaveBeenCalled();
  });
});

describe("sightingsText", () => {
  it("counts places in the period, with empty states", () => {
    const twenties = PERIODS.find((period) => period.label === "2020s")!;
    expect(sightingsText([], ALL_YEARS)).toBe("no sightings");
    expect(sightingsText([[1, 2, 1990], [3, 4]], ALL_YEARS)).toBe("2 places");
    expect(sightingsText([[1, 2, 1990], [3, 4]], twenties)).toBe("none in the 2020s");
    const many = Array.from({ length: 1500 }, (_, index): [number, number, number] => [
      index,
      0,
      2021,
    ]);
    expect(sightingsText(many, twenties)).toBe("1,500 places in the 2020s");
  });
});
