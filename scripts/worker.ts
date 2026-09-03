/**
 * Queue worker.
 *
 * Run alongside the web process: `npx tsx scripts/worker.ts`.
 * In production this is a separate deployment unit so a slow provider cannot
 * starve request handling, and so workers scale independently of web dynos.
 */
import { drainQueues } from "../src/server/jobs/handlers";
import { enqueue } from "../src/server/jobs/queue";
import { log } from "../src/server/lib/logger";

const WORKER_ID = `worker-${process.pid}-${Date.now().toString(36)}`;
const IDLE_DELAY_MS = 3_000;
const RETENTION_INTERVAL_MS = 60 * 60_000;

let running = true;
let lastRetentionSweep = 0;

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    log.info("worker.shutdown_requested", { signal, workerId: WORKER_ID });
    running = false;
  });
}

async function loop(): Promise<void> {
  log.info("worker.started", { workerId: WORKER_ID });

  while (running) {
    try {
      if (Date.now() - lastRetentionSweep > RETENTION_INTERVAL_MS) {
        await enqueue("retention_sweep", { at: new Date().toISOString() }, {
          dedupeKey: `retention:${Math.floor(Date.now() / RETENTION_INTERVAL_MS)}`,
        });
        lastRetentionSweep = Date.now();
      }

      const processed = await drainQueues(WORKER_ID, 25);
      if (processed === 0) {
        await new Promise((resolve) => setTimeout(resolve, IDLE_DELAY_MS));
      }
    } catch (error) {
      log.error("worker.loop_error", { workerId: WORKER_ID, error });
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
  }

  log.info("worker.stopped", { workerId: WORKER_ID });
  process.exit(0);
}

void loop();
