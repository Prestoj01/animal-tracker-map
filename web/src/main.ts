import { createBottomSheet } from "./bottomSheet";
import { PRESETS } from "./catalog";
import { createMap, type LayerKind } from "./map";
import { createProfilePanel } from "./profilePanel";
import { loadProfiles } from "./profiles";
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

// Both are shared by the cards and the profile panel, so each loads once.
function once<T>(load: () => Promise<T>): () => Promise<T> {
  let request: Promise<T> | undefined;
  return () => {
    request ??= load().catch((error: unknown) => {
      request = undefined;
      throw error;
    });
    return request;
  };
}
const summary = once(loadSummary);
const profiles = createProfilePanel(byId("profile"), once(loadProfiles), () =>
  summary().catch(() => null),
);

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

// On phones the sidebar is a drawer; CSS only shows its handle there.
const sheet = createBottomSheet(byId("sidebar"), byId("sheet-handle") as HTMLButtonElement);
const isPhone = () => window.matchMedia("(max-width: 40rem)").matches;

// The welcome card's quick picks wait until the picker can act on them.
const welcome = byId("welcome");
let picker: PickerApi | null = null;
const welcomeButtons = PRESETS.map((preset) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "preset";
  button.textContent = `${preset.icon} ${preset.label}`;
  button.disabled = true;
  button.addEventListener("click", () => {
    picker?.pick(preset.ids);
    // Get the drawer out of the way so the picks can be seen on the map.
    if (isPhone()) {
      sheet.set("peek");
    }
  });
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
    loadSummary: summary,
    onShowProfile: (species) => {
      profiles.open(species);
      // On phones the drawer would cover the profile.
      if (isPhone()) {
        sheet.set("peek");
      }
    },
    onSelectionChange: (ids) => {
      welcome.hidden = ids.length > 0;
    },
    onReady: (api) => {
      picker = api;
      welcomeButtons.forEach((button) => (button.disabled = false));
    },
  },
);
