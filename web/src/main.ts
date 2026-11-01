import { createMap } from "./map";
import { loadSpecies } from "./species";
import { renderSpeciesPicker } from "./speciesPicker";
import "./style.css";

function byId(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing #${id} in index.html`);
  }
  return element;
}

createMap(byId("map"), byId("map-status"));
void renderSpeciesPicker(byId("species-picker"), loadSpecies);
