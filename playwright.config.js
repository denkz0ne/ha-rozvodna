import { defineConfig } from "@playwright/test";

export default defineConfig({
  timeout: 12000,
  testDir: "tests/browser",
  webServer: {
    command: "python -m http.server 8179 --bind 127.0.0.1",
    url: "http://127.0.0.1:8179",
    reuseExistingServer: false,
    stderr: "ignore",
  },
  use: { baseURL: "http://127.0.0.1:8179", viewport: { width: 1280, height: 840 } },
});
