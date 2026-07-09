---
name: Email input type="email" uneditable
description: Recurring bug — type="email" on auth email inputs makes them uneditable/disabled-looking in the user's browser; use inputMode="email" instead.
---

**Rule:** Never use `type="email"` on the login/register email inputs (or other email fields) in this project. Use `inputMode="email"` + `autoComplete="email"` + autoCapitalize/autoCorrect off instead. Zod (`z.string().email()`) already enforces validation.

**Why:** Recurring bug reported multiple times by the user: with `type="email"` the field appears disabled / rejects typing in their browser (likely extension/password-manager interference). First fixed 2026-06-01 by removing `type="email"`; regressed 2026-06-10 when it was re-added "for autofill"; fixed again 2026-07-09. Autofill works fine with `autoComplete="email"` alone.

**How to apply:** When adding or editing any email input, use `inputMode="email"`, never `type="email"`. Inline comments in `login.tsx` mark the two historical spots.
