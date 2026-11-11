// Records real answers from the model into test/fixtures/anthropic/ (paid: one Sonnet call per case, ~$0.003 each, ~$0.10
// for the whole set). Also writes opinion-eval-run.json: the run's date, model and each call's latency, which the
// response body doesn't carry. Skipped unless RECORD_LIVE=1.
// Run: RECORD_LIVE=1 node --env-file=.env node_modules/.bin/vitest run test/second-opinion.record.test.ts
import { writeFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { afterAll, describe, expect, it } from "vitest";
import { askOpinion, OPINION_MODEL } from "@/lib/second-opinion";
import { OPINION_CASES } from "./second-opinion-cases";

describe.skipIf(process.env.RECORD_LIVE !== "1")("record second opinions (live, paid)", () => {
  const ms: Record<string, number> = {};

  afterAll(() => {
    const run = { recordedAt: new Date().toISOString(), requestedModel: OPINION_MODEL, ms };
    writeFileSync(new URL("./fixtures/anthropic/opinion-eval-run.json", import.meta.url), `${JSON.stringify(run, null, 2)}\n`);
  });

  for (const [name, input] of Object.entries(OPINION_CASES)) {
    it(name, async () => {
      let body = "";
      const api = new Anthropic({
        apiKey: process.env.LLM_API_KEY,
        maxRetries: 0,
        fetch: async (url, init) => {
          const response = await fetch(url, init);
          body = await response.clone().text();
          return response;
        },
      });
      const started = Date.now();
      const opinion = await askOpinion(api, input);
      ms[name] = Date.now() - started;
      writeFileSync(new URL(`./fixtures/anthropic/opinion-${name}.json`, import.meta.url), `${JSON.stringify(JSON.parse(body), null, 2)}\n`);
      console.log(`${name} (${ms[name]} ms): ${JSON.stringify(opinion)}`);
      expect(opinion).toBeTruthy();
    }, 60_000);
  }
});
