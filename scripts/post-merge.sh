#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm run typecheck:libs
pnpm --filter @workspace/api-spec run codegen
pnpm --filter @workspace/db run stamp-baseline
pnpm --filter @workspace/db run migrate
