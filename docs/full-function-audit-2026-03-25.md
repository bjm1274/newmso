# Full Function Audit - 2026-03-25

## Commands Run

```powershell
npm run lint
npx next typegen
npx tsc --noEmit --pretty false
npm run build
npx playwright test --grep-invert @real-db --reporter=line
npm run test:e2e:real
```

## Summary

- `lint`: passed
- `next typegen`: passed
- `tsc --noEmit`: passed
- `build`: passed
- `mock E2E`: 79 passed / 47 failed
- `real-db E2E`: 3 passed / 0 failed

## What Is Clearly Healthy

- Base build pipeline is healthy.
- Live Supabase connectivity is healthy enough for:
  - invalid login rejection
  - main shell load
  - live notification insert without refresh
- Approval flows are mostly stable.
- Extra features walkthrough/deep flows are mostly stable.
- Several chat deep-action flows still pass.
- Inventory detailed walkthroughs are not broadly broken.

## Main Failure Buckets

### 1. Admin / Company Manager / Staff Permission Navigation

Representative failures:

- `admin-auth.desktop.spec.ts`
- `admin-detailed-walkthrough.desktop.spec.ts`
- `smoke.desktop.spec.ts` company manager save flow
- `smoke.desktop.spec.ts` team manager add flow
- `smoke.desktop.spec.ts` staff permission copy flow
- `smoke.desktop.spec.ts` staff permission toggle save flow
- `smoke.desktop.spec.ts` realistic monthly operations lifecycle

Observed pattern:

- `company-manager-view`
- `staff-permission-view`
- specific admin submenu test ids

These are not being found consistently. This looks like either:

- admin routing/state regression
- changed test ids
- submenu visibility logic drift after recent menu/workspace changes

### 2. Board Schedule Persistence After Reload

Representative failures:

- `board-detailed-walkthrough.desktop.spec.ts` schedule post appears on the calendar immediately after registration
- `board-detailed-walkthrough.desktop.spec.ts` mri schedule survives refresh and keeps contrast flag

Observed pattern:

- test passes before reload
- after `page.reload()`, `board-view` is not visible

Likely cause:

- menu state reset behavior now prefers `내정보` on boot/reload
- tests still assume board view persistence across reload

This may be:

- intended product behavior + stale test expectation
- or an actual board state restore regression, depending on desired UX

### 3. Chat Detailed Surface / Message Action UI

Representative failures:

- `chat-detailed-walkthrough.desktop.spec.ts`
- `chat-reverse-actions.desktop.spec.ts`

Observed pattern:

- `chat-open-group-modal` not found
- `chat-message-action-edit` not found

Likely cause:

- changed UI entry point
- action menu not opening in the same way under test
- stale selectors after recent chat refactors

### 4. HR / Leave / MyPage Practical Flows

Representative failures:

- `hr-detailed-walkthrough.desktop.spec.ts`
- `leave-management.desktop.spec.ts`
- `mypage-deep-actions.desktop.spec.ts` commute check in/out
- `mypage-deep-actions.desktop.spec.ts` certificate print/download
- `salary-password.desktop.spec.ts`

Observed pattern:

- views not visible when expected
- practical side effects not occurring in mocked flow

Needs focused rerun by feature to separate:

- actual regression
- stale fixture data
- changed menu structure

### 5. Notification Realtime Regression Under Full-Suite Conditions

Representative failures:

- `notification-realtime.desktop.spec.ts` single live notification
- `notification-realtime.desktop.spec.ts` routing by type
- `notification-realtime.desktop.spec.ts` multi-tab native popup uniqueness

Observed pattern:

- targeted notification checks have passed in isolation before
- they fail again inside the full suite

Likely cause:

- state leakage between tests
- notification fixtures/mocks colliding when full suite runs in one pass
- stale assumptions after recent server-side notification changes

### 6. Payroll / Settlement / Contract Operations

Representative failures:

- `payroll-ops.desktop.spec.ts` dependent deduction finalize
- `payroll-ops.desktop.spec.ts` sender fallback to in-app notifications
- `smoke.desktop.spec.ts` payroll view opens through HR menu state
- `smoke.desktop.spec.ts` offboarding finalize flow
- `smoke.desktop.spec.ts` interim settlement save
- `smoke.desktop.spec.ts` regular payroll finalize
- `smoke.desktop.spec.ts` regular payroll save failure guard
- `smoke.desktop.spec.ts` payroll tax file utility
- `smoke.desktop.spec.ts` contract auto generator

Observed pattern:

- payroll-related subviews are not consistently opened
- some end-to-end flows depend on menu state restore that may no longer match current app behavior

### 7. Shift Planner / Ward Generation

Representative failures:

- `shift-planner-advanced-rules.desktop.spec.ts`
- `shift-planner.desktop.spec.ts` weekly mode
- `shift-planner.desktop.spec.ts` outpatient weekday day shift behavior
- `shift-planner.desktop.spec.ts` management/surgery allowed shift families
- `shift-planner.desktop.spec.ts` mixed ward roster
- `shift-planner.desktop.spec.ts` dedicated staff detection
- `shift-planner.desktop.spec.ts` shortage warning
- `shift-planner.desktop.spec.ts` consecutive work day protection
- `shift-planner.desktop.spec.ts` block day after evening
- `shift-planner.desktop.spec.ts` approved leave reflection
- `shift-planner.desktop.spec.ts` preferred off reflection

Observed pattern:

- this is the largest remaining unstable area in the mock suite
- either fixtures fell behind current roster generator behavior, or the planner still has functional regressions

This area needs a dedicated pass, not piecemeal fixes.

### 8. Inventory / Mobile Shell

Representative failures:

- `inventory-supply-approval.desktop.spec.ts` approved supply issue flow
- `smoke.desktop.spec.ts` inventory stock-out flow
- `smoke.mobile.spec.ts` mobile admin tab switching gets stuck before `inventory-view`

Observed pattern:

- desktop inventory has at least one operations regression
- mobile shell still has a tab/view exposure issue around inventory

## Real-DB Result

These passed:

- invalid login remains read-only against live backend
- main shell loads against live Supabase
- live notification insert appears without refresh

Interpretation:

- core live backend connectivity is not generally broken
- the broad failure cluster is mostly in mocked end-to-end flows, routing expectations, feature-level selectors, and interaction paths

## Most Likely Cross-Cutting Cause

There is a strong signal that recent changes to:

- login/start screen reset behavior
- grouped HR/admin navigation
- chat action entry points

have invalidated a meaningful chunk of the E2E assumptions.

That means the current 47 failures are likely a mix of:

- real regressions
- stale tests
- selectors that no longer match current UI

## Recommended Next Fix Order

1. Admin / company manager / staff permission view exposure
2. Board schedule refresh persistence expectations
3. Chat detailed walkthrough selectors and action menu paths
4. Notification realtime suite isolation issues
5. Shift planner suite stabilization
6. Payroll practical flow stabilization
7. Mobile inventory tab visibility

## Current Overall Verdict

The application is not in a "full-suite green" state.

However, it is also not broadly nonfunctional:

- build and type safety are green
- live backend smoke is green
- 79 mock E2E tests still pass

The remaining work is concentrated in a few large functional clusters and test assumptions, not a total-system collapse.
