import { speciesIcon } from "./catalog";
import type { Profile, Profiles } from "./profiles";
import type { Species } from "./species";
import type { Summary } from "./summary";

export interface ProfilePanel {
  open(species: Species): void;
  close(): void;
}

function link(href: string, text: string): HTMLAnchorElement {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.target = "_blank";
  anchor.rel = "noopener";
  anchor.textContent = text;
  return anchor;
}

function paragraph(className: string, ...content: (Node | string)[]): HTMLParagraphElement {
  const element = document.createElement("p");
  element.className = className;
  element.append(...content);
  return element;
}

function plural(count: number, one: string, many: string): string {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`;
}

function facts(counts: Summary[string] | undefined): HTMLElement {
  const list = document.createElement("ul");
  list.className = "profile-facts";
  const add = (label: string, value: string) => {
    const item = document.createElement("li");
    const term = document.createElement("span");
    term.textContent = label;
    const detail = document.createElement("strong");
    detail.textContent = value;
    item.append(term, detail);
    list.append(item);
  };
  if (counts) {
    add("Seen in", counts.sightings ? plural(counts.sightings, "place", "places") : "No sightings yet");
    add(
      "Tracked",
      counts.tracks ? plural(counts.tracks, "animal", "animals") : "No tracking data",
    );
  }
  // Filled in once the IUCN Red List is connected.
  add("Conservation status", "Coming soon");
  return list;
}

function renderProfile(
  body: HTMLElement,
  species: Species,
  profile: Profile,
  counts: Summary[string] | undefined,
): void {
  const parts: Node[] = [];

  if (profile.photo) {
    const figure = document.createElement("figure");
    figure.className = "profile-photo";
    const image = document.createElement("img");
    image.src = profile.photo.url;
    image.alt = species.commonName;
    const licence = profile.photo.licenceUrl
      ? link(profile.photo.licenceUrl, profile.photo.licence)
      : profile.photo.licence;
    const caption = document.createElement("figcaption");
    caption.append(
      `Photo: ${profile.photo.author}, `,
      licence,
      ", via ",
      link(profile.photo.sourceUrl, "Wikimedia Commons"),
    );
    figure.append(image, caption);
    parts.push(figure);
  }

  const heading = document.createElement("h2");
  heading.id = "profile-title";
  heading.textContent = `${speciesIcon(species.id)} ${species.commonName}`;
  const scientific = document.createElement("em");
  scientific.textContent = species.scientificName;
  parts.push(heading, paragraph("profile-scientific", scientific));

  if (profile.description) {
    parts.push(paragraph("profile-description", profile.description));
  }
  if (profile.extract) {
    parts.push(paragraph("profile-extract", profile.extract));
  }
  parts.push(facts(counts));
  parts.push(
    paragraph(
      "profile-credit",
      link(profile.url, "Read more on Wikipedia"),
      " · Text CC BY-SA 4.0",
    ),
  );
  body.replaceChildren(...parts);
}

/** A panel showing a species' photo, description and data, with its own loading states. */
export function createProfilePanel(
  panel: HTMLElement,
  loadProfiles: () => Promise<Profiles>,
  loadSummary: () => Promise<Summary | null>,
): ProfilePanel {
  const close = document.createElement("button");
  close.type = "button";
  close.className = "profile-close";
  close.setAttribute("aria-label", "Close");
  close.textContent = "✕";
  const body = document.createElement("div");
  body.className = "profile-body";
  panel.replaceChildren(close, body);
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-labelledby", "profile-title");
  panel.hidden = true;

  // Remembered so focus can return where the reader left off.
  let returnFocus: HTMLElement | null = null;
  let current: Species | null = null;

  const message = (text: string, retry?: () => void) => {
    const element = paragraph("profile-message", text);
    if (retry) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Try again";
      button.addEventListener("click", retry);
      element.append(" ", button);
    }
    body.replaceChildren(element);
  };

  const show = async (species: Species) => {
    current = species;
    message("Loading…");
    try {
      const [profiles, summary] = await Promise.all([loadProfiles(), loadSummary()]);
      if (current !== species) {
        return;
      }
      const profile = profiles[species.id];
      if (!profile) {
        message(`No profile for ${species.commonName} yet.`);
        return;
      }
      renderProfile(body, species, profile, summary?.[species.id]);
    } catch (error) {
      if (current !== species) {
        return;
      }
      console.error(`Could not load the profile for ${species.id}`, error);
      message("Could not load this profile.", () => void show(species));
    }
  };

  const api: ProfilePanel = {
    open(species) {
      if (panel.hidden) {
        returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      }
      panel.hidden = false;
      void show(species);
      close.focus();
    },
    close() {
      current = null;
      panel.hidden = true;
      returnFocus?.focus();
      returnFocus = null;
    },
  };

  close.addEventListener("click", api.close);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) {
      api.close();
    }
  });
  return api;
}
