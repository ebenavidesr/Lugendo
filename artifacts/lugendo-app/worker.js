// Proxies /api/* to the Railway backend (keeping cookies first-party, since
// the browser only ever talks to this one origin) and serves the built SPA
// for everything else. See wrangler.jsonc for the ASSETS binding.
const API_ORIGIN = "https://lugendo-production.up.railway.app";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      const target = new URL(url.pathname + url.search, API_ORIGIN);
      return fetch(new Request(target, request));
    }

    return env.ASSETS.fetch(request);
  },
};
