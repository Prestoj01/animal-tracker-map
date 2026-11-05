import { fetchJson } from "./fetchJson";
import type { Point } from "./sightings";

export interface Study {
  id: number;
  name: string;
  citation: string;
  licenseType: string;
  url: string;
  firstYear: number | null;
  lastYear: number | null;
}

/** A location and the number of days since the animal's track began. */
export type TrackPoint = [longitude: number, latitude: number, day: number];

export interface Track {
  /** The study's name or code for the animal. */
  animal: string;
  /** The date of the first point, as YYYY-MM-DD. */
  start: string;
  points: TrackPoint[];
}

export interface Tracks {
  speciesId: string;
  study: Study | null;
  tracks: Track[];
}

function isTrackPoint(value: unknown): value is TrackPoint {
  return Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
}

function isTrack(value: unknown): value is Track {
  const track = (value ?? {}) as Partial<Track>;
  return (
    typeof track.animal === "string" &&
    typeof track.start === "string" &&
    Array.isArray(track.points) &&
    track.points.every(isTrackPoint)
  );
}

/** Validates the format described in docs/data-format.md. */
export function parseTracks(data: unknown, speciesId: string): Tracks {
  const record = (data ?? {}) as Partial<Tracks>;
  if (record.speciesId !== speciesId) {
    throw new Error(`Expected tracks for ${speciesId}`);
  }
  if (!Array.isArray(record.tracks) || !record.tracks.every(isTrack)) {
    throw new Error(`Malformed tracks for ${speciesId}`);
  }
  const study = record.study;
  if (study !== null && (typeof study?.citation !== "string" || typeof study.url !== "string")) {
    throw new Error(`Malformed study for ${speciesId}`);
  }
  return record as Tracks;
}

export async function loadTracks(speciesId: string): Promise<Tracks> {
  const url = `${import.meta.env.BASE_URL}tracks/${speciesId}.json.gz`;
  return parseTracks(await fetchJson(url), speciesId);
}

/**
 * Splits a track wherever it crosses the 180° meridian, so a whale crossing the
 * Pacific isn't drawn as a line across the whole world.
 */
export function splitAtAntimeridian(track: Point[]): Point[][] {
  const parts: Point[][] = [[]];
  track.forEach((point, index) => {
    const previous = track[index - 1];
    if (previous && Math.abs(point[0] - previous[0]) > 180) {
      parts.push([]);
    }
    parts[parts.length - 1].push(point);
  });
  return parts.filter((part) => part.length >= 2);
}

const LICENCE_NAMES: Record<string, string> = {
  CC_0: "CC0",
  CC_BY: "CC BY",
  CC_BY_NC: "CC BY-NC",
};

export function licenceName(licenseType: string): string {
  return LICENCE_NAMES[licenseType] ?? licenseType.replaceAll("_", " ");
}

function addDays(start: string, days: number): Date {
  const date = new Date(`${start}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

function monthYear(date: Date): string {
  return date.toLocaleDateString("en", { month: "short", year: "numeric", timeZone: "UTC" });
}

/** For hover labels, e.g. "Bald eagle · Freedom · May 2016 – Feb 2021". */
export function trackLabel(speciesName: string, track: Track): string {
  const lastDay = track.points[track.points.length - 1]?.[2] ?? 0;
  const from = monthYear(addDays(track.start, 0));
  const to = monthYear(addDays(track.start, lastDay));
  const dates = from === to ? from : `${from} – ${to}`;
  return `${speciesName} · ${track.animal} · ${dates}`;
}

/**
 * The fixes covered by `progress` (0 to 1) of a track's own timespan, ending
 * with where the animal is at that moment, placed between its two fixes.
 */
export function pointsSoFar(track: Track, progress: number): TrackPoint[] {
  const points = track.points;
  const cutoff = progress * points[points.length - 1][2];
  const covered: TrackPoint[] = [];
  for (let index = 0; index < points.length; index++) {
    const [longitude, latitude, day] = points[index];
    if (day <= cutoff) {
      covered.push(points[index]);
      continue;
    }
    const [fromLongitude, fromLatitude, fromDay] = points[index - 1];
    const share = (cutoff - fromDay) / (day - fromDay);
    covered.push([
      fromLongitude + (longitude - fromLongitude) * share,
      fromLatitude + (latitude - fromLatitude) * share,
      cutoff,
    ]);
    break;
  }
  return covered;
}

/**
 * The part of a track covered by `progress` (0 to 1) of its own timespan, and
 * where the animal is at that moment, for replaying journeys.
 */
export function trackSoFar(track: Track, progress: number): { line: Point[]; head: Point } {
  const line = pointsSoFar(track, progress).map(([lon, lat]): Point => [lon, lat]);
  return { line, head: line[line.length - 1] };
}

/**
 * Track colours by time of year, two months per step: an ordinal blue ramp from
 * dark (January) to light (December), checked with the dataviz palette validator
 * against the dark map.
 */
export const MONTH_STEPS = [
  { label: "Jan–Feb", color: "#184f95" },
  { label: "Mar–Apr", color: "#256abf" },
  { label: "May–Jun", color: "#3987e5" },
  { label: "Jul–Aug", color: "#6da7ec" },
  { label: "Sep–Oct", color: "#9ec5f4" },
  { label: "Nov–Dec", color: "#cde2fb" },
];

/** Which of MONTH_STEPS a point `day` days after `start` falls in. */
export function monthStep(start: string, day: number): number {
  return Math.floor(addDays(start, day).getUTCMonth() / 2);
}

/**
 * Splits a line into runs in the same month step. Each run starts where the last
 * ended, so the coloured pieces join up.
 */
export function splitByMonthStep(
  start: string,
  points: TrackPoint[],
): { step: number; line: Point[] }[] {
  const runs: { step: number; line: Point[] }[] = [];
  points.forEach(([longitude, latitude, day], index) => {
    const step = monthStep(start, day);
    const current = runs[runs.length - 1];
    if (current?.step === step) {
      current.line.push([longitude, latitude]);
      return;
    }
    const previous = points[index - 1];
    runs.push({
      step,
      line: previous ? [[previous[0], previous[1]], [longitude, latitude]] : [[longitude, latitude]],
    });
  });
  return runs.filter((run) => run.line.length >= 2);
}
