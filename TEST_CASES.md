# Eisenhower Matrix App — Test Plan & Test Cases

## 1. Introduction

This document is the QA test plan for the **Eisenhower Matrix** productivity web app — a single-page, client-only application built from three files: `index.html` (markup + styles + all app logic), `i18n.js` (translation strings and the `t()` helper), and `countries.js` (nationality datalist).

The app has **no backend**. All state (tasks/tags, topics, today items, profile, motto, theme, Work-DNA results, daily-completion history) is persisted in the browser's **`localStorage`**. There is no network dependency except optional external image fetches (Wikipedia portraits) which must degrade gracefully.

Supported UI languages (per `i18n.js`): **English (en), Japanese (ja), German (de), Spanish (es)**.

### 1.1 How to run these tests

1. Serve the folder over a local static server (e.g. `python3 -m http.server`) or open `index.html` directly in a modern browser (Chrome, Firefox, Safari, Edge).
2. Open DevTools → **Console** (must stay error-free) and **Application → Local Storage** (to observe persistence).
3. Unless a precondition says otherwise, **start each case from a clean slate**: `localStorage.clear()` then reload. To test migration/persistence, inject the specified JSON into the app's storage key first.
4. "Pure function" / unit cases are run by calling the function in the DevTools console (functions are global on `window`) and asserting the returned value. No build/test runner is required.
5. RWD cases use DevTools device toolbar at the stated viewport widths. Touch cases require touch emulation or a real device.

### 1.2 Conventions

- **Tag** = a task object in `state.tags`. **Topic** = a grouping in `state.topics`. **Today item** = an entry in `state.todayItems`.
- Coordinate model (verified in code): `x` = horizontal 0–100 (urgency, `x>=50` urgent), `y` = vertical 0–100 (`y<50` important). Quadrants: `q1`=Do (urgent+important), `q2`=Schedule (important, not urgent), `q3`=Delegate (urgent, not important), `q4`=Eliminate (neither).
- Priority: **P0** = critical/blocking, **P1** = major, **P2** = minor/cosmetic.

---

## 2. Task Creation

### 2.1 Unit tests

| ID | Title | Type | Preconditions | Steps | Expected | Priority |
|----|-------|------|---------------|-------|----------|----------|
| TC-CREATE-U001 | `addTag` returns/creates a single tag object | unit | App loaded | In console, record `state.tags.length`; call `addTag('X', null, 'work', null)` | `state.tags.length` increases by exactly 1; new tag has `x:50,y:50`, `resolved:false`, `topicId:null`, a unique `id`, default `type` | P0 |
| TC-CREATE-U002 | `addTag` honours `topicId` argument | unit | A topic with id `T1` exists | Call `addTag('X', null, 'work', 'T1')` | New tag's `topicId === 'T1'` | P0 |
| TC-CREATE-U003 | `addTag` honours `type` argument | unit | App loaded | Call `addTag('X', null, 'private', null)` | New tag's `type === 'private'` | P1 |
| TC-CREATE-U004 | `addTag` stores deadline as ISO | unit | App loaded | Call `addTag('X', '2026-12-31T00:00:00.000Z', 'work', null)` | `deadline` stored verbatim; null when passed null | P1 |
| TC-CREATE-U005 | `genId` uniqueness | unit | App loaded | Call `genId()` 1000× and collect into a Set | Set size === 1000 (no collisions) | P1 |

### 2.2 Feature tests

| ID | Title | Type | Preconditions | Steps | Expected | Priority |
|----|-------|------|---------------|-------|----------|----------|
| TC-CREATE-F001 | Add task via main bar (minimal) | feature | Clean state | Type "Buy milk" in add bar, click **+ Add Task** | Exactly one tag created; appears on matrix immediately at center; input clears; focus returns to input | P0 |
| TC-CREATE-F002 | Add task with deadline | feature | Clean state | Enter name + a deadline date, Add | Tag created with that deadline; shows in deadline bar | P1 |
| TC-CREATE-F003 | Work/Private type toggle | feature | Clean state | Toggle to **Private**, add a task | Created tag has `type:'private'`; visible under Private matrix filter, hidden under Work | P1 |
| TC-CREATE-F004 | Topic select incl. "No topic" | feature | At least 2 topics exist | Choose a specific topic, add | Tag filed under that topic; if "No topic" chosen, `topicId:null` and appears under Unassigned | P0 |
| TC-CREATE-F005 | Enter key submits once | feature | Clean state | Type name, press **Enter** | Exactly one task created (no button+Enter double fire) | P0 |
| TC-CREATE-F006 | Per-topic "+ Add task" row (Today tab) | feature | Today tab open with topic group "Work" | Click that group's **+ Add task**, type "Spec", Enter | Exactly one task created, `topicId` = that group's topic, added to Today, appears on matrix | P0 |
| TC-CREATE-F007 | Per-topic add for Unassigned group | feature | Today tab, Unassigned group visible | Add task from Unassigned **+ Add task** | One task with `topicId:null` created and shown | P1 |
| TC-CREATE-F008 | Per-topic add row cancel | feature | Today tab | Click + Add task, type text, press **Esc** | No task created; row restores to plain "+ Add task" | P1 |

### 2.3 Negative / edge cases

| ID | Title | Type | Preconditions | Steps | Expected | Priority |
|----|-------|------|---------------|-------|----------|----------|
| TC-CREATE-N001 | Empty name rejected (main bar) | feature | Clean state | Leave name empty, click Add | No task created; input border flashes accent3 for ~1s; focus on input | P0 |
| TC-CREATE-N002 | Whitespace-only name rejected | feature | Clean state | Type "   ", Add | Trimmed to empty → rejected, no task | P1 |
| TC-CREATE-N003 | Very long name | feature | Clean state | Paste 500-char string | Name capped at 100 chars (maxLength); one task created; renders without breaking layout | P1 |
| TC-CREATE-N004 | Per-topic add empty/blank | feature | Today tab | Open + Add task row, leave blank, blur | No task created; row restored | P1 |
| TC-CREATE-N005 | Rapid double-click Add | regression | Clean state | Double-click Add quickly with a name | Exactly ONE task (single-commit guard `submittingNewTag`) | P0 |
| TC-CREATE-N006 | Unicode / emoji in name | feature | Clean state | Add "🚀 Launch — café" | Stored and rendered correctly (HTML-escaped, no injection) | P2 |
| TC-CREATE-N007 | HTML-injection in name | a11y/security | Clean state | Add `<img src=x onerror=alert(1)>` | Rendered as literal text via `escapeHtml`; no script executes | P0 |

---

## 3. Matrix & Quadrants

### 3.1 Unit tests

| ID | Title | Type | Preconditions | Steps | Expected | Priority |
|----|-------|------|---------------|-------|----------|----------|
| TC-MATRIX-U001 | `quadrantKey` Do (q1) | unit | — | `quadrantKey({x:80,y:20})` | `'q1'` | P0 |
| TC-MATRIX-U002 | `quadrantKey` Schedule (q2) | unit | — | `quadrantKey({x:20,y:20})` | `'q2'` | P0 |
| TC-MATRIX-U003 | `quadrantKey` Delegate (q3) | unit | — | `quadrantKey({x:80,y:80})` | `'q3'` | P0 |
| TC-MATRIX-U004 | `quadrantKey` Eliminate (q4) | unit | — | `quadrantKey({x:20,y:80})` | `'q4'` | P0 |
| TC-MATRIX-U005 | Boundary x=50 counts as urgent | unit | — | `quadrantKey({x:50,y:49})` | `'q1'` (x>=50 urgent, y<50 important) | P1 |
| TC-MATRIX-U006 | Boundary y=50 counts as NOT important | unit | — | `quadrantKey({x:80,y:50})` | `'q3'` (y<50 false) | P1 |
| TC-MATRIX-U007 | `urgency` rounds x | unit | — | `urgency({x:49.6})` | `50` | P2 |
| TC-MATRIX-U008 | `importance` is 100−y rounded | unit | — | `importance({y:30.4})` | `70` | P2 |

### 3.2 Feature tests

| ID | Title | Type | Preconditions | Steps | Expected | Priority |
|----|-------|------|---------------|-------|----------|----------|
| TC-MATRIX-F001 | Tag floats at x/y % | feature | 1 tag at x:25,y:75 | Open matrix | Tag positioned in lower-left (Eliminate) area proportionally | P1 |
| TC-MATRIX-F002 | Drag reposition (mouse) | feature | 1 tag | Drag tag from one quadrant to another | x/y update; `quadrantKey` reflects new quadrant; persisted after reload | P0 |
| TC-MATRIX-F003 | Drag reposition (touch) | feature | 1 tag, touch device/emulation | Touch-drag tag across matrix | Same as mouse; page does not scroll during drag (`preventDefault`) | P0 |
| TC-MATRIX-F004 | Inline rename via click | feature | 1 tag | Click tag text, edit, Enter | Name updated and persisted; Esc cancels | P1 |
| TC-MATRIX-F005 | ⋮ action menu — Done | feature | 1 active tag | ⋮ → Done | Tag marked resolved; moves to Done tab; task confetti fires | P1 |
| TC-MATRIX-F006 | ⋮ menu — Note | feature | 1 tag | ⋮ → Note | Note editor opens | P1 |
| TC-MATRIX-F007 | ⋮ menu — Move Work↔Private | feature | 1 work tag | ⋮ → Move to Private | `type` flips; filter behaviour updates | P1 |
| TC-MATRIX-F008 | ⋮ menu — Assign to topic | feature | 1 tag, ≥1 topic | ⋮ → Assign to topic → pick | `topicId` set; tag's x/y unchanged | P0 |
| TC-MATRIX-F009 | ⋮ menu — Delete | feature | 1 tag | ⋮ → Delete (confirm) | Tag removed from `state.tags`, matrix, and any today item | P1 |
| TC-MATRIX-F010 | Matrix tab filters All/Work/Private | feature | 1 work + 1 private tag | Switch matrix tabs | All shows both; Work shows work only; Private shows private only | P1 |

### 3.3 Edge cases

| ID | Title | Type | Preconditions | Steps | Expected | Priority |
|----|-------|------|---------------|-------|----------|----------|
| TC-MATRIX-N001 | Drag clamped to bounds | feature | 1 tag | Drag far beyond matrix edges | x/y clamp to 0–100; tag stays inside | P1 |
| TC-MATRIX-N002 | Many tags (50+) overlap | feature | 50 tags | Open matrix | All render, draggable, no crash; layout/perf acceptable | P2 |
| TC-MATRIX-N003 | Tag dropped exactly on center | unit | — | `quadrantKey({x:50,y:50})` | `'q3'` (deterministic, documents boundary) | P2 |

---

## 4. Topics

### 4.1 Unit tests

| ID | Title | Type | Preconditions | Steps | Expected | Priority |
|----|-------|------|---------------|-------|----------|----------|
| TC-TOPIC-U001 | `deleteTopic` orphans tasks to null | unit | Topic T1 with 3 tags | Call `deleteTopic('T1')` | Topic removed; its tags get `topicId:null` (NOT deleted, NOT forced to "General") | P0 |
| TC-TOPIC-U002 | Migration defaults topicId to null | unit | Inject tags lacking `topicId` | Reload (loadData runs) | Every tag gets `topicId:null` (line: `if(t.topicId===undefined) t.topicId=null`) | P0 |
| TC-TOPIC-U003 | `_reorderTopics` order math | unit | 3 topics A,B,C | `_reorderTopics('C','A',false)` | Array order becomes C,A,B (before A); `after` flag respected | P1 |

### 4.2 Feature tests

| ID | Title | Type | Preconditions | Steps | Expected | Priority |
|----|-------|------|---------------|-------|----------|----------|
| TC-TOPIC-F001 | Create topic from left rail | feature | Clean state | Use rail "new topic" control, name it | Topic appears in rail, Today groups, and add-bar `<select>` | P0 |
| TC-TOPIC-F002 | Create topic from Today group | feature | Today tab | Add new topic via Today UI | Same propagation as F001 | P1 |
| TC-TOPIC-F003 | Rename topic | feature | 1 topic | Rename via rail/Today | New name reflected everywhere (rail, Today, select) | P1 |
| TC-TOPIC-F004 | Delete topic with tasks | feature | Topic with 2 tags + today items | Delete topic | Topic gone; its tags move to Unassigned; matrix unaffected positionally | P0 |
| TC-TOPIC-F005 | Emoji picker (no typing) | feature | 1 topic | Open emoji picker | Curated grid shown; selecting sets emoji; no free-text input available | P1 |
| TC-TOPIC-F006 | Reorder topics by drag in rail | feature | 3 topics | Drag topic to new rail position | Rail order updates; Today group order + add-bar select order match | P1 |
| TC-TOPIC-F007 | Standalone (no-topic) tasks allowed | regression | Clean state | Add task with "No topic" | Task exists with `topicId:null`; NO auto "General" topic created | P0 |
| TC-TOPIC-F008 | Unassigned group always present for standalone | feature | ≥1 standalone tag | View Today/rail | "Unassigned" group/rail item shows the standalone tasks | P0 |
| TC-TOPIC-F009 | Assign via drag tag onto rail item | feature | 1 tag, 1 topic | Drag matrix tag onto rail topic | `topicId` set to that topic; **matrix x/y unchanged** | P0 |
| TC-TOPIC-F010 | Assign via ⋮ "Assign to topic" | feature | 1 tag, 1 topic | ⋮ → Assign → pick | `topicId` set; position unchanged | P1 |
| TC-TOPIC-F011 | Reassign tag to different topic | feature | Tag in T1, T2 exists | Drag/⋮ assign to T2 | Moves from T1 to T2 group; one membership only | P1 |
| TC-TOPIC-F012 | Drag onto rail must not move tag | regression | 1 tag at x:80,y:20 | Drag tag to rail item, drop | After drop, x still 80, y still 20 (no reposition) | P0 |

### 4.3 Edge cases

| ID | Title | Type | Preconditions | Steps | Expected | Priority |
|----|-------|------|---------------|-------|----------|----------|
| TC-TOPIC-N001 | Zero topics | feature | Clean state, no topics | Open add bar select | Only "No topic" option; tasks still creatable | P1 |
| TC-TOPIC-N002 | Many topics (15+) | feature | 15 topics | Open select + rail | All listed/scrollable; no clipping; reorder still works | P2 |
| TC-TOPIC-N003 | Duplicate topic names | feature | Topic "Work" exists | Create another "Work" | Allowed (distinct ids); both addressable independently | P2 |
| TC-TOPIC-N004 | Empty topic name | feature | — | Create topic with blank name | Rejected or no-op; no nameless topic added | P1 |
| TC-TOPIC-N005 | Delete the last topic | feature | 1 topic with tasks | Delete it | Tasks survive as Unassigned; rail shows only Unassigned | P1 |

---

## 5. Today Tab

### 5.1 Unit tests

| ID | Title | Type | Preconditions | Steps | Expected | Priority |
|----|-------|------|---------------|-------|----------|----------|
| TC-TODAY-U001 | Completion % math | unit | 4 today items, 1 resolved | `getTodaySprintCompletionPercent()` | `25` (round(1/4*100)) | P0 |
| TC-TODAY-U002 | Completion % with zero committed | unit | `state.todayItems=[]` | Call function | Returns `null` (no divide-by-zero) | P0 |
| TC-TODAY-U003 | Completion % rounding | unit | 3 items, 1 done | Call function | `33` (round) | P1 |
| TC-TODAY-U004 | Per-topic achievement count | unit | Topic group: 3 today tags, 2 resolved | Inspect group header math | Shows "2/3" (done/total) | P1 |
| TC-TODAY-U005 | `recordDailyCompletion` clamps 0–100 | unit | — | `recordDailyCompletion(150)` then read `state.dailyCompletion[today]` | Stored as `100`; `-5` → `0` | P1 |

### 5.2 Feature tests

| ID | Title | Type | Preconditions | Steps | Expected | Priority |
|----|-------|------|---------------|-------|----------|----------|
| TC-TODAY-F001 | Pick Tasks modal adds today items | feature | Several active tags | Open Pick Tasks, select 2, Add | 2 today items created; appear in Today list | P0 |
| TC-TODAY-F002 | Reorder today items via drag | feature | 3 today items | Drag item to new order | Order persists after reload | P1 |
| TC-TODAY-F003 | Group by topic with done/total count | feature | Today items across 2 topics | View Today | Each group header shows correct done/total | P1 |
| TC-TODAY-F004 | Move today item between topic groups | feature | Today item in T1 | Drag onto T2 group | Item's tag `topicId` becomes T2 | P1 |
| TC-TODAY-F005 | "Call it a day" modal opens | feature | ≥1 today item | Trigger end-of-day | Modal shows completion % | P0 |
| TC-TODAY-F006 | Day close carries over incomplete | feature | 3 today items, 1 done | Confirm "Call it a day" close | Daily completion recorded; only incomplete (2) items remain in todayItems | P0 |
| TC-TODAY-F007 | Day close dismiss (no commit) | feature | Today items | Open modal, click Dismiss | Modal closes; todayItems unchanged; no daily record written | P1 |
| TC-TODAY-F008 | Motto bar editable & persists | feature | Clean state | Click motto, type "Stay focused", commit, reload | Motto text persists and displays | P1 |

### 5.3 Regression tests

| ID | Title | Type | Preconditions | Steps | Expected | Priority |
|----|-------|------|---------------|-------|----------|----------|
| TC-TODAY-R001 | NO confetti on day close | regression | Today items | Click "Call it a day" → Close | NO confetti animation (handler does NOT call `triggerDayCloseConfetti`); completion still recorded | P0 |
| TC-TODAY-R002 | Spacebar works in motto edit | regression | Motto editor open | Type "a b c" with spaces | Spaces inserted normally (input keydown `stopPropagation` prevents global handler from eating space) | P0 |
| TC-TODAY-R003 | Motto persists until changed | regression | Motto = "X" | Reload several times, switch tabs | Motto remains "X" until explicitly edited | P1 |

### 5.4 Edge cases

| ID | Title | Type | Preconditions | Steps | Expected | Priority |
|----|-------|------|---------------|-------|----------|----------|
| TC-TODAY-N001 | No today items | feature | Clean state | Open Today tab | Empty state shown; "Call it a day" returns null %/handles gracefully | P1 |
| TC-TODAY-N002 | Add same tag to today twice | feature | 1 tag already in today | Pick it again | Not duplicated in todayItems | P1 |
| TC-TODAY-N003 | Empty motto reverts to placeholder | feature | Motto set | Clear motto text, commit | Placeholder style shown; no crash | P2 |

---

## 6. Notes

### 6.1 Feature tests

| ID | Title | Type | Preconditions | Steps | Expected | Priority |
|----|-------|------|---------------|-------|----------|----------|
| TC-NOTE-F001 | Open unified editor as modal ≥560px | feature | Desktop width | Open note on a tag | Centered modal with textarea + char counter + Save/Cancel | P1 |
| TC-NOTE-F002 | Editor as bottom sheet <560px | rwd | Width 480px | Open note | Renders as bottom sheet | P1 |
| TC-NOTE-F003 | Save persists note | feature | 1 tag | Type note, Save | `tag.notes` updated; persists after reload | P0 |
| TC-NOTE-F004 | Cmd/Ctrl+Enter saves | feature | Editor open | Type note, press Ctrl+Enter | Saves and closes | P1 |
| TC-NOTE-F005 | Esc cancels | feature | Editor open with unsaved text | Press Esc | Closes without saving | P1 |
| TC-NOTE-F006 | Click-outside no data loss | feature | Editor open with text | Click backdrop | Either keeps editing or preserves text — no silent loss of typed content | P0 |
| TC-NOTE-F007 | Char counter accuracy | feature | Editor open | Type N chars | Counter shows N (updates live) | P2 |
| TC-NOTE-F008 | Note indicator (line-art) on tag | feature | Tag with note | View matrix tag | Line-art note indicator visible; absent when no note | P2 |
| TC-NOTE-F009 | Right-list inline read preview (pre-wrap) | feature | Tag with multiline note | Toggle preview in Active list | Preview shows with whitespace preserved (`pre-wrap`) | P1 |
| TC-NOTE-F010 | One-click edit from preview | feature | Tag with note | Click edit on preview | Opens editor pre-filled | P1 |
| TC-NOTE-F011 | Notes work across tabs | feature | Tags in Active/Done/Archived/Today | Open/edit note in each | Editing works and persists in all four contexts | P1 |

### 6.2 Edge cases

| ID | Title | Type | Preconditions | Steps | Expected | Priority |
|----|-------|------|---------------|-------|----------|----------|
| TC-NOTE-N001 | Very long note | feature | Editor open | Paste 5000 chars | Counter and storage handle it (or cap to limit); no layout break | P2 |
| TC-NOTE-N002 | Note with HTML | security | Editor open | Save `<b>x</b>` | Rendered as text, not interpreted | P0 |
| TC-NOTE-N003 | Empty note save | feature | Tag with existing note | Clear and save | Note becomes empty; indicator removed | P2 |

---

## 7. Work DNA

### 7.1 Unit tests

| ID | Title | Type | Preconditions | Steps | Expected | Priority |
|----|-------|------|---------------|-------|----------|----------|
| TC-DNA-U001 | `anaHash` deterministic | unit | — | `anaHash([0,1,2],3)` twice | Same string both times | P1 |
| TC-DNA-U002 | `anaHash` buckets taskCount by /5 | unit | — | Compare `anaHash(a,4)` vs `anaHash(a,3)` | Equal (both floor to 0); differs at 5 | P2 |
| TC-DNA-U003 | `calculateProfile` quiz-only baseline | unit | `state.tags=[]` | `calculateProfile([...])` with weights favoring one profile | Returns that profile key; no NaN | P0 |
| TC-DNA-U004 | `getTaskSignals` zero-data safe | unit | `state.tags=[]` | Call it | `{created:0, completed:0, hasData:false}`, no divide-by-zero (denom=1) | P0 |
| TC-DNA-U005 | Completed-task signals fold in | unit | 20 resolved q1 tags | `calculateProfile(answers)` | architect/optimizer nudged up vs quiz-only; result tilts deterministically | P1 |
| TC-DNA-U006 | High completion rate boost | unit | dailyCompletion avg ≥70 | `getTaskSignals().completionRate` ≥70 → profile | optimizer/craftsman receive +bonus | P2 |
| TC-DNA-U007 | Tie-break stable (argmax) | unit | All weights equal | `calculateProfile` | Returns first key (visionary) deterministically | P2 |

### 7.2 Feature tests

| ID | Title | Type | Preconditions | Steps | Expected | Priority |
|----|-------|------|---------------|-------|----------|----------|
| TC-DNA-F001 | Questionnaire flow | feature | App loaded | Open Work DNA, answer all questions | Step counter advances; "See results" at end | P1 |
| TC-DNA-F002 | Options shuffled but stable per session | feature | Quiz open | Navigate back/forward | Option order stays consistent within session (`_anaShuffles` cached) | P2 |
| TC-DNA-F003 | Results panel renders | feature | Quiz completed | Reach results | Profile, companies, celeb mirrors, share buttons shown | P1 |
| TC-DNA-F004 | Signals folded into result | integration | 25 resolved Do tasks before quiz | Complete quiz | Result reflects task history nudge (architect lean) | P1 |
| TC-DNA-F005 | Redo / analyse again | feature | Results shown | Click redo | Fresh questionnaire starts | P1 |
| TC-DNA-F006 | Share buttons | feature | Results shown | Use share | Generates share image/links without console error | P2 |
| TC-DNA-F007 | Celeb photo fetch fails gracefully | integration | Block network | View results | Missing portrait handled (no crash; cache stores result) | P1 |

---

## 8. Profile & Avatar Menu

### 8.1 Feature tests

| ID | Title | Type | Preconditions | Steps | Expected | Priority |
|----|-------|------|---------------|-------|----------|----------|
| TC-PROF-F001 | Avatar dropdown opens | feature | App loaded | Click avatar | Dropdown lists Profile, Work DNA, Copy Data, Import Data, Theme toggle, Information | P1 |
| TC-PROF-F002 | Menu icons are line-art, no emoji | regression | Dropdown open | Inspect each item glyph | All icons are line-art SVG/icons; NO emoji glyphs in menu labels | P1 |
| TC-PROF-F003 | Profile modal fields | feature | Dropdown open | Open Profile | Job title, goals, language, nationality, gender, birthday, stats, daily-completion chart present | P1 |
| TC-PROF-F004 | Profile fields persist | feature | Profile modal | Set job title + goals, save, reload | Values persist | P1 |
| TC-PROF-F005 | Daily-completion chart renders | feature | dailyCompletion has data | Open Profile | Chart draws bars with palette; matches recorded data | P2 |
| TC-PROF-F006 | Theme toggle Dark↔Light | feature | Any theme | Click theme toggle | Theme switches; label text swaps Dark/Light; persists after reload | P1 |
| TC-PROF-F007 | Theme icon persists across toggles | regression | — | Toggle theme repeatedly | Icon remains correct/persistent (label swaps, icon stable) | P2 |
| TC-PROF-F008 | Information modal | feature | Dropdown open | Open Information | Info modal opens and closes cleanly | P2 |
| TC-PROF-F009 | Avatar reflects profile | feature | Profile set | View header | `updateProfileAvatar` shows correct avatar | P2 |

### 8.2 Edge cases

| ID | Title | Type | Preconditions | Steps | Expected | Priority |
|----|-------|------|---------------|-------|----------|----------|
| TC-PROF-N001 | Empty profile fields | feature | Clean state | Open Profile, save blank | No crash; stats show zero/empty gracefully | P2 |
| TC-PROF-N002 | Future birthday | feature | Profile | Set birthday in future | Accepted/handled without crash | P2 |

---

## 9. Data / Persistence

### 9.1 Unit / integration tests

| ID | Title | Type | Preconditions | Steps | Expected | Priority |
|----|-------|------|---------------|-------|----------|----------|
| TC-DATA-I001 | Save then reload restores state | integration | Add tags, topics, today items, motto | Reload page | All state restored from localStorage | P0 |
| TC-DATA-I002 | Migration of legacy data | integration | Inject old-schema JSON (tags without topicId, missing motto) | Load app | `topicId` defaulted to null, `motto` defaulted to '' ; no crash | P0 |
| TC-DATA-I003 | Copy Data → Import Data round-trip | integration | Populated state | Copy Data, clear storage, Import the copied payload | State fully restored, identical tags/topics/today/profile | P0 |
| TC-DATA-I004 | Import malformed data | integration | — | Import invalid/garbage JSON | Graceful error; existing state not corrupted | P1 |
| TC-DATA-I005 | Corrupt localStorage recovery | integration | Set storage key to invalid JSON | Load app | App boots to safe defaults, no uncaught error | P1 |
| TC-DATA-I006 | Save fires on each mutation | integration | — | Add/edit/delete tag | `saveData` writes; reload confirms each mutation persisted | P1 |

---

## 10. Cross-cutting: RWD

| ID | Title | Type | Preconditions | Steps | Expected | Priority |
|----|-------|------|---------------|-------|----------|----------|
| TC-RWD-001 | Desktop ≥1280px layout | rwd | Width 1440 | Load app | Matrix, rail, lists laid out without overflow | P1 |
| TC-RWD-002 | Laptop ~1024px | rwd | Width 1024 | Load | Responsive sizing; no clipping | P1 |
| TC-RWD-003 | Tablet ≤1024 | rwd | Width 900 | Load + interact | Layout adapts; drag works | P1 |
| TC-RWD-004 | Phone ≤480 | rwd | Width 375 | Load + interact | Full tag text shows and **wraps**; no clipping/overflow | P0 |
| TC-RWD-005 | Matrix not cut off by motto bar | regression | Phone width, motto set | View matrix | Matrix fully visible; bottom **not** clipped by the motto bar | P0 |
| TC-RWD-006 | Touch drag on small screen | rwd | Phone, touch | Drag a tag | Repositions; page does not scroll mid-drag | P0 |
| TC-RWD-007 | Note editor → bottom sheet <560px | rwd | Width 480 | Open note | Bottom-sheet layout | P1 |
| TC-RWD-008 | Long tag text wraps, no overflow | rwd | 80-char tag, phone | View matrix | Text wraps inside tag, fully readable | P1 |
| TC-RWD-009 | Add bar usable on phone | rwd | Phone | Use add bar + select | All controls reachable and tappable | P1 |

---

## 11. Cross-cutting: Accessibility (a11y)

| ID | Title | Type | Preconditions | Steps | Expected | Priority |
|----|-------|------|---------------|-------|----------|----------|
| TC-A11Y-001 | Keyboard nav of action menus | a11y | ⋮ menu open | Arrow Up/Down, Enter, Esc | Roving focus cycles rows; Enter activates; Esc closes (verified handlers exist) | P1 |
| TC-A11Y-002 | Avatar dropdown keyboard | a11y | Focus avatar | Enter/Space opens; navigate; Esc | Opens and is keyboard operable | P1 |
| TC-A11Y-003 | Motto bar is focusable button | a11y | — | Tab to motto bar | `role=button`, `tabindex=0`; Enter activates edit | P2 |
| TC-A11Y-004 | Focus returns after modal close | a11y | Open/close a modal | — | Focus restored sensibly; no focus trap leaks | P2 |
| TC-A11Y-005 | Color contrast (both themes) | a11y | Dark + Light | Inspect text/background | Meets WCAG AA for body text | P2 |
| TC-A11Y-006 | Inputs have accessible labels | a11y | Add bar, profile | Inspect | Inputs labeled/placeholdered meaningfully | P2 |

---

## 12. Cross-cutting: i18n

| ID | Title | Type | Preconditions | Steps | Expected | Priority |
|----|-------|------|---------------|-------|----------|----------|
| TC-I18N-001 | Switch to Japanese | i18n | — | Profile → language → ja | All visible labels translate; layout intact | P1 |
| TC-I18N-002 | Switch to German | i18n | — | language → de | Labels translate; longer German strings don't overflow | P1 |
| TC-I18N-003 | Switch to Spanish | i18n | — | language → es | Labels translate | P1 |
| TC-I18N-004 | English default | i18n | Clean state | Load | English labels | P1 |
| TC-I18N-005 | Menu labels have no emoji glyphs | regression | Any language | Open avatar dropdown | Menu item labels contain no emoji (line-art icons only) | P1 |
| TC-I18N-006 | `t()` param interpolation | unit | — | `t('...qCounter...',{current:2,total:5})` | "Question 2 of 5" pattern resolves placeholders | P2 |
| TC-I18N-007 | Missing key fallback | unit | — | `t('nonexistent.key')` | Returns key or sensible fallback; no crash/blank breakage | P2 |
| TC-I18N-008 | Language persists across reload | i18n | Set ja | Reload | Stays Japanese (applyLanguageFromProfile) | P1 |
| TC-I18N-009 | Work DNA strings localized | i18n | Set de | Open Work DNA | Title/loading/buttons in German | P2 |

---

## 13. Cross-cutting: Console / Stability

| ID | Title | Type | Preconditions | Steps | Expected | Priority |
|----|-------|------|---------------|-------|----------|----------|
| TC-STAB-001 | No console errors on load | regression | Clean state | Load app, watch console | Zero errors/uncaught exceptions | P0 |
| TC-STAB-002 | No console errors during full workflow | regression | — | Create→assign→note→done→day-close→profile→theme→lang | Console stays clean throughout | P0 |
| TC-STAB-003 | No errors with empty everything | regression | Clean state | Visit every tab/modal with no data | No errors; graceful empty states | P1 |

---

## 14. Consolidated Regression Checklist (previously-fixed bugs)

These map to the highest-risk fixes and MUST pass before any release:

- **BUG: day-close confetti** → TC-TODAY-R001 (no confetti on "Call it a day").
- **BUG: motto spacebar eaten** → TC-TODAY-R002 (spaces type normally in motto).
- **BUG: matrix cut off by motto bar** → TC-RWD-005 (matrix fully visible on phone).
- **BUG: under-topic add duplicated task** → TC-CREATE-F006 / TC-CREATE-N005 (exactly one task).
- **BUG: under-topic task not on matrix** → TC-CREATE-F006 (task appears on matrix immediately).
- **BUG: quadrant created duplicate on add** → TC-CREATE-F001 / TC-CREATE-U001 (single create).
- **BUG: forced "General" topic / topic-agnostic board** → TC-TOPIC-F007, TC-TOPIC-U001 (standalone tasks allowed, no auto-General).
- **BUG: drag-to-rail moved matrix position** → TC-TOPIC-F012 (position preserved on assign-by-drag).
- **BUG: menu emoji glyphs replaced by line-art** → TC-PROF-F002, TC-I18N-005.
- **BUG: motto persistence** → TC-TODAY-R003.
