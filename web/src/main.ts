import { createBottomSheet } from "./bottomSheet";
import { PRESETS } from "./catalog";
import { createLazyMap } from "./lazyMap";
import type { LayerKind } from "./map";
import { createProfilePanel } from "./profilePanel";
import { loadProfiles } from "./profiles";
import { loadSightings } from "./sightings";
import { createSightingsController } from "./sightingsController";
import { loadSpecies } from "./species";
import { copyText, readAnimals, withAnimals } from "./shareLink";
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

const playback = byId("playback");
const mapStatus = byId("map-status");
// The map library is most of the download, so it loads separately: the animal
// list is usable meanwhile, and anything picked is drawn once the map arrives.
const map = createLazyMap(
  import("./map").then(({ createMap }) =>
    createMap(byId("map"), mapStatus, {
      onTracksChange: (hasTracks) => {
        playback.hidden = !hasTracks;
        if (!hasTracks) {
          stopReplay?.();
        }
      },
    }),
  ),
  () => {
    mapStatus.textContent = "The map could not be loaded. Check your connection and reload the page.";
    mapStatus.hidden = false;
  },
);

// Replays every track on the map from its start, as a moving dot drawing its line.
const playButton = byId("play-tracks");
const progressBar = byId("playback-progress");
const tracksSwitch = byId("layer-toggles").querySelector<HTMLInputElement>('input[value="tracks"]');
let stopReplay: (() => void) | null = null;
playButton.addEventListener("click", () => {
  if (stopReplay) {
    stopReplay();
    return;
  }
  // A replay is pointless with tracks hidden, so show them.
  if (tracksSwitch && !tracksSwitch.checked) {
    tracksSwitch.checked = true;
    map.setKindVisible("tracks", true);
  }
  playButton.textContent = "■ Stop";
  stopReplay = map.playTracks({
    onProgress: (progress) => {
      progressBar.style.width = `${progress * 100}%`;
    },
    onEnd: () => {
      stopReplay = null;
      playButton.textContent = "▶ Play journeys";
      progressBar.style.width = "0";
    },
  });
});

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

// Read before the picker starts, because it rewrites the address as soon as it shows.
const linkedAnimals = readAnimals(window.location.search);

const shareButton = byId("share");
let shareReset: ReturnType<typeof setTimeout> | undefined;
shareButton.addEventListener("click", async () => {
  const link = window.location.href;
  if (await copyText(link)) {
    shareButton.textContent = "✓ Link copied";
    clearTimeout(shareReset);
    shareReset = setTimeout(() => (shareButton.textContent = "🔗 Share"), 2000);
  } else {
    // Some browsers block the clipboard; let the reader copy it themselves.
    window.prompt("Copy this link to share the map:", link);
  }
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
      shareButton.hidden = ids.length === 0;
      // Replacing, not pushing, so the back button leaves the site as expected.
      window.history.replaceState(null, "", withAnimals(window.location.href, ids));
    },
    onReady: (api) => {
      picker = api;
      welcomeButtons.forEach((button) => (button.disabled = false));
      if (linkedAnimals.length > 0) {
        api.pick(linkedAnimals);
        if (isPhone()) {
          sheet.set("peek");
        }
      }
    },
  },
);
