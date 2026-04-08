---
name: monthly-report-docx
description: Generate a monthly report .docx by extracting one month of meeting notes from 组会.md, rewriting them in the style of existing 月报 samples, and filling only the “本月工作进展情况” section of the current monthly-report template. Use when the user asks to write 月报、月工作报表、根据组会记录生成某月月报，or to output a final .docx in the established style.
---

# Monthly Report DOCX

Use this skill to draft only `本月工作进展情况` and export a final `.docx`.

## Defaults

- Meeting notes: `/Users/jader/Work/研/组会.md`
- Template: `/Users/jader/Work/研/月报/25硕-张江杰-x月工作报表_2025x.docx`
- Style samples: `/Users/jader/Work/研/月报`
- Output directory: same directory as the template, unless overridden

## Required Input

- `month`: `YYYY-MM`

Accept optional input:

- `meetings_md_path`
- `template_docx_path`
- `samples_dir`
- `output_docx_path`
- `name`

## Load Reference

Before running the script, read:

- `references/style-notes.md`

## Workflow

1. Confirm the target month.
2. Run:
   - `python3 scripts/build_monthly_report.py --month <YYYY-MM>`
   - Add overrides only when the user provides alternative paths or name.
3. Review the printed body text when the user wants a draft first.
4. Deliver the generated `.docx`.

## Script Behavior

The script will:

- Parse level-2 date headings in `组会.md`, including both `2026年03月08日` and `2026年2月8日`.
- Collect only the meeting blocks that belong to the requested month.
- Use sample monthly reports to keep the familiar “主题 + 进展条目” writing style.
- Prefer completed, merged, fixed, implemented, optimized, studied, and actively progressed items.
- Avoid filling `上月工作回顾及本周计划`、`需在例会上协调解决的问题及建议方法`、`下月工作计划`.
- Preserve the existing `.docx` layout and replace only the body under `本月工作进展情况：`.

## Output Rules

- Output must be a `.docx` file.
- If the target month has no meeting notes, stop with an error instead of generating an empty monthly report.
- Do not invent achievements that are not grounded in the meeting notes.
