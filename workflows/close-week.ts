// Render Workflows service: finishes closing a care week (pay Rosa by PayPal Payouts, create and send Sarah's and
// Tom's PayPal invoices, mark the period closed). Render retries a failed run with backoff; every step checks what's
// already done and uses the PayPal keys stored when the week was closed, so a retry never pays twice.
// Run: node --experimental-transform-types --import ./workflows/register.mjs workflows/close-week.ts
import { task, type TaskContext } from "@renderinc/sdk/workflows";
import { finishClosingById } from "../src/lib/care";

task(
  { name: "finishCloseWeek", retry: { maxRetries: 4, waitDurationMs: 5_000, backoffScaling: 2 }, timeoutSeconds: 300 },
  async function finishCloseWeek(_ctx: TaskContext, carePeriodId: string) {
    return await finishClosingById(carePeriodId);
  },
);
