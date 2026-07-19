FROM node:24-slim

# bcrypt is a native module; these are only used as a fallback if no
# prebuilt binary matches the platform (rare, but avoids a silent
# postinstall failure on an otherwise-clean deploy).
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@11.11.0

WORKDIR /app
COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @workspace/api-server run build

CMD ["pnpm", "--filter", "@workspace/api-server", "run", "start"]
