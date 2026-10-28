# Regional Commands home screen and command structure (from the attached photo and brief)

The photo shows 20 commands: National Headquarters plus 19 Regional Commands (Ahafo, AIA, Ashanti, Bono, Bono East, Central, Central East, Eastern, Greater Accra, North East, Northern, Oti, Savannah, Tema, Upper East, Upper West, Volta, Western, Western North). Each card has its own number and colour. The brief asks for this screen to appear right after sign-in, with HQ and Greater Accra active and the other commands pending.

## What already exists (checked)
- National Headquarters, Greater Accra, Eastern, Tema and AIA are already in the command list. Eastern and Tema are currently live and AIA is switched off. Sectors, districts and stations already sit under these commands.
- After sign-in, admins land on the Dashboard and staff land on the Portal.
- A branding settings page already exists.

## Phase 1 (this build)
1. **Command list**
   - Add the 15 missing Regional Commands under National Headquarters, numbered and coloured as in the photo.
   - Reuse the 5 existing commands. Nothing is duplicated, and no staff are moved.
   - Add a separate "Activation" status: Active or Pending activation. HQ and Greater Accra are Active. The rest are Pending.
   - The current on/off switch stays as it is. This keeps Eastern, Tema and their staff working. Only a Super Admin can change activation, and every change is logged.
2. **Regional Commands screen** (`/commands`), opened first after sign-in
   - A 5-column card grid matching the photo: number badge, pin, Ghana outline and the command's colour. It shows 2–3 columns on tablets and 1 on phones.
   - Super Admins and admins see all 20 cards. Pending cards are greyed out and marked "Pending activation".
   - Everyone else sees only the card for their own command. Staff with no command, or conflicting assignments, see a "Contact administrator" notice. These staff are also listed for admins to review.
   - Clicking an active card opens that command's existing dashboard. No new copies of modules are made.
   - Live refresh and a "last updated" time.
3. **Card order:** Super Admins and admins can drag cards (touch works too) to save a display order. Changing the order never changes command assignments or permissions, and it is logged.
4. **Branding**
   - Save today's colours as "Brand 1".
   - Create "Brand 2" (Gold, White, Deep Green, Mint Green) and make it active everywhere through the shared colour settings.
   - Admins can create, name, preview and switch brands. Each brand has primary, secondary, accent, background, surface, text, border, success, warning and danger colours.

## Later phases (to confirm after Phase 1)
- Word (.docx) export across reports. CSV, Excel, PDF and print already exist.
- A drag-and-drop view of the full hierarchy, with confirmed and audited changes to reporting lines.
- Full cross-command penetration and responsive regression run.

## Technical details
- Migration on `org_units`: add `activation_status` ('active' | 'pending', default 'pending'), `display_order int` and `brand_color text`. Insert the missing regions with type `regional` and `parent_id` = National Headquarters (`95ab6cb7…`). Set HQ and Greater Accra to active. Write changes through a Super Admin-only RPC `set_command_activation` and `save_command_order`, both of which write audit rows.
- `regional_commands_overview()` security-definer RPC. It returns all 20 cards to admins and super admins. Other callers get only the region that their `org_unit_id` rolls up to, using the existing `can_see_org_unit`. It also returns a flag for unresolved assignments.
- Login redirect is changed to go to `/commands`. Existing `/dashboard` and `/portal` stay reachable.
- Drag and drop uses `@dnd-kit` (already common in the stack, and supports keyboard and touch).
- Brands are stored in an `app_brands` table (name, tokens jsonb, is_active, is_system). `BrandingProvider` applies the active brand's HSL tokens to CSS variables, so components keep using the existing tokens. The Ghana card outline is an inline SVG. The photo itself is not embedded in the app.
- Tests cover: what each role can see, pending cards not opening, card order not changing assignments, and switching brands.
