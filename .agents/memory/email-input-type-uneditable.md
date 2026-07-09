---
name: Auth email inputs blocked by native browser autofill
description: Recurring bug — native email/address autofill steals focus on the login/register email fields and blocks typing until reload; mitigation recipe (not 100% eliminable).
---

**Rule:** Auth email/username inputs must minimize autofill-detection signals AND tolerate autofill writes that bypass React:
- No `type="email"`, no `autoComplete="email"` (use `"off"`), DOM `name` must not contain "email" (override after the RHF `{...field}` spread — RHF Controller is ref-based), `data-lpignore` + `data-1p-ignore`, and `inputMode="text"` (inputMode="email" is a strong mobile-autofill signal).
- Custom `onBlur`: if `e.target.value !== field.value`, call `field.onChange(e.target.value)` before `field.onBlur()` — captures native autofill that skips React's onChange.

**Why:** User-confirmed root cause (2026-07): the browser's native email/address autocomplete widget (visible as a `chrome-extension://` frame in devtools) captures focus on click/refocus and the field stops responding to the keyboard until reload. Reproduced in the published app, new tabs, and incognito — not an iframe or app-logic issue. Known React-controlled-form vs browser-autofill conflict; realistic goal is reducing frequency, not eliminating it. Regressed twice before when `type="email"`/`autoComplete="email"` were re-added "for autofill".

**How to apply:** Any email field on auth pages follows the recipe above (inline comments in `login.tsx` mark both spots). If incidents persist, next hardening step: also re-sync the DOM value on `onFocus`, and consider changing the placeholder (contains "@", another heuristic signal).
