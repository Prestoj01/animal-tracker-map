import { createMap, type LayerKind } from "./map";
import { loadSightings } from "./sightings";
import { createSightingsController } from "./sightingsController";
import { loadSpecies } from "./species";
import { renderSpeciesPicker } from "./speciesPicker";
import { loadTracks } from "./tracks";
import "./style.css";

function byId(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing #${id} in index.html`);
  }
  return element;
}

const map = createMap(byId("map"), byId("map-status"));

for (const input of byId("layer-toggles").querySelectorAll("input")) {
  input.addEventListener("change", () => {
    map.setKindVisible(input.value as LayerKind, input.checked);
  });
}

void renderSpeciesPicker(
  byId("species-picker"),
  loadSpecies,
  createSightingsController(
    map,
    { sightings: loadSightings, tracks: loadTracks },
    { legend: byId("legend"), sources: byId("sources") },
  ),
);
