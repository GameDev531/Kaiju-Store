import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
    globalSetup: ["./tests/global-setup.ts"],
    // Integration tests share one database file; parallel files would race on it.
    fileParallelism: false,
    globals: false,
    testTimeout: 20_000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
