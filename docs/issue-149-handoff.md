# Issue #149 implementation handoff

## Status and ownership — 2026-10-13

Work was prepared on `codex/issue-149`, based on v3.3.5, and is included in
the v3.3.6 release preparation on `master`.
The user resumed Phase B after the first quota-limited session. Implementation
and integrated verification were completed for the accepted scope. The user then
paused release preparation to correct the invisible spinner motion and unify the
timing dialog. Both corrections passed integrated verification. The user resumed
commit, push and v3.3.6 publication on 2026-10-13; platform packaging and remote
asset verification follow the repository release workflows.
The accepted plan excludes #5 (sidebar resizing) and #7 (cross-work chapter
movement), including their menus, drag/drop and APIs.

UI work initially used Claude Code `claude-opus-5-5 --effort high`. The user's
later explicit instruction ("아니다 그냥 너가 일단 고쳐봐") authorized Codex to
perform the UI cleanup directly. App-wide consistency is the highest-priority
constraint, recorded in AGENTS.md and docs/ui-design-rules.md. Accent selection,
focus and meaningful status colors must remain visible; palette unification must
never be interpreted as making all highlights grayscale.

| Issue                     | Implemented                                                                                                     | Remaining limitation                                                                   |
| ------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| #1 completion sound       | Sequential playback, resume-attempt identity, cleanup-before-success, 1 second leading silence                  | Physical HDMI/DP device wake-up is not verified                                        |
| #2 new translation timing | Persistent attempt history, query IPC, unified timing history, stale-response protection and open-only refresh  | Active durations are checkpoint snapshots                                              |
| #3 remembered preferences | 17 workspace preferences plus output defaults and library disclosure                                            | Execution targets and destructive choices intentionally remain transient               |
| #4 stable export entry    | Fixed raster/PSD actions below translation, shared command map and keyboard entry                               | Linked-output viewing stays a separate action                                          |
| #6 batch import           | Multiple folders, source path preservation, duplicate locking, compact selection, import-only and skip controls | PDF batching is outside the accepted scope                                             |
| #8 work disclosure        | Per-work/global collapse, persistence, temporary search expansion and explicit navigation reveal                | Stale IDs are bounded and retained until an authoritative complete-library read exists |

## Main contracts and boundaries

### Timing and completion

- `src/shared/pageWorkflowTiming.ts` defines version 1 records. Each execution
  attempt has a fresh UUID, even when resuming the same run ID. Records contain
  ten possible workflow stages, selected chapter/page snapshots, sparse measured
  stage durations, skipped page stages, wall elapsed time and cleanup time.
- `src/main/pageWorkflow/pageWorkflowTimingRecorder.ts` uses a monotonic clock
  and serialized atomic writes under `dataRoot/page-workflow-timings`. The most
  recent 50 terminal attempts plus active attempts are retained. Resume inputs
  and original/output data are not part of retention cleanup.
- `pageWorkflowGateway.getPageWorkflowTimings(chapterId)` is implemented. Missing
  measurements are not zero. Overall wall time is not the sum of page durations.
  Active elapsed values are checkpoint snapshots, not a continuously ticking API.
- The reader validates records, skips corrupt files with a warning and presents
  orphaned running attempts as interrupted **in memory**. It must never overwrite
  a concurrent recorder's final checkpoint. Old measurements are not backfilled.
- The dialog has one attempt list, page selector and stage table, with no
  translation/page-task tabs. Legacy per-page snapshots are grouped only by
  their recorded session ID; snapshots without one stay separate. Existing
  rounding and v1 stage merging use `buildPageTimingReport`. Their measured-stage
  sum is not presented as wall time, and unknown start/end/cleanup values stay
  unknown. The display adapter never rewrites stored measurements.
- New-workflow success is emitted after runtime disposal and timing finalization;
  partial remains partial. Original-erasure success is also buffered until timing
  checkpoint and engine/layout cleanup complete; cleanup failure emits failure.
- Optional `JobEvent.executionId` distinguishes resumed attempts in renderer
  state and completion-sound deduplication. Legacy events retain their existing ID
  behavior. Aggregate flows retain their own generation identity.

### Audio audit outcome

The existing four categories remain translation, sound-effect generation,
original-text erasure and research. Import/export do not gain sounds. Existing
background dispatch already handled terminal events independently of foreground
state; do not reintroduce an unsupported claim that it was wholly missing.

Playback now queues requests instead of resetting the active clip. End/error or
rejected playback advances the queue; mute changes discard queued muted-category
events and stop a now-muted active sound. Unmuting does not replay discarded
notifications. Defaults remain muted and volume 0.55.

The supplied OGG is already modified: duration 1.539002 seconds, approximately
one second silent lead plus the original 0.539 second clip. **Do not prepend
another second on resumption.** FFmpeg detected silence from 0 to 0.996803 seconds.
An isolated Electron smoke successfully reached `ended` on the first and two
successive plays. This proves software playback, not every physical audio device.
Focused tests cover four categories, duplicate events, resumed attempts, queued
playback, muting, rejected play and cleanup failure. Existing legacy translation,
SFX and research cleanup/terminal paths were traced alongside the changed paths.

### Import

- `prepareFoldersImportPreview` handles native multi-folder selection through one
  server-owned preview session. It excludes duplicate/descendant roots, rejects
  selected directory links, reuses existing archive/nested-folder preparation,
  includes root-owned images and applies aggregate 500-chapter/5,000-page limits.
  Existing nested depth and archive extraction limits remain in force.
- Single parent-folder nested paths remain unchanged. Direct chapter roots retain
  the root name; multiple roots gain deterministic sanitized aliases, including
  distinct aliases for equal basenames. Existing output sanitization was moved
  unchanged into `shared/outputPathSegment.ts` and characterized by tests.
- `skipDuplicateChapterTitles` is optional and defaults off. Exact trimmed title
  matches apply only within the chosen existing work and the selected batch;
  first preview-order candidate wins. Flag-off behavior still suffixes names.
- The skip path holds the existing work-content reservation across title reading,
  materialization and publication; the publication mutation stays inside the
  existing transaction. A concurrent-import test uses the real activity gate.
  Waiting for ownership does not increment the mutation count: a red/green test
  reproduced and fixed premature admission that could conflict with backup idle
  waiting. Cancellation while queued leaves the library unchanged.
- All-skipped returns `{ workId, chapterIds: [], skippedChapters }` without an
  opened chapter. Linked-workspace import already short-circuits this case.
  The renderer treats this as informational completion, refreshes the library,
  and avoids chapter navigation and translation setup.
- The new UI-only `openTranslationAfterImport` must not enter strict create-import
  IPC. It opens settings only; it never starts a translation model automatically.
- Batch PDF import and cross-work chapter movement were not added.

## Preference audit and UI implementation

State/default/localStorage usage was searched across components, hooks and session
controllers. Raw inventory is `.tmp/issue149-preference-inventory.txt`. The audit
does not mean every transient React state should become a preference.

| Classification                               | Values and policy                                                                                                                                                                                                                                                                               |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Implemented in `workspace.preferences.v1`    | Retouch radius 28 (4–90), paint `#ffffff`, mask adjustment radius 4 (1–32), floating editor false, toolbar-hidden false, sidebar collapsed panel null/library/pages, web size filter large                                                                                                      |
| Implemented separately                       | `library.collapsedWorkIds.v1`; search folds do not overwrite stored folds; IDs are bounded and validated                                                                                                                                                                                        |
| Export modal preferences                     | source/png/jpeg/webp; JPEG 95, WebP 90; preserve source names/paths true; timestamped/fixed destination (default timestamped)                                                                                                                                                                   |
| Additional `workspace.preferences.v1` fields | Import-afterward settings opening (true), skip duplicate titles (false), work picker sort (library), linked workspace sort (updated descending), block library sort (recent), region brush (circle/24, size 1–400), transform ratio lock (true), gathered field (both), exclude headers (false) |
| Existing explicit defaults remain explicit   | Translation, retranslation, SFX, erasure and workflow options/presets; do not silently persist every run option                                                                                                                                                                                 |
| Deliberately transient                       | Selected work/chapter/pages, scope, masks, private URLs/search, open modals, active tool, zoom, original peek, hidden/review-only block filters and document field drafts                                                                                                                       |
| Never restore as convenience                 | Collision overwrite, omit-text, dangerous SFX output mode, execution targets                                                                                                                                                                                                                    |

Output preferences use `AppSettings.ui.exportPreferences`; unknown fields are
discarded by normalization, and invalid fields fall back independently. The modal
must save a consolidated latest safe snapshot through the existing settings queue,
preserve the value through general Settings saves and reset collision policy to
cancel and omit-text to false on every opening. Codex reproduced a per-modal
queue allowing an old closed modal's WebP choice to overwrite a newer modal's
PNG choice. The regression test is `tests/exportPreferenceLifecycle.test.tsx`.
The new `settings:save-export-preferences` IPC merges only the strict five-field
snapshot inside `updateAppSettings`; ordinary full settings saves preserve this
independently owned preference. Real-file tests cover both save orders, unsafe
field rejection and explicit reset. Environment backup restoration still writes
its complete validated settings through the existing restore transaction.

Phase A added typed local preferences with safe read/write fallback, slider commit
handling/debouncing and unload flush. The web filter no longer resets after scans.
Both new local keys are in the environment-backup UI allowlist.

Fixed export actions use shared `AppCommandId` functions/names for buttons,
palette, completion entry and Ctrl+E. A chapter with pages works even if no page is
selected: export setup falls back to its first page. Empty chapters stay disabled.
Linked-workspace viewing remains separate from generating a raster/PSD export.

Disclosure does not force a currently folded work open on ordinary re-renders.
Search expansion is temporary, all-fold/all-expand are disabled during search,
and explicit navigation/new chapters reveal the relevant work. `libraryComplete`
is currently not passed from production; stale IDs are retained safely rather than
pruned using an empty/loading/filtered list.

## UI integration and common design rules

Phase B is implemented and reviewed. The app uses one raw palette in
`styles/palette.css`, with semantic aliases for selection, focus, information,
success, warning and danger. Existing component roles consume that authority.
The shared selected surface and edge use the carrot accent across the app.
Palette tests check alias integrity, distinct statuses, readable text contrast
and visible selection borders; the CSS gate rejects additional raw chrome colors.
Official Fluent, Spectrum, Carbon and W3C guidance and links are recorded in
`docs/ui-design-rules.md`.

Import uses shared segmented controls and flat compact draft rows. Optional source
path, duplicate and linked-output explanations use the existing accessible tooltip.
Timing uses compact rows and plain status text rather than explanatory panels.
Shared modal headings and the base font size establish consistent density.

The preference audit also persists work-picker sorting and linked-workspace
sorting through the existing typed preference store. A regression test covers an
acknowledged narrow output save followed by a stale full-settings response; the
latest local output preference remains authoritative in the settings owner.

The original scoped Claude prompts and stream logs remain in `.tmp`; do not dump
stream logs because they contain large signed payloads.

## Verification and retained artifacts

Final integrated validation on 2026-10-13: `npm run check` passed all **27 gates**
in 361.42 seconds, including the production build, page-artwork parity, image
protocol smoke and renderer/preload boundaries. **1,383 test files / 10,792 tests
passed**, with the existing 1 file / 9 tests skipped. Coverage: statements 85.70%,
branches 79.22%, functions 87.99%, lines 86.90%.
Evidence: `.tmp/issue149-check-verified-final.log`,
`.tmp/issue149-verified-timings.json` and `.tmp/issue149-verified-tests.json`.

The seven Phase B source additions use their measured coverage from
`.tmp/issue149-phase-b-coverage-measured.json` (SHA-256
`62e1cff3e44bf702230e94d7aeb4f481f24e0d87e90e2d8dc74e60cfbb3cb140`).
The newly touched `BubbleLayoutDraftLayer.tsx` uses its original stored baseline
from `.tmp/production-cleanup-coverage-baseline-node22.json`. All previously
registered floors and historical provenance remain byte-for-byte equivalent as
parsed records. Final inventory: 843 existing files, 1,465 introduced files and
12 historical deletions. No global thresholds were relaxed.

Current reviewed production-component screenshots (1600×980 and 1240×760):

- `C:/tmp/issue149-consistent-system-wide.png` and `system-narrow.png`.
- `C:/tmp/issue149-consistent-settings-wide-2.png` and `settings-narrow-2.png`.
- `C:/tmp/issue149-consistent-import-wide.png` and `import-narrow.png`.
- `C:/tmp/issue149-consistent-export-wide.png` and `export-narrow.png`.
- `C:/tmp/issue149-consistent-timing-wide.png` and `timing-narrow.png`.
- `C:/tmp/issue149-consistent-all-skipped-wide-2.png` and `all-skipped-narrow-2.png`.

Each shortened second filename shares the `issue149-consistent-` prefix. Codex
opened these captures and checked overflow, clipping and overlap. They cover
representative production surfaces; this is not a claim to have visually exercised
every app state. Temporary QA entries are preserved in `.tmp/issue149-final-qa/`
and removed from production source. Screenshots remain available for inspection.

Earlier Phase A screenshots:

- `C:/tmp/issue149-a-reviewed-wide.png` — 1600×980.
- `C:/tmp/issue149-a-reviewed-narrow.png` — 1240×760.
- `C:/tmp/issue149-a-reviewed-tools.png` — 1240×1600, stable build channel.

Codex opened all three PNGs and checked clipping, overlap and horizontal overflow.
The first two use the QA fixture's alpha platform marker; no app version changed.
Temporary production-importing entries were copied to `.tmp/qa.html` and
`.tmp/qaIssue149.tsx`, then removed from `src/renderer`. Screenshots are retained.

Focused backend, audio, preference, output-entry and disclosure tests passed.
The import/output integration test uses real preview, library transactions,
path planning, collision handling and filesystem output; only raster rendering
is substituted at its existing port. Equal root basenames preserve both distinct
image buffers at `26/0001.png` and `26 (2)/0001.png`. Another filesystem test
verifies timing write failures cannot replace the actual workflow result/error.

Before Phase B, `npm run check` passed all **27 gates** on 2026-10-13 at 07:09 KST
(388.87 seconds): **1,378 test files / 10,736 tests passed**, with the existing
1 file / 9 tests skipped. Type checks, lint, formatting, architecture, exact
coverage floors, production build, real page-artwork parity, image-protocol smoke
and renderer/preload bundle checks all passed. Global coverage was statements
85.65%, branches 79.18%, functions 87.92%, lines 86.85%.
Evidence is `.tmp/issue149-check-final.log`, `.tmp/issue149-check-timings.json`
and `.tmp/check-results/vitest.json` (the latter is replaced by later runs).
That result predates the resumed Phase B changes and is not their validation.
An initial full check found a new cleanup test mock returning void instead of the
runtime's boolean; it was corrected, with no production contract change.
The first full suite passed 10,728 tests and found six failures: five exposed a
default-settings/normalization mismatch for export preferences, fixed by sharing
the initial defaults; one required registering the 12 new source files in the
existing coverage inventory. The existing LibraryTree statement floor is retained;
keyboard dragging after disclosure and cancellation now have a behavior test.

Only new coverage floors were added, using the first integrated measurement
`.tmp/issue149-coverage-measured.json` (SHA-256
`92faea46b83d22769cd6d9a89522ed4eef1275221fd0a39a1eb9976736443dae`).
Existing file floors, historical provenance and global thresholds were not lowered.

Architecture baseline changes record only measured new runtime consumers/imports
and their reasons. Global lint, architecture, coverage and parity thresholds are
unchanged. No user library/original/output files were cleaned. At the end of implementation
validation, no commit/push or release had been made; the user subsequently
authorized committing and publishing v3.3.6, then paused that request before any
commit, push or publication.

## Post-pause timing and motion correction

Removed the timing-view preference and consolidated the dialog around the page
task layout. Legacy records remain accessible even if workflow-history loading
fails. Five locales use the same structure. The preference count is now 17.

The status indicator's rotating arc and track had both become opaque `--info-bd`
during palette migration. The track now derives from that same semantic color at
28% opacity, including reduced-motion styling; unread and partial dots use the
visible info/warning border tokens. Color regression tests check arc/track and
dot/background contrast. Production-element QA verifies a running animation and
different computed rotation matrices across 250 ms for the dock and image spinner.

Production QA captures were opened and inspected at 1600×980 and 1240×760:

- `C:/tmp/issue149-unified-timing-wide.png` and `issue149-unified-timing-narrow.png`.
- `C:/tmp/issue149-unified-legacy-wide.png` and `issue149-unified-legacy-narrow.png`.
- `C:/tmp/issue149-status-motion-wide-v2.png` and `issue149-status-motion-narrow-v2.png`.

Temporary entries are preserved under `.tmp/issue149-unified-qa` and removed from
the renderer source. `npm run check` passed all 27 gates after these corrections
on 2026-10-13 (398.27 seconds), including regression tests, exact coverage floors,
production build, page-artwork parity and image-protocol smoke. Evidence:
`.tmp/issue149-unified-check4.log`, `.tmp/issue149-unified-verified-timings.json`
and `.tmp/issue149-unified-verified-tests.json`.

`PageTimingDialog` is now only the modal shell. Its historical branch coverage
floor follows `PageWorkflowTimingView` through the existing metric-owner policy;
the view must still satisfy its own stricter floor. No historical floor is lowered
and zero coverage at the new owner still fails. App-local `page-workflow-timings`
is ignored alongside `page-workflows`; existing user records remain untouched.
