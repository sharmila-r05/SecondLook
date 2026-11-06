import { assertSandbox } from "@/lib/env";

try {
  assertSandbox();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
