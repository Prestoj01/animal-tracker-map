import { defineConfig } from "vitest/config";

export default defineConfig({
  publicDir: "../data",
  test: {
    environment: "jsdom",
  },
});
