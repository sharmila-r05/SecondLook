import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "next-env.d.ts",
    "tmp/**",
    // Local tooling folders (gitignored); they hold third-party scripts that aren't part of the app.
    ".claude/**",
    ".codex/**",
    ".agents/**",
    ".impeccable/**",
    ".remember/**",
  ]),
]);
