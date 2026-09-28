# Final checks: Command Console and Staff Bio-Data

Every date field in the app already uses the shared DD/MM/YYYY calendar picker. No old-style date boxes are left. What remains is checking the work while signed in.

## What will be checked
1. **Staff Bio-Data form** on phone (360px), tablet (768px) and computer (1280px), for both new and existing records:
   - Every field is visible and editable.
   - Region then command choices, Category/Intake, Training "Other", Height (cm with ft/in), Approved By, and Rank/Position search.
   - Dates show as DD/MM/YYYY and the calendar fills the field.
2. **Command Console** at the same three sizes:
   - Nothing is clipped or covered.
   - Page controls work on lists longer than 25 items.
   - Wide tables scroll sideways.
   - Scroll to Top/Bottom buttons appear on long pages.
3. **Staff Directory and exports**: the Intake column shows, and Intake appears in CSV/Excel downloads.
4. Anything broken is fixed straight away, then checked again.

## Technical details
- Playwright runs with a minted admin session, takes screenshots at each size, and captures console errors.
- Only read and fill actions are used. The form is never saved, so no staff records change.
- Run the date unit tests and the typecheck, and review build-errors.log.
- Update roadmap.md when done. The height range settings screen stays open as an optional follow-up.
