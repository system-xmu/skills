# 实验室共享 Skills 仓库

用于维护可复用的本地 AI Agent skills，当前主要覆盖：

- 会议转写 + PPT Markdown -> 中文会议纪要 `.docx`
- 现有 Marp 汇报的增量补写 / 重写
- `组会.md` -> 月报 `.docx`

具体工作流和边界定义以各目录下的 `SKILL.md` 为准。

## 快速配置

### Codex

| 项目 | 命令 / 配置 | 说明 |
| --- | --- | --- |
| 安装位置 | `ln -sfn <skills-repo> .codex/skills` | 也可直接放到 `$CODEX_HOME/skills` |
| 额外依赖 | Python、`pandoc`、`marp` / `npx @marp-team/marp-cli`、Playwright MCP | 仅 `meeting-minutes-docx` 需要 |
| 调用方式 | `$meeting-minutes-docx` / `$marp-slide-writer` / `$monthly-report-docx` | 在对话中直接按 skill 名称调用 |

### Claude Code

```bash
mkdir -p .claude/skills
ln -sfn <skills-repo>/meeting-minutes-docx .claude/skills/meeting-minutes-docx
ln -sfn <skills-repo>/marp-slide-writer .claude/skills/marp-slide-writer
ln -sfn <skills-repo>/monthly-report-docx .claude/skills/monthly-report-docx
```

| 配置项 | 要求 |
| --- | --- |
| 读取权限 | 允许读取 `<skills-repo>/**` |
| MCP / 命令 | `meeting-minutes-docx` 场景启用 `playwright` MCP，并允许执行 Python、`pandoc`、`marp` |
| 调用方式 | 直接用 `/meeting-minutes-docx`、`/marp-slide-writer`、`/monthly-report-docx`，也可让 Claude 自动匹配 |
| 兼容说明 | `.claude/commands/*.md` 仍可用，但属于旧 custom commands 兼容入口；新配置优先使用 `.claude/skills/` |

## Skills 一览

| Skill | 输入 | 输出 | 典型场景 |
| --- | --- | --- | --- |
| `meeting-minutes-docx` | PPT Markdown / Marp + 腾讯会议录播页或转写文本 | 会议纪要 `.docx` | 从录播转写中抽取讨论并整理成中文纪要 |
| `marp-slide-writer` | 现有 Marp 文档 + 写作任务 + 可选参考材料 | 修改后的 Marp Markdown | 补页、补章、重写某节、整理周报页 |
| `monthly-report-docx` | `YYYY-MM` + 可选会议记录 / 模板 / 样例路径 | 月报 `.docx` | 从 `组会.md` 提取某月进展并写入模板 |

## Skill 说明

### `meeting-minutes-docx`

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `ppt_md_path` | 是 | PPT Markdown 或 Marp 文档的绝对路径 |
| `transcript_page_url` | 条件必填 | 腾讯会议录播结果页 URL；与 `transcript` 二选一，推荐优先使用 |
| `transcript` | 条件必填 | 本地转写文件绝对路径，或直接粘贴的原始转写文本；与 `transcript_page_url` 二选一 |
| `transcript_speaker` | 否 | 页面中实际显示的发言人名称 |
| `transcript_anchor_time` | 否 | `HH:MM` / `HH:MM:SS`，用于同名发言人的时间锚点定位 |
| `transcript_page_mode` | 否 | `url` 或 `current-page`；默认按是否提供 `transcript_page_url` 推断 |
| `report_date` | 否 | `YYYY年MM月DD日`、`YYYY-MM-DD`、`YYYY/MM/DD`；用于 Marp 章节定位 |
| `output_docx_path` | 否 | 输出 `.docx` 的绝对路径；未提供时写入 skill 默认临时目录 |

输出与规则：

- 主输出：中文会议纪要 `.docx`
- 抽取优先级：优先使用腾讯会议页面中的说话人和时间戳
- Marp 支持：若 `ppt_md_path` 为 Marp 文档，可按汇报日期定位并切分章节
- 兜底策略：页面 / 文本缺少准确转写且用户明确同意时，可退化为基于 PPT 的纪要草稿

**使用例**

```text
$meeting-minutes-docx 使用 <slides.md> 作为 PPT，去 https://meeting.tencent.com/crm/xxxx 的录播转写页里提取张江杰在 01:00:00 附近的讨论，输出到 <output.docx>
$meeting-minutes-docx 使用当前浏览器页面的腾讯会议转写结果，提取张江杰在 01:00:00 附近的讨论，PPT 是 <slides.md>
$meeting-minutes-docx 使用 <slides.md> 和 <transcript.txt> 生成会议纪要
```

### `marp-slide-writer`

| 输入项 | 必填 | 说明 |
| --- | --- | --- |
| 目标 Marp 文档路径 | 是 | 通常为现有汇报 `.md`，应保留原 frontmatter 和分页结构 |
| 写作任务 | 是 | 例如补一页本周进展、补一章阶段总结、重写某一节 |
| 来源笔记 / 草稿 | 否 | 可提供组会记录、实验记录、TODO、草稿等参考材料 |
| 风格 / 布局约束 | 否 | 可指定主题、页面风格、布局方式、插入位置、参考页 |

输出与规则：

- 主输出：目标 `.md` 的增量修改结果
- 默认策略：只做完成任务所需的最小改动，不主动升级成完整 deck 重构
- 风格继承：优先沿用原文档的 frontmatter、页面粒度、class、HTML 容器和术语风格

**使用例**

```text
$marp-slide-writer 给 <slides.md> 补一页本周进展，保持当前 am_xmu 风格
$marp-slide-writer 根据 <notes.md>，把 <slides.md> 里“系统设计”这一节重写成 2 页
```

### `monthly-report-docx`

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `month` | 是 | `YYYY-MM` |
| `meetings_md_path` | 否 | 会议记录 Markdown 绝对路径；默认使用工作区中的 `组会.md` |
| `template_docx_path` | 否 | 月报模板 `.docx` 绝对路径 |
| `samples_dir` | 否 | 月报样例目录绝对路径 |
| `output_docx_path` | 否 | 输出 `.docx` 的绝对路径 |
| `name` | 否 | 姓名字符串 |

输出与规则：

- 主输出：月报 `.docx`
- 写入范围：只填充 `本月工作进展情况`
- 生成约束：保持样例中的“主题 + 进展条目”写法，不捏造会议记录中不存在的成果
- 错误处理：指定月份没有可用会议记录时直接报错，不生成空月报

**使用例**

```text
$monthly-report-docx 生成 2026-03 的月报，输出到模板同目录
$monthly-report-docx 用 <meetings.md> 生成 2026-03 月报，并保存到 <output.docx>
```

## 当前目录

```text
.
├── README.md
├── marp-slide-writer/
│   ├── SKILL.md
│   ├── agents/openai.yaml
│   └── references/
├── meeting-minutes-docx/
│   ├── SKILL.md
│   ├── agents/openai.yaml
│   ├── references/
│   └── scripts/
└── monthly-report-docx/
    ├── SKILL.md
    ├── agents/openai.yaml
    ├── assets/
    ├── references/
    └── scripts/
```

## 维护规范

| 项目 | 约束 |
| --- | --- |
| 目录结构 | 一个 skill 一个目录，至少包含 `SKILL.md` |
| 可选资源 | 需要脚本、参考资料或 agent 元数据时，再增设 `scripts/`、`references/`、`agents/`、`assets/` |
| 文档职责 | `SKILL.md` 定义能力边界、输入输出和工作流；`README.md` 提供入口说明 |
| 更新要求 | 新增 skill，或输入格式、输出形式、默认路径变化时，同步更新本 README |
