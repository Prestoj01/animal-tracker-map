import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMap } from "./map";

type Handler = (event: { error?: Error }) => void;

const mock = vi.hoisted(() => ({
  handlers: new Map<string, (event: { error?: Error }) => void>(),
  failToConstruct: false,
}));

// jsdom has no WebGL, so the real library cannot run here.
vi.mock("maplibre-gl", () => ({
  Map: class {
    constructor() {
      if (mock.failToConstruct) {
        throw new Error("WebGL unavailable");
      }
    }
    addControl() {}
    on(event: string, handler: Handler) {
      mock.handlers.set(event, handler);
    }
  },
  NavigationControl: class {},
  setWorkerUrl: () => {},
}));
vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));

let status: HTMLElement;

function start() {
  createMap(document.createElement("div"), status);
}

beforeEach(() => {
  mock.handlers.clear();
  mock.failToConstruct = false;
  status = document.createElement("p");
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("createMap", () => {
  it("shows loading until the map loads", () => {
    start();
    expect(status.hidden).toBe(false);
    expect(status.textContent).toContain("Loading map");

    mock.handlers.get("load")?.({});
    expect(status.hidden).toBe(true);
  });

  it("shows the failed state when the map errors before loading", () => {
    start();
    mock.handlers.get("error")?.({ error: new Error("style failed") });

    expect(status.textContent).toContain("could not be loaded");
  });

  it("shows the failed state when WebGL is unavailable", () => {
    mock.failToConstruct = true;
    start();

    expect(status.textContent).toContain("could not be loaded");
  });

  it("shows the failed state when loading times out", () => {
    start();
    vi.advanceTimersByTime(15000);

    expect(status.textContent).toContain("could not be loaded");
  });

  it("clears a timed-out failure if the map loads late", () => {
    start();
    vi.advanceTimersByTime(15000);
    mock.handlers.get("load")?.({});

    expect(status.hidden).toBe(true);
  });

  it("stays visible through errors after loading", () => {
    start();
    mock.handlers.get("load")?.({});
    mock.handlers.get("error")?.({ error: new Error("tile failed") });

    expect(status.hidden).toBe(true);
  });
});
