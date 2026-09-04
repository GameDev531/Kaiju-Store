import { execSync } from "node:child_process";
import { rmSync, existsSync } from "node:fs";

/**
 * Prepares the integration database once, before any test module is imported.
 *
 * This has to happen in globalSetup rather than in a beforeAll: the domain code
 * builds its Prisma client at import time, so the schema must already exist by
 * the time the first `import` statement is evaluated.
 */
/**
 * O caminho é relativo ao diretório do schema (`prisma/`), não ao cwd — é assim
 * que o Prisma resolve `file:`. Escrever "file:./prisma/vitest.db" aqui criava
 * `prisma/prisma/vitest.db`, fora do .gitignore e fora do alcance da limpeza
 * abaixo: o banco de teste nunca era zerado entre execuções.
 */
export const TEST_DATABASE_URL = "file:./vitest.db";

/**
 * Returns a teardown function. Individual test files must NOT disconnect the
 * shared Prisma client — doing so in one file's afterAll tears the connection
 * down for every file that runs afterwards, which produced a failure that only
 * appeared when the whole suite ran together.
 */
export default function setup(): () => void {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `./prisma/vitest.db${suffix}`;
    if (existsSync(path)) rmSync(path);
  }
  execSync("npx prisma db push --skip-generate", {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "pipe",
  });

  return () => {
    for (const suffix of ["", "-journal", "-wal", "-shm"]) {
      const path = `./prisma/vitest.db${suffix}`;
      if (existsSync(path)) rmSync(path);
    }
  };
}
