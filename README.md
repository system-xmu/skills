# 实验室共享 Skills 仓库

用于维护实验室可复用的 AI Agent skills（Codex / Claude Code / Cursor 等）。

## 快速使用

1. 将本仓库放到本地可访问路径，并配置到你的 agent skills 搜索路径。
2. 在对话中按 skill 名称调用（如：`$meeting-minutes-docx`）。
3. 严格按对应 `SKILL.md` 提供输入与文件路径。

## Skills

| Skill | 功能 | 目录 | 备注 |
| --- | --- | --- | --- |
| `meeting-minutes-docx` | 转写文本 + Markdown格式PPT -> 中文会议纪要 `.docx` | `meeting-minutes-docx/` | 浪潮双周会用 |

### `meeting-minutes-docx`

- 目录：`meeting-minutes-docx/`
- 功能：转写文本 + Markdown格式PPT -> 中文会议纪要 `.docx`
- 关键输入：`transcript`、`ppt_md_path`、可选 `output_docx_path`
- 依赖：`python3`、`pandoc`

调用样例（对话中）：

```text
$meeting-minutes-docx [PPT路径] [腾讯会议发言记录] [保存路径 默认~/Desktop/temp]
```

示例：

```bash
python3 meeting-minutes-docx/scripts/export_docx.py \
  --minutes-md /absolute/path/to/minutes.md \
  --output-docx /absolute/path/to/output.docx
```

## 维护规范

- 一个 skill 一个目录，至少包含 `SKILL.md`。
- 目录内推荐结构：`scripts/`、`references/`、`agents/`。
- 说明文档尽量 agent 无关，避免写死某个工具专用流程。
- 更新或新增 skill 后，同步更新本 README 的 `Skills` 列表。
