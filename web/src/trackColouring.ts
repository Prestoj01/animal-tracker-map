import { MONTH_STEPS } from "./tracks";

export type TrackColouring = "animal" | "month";

/**
 * A switch between colouring tracks by animal and by time of year, with a key
 * for the months that shows while they're in use.
 */
export function createTrackColouring(
  container: HTMLElement,
  onChange: (colouring: TrackColouring) => void,
): { set(colouring: TrackColouring): void } {
  const label = document.createElement("label");
  label.className = "switch";
  const input = document.createElement("input");
  input.type = "checkbox";
  const track = document.createElement("span");
  track.className = "switch-track";
  track.setAttribute("aria-hidden", "true");
  label.append(input, track, "Colour tracks by month");

  // Each step is named, so the key never relies on telling blues apart.
  const key = document.createElement("ol");
  key.className = "month-key";
  key.setAttribute("aria-label", "Track colours by month");
  key.hidden = true;
  key.append(
    ...MONTH_STEPS.map(({ label, color }) => {
      const step = document.createElement("li");
      const swatch = document.createElement("span");
      swatch.className = "month-swatch";
      swatch.style.backgroundColor = color;
      step.append(swatch, label);
      return step;
    }),
  );

  const apply = () => {
    key.hidden = !input.checked;
    onChange(input.checked ? "month" : "animal");
  };
  input.addEventListener("change", apply);
  container.replaceChildren(label, key);

  return {
    set(colouring) {
      input.checked = colouring === "month";
      apply();
    },
  };
}
