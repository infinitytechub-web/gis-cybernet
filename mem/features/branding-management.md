---
name: Branding Management
description: Admin-only branding customization (names, logos, favicon, theme colors, footer) stored in app_settings + branding storage bucket
type: feature
---
Admin-only **Branding** tab in System Settings (`src/components/settings/BrandingSettings.tsx`).

Editable: system name (`system_label`), company name, company logo, favicon, login-screen logo, dashboard logo, primary/secondary/accent theme colors (HSL "H S% L%"), footer text. All stored on the singleton `app_settings` row — survives redeploys, no code changes needed.

- Images live in the private `branding` storage bucket (public buckets are blocked in this workspace). Read policy grants anon + authenticated so the login screen can resolve signed URLs; write/delete restricted to admins. Max 2 MB, PNG/JPEG/WEBP/SVG/ICO.
- `get_public_branding()` RPC is granted to anon + authenticated (login screen). `get_public_app_settings()` stays authenticated-only.
- `src/hooks/useBranding.ts` fetches + resolves signed URLs; `useRefreshBranding()` invalidates after save for instant propagation.
- `src/components/BrandingProvider.tsx` (mounted in App.tsx) writes `--primary`, `--ring`, `--secondary`, `--sidebar-primary`, `--brand-accent` on `<html>` and swaps favicon + document title at runtime.
- shadcn's `--accent` is NOT overridden (it is a light hover surface); brand accent uses the dedicated `--brand-accent` token, used for the header title in Layout.
