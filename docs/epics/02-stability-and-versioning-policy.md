# Epic 02 — Stability & Versioning Policy

| Field      | Value                                                       |
| ---------- | ----------------------------------------------------------- |
| Owner      | TBD                                                         |
| Phase      | A (Foundation)                                              |
| Estimate   | 1 week                                                      |
| Status     | Proposed                                                    |
| Blocks     | Documentation Site v1, every public-API change going forward |
| Blocked by | —                                                           |

## 1. Goal

Make `@huuma/ui` safely adoptable by establishing an explicit contract between
the project and its users about **what changes, how it changes, and how users
are warned**. Today the project is at `v0.1.36` with no changelog, no
deprecation policy, and JSR auto-publishes on every push to `main`. That works
while there are no users; it stops working the moment the first one shows up.

**Success metric:** A new user can read one document, understand exactly what
"0.x" means, find every breaking change in the last N releases in 30 seconds,
and trust that minor version bumps won't silently delete their code.

## 2. Context — what's missing today

| Concern                | Today                                                                  | Risk                                                          |
| ---------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------- |
| Version bumping        | Manual `ci: tag new version` commits, ad-hoc                           | Easy to forget, easy to bump the wrong segment                |
| Changelog              | None — git log is the source of truth                                  | Users have no signal what changed; release notes ≠ commit log |
| Stability declarations | README says "Developer Preview" but exports look mature                | Users assume the API is stable because it's typed and works   |
| Breaking changes       | Just happen                                                            | Silent breakage; users can't pin safely                       |
| Deprecation            | No mechanism                                                           | No grace period before removals                               |
| Publish gate           | [`publish.yml`](../../.github/workflows/publish.yml) on every `main` push | Any merge can ship a release; no review of release notes      |
| Conventional commits   | Used informally (`feat:`, `fix:`, `ci:`, `refactor:`)                  | Almost there — formalize and use to drive automation         |

## 3. Scope

### In scope

- Versioning policy document (semver interpretation for 0.x and post-1.0)
- `CHANGELOG.md` with backfilled entries from existing tags
- Conventional commits enforcement in CI
- Stability markers on all public exports (`@stable`, `@experimental`, `@internal`)
- Deprecation policy + JSDoc `@deprecated` convention
- Publish workflow gated on a release commit (not every push)
- Public README + JSR metadata aligned with the policy

### Out of scope

- API redesign (covered by Epic 03 — API Surface Audit)
- Documentation site (covered by Epic 04)
- Codemods for breaking changes (consider after 1.0)
- Long-term support branches (only relevant post-1.0)

## 4. Task breakdown

### Task 1 — Author the versioning policy

- **Deliverable:** `docs/versioning.md`
- **Content:**
  - **0.x phase rules:**
    - `0.MAJOR.PATCH` — minor bumps may include breaking changes
    - Every breaking change must appear in CHANGELOG with migration notes
    - Experimental APIs may break in any release
  - **Post-1.0 rules:**
    - Strict semver
    - Breaking changes only in major bumps
    - Deprecations announced one minor before removal in next major
  - **Stability levels:**
    - `@stable` — semver guarantees apply
    - `@experimental` — may break in any release; documented as such
    - `@internal` — not for external use; behind `/internal` namespace
  - **What counts as a breaking change** (explicit list):
    - Removing or renaming an export
    - Changing a function signature (param order, types, return)
    - Changing CLI flags or `deno task` names
    - Changing the on-disk artifact layout (`.huuma/`)
    - Changing the runtime contract (e.g. `pack()` input shape)
  - **What does NOT count** (also explicit):
    - Adding new exports
    - Adding optional parameters
    - Internal refactors that don't change behavior
    - Bug fixes that align behavior with documentation
- **Acceptance:** Document committed; linked from README and JSR description
- **Estimate:** 1 day

### Task 2 — Backfill `CHANGELOG.md`

- **Deliverable:** `CHANGELOG.md` at repo root, format
  [Keep a Changelog](https://keepachangelog.com/)
- **Content:**
  - One section per published version going back as far as `git tag` history
    allows (use `git log <prev>..<curr>` to populate)
  - Group by: **Breaking**, **Added**, **Changed**, **Fixed**, **Internal**
  - Mark experimental features explicitly
  - Add an `## [Unreleased]` section at the top to collect changes between
    releases
- **Acceptance:** Every tagged version has an entry; `Unreleased` exists and is
  empty at start
- **Estimate:** 1 day

### Task 3 — Stability annotations on public exports

- **Deliverable:** JSDoc tags on every export listed in
  [`deno.json`](../../deno.json) `"exports"`
- **Convention:**
  ```ts
  /**
   * Create a Huuma UI app.
   * @stable since 0.1.0
   */
  export function createUIApp() { ... }

  /**
   * @experimental Subject to change. Pin exact versions if you depend on this.
   */
  export function someNewThing() { ... }
  ```
- **Audit work:** Walk every export and decide: stable / experimental / should
  not be exported (move to `/internal` — that's an Epic 03 concern, just flag
  for now).
- **Acceptance:**
  - Every public export has either `@stable` or `@experimental`
  - List of "should-not-be-exported" items handed off to Epic 03
- **Estimate:** 1.5 days

### Task 4 — Deprecation policy + tooling

- **Deliverable:** Section in `docs/versioning.md` + lint rule
- **Convention:**
  ```ts
  /**
   * @deprecated since 0.2.0. Use `newApi()` instead. Will be removed in 0.3.0.
   * @see https://github.com/.../docs/migrations/0.2-newapi.md
   */
  export function oldApi() { ... }
  ```
- **Lint:** Add a rule (or extend [src/lint](../../src/lint/mod.ts)) that warns
  when consumers import a `@deprecated` symbol
- **Acceptance:** Policy documented; one example deprecation cycle walked
  through in docs
- **Estimate:** 1 day

### Task 5 — Conventional commits enforcement

- **Deliverable:** GitHub Action that validates PR titles + commit messages
- **Why PR title:** Squash-merge takes the PR title, so that's what ends up on
  `main`
- **Allowed types:** `feat`, `fix`, `chore`, `ci`, `docs`, `refactor`, `test`,
  `perf`, `build`, `revert`
- **Breaking change marker:** `feat!:` or footer `BREAKING CHANGE: ...`
- **Acceptance:**
  - PRs fail CI if title doesn't match
  - Documented in `.github/PULL_REQUEST_TEMPLATE.md`
- **Estimate:** 0.5 day

### Task 6 — Gate the publish workflow

- **Deliverable:** Updated [`.github/workflows/publish.yml`](../../.github/workflows/publish.yml)
- **New flow:**
  1. Developer merges PRs to `main` — nothing publishes
  2. When ready to release, run `deno task release` locally:
     - Computes next version from conventional commits since last tag
     - Updates `deno.json` `version`
     - Moves `Unreleased` changelog entries into a new versioned section
     - Commits + tags + pushes
  3. CI on tag push → publishes to JSR
- **Tooling option:** Use a small Deno script rather than pulling in a Node
  release tool, to keep the project Deno-only
- **Acceptance:**
  - `publish.yml` triggers on tag push only, not every `main` push
  - `deno task release` exists and is documented
  - One dry-run release cut as validation
- **Estimate:** 1.5 days
- **Risk:** Auto-version bumping from commits is convenient but error-prone.
  Recommend semi-manual: script proposes a version, human confirms.

### Task 7 — README + JSR metadata alignment

- **Deliverable:** Updated [`README.md`](../../README.md)
- **Content:**
  - Replace generic "Developer Preview" warning with link to versioning policy
  - Add badges: version, JSR score, CI status
  - Add "What 0.x means for you" callout: how to pin, where to find migration
    notes, what to expect
  - Add "Stability" section linking to the policy
- **Acceptance:** README explicitly tells a new user how to evaluate stability
  in 30 seconds
- **Estimate:** 0.5 day

## 5. Risks & mitigations

| Risk                                                                          | Likelihood | Mitigation                                                                          |
| ----------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------- |
| Backfilling CHANGELOG is tedious and gets skipped                             | High       | Time-box to 1 day; for older versions, "Initial unspecified release" is acceptable |
| Conventional-commits enforcement annoys contributors                          | Low        | Provide a clear failure message with examples; allow a `-skip-conventional` label  |
| Auto-version bumps pick the wrong bump (e.g. minor when should be major)      | Medium     | Human-in-the-loop confirmation step in `deno task release`                          |
| Marking too many things `@experimental` undermines confidence                 | Medium     | Default to `@experimental` for genuinely uncertain APIs only; bias toward `@stable` for things that have been working for ≥ 6 months |
| Existing tags and version numbers don't match commits cleanly                 | Low        | CHANGELOG entries can be best-effort for pre-policy releases; mark "see git log"   |

## 6. Dependencies

- None blocking
- **Pairs well with:** Epic 03 (API Surface Audit) — surfaces what should be
  internal vs. public, which informs stability markers
- **Unblocks:** Documentation Site (needs a stability story to write about);
  every later epic that introduces or removes public APIs

## 7. Definition of Done

- [ ] `docs/versioning.md` exists and is linked from README + JSR
- [ ] `CHANGELOG.md` exists at repo root with an `Unreleased` section
- [ ] All exports in `deno.json` have `@stable` or `@experimental` JSDoc tags
- [ ] Deprecation policy documented; example deprecation in code
- [ ] Conventional-commits CI check active and documented
- [ ] `publish.yml` triggers only on tag push
- [ ] `deno task release` script exists and has been used at least once
- [ ] README accurately describes the stability story
- [ ] Next published version (`0.2.0` recommended as the "policy in effect"
      marker) lands cleanly through the new flow

## 8. Suggested first published release under the new policy

Cut **`0.2.0`** as the first release with all of the above in place:

- CHANGELOG entry describes the policy itself as the headline change
- All current exports tagged `@stable` or `@experimental`
- README links to the policy
- This becomes the version users can confidently pin against

## 9. Out-of-band benefits

- Forces the API surface decision (Epic 03) by surfacing every export to be
  audited
- Provides infrastructure (CHANGELOG + release script) every later epic uses
- Sets a contributor expectation that's hard to walk back later — better to
  establish now than after the user base grows
