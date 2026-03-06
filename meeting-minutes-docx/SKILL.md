---
name: meeting-minutes-docx
description: Generate structured meeting minutes and export Word (.docx) from meeting transcript text (pasted content or file path) plus PPT Markdown. Use when a user needs transcript cleanup, PPT-aligned terminology and data correction, fixed-format Chinese meeting minutes, and final .docx delivery.
---

# Meeting Minutes DOCX

## Overview

Use this skill to convert meeting transcript content and PPT Markdown into a finalized Chinese meeting-minutes Markdown document, then export it to `.docx` via Pandoc.

## Inputs

Require these inputs in the conversation:

- `transcript`: Either raw transcript text pasted directly, or a file path to transcript content.
- `ppt_md_path`: Absolute path to the PPT Markdown file.

Accept optional input:

- `output_docx_path`: Absolute path for output `.docx`. If omitted, export to `/Users/jader/Desktop/temp`.

## Load References

Before drafting the minutes, load:

- `references/format-template.md`
- `references/normalization-rules.md`

## Workflow

1. Read transcript input.
- If `transcript` is an existing readable file path, read file content.
- Otherwise treat `transcript` as direct text.

2. Parse PPT Markdown from `ppt_md_path`.
- Use both visible slide content and HTML comments (speaker notes).
- Keep title, names, method terms, metrics, and dates for factual alignment.

3. Normalize content.
- Use PPT terms/names/metrics to correct transcript ASR errors.
- Apply conflict priority: PPT visible content > PPT HTML comments > transcript text.
- Remove filler words and rewrite as concise written Chinese.

4. Generate meeting-minutes Markdown.
- Follow `references/format-template.md` strictly.
- Keep required section structure and heading order.
- Reconstruct Q&A into clear question/response pairs with participant attribution when available.

5. Export Word document.
- Save generated Markdown to a local `.md` file.
- Run:
  - `python3 scripts/export_docx.py --minutes-md <minutes_md_path>`
  - Or if user specifies output: `python3 scripts/export_docx.py --minutes-md <minutes_md_path> --output-docx <output_docx_path>`

## Output Rules

- Output must be a `.docx` file.
- Default output directory is `/Users/jader/Desktop/temp`.
- If `output_docx_path` is provided, use it as highest priority.
- Do not fabricate facts missing from both PPT and transcript.
