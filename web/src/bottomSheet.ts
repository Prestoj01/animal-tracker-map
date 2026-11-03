/**
 * On phones the sidebar becomes a drawer over the map, like Google Maps: it rests
 * at peek, half or full height, and can be dragged or tapped between them.
 */

export type SheetState = "peek" | "half" | "full";

const ORDER: SheetState[] = ["peek", "half", "full"];
const PEEK_PX = 120;
const LABELS: Record<SheetState, string> = {
  peek: "Show more of the animal list",
  half: "Show the full animal list",
  full: "Shrink the animal list",
};

/** How much of the viewport each state shows, in pixels. */
export function visibleHeight(state: SheetState, viewport: number): number {
  if (state === "peek") {
    return PEEK_PX;
  }
  return state === "half" ? viewport * 0.5 : viewport * 0.9;
}

/** The state closest to a dragged height, nudged in the direction of a quick flick. */
export function settle(visible: number, viewport: number, velocity: number): SheetState {
  const FLICK = 0.5; // pixels per millisecond
  const nearest = ORDER.reduce((best, state) =>
    Math.abs(visibleHeight(state, viewport) - visible) <
    Math.abs(visibleHeight(best, viewport) - visible)
      ? state
      : best,
  );
  const index = ORDER.indexOf(nearest);
  if (velocity < -FLICK) {
    return ORDER[Math.min(index + 1, ORDER.length - 1)];
  }
  if (velocity > FLICK) {
    return ORDER[Math.max(index - 1, 0)];
  }
  return nearest;
}

/** Tapping the handle steps up to full, then back down to peek. */
export function nextOnTap(state: SheetState): SheetState {
  return state === "full" ? "peek" : ORDER[ORDER.indexOf(state) + 1];
}

export interface Sheet {
  set(state: SheetState): void;
}

export function createBottomSheet(sheet: HTMLElement, handle: HTMLButtonElement): Sheet {
  let state: SheetState = "half";

  const set = (next: SheetState) => {
    state = next;
    sheet.dataset.sheet = next;
    sheet.style.removeProperty("--sheet-drag");
    handle.setAttribute("aria-expanded", String(next !== "peek"));
    handle.setAttribute("aria-label", LABELS[next]);
  };

  let start: { y: number; visible: number; time: number } | null = null;
  let moved = false;

  handle.addEventListener("pointerdown", (event) => {
    start = {
      y: event.clientY,
      visible: visibleHeight(state, window.innerHeight),
      time: event.timeStamp,
    };
    moved = false;
    handle.setPointerCapture?.(event.pointerId);
  });

  handle.addEventListener("pointermove", (event) => {
    if (!start) {
      return;
    }
    const delta = event.clientY - start.y;
    if (Math.abs(delta) > 4) {
      moved = true;
    }
    const visible = Math.min(
      visibleHeight("full", window.innerHeight),
      Math.max(PEEK_PX, start.visible - delta),
    );
    sheet.dataset.dragging = "true";
    sheet.style.setProperty("--sheet-drag", `${visible}px`);
  });

  const finish = (event: PointerEvent) => {
    if (!start) {
      return;
    }
    const delta = event.clientY - start.y;
    const velocity = delta / Math.max(1, event.timeStamp - start.time);
    delete sheet.dataset.dragging;
    if (moved) {
      set(settle(start.visible - delta, window.innerHeight, velocity));
    }
    start = null;
  };
  handle.addEventListener("pointerup", finish);
  handle.addEventListener("pointercancel", finish);

  // A tap (or Enter/Space on the keyboard) steps through the heights.
  handle.addEventListener("click", () => {
    if (!moved) {
      set(nextOnTap(state));
    }
    moved = false;
  });

  set(state);
  return { set };
}
