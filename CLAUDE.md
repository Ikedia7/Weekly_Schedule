# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A client-side-only web app for elementary school teachers to build a weekly schedule
(time-table + notices) in the browser and export it as a formatted `.xlsx` (Excel) file
matching a real reference spreadsheet. No backend, no build step: plain HTML/CSS/JS served
as static files (target: GitHub Pages). All data lives in the browser's LocalStorage; nothing
is sent to any server. ExcelJS is loaded from a CDN `<script>` tag in `index.html`.

## Running / developing

There is no package.json, no build step, no linter, and no test suite. To work on this app:

- Open `index.html` directly in a browser, or serve the directory with any static file
  server (e.g. `python -m http.server 8791` from the project root) — a real server is
  needed for the Excel export to `fetch()` `templates/schedule_template.xlsx`, since some
  browsers restrict binary `fetch()` over `file://`.
- Sanity-check JS changes with `node --check js/<file>.js` (no bundler/transpiler is
  involved — these files run as-is in the browser).
- There's no automated test suite. Verification during development has been done ad hoc
  with Playwright (installed only in a scratch directory, not part of this repo) driving a
  local static server, plus `openpyxl`/direct XML inspection of exported `.xlsx` files.

## Script loading and module pattern

Every `js/*.js` file is a plain (non-module) script attaching one IIFE-returned object to a
shared global `window.App` namespace (e.g. `App.dataStore`, `App.render`). `index.html` loads
them in a fixed order that matters because later scripts reference `App.xxx` from earlier
ones: `config.js` → `imageLibrary.js` → `dateUtils.js` → `storage.js` → `dataStore.js` →
`galleryUI.js` → `render.js` → `subjectManager.js` → `layoutManager.js` → `excelExport.js` →
`main.js`. `main.js` is the only file with a `DOMContentLoaded` listener; it initializes every
other module and wires up toolbar buttons. This (deliberately) avoids ES modules so the app
still works when opened via `file://` without CORS issues.

## Core data model

Two concerns are kept separate, both persisted to LocalStorage via `js/storage.js`
(one function pair per key — `loadX`/`saveX`) and read/written only through `js/dataStore.js`:

- **Layout** (`weeklySchedule_layout`, default in `config.js`'s `defaultLayout`): an ordered
  array of row definitions the teacher can freely add/remove/reorder via the "予定表のレイアウト編集"
  screen (`js/layoutManager.js`). Each entry is `{ id, label, type }` where `type` is one of
  four kinds — `"text"` (free multi-line box), `"subject"` (dropdown into the subjects
  master + illustration + note), `"check"` (○/× dropdown, defaults to ○), `"list"` (belongings-style
  add/remove item list). A section's `type` cannot be changed after creation through the UI
  (delete + re-add instead) — this keeps the editor simple.
- **Master schedule data** (`weeklySchedule_masterData`): a flat array of per-day objects,
  `{ date: "YYYY-MM-DD", dayOfWeek, cells: { [sectionId]: {...} } }`, keyed by ISO date (not by
  weekday) so it scales to arbitrarily many days without a fixed schema. `cells[sectionId]`'s
  shape depends on the layout section's `type` (`{type,value}` for text/check, `{type,items}` for
  list, `{type,subject,note,customImage}` for subject). `dataStore.getEntriesForDates(dates)` is the
  only way views/export should read this — it lazily creates missing day entries and
  reconciles cells when the layout changes (new section → empty cell added; a section's `type`
  changed since last save → `reconcileCellType` best-effort migrates old content into the new
  shape). This reconciliation is what let "朝"/"帰り" flip from `text` to `subject` type without
  a hard data migration.
- Separately: **subjects master** (`weeklySchedule_subjectsMaster`, default in `config.js`'s
  `subjects`) maps subject id → name → default illustration path; **week notes**
  (`weeklySchedule_weekNotes`) hold the "担任より" free text that is *not* tied to a specific
  date, keyed by the Monday of the displayed week; **belongings rules**
  (`weeklySchedule_belongingsRules`, managed via `js/belongingsRulesManager.js`) is a list of
  `{id, conditionType: "dayOfWeek"|"subject", conditionValue, item}` — `dataStore` applies
  matching rules' `item` into that day's `"list"`-type section(s) once, at the moment a new day
  entry is created (day-of-week rules) or a subject dropdown is changed
  (`applySubjectBelongingsRules`); it never re-applies on every render, so a teacher who manually
  removes an auto-added item won't see it silently reappear; **class name** and **view state**
  (which dates are currently displayed) are each their own key.

## View/date model (`js/render.js`)

The displayed date range is 5–9 columns, driven by "週を選択" (`selectWeek`), not by editing
individual date cells. Picking any date snaps to that week's Monday and rebuilds a 6-day
[Mon, Tue, Wed, Thu, Fri, next Mon] set (`computeDefaultWeekDates`); prev/next-week buttons do
the same shifted by ±7 days. A separate `weekAnchor` (that Monday) is persisted alongside the
date array specifically so "next week" always resets to a clean 6-day set even if the teacher
had manually added extra one-off days. Extra non-consecutive days (e.g. a Saturday event) are
added via a date-input + "＋追加" control that inserts into `viewDates` and re-sorts
chronologically; removed via the per-column "×" (bounded to `config.minDays`/`maxDays`, 5/9).

Illustrations can be assigned either via each period's `<select>` or by dragging a thumbnail
(from the "教科・イラストの管理" gallery or the "イラストパレット") onto a period cell's image
area — native HTML5 drag-and-drop, no library. A dragged image sets `cells[id].customImage`,
which takes priority over the subject's default image everywhere (screen and Excel) until
cleared or the subject dropdown is changed again. `js/galleryUI.js` is the shared
tabs/subcategory/search/grid component used by both the subject manager and the palette, backed
by `js/imageLibrary.js` — an auto-generated (do not hand-edit) flat manifest of ~1394 entries
pointing into `images/library/<major>_<name>/<sub>_<name>/<original-numbered-filename>`, a
third-party clip-art set ("ドロップス") kept under its original filenames on purpose.

## Excel export (`js/excelExport.js`) — the trickiest part

Exports take one of two code paths depending on the *currently displayed* day count, because
`templates/schedule_template.xlsx` (derived from the school's real reference file, one column
per day, columns `B,C,D,E,F,H` with `G` as a deliberate spacer — six fixed day slots) can't
stretch:

- **Exactly 6 days** (`exportUsingTemplate`): fetches and loads the template workbook as-is
  and only pokes values into specific known cells — it must **never** overwrite the template's
  own styling (font/border/fill/alignment/pageSetup/orientation). A past bug here was the code
  force-setting `pageSetup.orientation = "landscape"` and cell alignment on every export,
  clobbering the teacher's actual portrait-A4 template design. The fix pattern: only set
  `cell.alignment = { ...cell.alignment, wrapText: true }` (merge, don't replace) when writing
  into template cells, and don't touch `pageSetup` at all in this path. `TEMPLATE_ROW_MAP` maps
  each *default* layout section id → template row number(s) (`section_belongings` maps to 5
  rows, one per line of free text — the only multi-row section). `TEMPLATE_DAY_COLS` maps day
  index → column number. `TEMPLATE_WEEK_NOTE_ROW` is where "担任より" gets merged across all
  day columns (it's week-level, not per-day). If the teacher's layout has sections with no
  entry in `TEMPLATE_ROW_MAP` (custom sections added via the layout editor), they're appended
  as extra rows below `TEMPLATE_LAST_ROW`.
- **5, 7, 8, or 9 days** (`exportProgrammatic`): the template can't represent this day count, so
  a fresh workbook is built column-by-column in code, but `extractTemplateLook` first pulls
  font/border/fill/row-heights/column-width/pageSetup off the template so the output still
  resembles it — this is the one path allowed to set `pageSetup` (inheriting the template's
  orientation/paper size, only adding `fitToPage`/`fitToWidth` since the column count differs).

If `templates/schedule_template.xlsx`'s row/column layout is ever restructured (someone edits
it directly in Excel), **`TEMPLATE_ROW_MAP`/`TEMPLATE_DAY_COLS`/`TEMPLATE_WEEK_NOTE_ROW`/
`TEMPLATE_LAST_ROW` in `js/excelExport.js` must be updated to match** — nothing checks these
automatically against the file. `review/` is a scratch folder for Excel files exported from the
app that show a bug, dropped there purely so it can be inspected — its contents are diagnostic
input only and must never be copied/promoted into `templates/` or any other directory; fix the
underlying logic in `js/excelExport.js` instead.

Other export details worth knowing:
- Dates must be built as `new Date(Date.UTC(y, m-1, d))` (see `toExcelDate`), never
  `new Date(y, m-1, d)` — ExcelJS serializes via the Date's UTC fields, so a local-time Date
  shifts by the timezone offset and lands on the wrong day/has a spurious time-of-day.
  `dateUtils.parseISODate` (local-time) is correct for on-screen/day-of-week math but wrong for
  writing Excel date cells.
- ExcelJS's image anchor `tl.col`/`tl.row` fractional part is a fraction of *that specific
  column/row's* width/height (see `js/excelExport.js`'s `writeSubjectCell` for the pixel-budget
  math), not a fixed EMU or default-width unit — don't assume a flat pixel-to-fraction ratio
  without checking the actual column width.
- ExcelJS has no API for inserting a real floating text-box shape (only cell values, comments,
  and images). Where a "separate note, smaller font" look is wanted, it's done with a
  `richText` cell value (multiple runs with different `font.size`), not a separate object.
- Subject illustrations only embed in Excel if PNG/JPEG/GIF (`getEmbeddableExtension`) — SVG
  placeholders (used for subjects with no matched illustration yet, under `images/subjects/`)
  are silently skipped, only the subject name text appears.
