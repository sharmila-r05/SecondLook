// Lets the workflow service run the app's own TypeScript with no build step: Node strips the types, and this hook
// resolves the app's `@/` path alias and extensionless relative imports to their .ts files.
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

const SRC = new URL("../src/", import.meta.url);

registerHooks({
  resolve(specifier, context, nextResolve) {
    const spec = specifier.startsWith("@/") ? new URL(specifier.slice(2), SRC).href : specifier;
    const local = spec.startsWith("./") || spec.startsWith("../") || spec.startsWith("file:");
    if (local && context.parentURL?.startsWith("file:") && !context.parentURL.includes("/node_modules/") && !/\.[cm]?[jt]sx?$/.test(spec)) {
      for (const ext of [".ts", "/index.ts"]) {
        const url = new URL(spec + ext, context.parentURL);
        if (existsSync(fileURLToPath(url))) return nextResolve(url.href, context);
      }
    }
    return nextResolve(spec, context);
  },
});
