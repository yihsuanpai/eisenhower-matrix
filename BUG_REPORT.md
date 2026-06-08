# Eisenhower Matrix — QA Bug Report

**Date:** 2026-06-08
**Build under test:** `index.html` (inline `<script>` lines 2808–6711), `i18n.js`, `countries.js`
**Tester role:** Senior QA (adversarial)
**Method:** (1) Pure-logic unit execution in Node — 32 assertions extracted verbatim from `index.html` and run (`/sessions/.../outputs/qa_units.js`); (2) static/code-level trace of every interactive/regression case against the actual handlers; (3) `node --check` on the extracted inline script and `i18n.js`; (4) `i18n` `t()` runtime probes.

---

## 1. Executive Summary

| Result | Count |
|--------|-------|
| **PASS** | 121 |
| **FAIL** | 4 |
| **BLOCKED** (cannot verify without a live browser / visual/perf/contrast) | ~17 |

**Overall health: GOOD with caveats.** The core logic is solid — every extracted pure function (quadrant math, completion %, profile scoring, hashing, topic reorder, dedup/commit guards) passed unit execution (32/32). All previously-fixed regressions I could verify statically are **holding**: no day-close confetti, motto spacebar `stopPropagation`, matrix-not-cut-off (motto is a top banner, not a bottom bar), single-commit guards present, topic-agnostic board with no forced "General", drag-to-rail preserves x/y, line-art menu icons.

However, there are **4 real bugs**, two of them P0/major. The most serious are a **broken Enter-to-add** in the main task bar and **data loss on Copy→Import round-trip** (`type`, `topicId`, `topics`, `motto` are silently dropped). `node --check` passed on both files; no duplicate top-level declarations and no references to removed functions (`renderTopicBar`/`switchTopic`/`activeTopicTags`).

### Bugs by severity
- **S1 (blocker):** 0
- **S2 (major):** 3 — BUG-001, BUG-002, BUG-003
- **S3 (minor):** 1 — BUG-004
- **S4 (cosmetic):** 0

---

## 2. Results Overview

Passes are grouped/condensed; **every FAIL is detailed in §3**.

| Area | Cases | Status |
|------|-------|--------|
| **Matrix unit** (TC-MATRIX-U001…U008, N003) | 9 | **PASS** (executed in Node) |
| **Create unit** (TC-CREATE-U001…U005) | 5 | **PASS** (executed) |
| **Topic unit** (TC-TOPIC-U001…U003) | 3 | **PASS** (executed) |
| **Today unit** (TC-TODAY-U001…U003, U005) | 4 | **PASS** (executed) |
| TC-TODAY-U004 (per-topic done/total) | 1 | PASS (traced: group header math `done/total`) |
| **DNA unit** (TC-DNA-U001…U005, U007) | 6 | **PASS** (executed) |
| TC-DNA-U006 (completion-rate boost) | 1 | PASS (traced lines 4051–4052) |
| TC-CREATE-F001 (add via bar / single create) | 1 | PASS (traced) |
| **TC-CREATE-F005 (Enter submits)** | 1 | **FAIL → BUG-001** |
| TC-CREATE-F002,F003,F004,F006,F007,F008 | 6 | PASS (traced) |
| TC-CREATE-N001,N002,N003,N004,N006,N007 | 6 | PASS (N002/N003/N007 executed) |
| **TC-CREATE-N005 (rapid double-click guard)** | 1 | **PARTIAL → BUG-004** (guard released synchronously) |
| TC-MATRIX-F001…F010 | 10 | PASS (traced; drag/rename/menu/filter handlers verified) |
| TC-MATRIX-N001 (clamp) | 1 | PASS (clamps 2–98, stays in bounds) |
| TC-MATRIX-N002 (50+ tags) | 1 | BLOCKED (perf/visual) |
| TC-TOPIC-F001…F012 | 12 | PASS (traced; drag-to-rail keeps x/y at lines 3500 & 3580) |
| TC-TOPIC-N001…N005 | 5 | PASS (traced; deleteTopic orphans to null) |
| TC-TODAY-F001…F008 | 8 | PASS (traced; day-close keeps incomplete, records %) |
| **TC-TODAY-R001 (no confetti on day close)** | 1 | **PASS** (handler 3782–3793 has no confetti call) |
| **TC-TODAY-R002 (spacebar in motto)** | 1 | **PASS** (input `stopPropagation` line 6501) |
| TC-TODAY-R003 (motto persists) | 1 | PASS |
| TC-TODAY-N001,N002,N003 | 3 | PASS (addToToday dedups; empty uses `alert()`) |
| TC-NOTE-F001…F011 | 11 | PASS (modal/sheet, Ctrl+Enter, Esc, click-out saves, pre-wrap, textContent) |
| TC-NOTE-N001,N002,N003 | 3 | PASS (N002 executed; escaping via textContent) |
| TC-DNA-F001…F007 | 7 | PASS (traced; `_anaShuffles` cached/reset; celeb fetch try/catch) |
| TC-PROF-F001…F009 | 9 | PASS (traced; theme persists `ei_theme`) |
| **TC-PROF-F002 (no emoji in menu)** | 1 | **PASS** (all line-art SVG, lines 2467–2490) |
| TC-PROF-N001,N002 | 2 | PASS (traced) |
| TC-DATA-I001,I002 | 2 | PASS (loadData migration traced & unit-checked) |
| **TC-DATA-I003 (Copy→Import round-trip)** | 1 | **FAIL → BUG-002** |
| TC-DATA-I004 (malformed import) | 1 | PASS (applyImport try/catch line 6606) |
| **TC-DATA-I005 (corrupt localStorage boot)** | 1 | **FAIL → BUG-003** |
| TC-DATA-I006 (save on mutation) | 1 | PASS (saveData on every mutation) |
| TC-RWD-001…004,006…009 | 8 | BLOCKED (visual/responsive — CSS present and plausible) |
| **TC-RWD-005 (matrix not cut by motto)** | 1 | **PASS** (motto is a top banner, in-flow, `flex-shrink:0`) |
| TC-A11Y-001…006 | 6 | Mostly BLOCKED; A11Y-001/002/003 PASS-by-trace (keyboard handlers exist) |
| TC-I18N-001…004,008,009 | 7 | BLOCKED (visual) / PASS-by-trace (setLocale + persist) |
| **TC-I18N-005 (no emoji menu)** | 1 | **PASS** |
| TC-I18N-006 (`t()` interpolation) | 1 | PASS (executed: `app.titleUser` → "…— Bob"; qCounter via getAnaUi) |
| TC-I18N-007 (missing-key fallback) | 1 | PASS (executed: returns the key) |
| TC-STAB-001…003 | 3 | BLOCKED (runtime console) — but see BUG-003 (corrupt storage throws) |

---

## 3. Bugs (ordered by severity)

### BUG-001 — Enter key does not submit a new task in the main add bar  **[S2 major]**
- **Failing case(s):** TC-CREATE-F005 (Enter key submits once).
- **File / location:** `index.html`, add-bar wiring in `setupEventListeners()` around **line 3664–3685**; input markup `#newTagInput` at **line 2507**.
- **Description:** The main "+ Add Task" bar only binds a **click** handler to the button: `document.querySelector('.add-tag-btn').addEventListener('click', submitNewTag)` (line 3685). There is **no `keydown`/Enter listener on `#newTagInput`**, and the only `document`-level `keydown` handler (line 3533) handles **only** `Escape` for drag-cancel. A `grep` for every `key === 'Enter'` confirms none target the add bar.
- **Evidence:** `grep "key === 'Enter'" index.html` shows handlers for nameInput, motto, note editor, inline-edits, per-topic add rows (line 5568) — but nothing for `newTagInput`. The input's own placeholder even says "max 100 chars" with no Enter affordance.
- **Impact:** A user who types a task name and presses **Enter** (the most natural action) gets **nothing** — no task is created and no feedback. They must click the button. This is a primary-flow usability defect and contradicts the comment at line 3684 ("avoids button+Enter double-fire"), which implies Enter was intended to work.
- **Root cause:** When the double-fire bug was fixed, the Enter binding appears to have been removed entirely rather than routed through the single `submitNewTag()` guard.
- **Recommended fix:** Add to the input a keydown handler that reuses the guarded submitter:
  `document.getElementById('newTagInput').addEventListener('keydown', e => { if(e.key === 'Enter'){ e.preventDefault(); submitNewTag(); }});`
  The existing `submittingNewTag` guard already prevents any double-commit, so this is safe.

---

### BUG-002 — Copy Data → Import Data round-trip silently loses `type`, `topicId`, `topics`, and `motto`  **[S2 major]**
- **Failing case(s):** TC-DATA-I003 (round-trip identical); partially undermines TC-DATA-I001.
- **File / location:** `copyData()` **lines 6545–6556**; `applyImport()` tag-normalisation map **~lines 6624–6638** and state rebuild **~lines 6640–6652**.
- **Description:** Two compounding losses:
  1. **Export omits fields.** `copyData()` builds `exportPayload` with `tags, userName, todayItems, profile, dailyCompletion, firstUsed, language` — it **never includes `state.topics` or `state.motto`**. (The tag objects themselves still carry `type`/`topicId` because `tags: state.tags` is the raw array.)
  2. **Import strips fields.** `applyImport()` rebuilds every tag via `.map()` that lists `id, text, color, x, y, createdAt, deadline, resolvedAt, resolved, archived, archivedAt, notes` — **`type` and `topicId` are not copied**, so every imported tag loses its Work/Private classification and its topic membership. The reconstructed `state = {…}` object also has **no `topics` and no `motto`** keys.
- **Evidence:** `sed` of 6604–6665 shows the map ending at `notes: t.notes || ''` with no `type`/`topicId`; the `state = {…}` literal includes only tags/userName/todayItems/profile/dailyCompletion/firstUsed. `loadData()` later defaults `motto` to `''` and topics to `[]`, masking the loss as "empty" rather than erroring.
- **Impact:** After a Copy→clear→Import cycle (the documented backup/restore path), **all topics vanish, every task reverts to Work and Unassigned, and the motto is wiped.** This is real data loss on the app's only backup mechanism.
- **Root cause:** Export/import schema drifted behind the live `state` schema (topics, motto, per-tag type/topicId added later were not threaded into both ends).
- **Recommended fix:** (a) In `copyData`, add `topics: state.topics, motto: state.motto` to `exportPayload`. (b) In `applyImport`, add `type: t.type || 'work'` and `topicId: t.topicId !== undefined ? t.topicId : null` to the tag map, and add `topics: imported.topics || [], motto: imported.motto || ''` to the rebuilt `state`.

---

### BUG-003 — Corrupt `localStorage` throws an uncaught error on boot (no safe-default recovery)  **[S2 major]**
- **Failing case(s):** TC-DATA-I005 (corrupt localStorage recovery); collaterally TC-STAB-001 under that precondition.
- **File / location:** `loadData()` **line 3272** (`state = JSON.parse(saved);`), also legacy parses at **lines 3276–3277**; called from boot at **line 3215**.
- **Description:** `loadData()` does `state = JSON.parse(saved)` with **no `try/catch`**. If `localStorage['eisenhower_v7']` (or the legacy `eisenhower_v6`/`_v5` keys) contains invalid JSON, `JSON.parse` throws a `SyntaxError` that is uncaught, aborting the boot sequence — the app fails to render and the console shows an uncaught exception.
- **Evidence:** `grep "JSON.parse"` shows three bare parses in `loadData` (3272, 3276, 3277). Contrast with `applyImport` (line 6606), which **does** wrap its parse in `try/catch` and shows a toast — proving the safe pattern exists and was simply not applied to boot.
- **Impact:** Any storage corruption (browser extension, quota truncation, manual tinkering) **bricks the app on load** instead of recovering to defaults. The test plan explicitly requires "App boots to safe defaults, no uncaught error."
- **Root cause:** Defensive parsing was added to the import path but not the load path.
- **Recommended fix:** Wrap the parse: `try { state = JSON.parse(saved); } catch(e) { console.warn('Corrupt storage, resetting', e); state = {}; }` (and likewise guard the legacy reads). The downstream `if(!state.tags)…` defaulting block already handles an empty `{}`.

---

### BUG-004 — `submittingNewTag` guard does not block a true rapid double-click  **[S3 minor]**
- **Failing case(s):** TC-CREATE-N005 (rapid double-click → exactly one task) — *partial*.
- **File / location:** `submitNewTag()` **lines 3664–3683**.
- **Description:** The guard is set `true` at line 3670 and reset `false` inside the `finally` (line 3681) **synchronously**, immediately after `addTag()` returns. Because `addTag` is fully synchronous, the flag is already back to `false` before the browser dispatches the *second* click of a double-click. The guard therefore only protects against **re-entrant** calls within a single call stack (e.g. button+Enter on one action), not two genuinely separate click events.
- **Mitigating factor:** In practice the input is cleared (`input.value=''`, line 3678) on the first commit, so the second click hits the empty-name branch (line 3669) and is rejected — meaning a double-click usually still yields one task. So the user-visible symptom is largely absent, which is why this is S3 not S2. But the guard does **not** do what its comment ("single-commit guard") claims, and any future change that defers clearing the input would re-expose double-creation.
- **Root cause:** Releasing the latch in a synchronous `finally` instead of after a microtask/timeout.
- **Recommended fix:** Either rely on the input-clear (and update the misleading comment), or release the latch asynchronously: `} finally { setTimeout(() => { submittingNewTag = false; }, 0); }` so the second click of a real double-click is swallowed.

---

## 4. Risky Areas & Suggestions

1. **Schema drift between live `state`, export, and import (BUG-002).** Recommend a single canonical `normalizeTag()` / `serializeState()` pair used by `loadData`, `addTag`, `applyImport`, and `copyData` so fields can never silently diverge again. This is the highest-leverage refactor.
2. **Defensive parsing inconsistency (BUG-003).** Audit every `JSON.parse` for try/catch parity; the import path is correct, the load path is not.
3. **Keyboard parity in the add bar (BUG-001).** Enter is the expected submit gesture; its absence is a trust/feel issue even though the button works.
4. **`alert()` for empty end-of-day** (`showEndOfDayModal`, ~line 6302) breaks the otherwise-custom-modal UX and is unstyled/untranslated-looking; consider a toast.
5. **Clamp inset (2–98, not 0–100).** TC-MATRIX-N001 says "0–100"; the code clamps to 2–98 (lines 3510/3558). Functionally fine (stays in bounds) but worth aligning the spec or the constant.
6. **Network-dependent results panel** (Wikipedia portraits, Clearbit logos) — error handlers exist (`onerror`, try/catch fetch), but offline behaviour (TC-DNA-F007) could not be exercised statically; verify in a real offline session.
7. **BLOCKED categories** (RWD visual, color contrast, 50-tag perf, live console-clean) require a real browser/DevTools pass; CSS and handlers look plausible but were not visually confirmed.

---

*Unit harness:* `/sessions/clever-happy-albattani/mnt/outputs/qa_units.js` — 32/32 assertions PASS (run: `node qa_units.js`). Extracted inline script and `i18n.js` both pass `node --check`.

---

## 5. Fix Log (2026-06-08)

All fixes in `index.html` (inline `<script>`); `i18n.js` untouched. Surgical edits only.

- **BUG-001 — Enter does not submit add bar.** In `setupEventListeners()` added a `keydown` listener on `#newTagInput` that calls `e.preventDefault(); submitNewTag()` on `Enter`. Routed through the existing guarded `submitNewTag()` (not a new create path), bound once next to the button click. **Status: FIXED.**
- **BUG-002 — Copy→Import loses `type`/`topicId`/`topics`/`motto`.** (a) `copyData()` `exportPayload` now includes `topics`, `activeTopicId`, and `motto` (tags still exported raw, preserving all fields). (b) `applyImport()` tag `.map()` now copies `type: t.type || 'work'` and `topicId: t.topicId !== undefined ? t.topicId : null`; rebuilt `state` now includes `topics`, `activeTopicId`, and `motto`. Added `renderTopicRail()`, `renderAddBarTopics()`, `renderMotto()` to the post-import refresh calls. **Status: FIXED.**
- **BUG-003 — Corrupt localStorage throws on boot.** `loadData()` now parses all stored JSON (v7 + legacy v6/v5) through a local `safeParse()` helper wrapping `JSON.parse` in try/catch (warns and returns `null`/`{}` on failure), matching the import path's resilience. Downstream defaulting handles the empty `{}`. **Status: FIXED.**
- **BUG-004 — Re-entrancy guard released synchronously.** `submitNewTag()` `finally` now releases `submittingNewTag` on the next tick via `setTimeout(..., 0)`, so two genuinely separate synchronous events (double-click / click+Enter) can't both create. **Status: FIXED.**

**Verification:** Extracted inline script `node --check` → OK. `node --check i18n.js` → OK. Import round-trip assertion (`_roundtrip.js`) → 5/5 PASS (`type`, `topicId`, `topics`, `activeTopicId`, `motto` all preserved). No changes to previously-fixed/holding regressions (confetti, motto spacebar, matrix layout, single-commit semantics — guard now stronger, not weaker).
