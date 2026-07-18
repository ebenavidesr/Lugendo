if (!process.env.PUBLIC_APP_URL) {
  throw new Error("PUBLIC_APP_URL env var is required");
}

export const PUBLIC_APP_URL = process.env.PUBLIC_APP_URL.replace(/\/$/, "");
