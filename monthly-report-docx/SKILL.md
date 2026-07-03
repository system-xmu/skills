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

## Input

Accept optional input:

- `month`: `YYYY-MM`; if omitted, use the previous calendar month without asking for confirmation
- `meetings_md_path`
- `template_docx_path`
- `samples_dir`
- `output_docx_path`
- `name`

## Load Reference

Before running the script, read:

- `references/style-notes.md`

## Workflow

1. Infer the target month from the user request. If no month is stated, use the previous calendar month without asking. Ask only when the wording gives conflicting months.
2. Run:
   - `python3 scripts/build_monthly_report.py`
   - Add `--month <YYYY-MM>` only when the user states a month.
   - Add other overrides only when the user provides alternative paths or name.
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
- Update the report title and name/time line for the target month, such as `6月工作报表` and `时间：2026.6`.
- Prefer completed, merged, fixed, implemented, optimized, studied, and actively progressed items.
- Avoid filling `上月工作回顾及本周计划`、`需在例会上协调解决的问题及建议方法`、`下月工作计划`.
- Preserve the existing `.docx` layout, update only the title/time fields, and replace only the body under `本月工作进展情况：`; do not fill other template sections.

## Output Rules

- Output must be a `.docx` file.
- If the target month has no meeting notes, stop with an error instead of generating an empty monthly report.
- Do not invent achievements that are not grounded in the meeting notes.
- When the user supplies extra work items in the prompt, fold them into the same project/topic grouping before generating the final source notes or report.
