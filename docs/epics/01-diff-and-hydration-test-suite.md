# Epic 01 — Diff & Hydration Test Suite

| Field          | Value                              |
| -------------- | ---------------------------------- |
| Owner          | TBD                                |
| Phase          | A (Foundation)                     |
| Estimate       | 3–4 weeks                          |
| Status         | Proposed                           |
| Blocks         | HMR, Streaming SSR, Error Boundaries |
| Blocked by     | —                                  |

## 1. Goal

Establish a comprehensive, fixture-driven test suite for the
[`diff/`](../../src/platform/browser/diff/) and
[`v-node/`](../../src/v-node/) subsystems so that:

- Every code path in `diff()` (render / update / hydrate / remove) has explicit
  fixture coverage.
- Regressions are caught in CI before reaching users.
- Future work (HMR, SSR streaming, error boundaries) can be built on a stable
  foundation.
- Recent regressions of the type seen in commits
  - `175c309 fix: use vChild for key mapping`
  - `2536ae6 fix: compare normalized tag names while hydrating`
  - `ada108e fix: apply correct changeset order for component mounting`

  become impossible to ship undetected.

**Success metric:** `diff/` coverage moves from 0 dedicated test files
→ ≥ 85 % line coverage with 200+ scenario fixtures, all running in < 5 s.

## 2. Context — what we're testing

```
                              ┌──────────────┐
                              │ diff(props)  │  src/platform/browser/diff/diff.ts
                              └──────┬───────┘
        ┌────────────┬─────────────┬─┴───────────┬──────────────┐
        ▼            ▼             ▼             ▼              ▼
   ┌─────────┐  ┌─────────┐  ┌──────────┐  ┌─────────┐   ┌──────────┐
   │ render  │  │ update  │  │ hydrate  │  │ remove  │   │ dispatch │
   │ 186 LOC │  │ 270 LOC │  │ 214 LOC  │  │ 51 LOC  │   │ + 5 type │
   └─────────┘  └─────────┘  └──────────┘  └─────────┘   │ handlers │
                                                          │ 740 LOC  │
                                                          └──────────┘
```

Total surface: ~1650 LOC across 11 files, zero dedicated tests today.

## 3. Scope

### In scope

- Unit tests for `diff()` routing logic
- Fixture-based tests for `render`, `update`, `hydrate`, `remove`
- Tests for each type handler (attribute, component, element, event, text)
- Integration tests for end-to-end SSR-output → hydrate → update flows
- DOM test harness (likely `@b-fuze/deno-dom` or `happy-dom` via `npm:`)
- CI integration with coverage gates
- Property-based tests for keyed list reconciliation (highest-risk algorithm)

### Out of scope

- Refactoring the diff implementation itself (only fix bugs that tests reveal —
  separate PRs)
- Performance optimization (covered by Epic: Benchmarks)
- E2E browser tests with real Chrome (covered later)
- HMR-related diff scenarios (covered by Epic: HMR)

## 4. Task breakdown

### Task 1 — DOM test harness setup

- **Deliverable:** `src/platform/browser/diff/test/_harness.ts`
- **Acceptance:**
  - Exports `createTestDOM()` that returns a fresh `Document` per test
    (using `@b-fuze/deno-dom`)
  - Helper `applyChangeSet(changes, root)` runs `dispatch` against the test DOM
  - Helper `assertDOM(root, expectedHTML)` normalizes whitespace, compares
  - Helper `vnode(jsx)` builds a VNode for any JSX expression
  - Documented in `src/platform/browser/diff/test/README.md`
- **Estimate:** 2 days
- **Risk:** Picking the wrong DOM lib (`deno-dom` is light but lacks full event
  support; `happy-dom` is heavier but more accurate). Spike both for ½ day
  before deciding.

### Task 2 — `render` tests

- **Deliverable:** `src/platform/browser/diff/test/render.test.ts`
- **Coverage targets:**
  - Single element, nested elements, void elements, fragments
  - Text nodes, mixed text+elements, whitespace handling
  - All attribute types: string, boolean, number, null/undefined, `class`,
    `style`, `data-*`, `aria-*`
  - Event handlers: `on-click`, capture variants, removal
  - Components (sync + async), components returning fragments, components
    returning null
  - Refs (`$ref`) attach correctly
  - Lifecycle hooks fire in correct order (`$mount`)
- **Acceptance:** ≥ 40 fixtures, ≥ 90 % line coverage of `render.ts`
- **Estimate:** 3 days

### Task 3 — `update` tests + keyed list property tests

- **Deliverable:**
  - `src/platform/browser/diff/test/update.test.ts`
  - `src/platform/browser/diff/test/update.property.test.ts`
- **Coverage targets:**
  - Attribute add / change / remove
  - Text content change
  - Element type swap (`div` → `span`) → must replace, not patch
  - Children added at start / middle / end
  - Children removed at start / middle / end
  - **Keyed reordering** (the bug class from `175c309`):
    - reverse, shuffle, swap-two, prepend-existing, dedupe, key collisions
    - mixed keyed + unkeyed
  - Component prop change → re-render with same instance (signal preservation)
  - Component swap → unmount + mount, cleanups fire
  - Conditional rendering (`{cond && <X/>}`) toggles
- **Property test:** Generate random sequences of children with random keys;
  assert post-diff DOM matches a freshly rendered DOM. Use `@std/testing/bdd`
  or a small custom shrinker.
- **Acceptance:** ≥ 80 fixtures + 1 property test running 1 000 cases,
  ≥ 90 % line coverage of `update.ts`
- **Estimate:** 5 days
- **Risk:** Property tests will likely surface real bugs. Budget ~2 days inside
  this task for triage; non-trivial fixes go to follow-up PRs and are tracked
  but don't block the test suite landing.

### Task 4 — `hydrate` tests (highest risk)

- **Deliverable:** `src/platform/browser/diff/test/hydrate.test.ts`
- **Why highest risk:** Hydration mismatches are silent and ship to production.
  Recent fixes `2536ae6` (tag normalization) and `ada108e` (changeset order)
  prove this area is fragile.
- **Coverage targets:**
  - Round-trip: `renderToString(vnode)` → `parse HTML` → `hydrate(vnode, nodes, ref)`
    → assert no mutations queued (the "perfect hydration" invariant)
  - Whitespace handling: HTML adds whitespace text nodes that VDOM doesn't have
  - Tag case: `<DIV>` from server → `<div>` from VDOM (the `2536ae6` bug)
  - Self-closing vs explicit close
  - Comment markers for islands
  - Nested islands
  - Island with children passed from outer scope
  - Hydration with stale server HTML (intentional mismatch → expected fixup)
  - Fragments at root, fragments inside elements
  - SVG / MathML namespaces (if supported, otherwise document non-support)
- **Acceptance:** ≥ 50 fixtures, ≥ 85 % coverage of `hydrate.ts`
- **Estimate:** 4 days

### Task 5 — `remove` + `dispatch` + type-handler tests

- **Deliverables:**
  - `src/platform/browser/diff/test/remove.test.ts`
  - `src/platform/browser/diff/types/test/{attribute,component,element,event,text}.test.ts`
- **Coverage targets:**
  - Remove fires `cleanup` callbacks in correct order (children before parents)
  - Removing a component cleans up its signals/effects
  - Refs are nulled on removal
  - Dispatch ordering: changes apply in the order produced by diff
    (the `ada108e` bug)
  - Each type handler: Create / Link / Attach / Mount / Update / Replace /
    Delete actions
- **Acceptance:** ≥ 30 fixtures, every `Action` enum value tested for every
  `Type` it applies to
- **Estimate:** 3 days

### Task 6 — Integration tests (the "no surprises" gate)

- **Deliverable:** `src/platform/browser/diff/test/integration.test.tsx`
- **Scenarios:**
  1. Counter island: SSR → hydrate → click → DOM updates correctly
  2. List with add/remove buttons + keys (the canonical reconciliation demo)
  3. Conditional rendering driven by signal
  4. Form submit + remote function mock + UI feedback
  5. Nested islands with children
  6. Component unmount triggers cleanup
  7. Async component with Suspense-like delay
- **Acceptance:** All 7 scenarios pass, snapshot fixtures committed to repo for
  regression visibility
- **Estimate:** 3 days

### Task 7 — CI integration + coverage gate

- **Deliverable:** Updated `.github/workflows/` (or new file) + `deno.json` tasks
- **Acceptance:**
  - `deno task test` runs all tests, exits non-zero on failure
  - `deno task test:coverage` produces lcov output
  - CI fails if `src/platform/browser/diff/**` coverage drops below 85 %
  - PR template links to test-writing guide
  - Total test runtime < 5 s (excluding property test)
- **Estimate:** 1 day

### Task 8 — Bug triage queue

- **Deliverable:** GitHub issues filed for every bug surfaced by Tasks 2–6
- **Acceptance:** Each bug has minimal repro fixture committed
  (skipped/`Deno.test.ignore` until fixed); roadmap entry created for
  prioritization
- **Estimate:** rolling, expect 1–2 days of triage time across the epic

## 5. Risks & mitigations

| Risk                                                                       | Likelihood | Mitigation                                                                                                                                |
| -------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Property tests surface so many bugs the epic balloons                      | High       | Cap fix work inside the epic; file rest as separate issues with `Deno.test.ignore` and minimal repros — the *test* still lands           |
| DOM lib doesn't faithfully implement event/CSSOM behavior                  | Medium     | Spike-then-decide upfront (Task 1); document any limitations in the harness README                                                        |
| Snapshot tests become noisy                                                | Medium     | Prefer assertion-style tests; reserve snapshots for integration tests only                                                                |
| Tests get coupled to internal `ChangeSet` shape, fragile across refactors  | Medium     | Assert on **DOM outcome**, not on ChangeSet structure, except in the dedicated dispatch tests                                             |
| Hydration tests reveal the spec is ambiguous (e.g. whitespace)             | High       | Document the chosen behavior as ADR; each fixture cites the ADR section it validates                                                      |

## 6. Dependencies

- None blocking — can start immediately
- **Will unblock:** HMR epic (needs reliable diff), Streaming SSR epic, Error
  Boundaries epic
- **Soft dependency:** decision on DOM lib will inform any future browser-API
  code

## 7. Definition of Done

- [ ] All 8 tasks complete with acceptance criteria met
- [ ] `deno task test` green in CI
- [ ] Coverage gate active and ≥ 85 % for `diff/` and `v-node/`
- [ ] Test-writing guide added to docs (`docs/contributing/testing.md`)
- [ ] At least one ADR documenting hydration behavior decisions
      (whitespace, tag case, etc.)
- [ ] Outstanding bugs surfaced are tracked as separate issues with minimal
      repros
- [ ] CHANGELOG entry under Unreleased:
      "Internal: comprehensive diff/hydrate test suite"

## 8. Out-of-band benefits

By the end of this epic you'll incidentally have:

- A reusable JSX → DOM test harness usable for every later epic (HMR, error
  boundaries, forms)
- A library of hydration fixtures that doubles as documentation
- A ChangeSet inspection toolkit usable for a future devtools panel
- Property-test infrastructure reusable for routing, signals, etc.
