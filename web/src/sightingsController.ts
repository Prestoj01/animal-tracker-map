import type { SightingsMap } from "./map";
import type { Sightings } from "./sightings";
import type { Species } from "./species";
import type { PickerHandlers, RowStatus } from "./speciesPicker";

/** Connects the picker to the map: loads, shows and hides each species' sightings. */
export function createSightingsController(
  map: SightingsMap,
  load: (speciesId: string) => Promise<Sightings>,
  legend: HTMLElement,
): PickerHandlers {
  const cache = new Map<string, Promise<Sightings>>();
  // Checked against on arrival, so a slow response can't revive a deselected species.
  const active = new Map<string, symbol>();
  const legendEntries = new Map<string, HTMLElement>();

  const renderLegend = () => {
    legend.replaceChildren(...legendEntries.values());
    legend.hidden = legendEntries.size === 0;
  };

  const show = async (species: Species, color: string, status: RowStatus) => {
    const token = Symbol(species.id);
    active.set(species.id, token);
    status.set("Loading…");

    let request = cache.get(species.id);
    if (!request) {
      request = load(species.id);
      cache.set(species.id, request);
    }
    try {
      const { points } = await request;
      if (active.get(species.id) !== token) {
        return;
      }
      if (points.length === 0) {
        status.set("No sightings");
        return;
      }
      map.showSightings(species.id, species.commonName, color, points);
      status.set(`${points.length.toLocaleString()} places`);

      const entry = document.createElement("li");
      const swatch = document.createElement("span");
      swatch.className = "swatch";
      swatch.style.backgroundColor = color;
      entry.append(swatch, species.commonName);
      legendEntries.set(species.id, entry);
      renderLegend();
    } catch (error) {
      cache.delete(species.id);
      if (active.get(species.id) !== token) {
        return;
      }
      console.error(`Could not load sightings for ${species.id}`, error);
      status.set("Could not load", () => void show(species, color, status));
    }
  };

  return {
    onSelect(species, color, status) {
      void show(species, color, status);
    },
    onDeselect(species) {
      active.delete(species.id);
      map.hideSightings(species.id);
      legendEntries.delete(species.id);
      renderLegend();
    },
  };
}
