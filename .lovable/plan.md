# Login page redesign (split layout, Cybernet brand)

## What changes
- **Left panel (desktop/tablet ≥1024px):** a new professional HRM / workplace-operations photo (officers and staff in a modern operations room), with a deep-green overlay, the Cybernet logo, a gold accent line, the platform name and a short line naming its three areas: HR Management, Staff Management, Operations.
- **Right panel:** the existing sign-in form, unchanged in behaviour (Staff ID / email tabs, password, two-factor, passkey, lockout and session handling), restyled as a clean card on a white/soft surface with deep-green buttons and gold focus highlights.
- **Phones and narrow screens:** the photo collapses to a slim green-and-gold header strip above the form so nothing is hidden or cramped.
- Colours come only from the existing brand theme (deep green primary, gold secondary, white text on dark areas), so Light/Dark mode and brand switching keep working.

## What stays the same
- All sign-in logic, redirects, security checks and the post-login landing screen.
- The HRM, Staff and Operations modules already live in the system (Staff, Attendance, Rosters, Command Operations, etc.); they are not rebuilt. The login panel simply presents them; no working feature is touched.

## Technical details
- Generate `src/assets/login-hrm.jpg` (1280x1600) and import it in `src/pages/Login.tsx`.
- Wrap the current render (line ~467) in a `lg:grid-cols-2` layout; form content moved into the right column untouched.
- Overlay uses `bg-primary/80` and `bg-gradient` tokens; gold via `secondary`/`accent` tokens; no hard-coded colours.
- Verify with Playwright at 360, 768 and 1280 widths on `/login` and confirm sign-in still works.
