/** A span of years to show sightings from; null ends mean open-ended. */
export interface Period {
  label: string;
  from: number | null;
  to: number | null;
}

/** "All years" first, then decades, which are coarse enough to have data in each. */
export const PERIODS: Period[] = [
  { label: "All years", from: null, to: null },
  { label: "Before 1990", from: null, to: 1989 },
  { label: "1990s", from: 1990, to: 1999 },
  { label: "2000s", from: 2000, to: 2009 },
  { label: "2010s", from: 2010, to: 2019 },
  { label: "2020s", from: 2020, to: null },
];

export const ALL_YEARS = PERIODS[0];

/** Whether a sighting's year falls in the period. Unknown years only show in "All years". */
export function inPeriod(year: number | null, period: Period): boolean {
  if (period === ALL_YEARS) {
    return true;
  }
  if (year === null) {
    return false;
  }
  return (period.from === null || year >= period.from) && (period.to === null || year <= period.to);
}

/** How a period reads in a sentence, e.g. "in the 1990s" or "before 1990". */
export function periodPhrase(period: Period): string {
  if (period === ALL_YEARS) {
    return "";
  }
  return period.from === null ? `before ${(period.to ?? 0) + 1}` : `in the ${period.label}`;
}

/**
 * A slider that steps through the periods. Moving it calls `onChange`, which
 * filters the sightings on the map.
 */
export function createTimeline(
  container: HTMLElement,
  onChange: (period: Period) => void,
): { reset(): void } {
  const label = document.createElement("label");
  label.className = "timeline";
  const heading = document.createElement("span");
  heading.className = "timeline-heading";
  heading.textContent = "Sightings from";
  const value = document.createElement("output");
  value.className = "timeline-value";
  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0";
  slider.max = String(PERIODS.length - 1);
  slider.step = "1";
  slider.value = "0";
  const ticks = document.createElement("span");
  ticks.className = "timeline-ticks";
  ticks.setAttribute("aria-hidden", "true");
  ticks.append(
    ...PERIODS.map((period) => {
      const tick = document.createElement("span");
      tick.textContent = period === ALL_YEARS ? "All" : period.label.replace("Before ", "<");
      return tick;
    }),
  );

  const update = () => {
    const period = PERIODS[Number(slider.value)] ?? ALL_YEARS;
    value.textContent = period.label;
    slider.setAttribute("aria-valuetext", period.label);
    onChange(period);
  };
  slider.addEventListener("input", update);

  label.append(heading, value, slider, ticks);
  container.replaceChildren(label);
  value.textContent = ALL_YEARS.label;

  return {
    reset() {
      slider.value = "0";
      update();
    },
  };
}
