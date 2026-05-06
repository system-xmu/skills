# Style Notes

## Sample Pattern

Monthly reports should write `本月工作进展情况` as:

- project/topic heading first
- 2 to 6 concrete progress bullets under each topic
- concise written Chinese rather than raw meeting-note fragments
- no date headings in the body

## Preferred Verbs

Prefer wording around:

- 完成
- 推进
- 实现
- 修复
- 优化
- 调研
- 学习
- 阅读
- 合入
- 提交

## Grouping Rule

- Keep explicit project/topic markers such as `DiT` or `vllm-omni` as topic headings.
- Render project/topic headings as bold text without `•`.
- If no topic marker exists, group items under `本月工作`.
- Preserve project/topic order by first appearance in the source notes.

## Rewrite Rule

- Compress repeated fragments into a clearer written sentence.
- Keep technical names and project names unchanged when possible.
- Exclude TODO-only or purely future-looking items unless they describe an already started effort.
- When records are sparse, keep the output short and factual.
- Do not add mechanical prefixes such as `推进` to already clear accomplishments like `修正实验数值...` or `重构方法部分...`.
