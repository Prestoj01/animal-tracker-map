const ICONS: Record<string, string> = {
  lion: "🦁",
  tiger: "🐅",
  cheetah: "🐆",
  puma: "🐆",
  "african-bush-elephant": "🐘",
  "african-forest-elephant": "🐘",
  giraffe: "🦒",
  "white-rhino": "🦏",
  "western-gorilla": "🦍",
  "eastern-gorilla": "🦍",
  "giant-panda": "🐼",
  "polar-bear": "🐻‍❄️",
  "brown-bear": "🐻",
  "grey-wolf": "🐺",
  wildebeest: "🦬",
  caribou: "🦌",
  "humpback-whale": "🐋",
  "blue-whale": "🐳",
  "whale-shark": "🦈",
  "great-white-shark": "🦈",
  "green-sea-turtle": "🐢",
  "emperor-penguin": "🐧",
  "bald-eagle": "🦅",
  "snowy-owl": "🦉",
};

/** An emoji for each species, with a paw print for any added later. */
export function speciesIcon(id: string): string {
  return ICONS[id] ?? "🐾";
}
