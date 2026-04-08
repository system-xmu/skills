---
name: meeting-minutes-docx
description: Generate structured meeting minutes and export Word (.docx) from meeting transcript text (pasted content or file path) plus PPT Markdown. Use when a user needs transcript cleanup, PPT-aligned terminology and data correction, fixed-format Chinese meeting minutes, Marp deck rendering and section slicing, and final .docx delivery.
---

# Meeting Minutes DOCX

## Overview

Use this skill to convert meeting transcript content and PPT Markdown into a finalized Chinese meeting-minutes Markdown document, then export it to `.docx` via Pandoc. If the PPT Markdown is a Marp deck, first render the full deck to PDF and slice out the current report section as PPTX for reference.

## Inputs

Require these inputs in the conversation:

- `transcript`: Either raw transcript text pasted directly, or a file path to transcript content.
- `ppt_md_path`: Absolute path to the PPT Markdown file.

Accept optional input:

- `report_date`: Report date for Marp section extraction. Accept `YYYY年MM月DD日`, `YYYY-MM-DD`, or `YYYY/MM/DD`. Normalize internally to `YYYY年MM月DD日`.
- `output_docx_path`: Absolute path for output `.docx`. If omitted, export to `/Users/jader/Desktop/temp`.

## Load References

Before drafting the minutes, load:

- `references/format-template.md`
- `references/normalization-rules.md`

Use these bundled scripts when needed:

- `scripts/export_docx.py`
- `scripts/render_marp_section.py`
- `scripts/split_pdf.py`

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

## Workflow

1. Read transcript input.
- If `transcript` is an existing readable file path, read file content.
- Otherwise treat `transcript` as direct text.

2. Read PPT Markdown from `ppt_md_path`.
- Always parse visible slide content and HTML comments (speaker notes).
- Keep title, names, method terms, metrics, and dates for factual alignment.

3. If the PPT is a Marp deck, render and slice it before drafting minutes.
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

4. If the PPT is not a Marp deck, continue directly with the Markdown content.
- Do not require Marp rendering.
- Do not require section slicing.

5. Normalize content.
- Use PPT terms/names/metrics to correct transcript ASR errors.
- Apply conflict priority: PPT visible content > PPT HTML comments > transcript text.
- Remove filler words and rewrite as concise written Chinese.

6. Generate meeting-minutes Markdown.
- Follow `references/format-template.md` strictly.
- Keep required section structure and heading order.
- Reconstruct Q&A into clear question/response pairs with participant attribution when available.

7. Export Word document.
- Save generated Markdown to a local `.md` file.
- Run:
  - `.codex/.venv/bin/python scripts/export_docx.py --minutes-md <minutes_md_path>`
  - Or if user specifies output: `.codex/.venv/bin/python scripts/export_docx.py --minutes-md <minutes_md_path> --output-docx <output_docx_path>`

## Output Rules

- Output must be a `.docx` file.
- Default output directory is `/Users/jader/Desktop/temp`.
- If `output_docx_path` is provided, use it as highest priority.
- For Marp input, always keep the rendered full PDF and the sliced section PPTX, and default their output directory to the final `.docx` parent directory.
- Do not fabricate facts missing from both PPT and transcript.
