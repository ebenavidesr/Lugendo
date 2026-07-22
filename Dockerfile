FROM node:24-slim

# bcrypt is a native module; these are only used as a fallback if no
# prebuilt binary matches the platform (rare, but avoids a silent
# postinstall failure on an otherwise-clean deploy).
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@11.11.0

WORKDIR /app

# Copy only the manifests needed to resolve the dependency graph first, so
# `pnpm install` stays cached across builds that don't touch dependencies.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY artifacts/api-server/package.json artifacts/api-server/package.json
COPY artifacts/lugendo-app/package.json artifacts/lugendo-app/package.json
COPY artifacts/mockup-sandbox/package.json artifacts/mockup-sandbox/package.json
COPY lib/api-client-react/package.json lib/api-client-react/package.json
COPY lib/api-spec/package.json lib/api-spec/package.json
COPY lib/api-zod/package.json lib/api-zod/package.json
COPY lib/db/package.json lib/db/package.json
COPY lib/integrations-openai-ai-react/package.json lib/integrations-openai-ai-react/package.json
COPY lib/integrations-openai-ai-server/package.json lib/integrations-openai-ai-server/package.json
COPY lib/object-storage-web/package.json lib/object-storage-web/package.json
COPY scripts/package.json scripts/package.json

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm --filter @workspace/api-server run build

CMD ["pnpm", "--filter", "@workspace/api-server", "run", "start"]
