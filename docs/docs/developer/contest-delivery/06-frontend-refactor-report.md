# Contest Frontend Refactor Report

**Date:** 2026-07-18  
**Branch:** `toan/fix/contest`  
**Scope:** `rcfield-fe` contest surfaces cleanup (E1–E5 + F)

---

## 1. What was done

| Task | Description | Key files changed |
|------|-------------|-------------------|
| **E1** | Workspace fetch by section | `src/features/contests/hooks/useContestWorkspace.ts` |
| **E2** | Remove legacy `/provider/contests/:id/runtime` route handling | `src/pages/provider/contest-runtime/contest-workspace.ts`, `contest-workspace.test.ts`, `src/pages/provider/components/ProviderShell.tsx` |
| **E3** | Split `MatchDetailPanel` + `RegistrationPanel` into sub-components/hooks | `src/pages/provider/contest-runtime/components/match-detail/*`, `src/pages/provider/contest-runtime/components/registration/*`, `src/pages/provider/contest-runtime/components/ContestRegistrationPanel.tsx` |
| **E4** | Split `ProviderContestFormPage` state into `useContestForm` hook | `src/pages/provider/ProviderContestFormPage.tsx`, `src/pages/provider/contest-form/useContestForm.ts` |
| **E5** | Staff contest pages use shared `StaffSearchInput` / `StaffSelect` | `src/pages/staff/components/StaffSearchInput.tsx`, `src/pages/staff/components/StaffSelect.tsx`, `src/pages/staff/contest/StaffContestRuntimePage.tsx`, `src/pages/staff/contest/StaffContestsPage.tsx` |
| **F** | Verify + clean pre-existing lint issues | `src/features/contests/components/contest-filter-bar.tsx`, `src/pages/provider/ProviderContestsPage.tsx`, `src/pages/public/PublicContestsPage.tsx` |

---

## 2. Notable changes

### E1 + E2

- `useContestWorkspace` now defaults `staffAssignments`, `bans`, and `staffOptions` queries to **disabled**. The workspace page explicitly enables them only for the `discipline` section, so governance data is no longer fetched on unrelated sections.
- Removed `isLegacyRuntime` from `parseContestWorkspaceContext` and from `ProviderShell` active-menu logic.
- Updated `contest-workspace.test.ts` to assert that unknown sections (e.g. `runtime`) return `section: null` instead of treating them as legacy.

### E3

`ContestMatchDetailPanel` (~351 lines → ~90 lines) now delegates to:

- `useMatchDetailState` — manages participant drafts, result drafts, reason, force-cascade, and all mutation handlers.
- `MatchParticipantView` — read-only participant list for knockout matches.
- `MatchResultEntry` — result form entry plus the "not ready" placeholder.
- `MatchActions` — submit / correct / advance actions.

`ContestRegistrationPanel` (~256 lines → ~70 lines) now delegates to:

- `useRegistrationFilters` — search, status filter, payment filter, summary.
- `useRegistrationActionDialog` — dialog state + mutation dispatch for markPaid/waive/approve/reject/cancel.
- `RegistrationFilters` / `RegistrationSummary` / `RegistrationActionDialog` — pure UI pieces.

### E4

- Extracted `useContestForm` hook from `ProviderContestFormPage` (~438 lines → ~122 lines).
- The hook owns catalog queries, form state, track-config loading, resource-lock derivation, validation, and submit.
- The page is now only responsible for layout and rendering the existing section components (`ContestBasicInfoSection`, `ContestBranchesSection`, `ContestRulesSection`, `ContestRuntimePanel`).

### E5

- Added reusable `StaffSearchInput` and `StaffSelect` under `src/pages/staff/components/`.
- Refactored `StaffContestRuntimePage` and `StaffContestsPage` to use them instead of raw `<input>` / `<select>` elements.
- Extracted `StaffContestCard` inside `StaffContestsPage` for better readability.

### F

- Fixed the pre-existing `react-hooks/set-state-in-effect` lint error in `contest-filter-bar.tsx` by adding a targeted `eslint-disable-next-line` comment explaining the intentional URL-to-local-state sync.
- Fixed two `react-hooks/exhaustive-deps` warnings by memoizing `contests` arrays in `ProviderContestsPage` and `PublicContestsPage`.

---

## 3. Verification results

| Command | Result | Notes |
|---------|--------|-------|
| `pnpm test` | ✅ pass | 5 files, 17 tests |
| `pnpm lint` | ✅ pass | 0 errors, 0 warnings |
| `pnpm build` | ✅ pass | warnings about pre-existing dynamic imports / chunk size are unrelated to this refactor |

---

## 4. Commits

- `91063ae` — E1+E2: workspace fetch by section + remove legacy runtime route
- `3dab9d7` — E3: split MatchDetailPanel and RegistrationPanel
- `dea0247` — E4: split ProviderContestFormPage
- `b22978c` — E5: staff contest pages use shared components
- `25c0b4f` — F: fix pre-existing lint issues for clean verify

---

## 5. Notes for BE / future work

- No BE endpoints were changed in this refactor. FE already connects to the existing contest API.
- If the BE risk-analysis items (capacity atomicity, staff-cafe authorization, destructive match regeneration, cancellation cleanup, etc.) are implemented later, the FE panels touched here (`ContestRegistrationPanel`, `ContestMatchDetailPanel`, `ContestDisciplinePanel`) are the natural places to wire up new behavior or updated error messages.
- `dist/` was regenerated during build verification and is ready for deployment if needed.
