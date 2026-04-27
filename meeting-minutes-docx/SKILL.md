---
name: meeting-minutes-docx
description: Generate structured meeting minutes and export Word (.docx) from meeting transcript text, a local transcript file, or Playwright MCP extraction from Tencent Meeting transcript result pages, plus PPT Markdown. Use when Codex needs transcript cleanup, Tencent Meeting transcript-page reading, speaker-and-time anchored discussion-window extraction, PPT-aligned terminology correction, Marp deck rendering and section slicing, and final .docx delivery.
---

# Meeting Minutes DOCX

## Overview

Use this skill to convert meeting transcript content and PPT Markdown into a finalized Chinese meeting-minutes Markdown document, then export it to `.docx` via Pandoc. Support transcript input from raw text, a local transcript file, or Playwright MCP extraction from Tencent Meeting transcript result pages. The Tencent Meeting page flow has been tested against a real recording page where the right-side content area exposes `转写`, `纪要`, and `AI小助手` tabs, and the transcript body renders as repeated `speaker -> timestamp -> content` turn blocks. When extracting from a page, locate a discussion window by target speaker plus timestamp anchor, include other speakers within that exchange, then feed the extracted transcript into the existing cleanup and export pipeline.

## Inputs

Require these inputs in the conversation:

- `ppt_md_path`: Absolute path to the PPT Markdown file.

Provide one transcript source:

- `transcript`: Either raw transcript text pasted directly, or a readable file path to transcript content.
- Page extraction inputs:
  - `transcript_speaker`: Target speaker name.
  - `transcript_page_url`: Absolute transcript result page URL, or omit this and use the current browser page.

Accept optional input:

- `transcript_page_mode`: `url` or `current-page`.
  - Default to `url` when `transcript_page_url` is provided.
  - Otherwise default to `current-page`.
- `transcript_anchor_time`: Timestamp near the intended occurrence of `transcript_speaker`. Accept `HH:MM` or `HH:MM:SS`. Treat this as required when the speaker appears multiple times in the page transcript.
- `report_date`: Report date for Marp section extraction. Accept `YYYY年MM月DD日`, `YYYY-MM-DD`, or `YYYY/MM/DD`. Normalize internally to `YYYY年MM月DD日`.
- `output_docx_path`: Absolute path for output `.docx`. If omitted, export to `/Users/jader/Desktop/temp`.

If both `transcript` and page extraction inputs are provided, prefer `transcript` unless the user explicitly says to refresh transcript content from the page.

## Load References

Before drafting the minutes, load:

- `references/format-template.md`
- `references/normalization-rules.md`
- `references/playwright-transcript-extraction.md` when using page extraction mode.

Use these bundled scripts when needed:

- `scripts/export_docx.py`
- `scripts/render_marp_section.py`
- `scripts/split_pdf.py`

Use these bundled scripts for page extraction:

- `scripts/tencent_meeting_extract.js`

Use Playwright MCP tools when extracting transcript content from a page:

- `mcp__playwright__browser_navigate`
- `mcp__playwright__browser_evaluate`
- `mcp__playwright__browser_run_code`
- `mcp__playwright__browser_tabs` when navigation reports a temporary MCP Bridge connection timeout

Debug-only tools (use only when extraction fails and DOM diagnosis is needed):

- `mcp__playwright__browser_snapshot`

## Marp Detection

Treat `ppt_md_path` as a Marp deck only if both conditions are true:

- The file path ends with `.md`.
- The Markdown frontmatter contains `marp: true`.

If either condition is false, treat it as plain Markdown PPT notes and skip Marp rendering.

## Dependencies

Require these tools for the full workflow:

- `pandoc` for `.docx` export.
- `marp` in `PATH`, or `npx @marp-team/marp-cli`, for Marp-to-PDF rendering.
- Use the Python environment at `.codex/.venv` for all bundled Python scripts.
- Python packages for slide slicing: `PyMuPDF`, `typer`, `rich`, `Pillow`, `python-pptx`.
- Playwright MCP browser access for page extraction mode.

## Workflow

1. Determine transcript acquisition mode.
- If `transcript` is provided, use direct transcript mode.
- Otherwise, if `transcript_speaker` is provided, use page extraction mode.
- Otherwise stop and ask for either `transcript` or the page extraction inputs.

2. Read transcript input in direct transcript mode.
- If `transcript` is an existing readable file path, read file content.
- Otherwise treat `transcript` as direct text.
- If the resulting transcript content is empty, clearly corrupted, or only contains UI noise / summary text rather than usable meeting turns, stop and tell the user that no accurate meeting record is currently available.
- In that case, ask the user whether to continue with a PPT-only minutes draft.
  - Continue only after the user explicitly agrees.
  - If the user declines, stop without generating minutes or `.docx`.

3. Extract transcript input in page extraction mode.
- Load `references/playwright-transcript-extraction.md`.
- Resolve the page source first.
  - If `transcript_page_url` is provided, navigate to it using `browser_navigate`.
  - Otherwise operate on the current browser page.
  - If navigation fails with a Playwright MCP Bridge / extension connection timeout, do not immediately conclude Playwright is unavailable. Run `browser_tabs list` once to give the bridge extension a chance to finish connecting, then retry `browser_navigate` once. Only treat it as unavailable if the retry still fails.
- Run a single `browser_evaluate` state check to confirm the page is ready.
  - Check: is the page logged in (title contains `录制文件`)? Does it have a `转写` tab? Does it have a `.minutes-module-list` container?
  - If not logged in, stop and ask the user to complete login manually in the browser, then continue.
  - If no `转写` tab, say that Tencent Meeting is the supported page type and ask the user for raw transcript text or a transcript file path instead.
- Read `scripts/tencent_meeting_extract.js` with the Read tool.
- Replace parameter placeholders in the script:
  - `'__TARGET_SPEAKER__'` → the actual `transcript_speaker` value.
  - `'__ANCHOR_TIME__'` → the actual `transcript_anchor_time` value, or `'null'` if not provided.
- Run the substituted script via a single `browser_run_code` call (pass as `code` parameter).
  - The script handles all remaining work internally: tab switching, scrolling, deduplication, speaker matching, anchor selection, and discussion window extraction.
  - Do not use `browser_snapshot`, `browser_click`, `browser_press_key`, or additional `browser_evaluate` calls in the normal path.
- Parse the returned JSON result:
  - On `error: 'no_transcript'` → tell the user no accurate meeting record was found. Ask whether to continue with PPT-only minutes.
  - On `error: 'speaker_not_found'` → show available speakers and ask the user to verify the name.
  - On `error: 'anchor_too_far'` → show available occurrences and ask the user to confirm or provide a better anchor.
  - On success → extract `selected_occurrence`, `time_range`, and `turns` from the result.
- Render the extracted turns as ordered text lines in the form `[HH:MM:SS] Speaker: content`.
- Before drafting the minutes, explicitly tell the user which occurrence was selected and the extracted time range.
- If `browser_run_code` itself fails (unexpected error), fall back to a single `browser_snapshot` for diagnosis, then ask the user for raw transcript text.

4. Read PPT Markdown from `ppt_md_path`.
- Always parse visible slide content and HTML comments (speaker notes).
- Keep title, names, method terms, metrics, and dates for factual alignment.

5. If the PPT is a Marp deck, render and slice it before drafting minutes.
- Determine the final `.docx` output location first.
  - If `output_docx_path` is provided, use its parent directory as the render output directory.
  - Otherwise use the default `.docx` output directory `/Users/jader/Desktop/temp` as the render output directory.
- Run `.codex/.venv/bin/python scripts/render_marp_section.py --ppt-md <ppt_md_path> --output-dir <final_docx_parent_dir>`.
- If `report_date` is provided, pass `--report-date <report_date>`.
- The script must:
  - Render the full deck to `<deck_stem>.pdf`.
  - Extract the selected section as `<deck_stem>_<normalized_date>.pptx`.
  - Prefer `marp` in `PATH`, otherwise use `npx @marp-team/marp-cli`.
  - Stop with a concrete dependency message if neither render path works.
- If `report_date` is omitted, the script must select the section whose date is nearest to the current system date. If two sections are equally near, choose the later date.
- When defaulting the date, explicitly tell the user which date was chosen, for example:
  - `未指定汇报日期，默认选择距离当前日期 2026年03月30日 最近的章节：2026年03月30日。`
- Use both the original Markdown deck and the sliced PPTX as factual references. Do not replace the Markdown parsing path with the sliced output.

6. If the PPT is not a Marp deck, continue directly with the Markdown content.
- Do not require Marp rendering.
- Do not require section slicing.

7. Normalize content.
- Use PPT terms, names, and metrics to correct transcript ASR errors.
- Apply conflict priority: PPT visible content > PPT HTML comments > transcript text.
- When transcript content comes from page extraction mode, preserve speaker attribution and timestamps during cleanup until Q&A reconstruction is complete.
- Remove filler words and rewrite as concise written Chinese.
- If the user chose to continue without any accurate meeting record, explicitly treat the output as PPT-only minutes.
  - Do not fabricate Q&A details that are unsupported by the PPT.
  - Clearly mark unanswered or unrecoverable discussion details as unavailable instead of guessing.

8. Generate meeting-minutes Markdown.
- Follow `references/format-template.md` strictly.
- Keep required section structure and heading order.
- Reconstruct Q&A into clear question/response pairs with participant attribution when available.

9. Export Word document.
- Save generated Markdown to a temporary `.md` file for Pandoc conversion.
- Run:
  - `.codex/.venv/bin/python scripts/export_docx.py --minutes-md <minutes_md_path>`
  - Or if the user specifies output: `.codex/.venv/bin/python scripts/export_docx.py --minutes-md <minutes_md_path> --output-docx <output_docx_path>`
- After successful `.docx` export, delete the intermediate `.md` file. Do not keep it in the output directory unless the user explicitly asks to preserve it.

## Output Rules

- Output must be a `.docx` file.
- Default output directory is `/Users/jader/Desktop/temp`.
- If `output_docx_path` is provided, use it as highest priority.
- For Marp input, only keep the sliced section PDF/PPTX in the output directory. Delete the full deck PDF after slicing unless the user explicitly asks to keep it.
- For page extraction mode, report the selected speaker occurrence and extracted time range before generating the final document.
- If no accurate meeting record was available and the user chose to continue, tell the user that the output is based only on PPT content and that detailed discussion reconstruction was skipped.
- Do not fabricate facts missing from both PPT and transcript.
