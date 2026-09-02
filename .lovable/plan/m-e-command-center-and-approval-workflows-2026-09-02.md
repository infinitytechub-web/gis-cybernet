# M&E Command Center and Approval Workflows

## What gets built

### 1. Command Center with real figures
The `/me` Command Center currently shows a flat grid of numbers from the `me_command_center` function. That function already returns objectives, programmes, projects, measures, achievement, budget, risks and incidents scoped by classification and unit, so the work is on the presentation side plus filters:

- Region, reporting period and department filters wired into the existing function parameters.
- Executive KPI row: objectives, programmes, active projects, average completion, achievement percentage, pending approvals.
- Portfolio health donut (on track / at risk / critical) and a project-status bar chart using Recharts.
- Budget card: approved vs committed vs spent with a utilisation bar.
- Attention lists: top open risks by score, critical incidents, field reports awaiting review, overdue approvals — each row deep-links to its module.
- Empty states where no data exists yet, and a manual refresh plus periodic revalidation.

### 2. Approval workflows for objectives, programmes and projects
Today `me_approvals` and `me_approval_steps` exist but hold no records and nothing writes to them. Add the governed flow:

- Submit for approval from an objective, programme or project record: creates an approval with its ordered steps and moves the record to `pending_approval`.
- Reviewer actions: approve, reject, or return for revision, each requiring a comment; the record advances to the next step or reaches a final decision.
- Final approval sets the record status to `approved`; rejection returns it to `draft` with the reason retained.
- Approvals inbox at `/me/approvals`: my pending decisions, all in-flight approvals for command tier, full step history per approval, and overdue highlighting.
- Every submission and decision is written to the audit trail; decisions are restricted by role so only authorised reviewers can act.

### 3. Scope and E2E tests
A Playwright spec that runs the full slice against the live app:

1. Sign in as a command-tier user.
2. Create a strategic objective, submit it for approval, approve it, confirm status `approved`.
3. Create a programme linked to the objective and run the same approval path.
4. Create a project under the programme and approve it.
5. Submit a field report against the project.
6. Open the Command Center and confirm the counts and the field report appear, and that a non-privileged role is denied the approvals inbox.

Assertions cover both the UI and the database rows so status changes are confirmed consistently in each.

## Technical notes

- New migration: `me_submit_for_approval(record_type, record_id, workflow_key)` and `me_decide_approval(approval_id, decision, comment)` as security-definer functions that validate reviewer authority via the existing `me_can_manage` / `me_can_verify` / command-tier helpers, insert step rows, and update the parent record status transactionally. Status transitions are guarded so a record cannot be double-submitted.
- Extend `me_command_center` with an `approvals` block (pending, overdue, mine) and an `attention` block (top risks, critical incidents, reports pending review) so the dashboard needs one round trip.
- Frontend: split `src/pages/me/MEPage.tsx` so the Command Center and approvals inbox live in `src/components/me/` (`CommandCenterDashboard.tsx`, `ApprovalsInbox.tsx`, `SubmitForApprovalButton.tsx`, `ApprovalDecisionDialog.tsx`), keeping the generic record pages as they are.
- Charts use Recharts with semantic design tokens only. Dates render `DD/MM/YYYY` via the shared formatter.
- Tests: `tests/e2e/me-workflow.spec.ts` following the existing spec conventions, with created records cleaned up at the end.
