import 'dotenv/config';

import { claimPendingAutomationJobs } from '../services/automation/claimJobs.service.js';
import { processClaimedJobs } from '../services/automation/processJob.service.js';

const POLL_MS = Number(process.env.AUTOMATION_POLL_MS) || 2000;
const BATCH_SIZE = Number(process.env.AUTOMATION_BATCH_SIZE) || 10;

let stopping = false;

async function tick() {
  if (stopping) return;
  try {
    const jobs = await claimPendingAutomationJobs(BATCH_SIZE);
    if (jobs.length > 0) {
      const { ok, failed } = await processClaimedJobs(jobs);
      // eslint-disable-next-line no-console
      console.log(
        `[automation-worker] batch ${jobs.length} job(s): ${ok} completed, ${failed} failed (check last_error on automation_jobs)`,
      );
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[automation-worker] tick error', e?.message ?? e);
  }
}

async function loop() {
  // eslint-disable-next-line no-console
  console.log(`[automation-worker] started (poll ${POLL_MS}ms, batch ${BATCH_SIZE})`);
  while (!stopping) {
    await tick();
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

function shutdown(signal) {
  // eslint-disable-next-line no-console
  console.log(`[automation-worker] ${signal} received, stopping…`);
  stopping = true;
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

loop().catch((e) => {
  console.error('[automation-worker] fatal', e);
  process.exit(1);
});
