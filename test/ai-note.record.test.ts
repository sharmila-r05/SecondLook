// Records real answers from the model into test/fixtures/anthropic/ (paid: one Sonnet call per case, ~$0.003 each).
// Skipped unless RECORD_LIVE=1. Run: RECORD_LIVE=1 node --env-file=.env node_modules/.bin/vitest run test/ai-note.record.test.ts
import { writeFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { writeNote } from "@/lib/ai-note";
import { NOTE_CASES } from "./ai-note-cases";

describe.skipIf(process.env.RECORD_LIVE !== "1")("record AI notes (live, paid)", () => {
  for (const [name, input] of Object.entries(NOTE_CASES)) {
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
      const written = await writeNote(api, input);
      const ms = Date.now() - started;
      writeFileSync(new URL(`./fixtures/anthropic/note-${name}.json`, import.meta.url), `${JSON.stringify(JSON.parse(body), null, 2)}\n`);
      console.log(`${name} (${ms} ms): ${JSON.stringify(written)}`);
      expect(written?.note).toBeTruthy();
    }, 60_000);
  }
});
