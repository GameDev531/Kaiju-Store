import { execSync } from "node:child_process";
import { rmSync, existsSync } from "node:fs";

/**
 * Prepares the integration database once, before any test module is imported.
 *
 * This has to happen in globalSetup rather than in a beforeAll: the domain code
 * builds its Prisma client at import time, so the schema must already exist by
 * the time the first `import` statement is evaluated.
 */
export const TEST_DATABASE_URL = "file:./prisma/vitest.db";

export default function setup(): void {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `./prisma/vitest.db${suffix}`;
    if (existsSync(path)) rmSync(path);
  }
  execSync("npx prisma db push --skip-generate", {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "pipe",
  });
}
