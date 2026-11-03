import type { Point } from "./sightings";

/**
 * Turns sightings into filled areas. The world is cut into a grid, every cell
 * with a sighting is filled along with its neighbours (so scattered records
 * join into areas), and cells shared by several animals get a striped pattern.
 */

export const CELL_DEGREES = 1;
export const SPREAD_CELLS = 1;
// Web maps can't show the poles, so cells stop where the map does.
const MAX_LATITUDE = 85;

export interface RegionInput {
  id: string;
  name: string;
  color: string;
  points: Point[];
}

export interface Regions {
  features: GeoJSON.Feature<GeoJSON.MultiPolygon, { pattern: string; names: string }>[];
  /** Colours of each pattern the features use, keyed by pattern name. */
  patterns: Map<string, string[]>;
}

const COLUMNS = 360 / CELL_DEGREES;

function cellSquare(column: number, row: number): GeoJSON.Position[][] {
  const west = column * CELL_DEGREES - 180;
  const south = Math.max(-MAX_LATITUDE, row * CELL_DEGREES);
  const east = west + CELL_DEGREES;
  const north = Math.min(MAX_LATITUDE, south + CELL_DEGREES);
  return [
    [
      [west, south],
      [east, south],
      [east, north],
      [west, north],
      [west, south],
    ],
  ];
}

export function patternName(colors: string[]): string {
  return `region-${colors.map((color) => color.replace("#", "")).join("-")}`;
}

export function buildRegions(inputs: RegionInput[]): Regions {
  const minRow = Math.floor(-MAX_LATITUDE / CELL_DEGREES);
  const maxRow = Math.ceil(MAX_LATITUDE / CELL_DEGREES) - 1;
  // Each cell remembers which inputs reach it, by their position in `inputs`.
  const cells = new Map<string, Set<number>>();

  inputs.forEach((input, index) => {
    for (const [longitude, latitude] of input.points) {
      const column = Math.floor((longitude + 180) / CELL_DEGREES);
      const row = Math.floor(latitude / CELL_DEGREES);
      for (let dx = -SPREAD_CELLS; dx <= SPREAD_CELLS; dx++) {
        for (let dy = -SPREAD_CELLS; dy <= SPREAD_CELLS; dy++) {
          const y = row + dy;
          if (y < minRow || y > maxRow) {
            continue;
          }
          // Wrap around the date line rather than stopping at it.
          const x = (((column + dx) % COLUMNS) + COLUMNS) % COLUMNS;
          const key = `${x},${y}`;
          const owners = cells.get(key) ?? new Set<number>();
          owners.add(index);
          cells.set(key, owners);
        }
      }
    }
  });

  // One feature per combination of animals keeps the layer small.
  const groups = new Map<string, { owners: number[]; polygons: GeoJSON.Position[][][] }>();
  for (const [key, owners] of cells) {
    const sorted = [...owners].sort((a, b) => a - b);
    const groupKey = sorted.join(",");
    const group = groups.get(groupKey) ?? { owners: sorted, polygons: [] };
    const [column, row] = key.split(",").map(Number);
    group.polygons.push(cellSquare(column, row));
    groups.set(groupKey, group);
  }

  const patterns = new Map<string, string[]>();
  const features: Regions["features"] = [];
  for (const { owners, polygons } of groups.values()) {
    const colors = owners.map((index) => inputs[index].color);
    const pattern = patternName(colors);
    patterns.set(pattern, colors);
    features.push({
      type: "Feature",
      properties: {
        pattern,
        names: owners.map((index) => inputs[index].name).join(" & "),
      },
      geometry: { type: "MultiPolygon", coordinates: polygons },
    });
  }
  return { features, patterns };
}

export const PATTERN_SIZE = 96;
const STRIPE_WIDTH = 8;

function rgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/**
 * Draws diagonal stripes cycling through `colors`; one colour gives a solid fill.
 * The size divides evenly by every stripe cycle up to four colours, so the tile
 * repeats without seams.
 */
export function stripePattern(colors: string[]): {
  width: number;
  height: number;
  data: Uint8Array;
} {
  const rgbs = colors.map(rgb);
  const period = STRIPE_WIDTH * rgbs.length;
  const data = new Uint8Array(PATTERN_SIZE * PATTERN_SIZE * 4);
  for (let y = 0; y < PATTERN_SIZE; y++) {
    for (let x = 0; x < PATTERN_SIZE; x++) {
      const stripe = Math.floor(((x + y) % period) / STRIPE_WIDTH);
      const offset = (y * PATTERN_SIZE + x) * 4;
      data.set([...rgbs[stripe], 255], offset);
    }
  }
  return { width: PATTERN_SIZE, height: PATTERN_SIZE, data };
}
