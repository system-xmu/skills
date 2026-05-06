---
name: monthly-report-docx
description: Generate a monthly report .docx by collecting one month of work notes, grouping the work by project/topic, and filling only the “本月工作进展情况” section of the current monthly-report template. Use when the user asks to write 月报、月工作报表、根据组会记录生成某月月报，or to output a final .docx in the established style.
---

# Monthly Report DOCX

Use this skill to draft only `本月工作进展情况` and export a final `.docx`. The month is only a filter for source material; the report body should be organized by project/topic, not by date.

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
- Collect only the note blocks that belong to the requested month; dates are not emitted into the report body.
- Group all retained items by project/topic, preserving the first-seen project order.
- Recognize project/topic markers from bold lines such as `**vllm-omni**` and Markdown headings such as `### vllm-omni` or `#### batch scheduler support`.
- Render project/topic lines as bold headings without `•`; render progress items as bullet paragraphs.
- Use sample monthly reports to keep the familiar “项目标题 + 进展条目” writing style.
- Prefer completed, merged, fixed, implemented, optimized, studied, and actively progressed items.
- Avoid filling `上月工作回顾及本周计划`、`需在例会上协调解决的问题及建议方法`、`下月工作计划`.
- Preserve the existing `.docx` layout and replace only the body under `本月工作进展情况：`; do not proactively modify title, name, time, or other template fields.

## Output Rules

- Output must be a `.docx` file.
- If the target month has no meeting notes, stop with an error instead of generating an empty monthly report.
- Do not invent achievements that are not grounded in the meeting notes.
- When the user supplies extra work items in the prompt, fold them into the same project/topic grouping before generating the final source notes or report.
