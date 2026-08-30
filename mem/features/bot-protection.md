---
name: Bot Protection (reCAPTCHA v3)
description: reCAPTCHA v3 gate on the login lookup; fails OPEN on config/browser errors and logs the reason, blocks only on real bad tokens or low score
type: feature
---
- Policy lives in `app_settings` (`recaptcha_enabled`, `recaptcha_min_score`, site key) + `RECAPTCHA_SECRET_KEY`; helper `supabase/functions/_shared/recaptcha.ts`, used by `resolve-staff-email`.
- The reCAPTCHA site key must list every host that signs in: `admin.infinitytechub.com`, `giscybernethrm.lovable.app`, `*.lovable.app` preview hosts and `localhost`. A missing host makes Google return `error-codes: ["browser-error"]`.
- Because a missing/unverifiable token is almost always misconfiguration, verification now SKIPS (fail-open) and logs `recaptcha_token_missing` / `recaptcha_siteverify_failed` / `recaptcha_siteverify_unreachable` for codes `browser-error`, `missing-input-secret`, `invalid-input-secret`, `bad-request`, or when Google is unreachable. Never re-introduce fail-closed on those — it takes the whole login page down.
- Still fails closed for real token problems (`invalid-input-response`, `timeout-or-duplicate`), action mismatch, and score below the configured minimum.
