// Injected at build time via esbuild's `define` (see build.mjs). An ISO
// timestamp identifying when the bundle was built, used to confirm a fresh
// deploy isn't serving a stale cached build (see the `production-migration-hang`
// memory topic for why this was added).
declare const __BUILD_ID__: string;
