# BusinessTable filter migration implementation plan

**Goal:** Deliver the legacy column/combined-filter workflow as a reusable, opt-in feature using the existing table runtime, without adding query state to business pages.
**Spec:** `docs/BUSINESS-TABLE-CODEX-MASTER-HANDOFF.md`, `reference/legacy-v3.1/quotation-manager-v3.1/src/column-filter-ui.js`, user migration instructions.
**Architecture:** A single pure predicate/decoding engine serves local tables and business data adapters. Lazy filter UI edits private drafts and applies validated snapshots through runtime commands. Named filter plans use a scoped persistence adapter, not business-page storage logic.
**Tech stack:** Existing locked Vue, TypeScript, Vite, Vitest, Playwright; no dependency upgrades.

## Constraints / rulings
- Existing branch is now `6225ced8d47a954239aee43d38a9e6db2ccb0d70`, a descendant of requested `79110eb`; preserve both subsequent source and verified CI fixes. Do not recreate or force-reset branch.
- User requested continuous execution with no intermediate approval/report; execute inline in the current session.
- This plan covers a verified filter migration slice, not a claim of complete legacy parity. Remaining feature and visual gaps stay explicit in the migration report.
- Reference files remain byte-for-byte unchanged. No reference imports in production.
- Baseline: 220 unit tests passed; 53 browser cases passed after correcting the local browser-cache path. Frozen dependencies restored from the repository's CI artifact; no new install claimed.

## Tasks
1. [x] Unify predicates and guarded decoding (`src/runtime/filter.ts`, `src/core.ts`, filter model, quotation adapter). RED cases: missing operators in applyFilters; null treated as zero; invalid relative dates; over-budget/cyclic groups; typed values; quotation numeric comparisons and groups. GREEN: one predicate implementation and strict finite-depth/size decoding. Run focused tests then full Vitest.
2. [x] Implement typed filter drafts and plan persistence (`src/features/filters/editor.ts`, `plans.ts`, tests). RED: numeric scale captured once, explicit percent conversion, invalid dates/ranges/empty selections, duplicate names, failed saves, table isolation, asynchronous option race cancellation. GREEN: declarative editors with validation and transactional persistence.
3. [x] Implement lazy first-party column/group editor, option picker, saved plans and condition tags. Wire only commands/props in `BusinessTable.vue`; existing query ownership stays in runtime. Add `filters` gate, headless context and capability guards. RED integration: off has no UI/module/details, cancel does not mutate, AND/OR and nested groups work, clear column preserves top search, stale options and revoked capabilities cannot apply.
4. [x] Connect quotation via field metadata, feature declaration and full-result adapter; remove its duplicated predicate logic. Add browser scenarios to development AND production preview: real filtering, cancel, clear, grouping, save/reload, keyboard focus and narrow viewport. No replacement demo or fake buttons.
5. [ ] Verify full release gate, review exact diff, compare all reference hashes, write truthful acceptance results and remaining gaps. Commit and fast-forward only the requested feature branch after rechecking its head. Do not merge or publish a release.

## Review focus
Invalid persisted conditions must not silently become unrestricted valid groups; typed `1`, `"1"`, `false`, `null` remain distinct; scale changes must not reinterpret existing raw queries; late option/save responses must not overwrite new sessions; disabled fields/operators must not be actionable via custom/headless UI.

## Verification record
- Full local `npm run verify:release`: exit 0, 276 Vitest cases across 34 files; 69 Playwright cases across development/production; package type consumer, declarations, library and demo builds passed.
- Original archive: 145/145 byte lengths and SHA-256 hashes match. No dependency, lockfile or reference changes.
- Review was performed inline; no independent agent review is claimed. Plan task 5 publication is recorded by the actual GitHub commit and its workflow, not a future promise.
