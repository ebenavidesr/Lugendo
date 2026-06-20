---
name: Circular import fix pattern
description: How to break circular imports in Vite/React caused by re-exporting from consumer files
---

## Rule
Extract shared constants/types that are used by multiple components into a standalone `*.ts` file (e.g. `activity-meta.ts`). Do NOT define them in a component file and re-export from another component that also imports back — Vite HMR treats that as a circular import and fails to hot-reload the entire module graph.

**Why:** `day-activities-panel.tsx` originally exported `categoryMeta` AND imported `ActivityDetailSheet`. `activity-detail-sheet.tsx` imported `categoryMeta` from `day-activities-panel`. This created a circular import that caused Vite to log "failed to apply HMR as it's within a circular import" and reload the whole page on every change.

**How to apply:** When two or more components need the same constant/type, extract it to `components/<name>.ts` (no JSX). Each consumer imports directly from that file. The original consumer can re-export it (`export { x } from './x'`) for backward compatibility, but must also `import { x }` separately for local use.
