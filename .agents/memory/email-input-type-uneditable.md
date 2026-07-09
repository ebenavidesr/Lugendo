---
name: Email inputs uneditable in Replit preview (password-manager autofill)
description: Recurring bug — login/register email fields reject typing in the user's Safari/Chrome inside the Replit preview iframe; caused by browser password-manager autofill targeting the field.
---

**Rule:** The login/register email inputs must NOT look like autofill targets: no `type="email"`, no `autoComplete="email"` (use `autoComplete="off"`), DOM `name` must not contain "email" (override it after the RHF `{...field}` spread — RHF Controller is ref-based, DOM name is irrelevant), plus `data-lpignore` / `data-1p-ignore`. Keep `inputMode="email"` for the keyboard and Zod for validation.

**Why:** Recurring user-reported bug (fixed 2026-06-01, regressed 2026-06-10, again 2026-07-09). Only the email field is affected, in both Safari and Chrome, and only inside the Replit preview iframe — browsers block their password-manager autofill in cross-origin iframes and the interception leaves the field unable to accept keystrokes. Not reproducible in Playwright (no password manager): diagnostics showed keydown firing with defaultPrevented=false yet value never updating in one run, and 10/10 clean-context loads typing fine.

**How to apply:** Any email/username field on auth pages must follow the rule above. Inline comments in `login.tsx` mark the two spots. If it recurs anyway, next suspects: placeholder text containing "@" feeding autofill heuristics, or having the user open the preview in a new tab (outside the iframe) to confirm the iframe theory.
