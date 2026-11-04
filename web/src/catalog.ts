/** How the site presents each species: its icon, its group, and ready-made combinations. */

interface Entry {
  icon: string;
  group: string;
}

export const GROUPS = ["Big cats", "Savanna & forest", "Bears, wolves & deer", "Ocean", "Birds"];
const OTHER = "Other animals";

const CATALOG: Record<string, Entry> = {
  lion: { icon: "🦁", group: "Big cats" },
  tiger: { icon: "🐅", group: "Big cats" },
  cheetah: { icon: "🐆", group: "Big cats" },
  puma: { icon: "🐆", group: "Big cats" },
  "african-bush-elephant": { icon: "🐘", group: "Savanna & forest" },
  "african-forest-elephant": { icon: "🐘", group: "Savanna & forest" },
  giraffe: { icon: "🦒", group: "Savanna & forest" },
  "white-rhino": { icon: "🦏", group: "Savanna & forest" },
  wildebeest: { icon: "🦬", group: "Savanna & forest" },
  "western-gorilla": { icon: "🦍", group: "Savanna & forest" },
  "eastern-gorilla": { icon: "🦍", group: "Savanna & forest" },
  "giant-panda": { icon: "🐼", group: "Bears, wolves & deer" },
  "polar-bear": { icon: "🐻‍❄️", group: "Bears, wolves & deer" },
  "brown-bear": { icon: "🐻", group: "Bears, wolves & deer" },
  "grey-wolf": { icon: "🐺", group: "Bears, wolves & deer" },
  caribou: { icon: "🦌", group: "Bears, wolves & deer" },
  "humpback-whale": { icon: "🐋", group: "Ocean" },
  "blue-whale": { icon: "🐳", group: "Ocean" },
  "whale-shark": { icon: "🦈", group: "Ocean" },
  "great-white-shark": { icon: "🦈", group: "Ocean" },
  "green-sea-turtle": { icon: "🐢", group: "Ocean" },
  "emperor-penguin": { icon: "🐧", group: "Birds" },
  "bald-eagle": { icon: "🦅", group: "Birds" },
  "snowy-owl": { icon: "🦉", group: "Birds" },
};

/** An emoji for each species, with a paw print for any added later. */
export function speciesIcon(id: string): string {
  return CATALOG[id]?.icon ?? "🐾";
}

export function speciesGroup(id: string): string {
  return CATALOG[id]?.group ?? OTHER;
}

/** Groups in display order; species without a group come last. */
export function groupOrder(): string[] {
  return [...GROUPS, OTHER];
}

export interface Preset {
  label: string;
  icon: string;
  ids: string[];
}

export const PRESETS: Preset[] = [
  { label: "Big cats", icon: "🦁", ids: ["lion", "tiger", "cheetah", "puma"] },
  {
    label: "Ocean giants",
    icon: "🐋",
    ids: ["humpback-whale", "blue-whale", "whale-shark", "great-white-shark"],
  },
  { label: "Arctic", icon: "❄️", ids: ["polar-bear", "caribou", "snowy-owl", "grey-wolf"] },
  {
    label: "Safari",
    icon: "🌍",
    ids: ["lion", "african-bush-elephant", "giraffe", "white-rhino"],
  },
];

/** `count` different ids picked at random, for the "Surprise me" button. */
export function randomPick(ids: string[], count: number, random = Math.random): string[] {
  const pool = [...ids];
  const picked: string[] = [];
  while (picked.length < count && pool.length > 0) {
    picked.push(...pool.splice(Math.floor(random() * pool.length), 1));
  }
  return picked;
}
