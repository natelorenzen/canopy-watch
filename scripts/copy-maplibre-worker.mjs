// MapLibre v6 starts its web worker from a module URL that Turbopack doesn't emit. Serve the
// worker (and the shared chunk it imports) from our own origin instead; see components/AlertMap.tsx.
import { copyFileSync, mkdirSync } from "node:fs";

mkdirSync("public/maplibre", { recursive: true });
for (const f of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(`node_modules/maplibre-gl/dist/${f}`, `public/maplibre/${f}`);
}
