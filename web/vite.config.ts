import { defineConfig, type Plugin } from "vitest/config";
import siteConfig from "./site.config.json" with { type: "json" };
import { addAnalytics, addPreviewTags, parseSiteConfig } from "./src/siteHead.ts";

/** Adds link-preview tags and visitor stats to each page, from web/site.config.json. */
function siteHead(command: "build" | "serve"): Plugin {
  const config = parseSiteConfig(siteConfig);
  return {
    name: "site-head",
    transformIndexHtml(html, { path }) {
      const withPreviews = addPreviewTags(html, config, path === "/index.html" ? "/" : path);
      // Only built pages count visits, so local development isn't recorded.
      return command === "build" ? addAnalytics(withPreviews, config) : withPreviews;
    },
  };
}

export default defineConfig(({ command }) => ({
  publicDir: "../data",
  plugins: [siteHead(command)],
  build: {
    // The map and the About page are separate pages.
    rollupOptions: { input: ["index.html", "about.html"] },
  },
  test: {
    environment: "jsdom",
  },
}));
