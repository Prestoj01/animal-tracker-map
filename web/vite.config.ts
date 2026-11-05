import { defineConfig, type Plugin } from "vitest/config";
import siteConfig from "./site.config.json";
import { addPreviewTags, parseSiteConfig } from "./src/siteHead";

/** Adds link-preview tags to each page, from web/site.config.json. */
function siteHead(): Plugin {
  const config = parseSiteConfig(siteConfig);
  return {
    name: "site-head",
    transformIndexHtml(html, { path }) {
      return addPreviewTags(html, config, path === "/index.html" ? "/" : path);
    },
  };
}

export default defineConfig({
  publicDir: "../data",
  plugins: [siteHead()],
  test: {
    environment: "jsdom",
  },
});
