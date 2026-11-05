import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createNearMe,
  distanceKm,
  formatDistance,
  locate,
  LocationError,
  nearestSightings,
  type NearMeOptions,
} from "./nearMe";
import type { Species } from "./species";

const lion: Species = { id: "lion", commonName: "Lion", scientificName: "Panthera leo" };
const tiger: Species = { id: "tiger", commonName: "Tiger", scientificName: "Panthera tigris" };
const panda: Species = { id: "giant-panda", commonName: "Giant panda", scientificName: "A" };

const NAIROBI: [number, number] = [36.8, -1.3];
const DELHI: [number, number] = [77.2, 28.6];

let container: HTMLElement;

beforeEach(() => {
  container = document.createElement("section");
  container.hidden = true;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function options(overrides: Partial<NearMeOptions> = {}): NearMeOptions {
  const points: Record<string, number[][]> = {
    lion: [[36.9, -1.4], [20, 0]],
    tiger: [DELHI],
    "giant-panda": [],
  };
  return {
    locate: async () => NAIROBI,
    loadSpecies: async () => [lion, tiger, panda],
    loadPoints: async (id) => points[id],
    onLocated: vi.fn(),
    onShow: vi.fn(),
    ...overrides,
  };
}

describe("distanceKm", () => {
  it("measures great-circle distances", () => {
    expect(distanceKm([0, 0], [0, 0])).toBe(0);
    expect(distanceKm([0, 0], [180, 0])).toBeCloseTo(Math.PI * 6371, 0);
    // Nairobi to Delhi is about 5,430 km.
    expect(distanceKm(NAIROBI, DELHI)).toBeGreaterThan(5400);
    expect(distanceKm(NAIROBI, DELHI)).toBeLessThan(5470);
  });
});

describe("nearestSightings", () => {
  it("ranks species by their closest place and skips ones with none", () => {
    const ranked = nearestSightings(NAIROBI, [
      { species: tiger, points: [DELHI] },
      { species: panda, points: [] },
      { species: lion, points: [[20, 0], [36.8, -1.2, 2015]] },
    ]);
    expect(ranked.map(({ species }) => species.id)).toEqual(["lion", "tiger"]);
    expect(ranked[0].km).toBeLessThan(15);
  });
});

describe("formatDistance", () => {
  it("rounds to what the rounded sightings can support", () => {
    expect(formatDistance(3)).toBe("within 10 km");
    expect(formatDistance(42)).toBe("about 40 km away");
    expect(formatDistance(4987)).toBe("about 4,990 km away");
  });
});

describe("locate", () => {
  it("resolves with longitude then latitude", async () => {
    const geolocation = {
      getCurrentPosition: (success: PositionCallback) =>
        success({ coords: { longitude: 1, latitude: 2 } } as GeolocationPosition),
    } as unknown as Geolocation;
    await expect(locate(geolocation)).resolves.toEqual([1, 2]);
  });

  it("explains a blocked permission", async () => {
    const geolocation = {
      getCurrentPosition: (_: PositionCallback, failure: PositionErrorCallback) =>
        failure({ code: 1, PERMISSION_DENIED: 1 } as GeolocationPositionError),
    } as unknown as Geolocation;
    await expect(locate(geolocation)).rejects.toThrow(/blocked/);
  });

  it("fails clearly without geolocation", async () => {
    await expect(locate(undefined as unknown as Geolocation)).rejects.toBeInstanceOf(
      LocationError,
    );
  });
});

describe("createNearMe", () => {
  it("shows progress, then the nearest animals, and marks the reader", async () => {
    let resolve: (here: [number, number]) => void = () => {};
    const setup = options({ locate: () => new Promise((r) => (resolve = r)) });
    const nearMe = createNearMe(container, setup);

    const started = nearMe.start();
    expect(container.hidden).toBe(false);
    expect(container.textContent).toContain("Finding where you are");

    resolve(NAIROBI);
    await started;
    expect(setup.onLocated).toHaveBeenCalledWith(NAIROBI);
    const rows = [...container.querySelectorAll("li")].map((row) => row.textContent);
    expect(rows).toEqual([
      expect.stringContaining("Lion"),
      expect.stringContaining("Tiger"),
    ]);
    expect(container.textContent).toContain("stays on your device");
  });

  it("puts one animal, or the nearest four, on the map", async () => {
    const setup = options();
    await createNearMe(container, setup).start();

    (container.querySelector(".nearby-show") as HTMLButtonElement).click();
    expect(setup.onShow).toHaveBeenLastCalledWith(["lion"]);
    const showAll = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("nearest 4"),
    ) as HTMLButtonElement;
    showAll.click();
    expect(setup.onShow).toHaveBeenLastCalledWith(["lion", "tiger"]);
  });

  it("explains a refused location and can try again", async () => {
    const locateMock = vi
      .fn<() => Promise<[number, number]>>()
      .mockRejectedValueOnce(new LocationError("Location access was blocked."))
      .mockResolvedValueOnce(NAIROBI);
    const nearMe = createNearMe(container, options({ locate: locateMock }));

    await nearMe.start();
    expect(container.textContent).toContain("Location access was blocked.");

    container.querySelector("button")?.click();
    await vi.waitFor(() => expect(container.querySelector("li")).not.toBeNull());
  });

  it("notes animals that could not be checked, and fails if none could", async () => {
    await createNearMe(
      container,
      options({
        loadPoints: async (id) => {
          if (id === "tiger") {
            throw new Error("offline");
          }
          return [[36.9, -1.4]];
        },
      }),
    ).start();
    expect(container.textContent).toContain("could not be checked");

    await createNearMe(
      container,
      options({
        loadPoints: async () => {
          throw new Error("offline");
        },
      }),
    ).start();
    expect(container.textContent).toContain("Could not load the animal sightings");
  });

  it("has an empty state", async () => {
    await createNearMe(container, options({ loadPoints: async () => [] })).start();
    expect(container.textContent).toContain("No animal sightings are available yet");
  });

  it("can be closed", async () => {
    await createNearMe(container, options()).start();
    const close = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Close",
    ) as HTMLButtonElement;
    close.click();
    expect(container.hidden).toBe(true);
  });
});
