---
name: meeting-minutes-docx
description: Generate Chinese meeting minutes and Word (.docx) from PPT Markdown and pasted/local or Tencent Meeting transcripts. Prefer the official tmeet CLI for retrieval, with Playwright MCP browser extraction as fallback. Supports presenter/time anchored discussion selection and optional Marp rendering and dated section slicing.
---

# Meeting Minutes DOCX

Convert a usable meeting transcript and PPT Markdown into structured Chinese meeting minutes, then export Word with Pandoc. Prefer the sibling official `tmeet-skill` for Tencent Meeting retrieval; use the Playwright MCP browser fallback when CLI acquisition cannot provide a complete transcript.

## Inputs

Require `ppt_md_path`: absolute path to PPT Markdown or a Marp deck.

Use one transcript source:

- `transcript`: pasted verbatim transcript text or an existing readable local transcript file.
- Tencent Meeting identifiers: `record_file_id`, `meeting_record_id`, `meeting_id`, or `meeting_code`. Preserve identifiers as strings and distinguish their types. Resolve the actual transcript file through the official tools.
- `transcript_page_url`: shared recording URL. Use official resolution only if supported; otherwise retain the full URL for browser fallback. A share slug is not a recording/file ID.

Optional inputs:

- `transcript_page_mode`: `url` (default; create a task-owned tab for the supplied URL) or `current-page` (only when the user explicitly asks to use an existing browser page; identify the intended tab from its title/URL).
- `transcript_speaker`: target presenter name as shown in the transcript. Infer from the PPT only when unambiguous; otherwise ask which presenter/report to select.
- `transcript_anchor_time`: recording-relative `MM:SS` or `HH:MM:SS` near the intended report. Two components mean minutes and seconds (`36:59` = `00:36:59`), not hours and minutes.
- `transcript_end_time`: optional recording-relative end time in the same formats. Include turns starting at or before this time; it must not precede the selected start.
- `report_date`: Marp section date, accepting `YYYY年MM月DD日`, `YYYY-MM-DD`, or `YYYY/MM/DD`.
- `output_docx_path`: absolute output `.docx` path; default directory `/Users/jader/Desktop/temp`.

If both local/pasted transcript and Tencent inputs are present, use `transcript` unless the user explicitly requests a refresh. Local/pasted input needs neither tmeet nor a browser. `current-page` is a browser-fallback input, not permission to inspect unrelated tabs or a reason to skip usable local input.

## References and Dependencies

Before drafting, read [the minutes template](references/format-template.md) and [normalization rules](references/normalization-rules.md). When selecting a report from a larger transcript, also read [discussion selection](references/discussion-window.md).

For Tencent retrieval, read [the acquisition procedure](references/tencent-meeting-transcript.md), [the installed official skill](../tmeet-skill/SKILL.md), and its recording/auth references. Use the installed `tmeet` commands and OAuth; do not implement a separate API/authentication proxy. For fallback, read [Playwright browser extraction](references/playwright-transcript-extraction.md) and the sibling [web-access skill](../web-access/SKILL.md), whose Tencent transcript exception uses the existing Playwright MCP extension connection. These are instruction-level dependencies, not `dependencies.tools` skill entries in `agents/openai.yaml`.

Use `.codex/.venv/bin/python` from the project root for bundled Python scripts. Script paths below are relative to this skill's directory unless qualified. Resolve absolute paths before running from another directory.

- `pandoc`: Word export, via `scripts/export_docx.py`.
- `marp` in `PATH` or `npx @marp-team/marp-cli`: only for Marp inputs, via `scripts/render_marp_section.py`.
- `PyMuPDF`, `typer`, `rich`, `Pillow`, `python-pptx`: slide slicing via `scripts/split_pdf.py`.
- `tmeet` in `PATH` plus sibling `tmeet-skill`: preferred Tencent retrieval, authenticated with `tmeet auth login` when needed.
- Playwright MCP connected through its browser extension: browser fallback only, via `scripts/tencent_meeting_extract.js` and `browser_run_code_unsafe` (or `browser_run_code` on older clients). No CDP Proxy is needed for this route.

## Workflow

### 1. Acquire a usable transcript

For `transcript`, read the file if it is an existing readable path; otherwise use the pasted text. A clearly intended but missing/unreadable file is an input error, not literal transcript text.

For Tencent Meeting input, follow [the acquisition procedure](references/tencent-meeting-transcript.md). Obtain complete verbatim turns covering the intended report and its discussion before selecting an excerpt. Preserve speaker, recording-relative timestamp, paragraph identity, and text. Do not treat a search snippet, AI summary, Yuanbao rolling summary, or a single partial page as a complete transcript.

If tmeet is missing, not logged in, denied access, unable to resolve a share URL, fails, or returns incomplete content, automatically try the browser path when an authorized recording URL or explicitly requested current page is available. Do not block fallback on repeated CLI login attempts. Respect permission/password/login barriers; browser share access and CLI account access are separate. Only after both usable routes fail, explain the concrete limitation and allow an exported transcript. A PPT-only draft requires explicit agreement and must not invent Q&A. AI summaries/UI noise cannot substitute for verbatim evidence.

### 2. Select the report and all related discussion

Keep acquisition separate from selection. Apply [discussion selection](references/discussion-window.md) to CLI, browser, and local transcripts alike. Include the report plus teacher/peer questions, replies, follow-up questions, and related discussion until a genuine next-report/agenda boundary or explicit `transcript_end_time`. Do not filter all turns to the presenter or end after a fixed number of other-speaker turns.

Resolve repeated reports using the anchor and PPT topic. Ask only when the intended occurrence or boundary remains ambiguous. Before drafting a selected excerpt, report the chosen presenter/report, actual recording-relative range, and why the range ends there. If the transcript lacks timestamps or speaker labels, disclose that limitation and select only what the text supports.

### 3. Read and align the PPT

Parse visible Markdown content and HTML comments (speaker notes); retain names, method terms, metrics, dates, and the selected report topic. Apply factual priority: PPT visible content > PPT HTML comments > transcript. Correct ASR terminology without inventing dialogue.

Detect Marp only when the input ends in `.md` and its frontmatter contains `marp: true`. Otherwise treat it as plain PPT Markdown and skip rendering/slicing.

### 4. Render Marp when applicable

Determine the final Word output directory first: parent of `output_docx_path`, otherwise `/Users/jader/Desktop/temp`. Run:

```bash
.codex/.venv/bin/python .codex/skills/meeting-minutes-docx/scripts/render_marp_section.py \
  --ppt-md <ppt_md_path> --output-dir <final_docx_parent_dir>
```

Add `--report-date <report_date>` when provided. The renderer produces the full PDF and slices a dated section to PPTX when date sections exist. Without `report_date`, choose the section nearest the current system date; ties choose the later date. Tell the user the current date and selected section date explicitly. Without dated sections, retain the full PDF and do not force slicing.

For this workspace, `am_xmu.scss` depends on `am_template.scss`. Manual rendering must pass both themes in this order with separate flags and the deck path before the theme options:

```bash
marp <deck.md> \
  --theme-set /Users/jader/Work/研/themes/am_template.scss \
  --theme-set /Users/jader/Work/研/themes/am_xmu.scss \
  --pdf --allow-local-files -o <full-deck.pdf>
```

A Marp exit code of zero is insufficient: verify that the expected PDF exists and is nonempty. Visually inspect at least one non-cover page for the XMU blue headings, footer, and expected layout; a plain black default render indicates a theme failure. Use original Markdown including notes plus the selected rendered output as references, not the rendered output alone.

### 5. Write and export minutes

Apply [normalization rules](references/normalization-rules.md), then follow [the template](references/format-template.md). Reconstruct attributed question/response pairs from the selected turns; retain the speaker/time evidence until reconstruction is complete. Mark missing answers and plans as unavailable or pending rather than guessing.

Write temporary minutes Markdown and run:

```bash
.codex/.venv/bin/python .codex/skills/meeting-minutes-docx/scripts/export_docx.py \
  --minutes-md <temporary_minutes_md> --output-docx <output_docx_path>
```

Omit `--output-docx` to use the default output directory and collision-safe filename. Verify the `.docx` exists, is nonempty, and its content/format follows the template. Delete the temporary Markdown only after successful export unless the user requested it.

## Outputs and Cleanup

- Deliver `.docx`; honor `output_docx_path` over the default directory.
- Dated Marp input: retain the selected PDF/PPTX products that were generated; remove the full-deck PDF after successful slicing unless requested otherwise.
- Standalone Marp input: retain the full PDF.
- Delete task-created transcript caches and temporary render/export files when no longer needed; preserve user-provided source files and requested outputs. Close only browser tabs created by this task. Do not write credentials to project files or responses.
- State the actual acquisition channel and any PPT-only or incomplete-source limitation. Do not claim successful live retrieval when only local/offline tests ran.
