import { PRESETS } from "./catalog";
import { createMap, type LayerKind } from "./map";
import { loadSightings } from "./sightings";
import { createSightingsController } from "./sightingsController";
import { loadSpecies } from "./species";
import { renderSpeciesPicker, type PickerApi } from "./speciesPicker";
import { loadSummary } from "./summary";
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

const toggle = byId("sidebar-toggle");
toggle.addEventListener("click", () => {
  const collapsed = document.body.classList.toggle("sidebar-collapsed");
  toggle.setAttribute("aria-expanded", String(!collapsed));
  toggle.querySelector(".visually-hidden")!.textContent = collapsed
    ? "Show the animal list"
    : "Hide the animal list";
});

// The welcome card's quick picks wait until the picker can act on them.
const welcome = byId("welcome");
let picker: PickerApi | null = null;
const welcomeButtons = PRESETS.map((preset) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "preset";
  button.textContent = `${preset.icon} ${preset.label}`;
  button.disabled = true;
  button.addEventListener("click", () => picker?.pick(preset.ids));
  return button;
});
byId("welcome-presets").append(...welcomeButtons);

void renderSpeciesPicker(
  byId("species-picker"),
  loadSpecies,
  createSightingsController(
    map,
    { sightings: loadSightings, tracks: loadTracks },
    { legend: byId("legend"), sources: byId("sources") },
  ),
  {
    loadSummary,
    onSelectionChange: (ids) => {
      welcome.hidden = ids.length > 0;
    },
    onReady: (api) => {
      picker = api;
      welcomeButtons.forEach((button) => (button.disabled = false));
    },
  },
);
