import { describe, expect, it } from "vitest";
import {
  buildRegions,
  CELL_DEGREES,
  PATTERN_SIZE,
  patternName,
  SPREAD_CELLS,
  stripePattern,
} from "./regions";

const lion = { id: "lion", name: "Lion", color: "#3987e5", points: [] };
const leopard = { id: "leopard", name: "Leopard", color: "#d55181", points: [] };

function cellCount(feature: { geometry: { coordinates: unknown[] } }) {
  return feature.geometry.coordinates.length;
}

const block = (2 * SPREAD_CELLS + 1) ** 2;

describe("buildRegions", () => {
  it("fills the cell of each sighting and its neighbours", () => {
    const { features, patterns } = buildRegions([{ ...lion, points: [[36.5, -1.5]] }]);

    expect(features).toHaveLength(1);
    expect(cellCount(features[0])).toBe(block);
    expect(features[0].properties).toEqual({
      pattern: patternName(["#3987e5"]),
      names: "Lion",
    });
    expect(patterns.get(patternName(["#3987e5"]))).toEqual(["#3987e5"]);
  });

  it("merges nearby sightings into one area without duplicating cells", () => {
    const { features } = buildRegions([
      {
        ...lion,
        points: [
          [36.5, -1.5],
          [36.6, -1.4],
        ],
      },
    ]);

    expect(cellCount(features[0])).toBe(block);
  });

  it("stripes the cells two animals share and names both", () => {
    const { features, patterns } = buildRegions([
      { ...lion, points: [[36.5, -1.5]] },
      { ...leopard, points: [[36.5 + CELL_DEGREES, -1.5]] },
    ]);

    const shared = features.find((feature) => feature.properties.names === "Lion & Leopard");
    expect(shared).toBeDefined();
    // Neighbouring blocks overlap in two columns of three cells.
    expect(cellCount(shared!)).toBe(2 * (2 * SPREAD_CELLS + 1));
    expect(patterns.get(shared!.properties.pattern)).toEqual(["#3987e5", "#d55181"]);
    expect(features.map((feature) => feature.properties.names).sort()).toEqual([
      "Leopard",
      "Lion",
      "Lion & Leopard",
    ]);
  });

  it("wraps areas across the date line", () => {
    const { features } = buildRegions([{ ...lion, points: [[179.5, 0.5]] }]);
    const longitudes = features[0].geometry.coordinates.flat(2).map(([longitude]) => longitude);

    expect(Math.min(...longitudes)).toBe(-180);
    expect(Math.max(...longitudes)).toBe(180);
  });

  it("stops at the latitudes a web map can show", () => {
    const { features } = buildRegions([{ ...lion, points: [[0.5, 84.5]] }]);
    const latitudes = features[0].geometry.coordinates.flat(2).map(([, latitude]) => latitude);

    expect(Math.max(...latitudes)).toBe(85);
  });

  it("returns nothing for no sightings", () => {
    expect(buildRegions([lion]).features).toEqual([]);
  });
});

describe("stripePattern", () => {
  function pixel(data: Uint8Array, x: number, y: number) {
    return [...data.slice((y * PATTERN_SIZE + x) * 4, (y * PATTERN_SIZE + x) * 4 + 4)];
  }

  it("fills a single colour solidly", () => {
    const { data } = stripePattern(["#3987e5"]);

    expect(pixel(data, 0, 0)).toEqual([0x39, 0x87, 0xe5, 255]);
    expect(pixel(data, 50, 70)).toEqual([0x39, 0x87, 0xe5, 255]);
  });

  it("alternates diagonal stripes of each colour", () => {
    const { data, width, height } = stripePattern(["#000000", "#ffffff"]);

    expect([width, height]).toEqual([PATTERN_SIZE, PATTERN_SIZE]);
    expect(pixel(data, 0, 0)).toEqual([0, 0, 0, 255]);
    expect(pixel(data, 8, 0)).toEqual([255, 255, 255, 255]);
    expect(pixel(data, 4, 4)).toEqual([255, 255, 255, 255]);
  });

  it.each([2, 3, 4])("tiles seamlessly with %i colours", (count) => {
    const palette = [
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
      [255, 255, 255],
    ];
    const hex = ["#ff0000", "#00ff00", "#0000ff", "#ffffff"].slice(0, count);
    const { data } = stripePattern(hex);

    for (let y = 0; y < PATTERN_SIZE; y++) {
      // Column 0 of the next tile must continue the stripes from the last column.
      const continued = Math.floor(((PATTERN_SIZE + y) % (8 * count)) / 8);
      expect(pixel(data, 0, y).slice(0, 3)).toEqual(palette[continued]);
    }
  });
});
