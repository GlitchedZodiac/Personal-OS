import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored/generated bundles — not our source. Left un-ignored until
    // 2026-09-08 they contributed 1790 of the repo's 1853 lint problems,
    // burying @typescript-eslint/no-unused-expressions so deep that it
    // could not do its job: that rule flags exactly the dropped-`+` string
    // concatenation that silently truncated the MCP connector's
    // instructions (lib/mcp/server.ts) for two rounds.
    "public/maplibre-gl-shared.mjs", // hand-copied MapLibre worker chunks
    "public/maplibre-gl-worker.mjs", // (see components/trail-map.tsx header)
    ".bench/**", // bundled benchmark fixtures
    "docs/design/**", // design-export scripts, not app code
  ]),
]);

export default eslintConfig;
