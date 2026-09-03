import { PrismaClient } from "@prisma/client";
import { env } from "./lib/env";

/**
 * A single Prisma client per process. Next.js dev reloads modules on every edit,
 * so the client is cached on globalThis to avoid exhausting DB connections.
 */
const globalForPrisma = globalThis as unknown as { __kaijuPrisma?: PrismaClient };

export const db =
  globalForPrisma.__kaijuPrisma ??
  new PrismaClient({
    log:
      env.LOG_LEVEL === "debug"
        ? [{ emit: "stdout", level: "query" }, "warn", "error"]
        : ["warn", "error"],
  });

if (env.NODE_ENV !== "production") globalForPrisma.__kaijuPrisma = db;
