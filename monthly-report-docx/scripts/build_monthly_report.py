#!/usr/bin/env python3

from __future__ import annotations

import argparse
import calendar
import copy
import re
import sys
import zipfile
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable
from xml.etree import ElementTree as ET


WORKSPACE_ROOT = Path("/Users/jader/Work/研")
DEFAULT_MEETINGS_MD = WORKSPACE_ROOT / "组会.md"
DEFAULT_TEMPLATE_DOCX = WORKSPACE_ROOT / "月报" / "25硕-张江杰-x月工作报表_2025x.docx"
DEFAULT_SAMPLES_DIR = WORKSPACE_ROOT / "月报"

WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
XML_NS = "http://www.w3.org/XML/1998/namespace"
NS = {"w": WORD_NS}

HEADING_RE = re.compile(r"^##\s*(\d{4})年0?(\d{1,2})月0?(\d{1,2})日\s*$")
TOPIC_RE = re.compile(r"^\*\*(.+?)\*\*[:：]?\s*$")
BULLET_RE = re.compile(r"^(\s*)[-*]\s+(.*\S)\s*$")
TASK_MARKERS = ("TODO", "todo", "Todo")
PROGRESS_MARKERS = (
    "完成",
    "推进",
    "实现",
    "修复",
    "优化",
    "调研",
    "学习",
    "阅读",
    "合入",
    "提交",
    "开发",
    "定位",
    "支持",
    "拆分",
    "设计",
    "搭建",
    "改进",
)
FUTURE_ONLY_MARKERS = (
    "TODO",
    "todo",
    "计划",
    "准备",
    "考虑",
    "需要",
    "下周",
    "后续",
)
HARD_EXCLUDE_MARKERS = ("TODO", "todo", "周二前", "要完成")


@dataclass
class MeetingItem:
    topic: str
    text: str
    indent: int
    date_label: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate a monthly report .docx from meeting notes."
    )
    parser.add_argument("--month", required=True, help="Target month in YYYY-MM format.")
    parser.add_argument("--meetings-md", default=str(DEFAULT_MEETINGS_MD))
    parser.add_argument("--template-docx", default=str(DEFAULT_TEMPLATE_DOCX))
    parser.add_argument("--samples-dir", default=str(DEFAULT_SAMPLES_DIR))
    parser.add_argument("--output-docx", default="")
    parser.add_argument("--name", default="张江杰")
    return parser.parse_args()


def parse_month(month: str) -> tuple[int, int]:
    match = re.fullmatch(r"(\d{4})-(\d{2})", month)
    if not match:
        raise ValueError(f"Invalid month '{month}'. Expected YYYY-MM.")
    year, month_num = int(match.group(1)), int(match.group(2))
    if not 1 <= month_num <= 12:
        raise ValueError(f"Invalid month '{month}'. Month must be between 01 and 12.")
    return year, month_num


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def collect_month_blocks(text: str, year: int, month_num: int) -> list[tuple[str, list[str]]]:
    blocks: list[tuple[str, list[str]]] = []
    current_date: str | None = None
    current_lines: list[str] = []

    def flush() -> None:
        if current_date is not None:
            blocks.append((current_date, current_lines.copy()))

    for raw_line in text.splitlines():
        line = raw_line.rstrip()
        heading = HEADING_RE.match(line)
        if heading:
            flush()
            y, m, d = map(int, heading.groups())
            if y == year and m == month_num:
                current_date = f"{y:04d}年{m:02d}月{d:02d}日"
                current_lines = []
            else:
                current_date = None
                current_lines = []
            continue
        if current_date is not None:
            current_lines.append(line)

    flush()
    return blocks


def parse_meeting_items(blocks: Iterable[tuple[str, list[str]]]) -> list[MeetingItem]:
    items: list[MeetingItem] = []
    for date_label, lines in blocks:
        current_topic = ""
        for line in lines:
            stripped = line.strip()
            if not stripped:
                continue
            topic_match = TOPIC_RE.match(stripped)
            if topic_match:
                current_topic = normalize_topic(topic_match.group(1))
                continue
            bullet_match = BULLET_RE.match(line)
            if not bullet_match:
                continue
            indent = len(bullet_match.group(1))
            text = clean_fragment(bullet_match.group(2))
            if text:
                items.append(
                    MeetingItem(
                        topic=current_topic or "本月工作",
                        text=text,
                        indent=indent,
                        date_label=date_label,
                    )
                )
    return items


def normalize_topic(topic: str) -> str:
    topic = topic.strip()
    topic = topic.rstrip(":：")
    return re.sub(r"\s+", " ", topic)


def clean_fragment(text: str) -> str:
    text = text.replace("\u200b", "").replace("\ufeff", "").strip()
    text = re.sub(r"\s+", " ", text)
    return text.strip(" -")


def should_keep_item(text: str) -> bool:
    if any(marker in text for marker in HARD_EXCLUDE_MARKERS):
        return False
    if "待review" in text.lower() or "待 review" in text.lower():
        return True
    if any(marker in text for marker in TASK_MARKERS):
        return False
    has_progress = any(marker in text for marker in PROGRESS_MARKERS)
    has_future_only = any(marker in text for marker in FUTURE_ONLY_MARKERS)
    if has_progress:
        return True
    return not has_future_only


def score_item(text: str, indent: int) -> int:
    score = 0
    for marker in PROGRESS_MARKERS:
        if marker in text:
            score += 2
    for marker in FUTURE_ONLY_MARKERS:
        if marker in text:
            score -= 2
    if indent == 0:
        score += 1
    if len(text) > 12:
        score += 1
    return score


def extract_docx_text(path: Path) -> str:
    with zipfile.ZipFile(path) as archive:
        xml_bytes = archive.read("word/document.xml")
    root = ET.fromstring(xml_bytes)
    paragraphs = []
    for paragraph in root.findall(".//w:p", NS):
        texts = [node.text or "" for node in paragraph.findall(".//w:t", NS)]
        combined = "".join(texts).strip()
        if combined:
            paragraphs.append(combined)
    return "\n".join(paragraphs)


def load_style_notes(samples_dir: Path) -> dict[str, bool]:
    use_topic_headers = True
    for path in sorted(samples_dir.glob("*.docx")):
        if path.name.endswith("_2025x.docx"):
            continue
        try:
            text = extract_docx_text(path)
        except Exception:
            continue
        for line in text.splitlines():
            stripped = line.strip()
            if not stripped.startswith("•"):
                continue
            content = stripped.lstrip("•").strip()
            if content and len(content) <= 24 and "：" not in content and "。" not in content:
                use_topic_headers = True
                break
        if use_topic_headers:
            break
    return {"use_topic_headers": use_topic_headers}


def build_progress_lines(items: list[MeetingItem], style_notes: dict[str, bool]) -> list[str]:
    grouped: dict[str, list[MeetingItem]] = defaultdict(list)
    for item in items:
        if should_keep_item(item.text):
            grouped[item.topic].append(item)

    if not grouped:
        raise ValueError("No usable progress items found for the requested month.")

    ordered_topics = sort_topics(grouped)
    lines: list[str] = []
    for topic in ordered_topics:
        selected = sorted(
            grouped[topic],
            key=lambda item: (-score_item(item.text, item.indent), item.date_label, item.text),
        )[:3]
        if style_notes.get("use_topic_headers", True):
            lines.append(f"• {topic}")
            for item in selected:
                lines.append(f"• {rewrite_item(item.text)}")
        else:
            merged = "；".join(rewrite_item(item.text).rstrip("。") for item in selected)
            lines.append(f"• {topic}：{merged}。")
    return lines


def sort_topics(grouped: dict[str, list[MeetingItem]]) -> list[str]:
    def topic_key(topic: str) -> tuple[int, str]:
        items = grouped[topic]
        progress_score = sum(score_item(item.text, item.indent) for item in items)
        generic_penalty = 1 if topic == "本月工作" else 0
        return (generic_penalty, -progress_score, topic.lower())

    return sorted(grouped.keys(), key=topic_key)


def rewrite_item(text: str) -> str:
    text = clean_fragment(text)
    text = text.replace("bugfix", "Bugfix")
    text = text.replace("PR", "PR")
    text = text.replace("review", "Review")
    text = text.replace(":", "，").replace("：", "，")
    text = re.sub(r"\s+", " ", text)
    starts_with_progress = text.startswith(
        ("完成", "推进", "实现", "修复", "优化", "调研", "学习", "阅读", "合入", "提交", "开发", "定位", "支持", "拆分", "设计", "搭建", "改进")
    )
    contains_progress = any(marker in text for marker in PROGRESS_MARKERS)
    if starts_with_progress or contains_progress:
        sentence = text
    elif "待review" in text or "待 review" in text:
        sentence = text.replace("待review", "推进 Review").replace("待 review", "推进 Review")
    else:
        sentence = f"推进{text}"
    sentence = sentence.rstrip("；;，,。")
    return f"{sentence}。"


def derive_output_path(template_docx: Path, month: str, output_docx: str) -> Path:
    if output_docx:
        return Path(output_docx)

    year, month_num = parse_month(month)
    yyyymm = f"{year:04d}{month_num:02d}"
    stem = template_docx.stem
    stem = stem.replace("x月工作报表_2025x", f"{month_num}月工作报表_{yyyymm}")
    stem = re.sub(r"\d+月工作报表_\d{6}", f"{month_num}月工作报表_{yyyymm}", stem)
    if stem == template_docx.stem:
        stem = f"{stem}-{yyyymm}"
    return template_docx.with_name(stem + template_docx.suffix)


def make_paragraph(template_paragraph: ET.Element, text: str) -> ET.Element:
    paragraph = copy.deepcopy(template_paragraph)
    for child in list(paragraph):
        if child.tag != f"{{{WORD_NS}}}pPr":
            paragraph.remove(child)

    first_run = template_paragraph.find("w:r", NS)
    run = ET.Element(f"{{{WORD_NS}}}r")
    if first_run is not None:
        run_pr = first_run.find("w:rPr", NS)
        if run_pr is not None:
            run.append(copy.deepcopy(run_pr))
    text_node = ET.SubElement(run, f"{{{WORD_NS}}}t")
    if text.startswith(" ") or text.endswith(" "):
        text_node.set(f"{{{XML_NS}}}space", "preserve")
    text_node.text = text
    paragraph.append(run)
    return paragraph


def replace_progress_section(template_docx: Path, output_docx: Path, body_lines: list[str]) -> None:
    with zipfile.ZipFile(template_docx) as source:
        file_map = {name: source.read(name) for name in source.namelist()}

    root = ET.fromstring(file_map["word/document.xml"])
    table = root.find(".//w:tbl", NS)
    if table is None:
        raise ValueError("Template does not contain the expected table.")
    rows = table.findall("w:tr", NS)
    if not rows:
        raise ValueError("Template table does not contain any rows.")
    cell = rows[0].find("w:tc", NS)
    if cell is None:
        raise ValueError("Template first row does not contain a cell.")

    paragraphs = cell.findall("w:p", NS)
    if not paragraphs:
        raise ValueError("Template first cell does not contain paragraphs.")
    label_paragraph = paragraphs[0]

    for paragraph in paragraphs[1:]:
        cell.remove(paragraph)

    for line in body_lines:
        cell.append(make_paragraph(label_paragraph, line))

    file_map["word/document.xml"] = ET.tostring(root, encoding="utf-8", xml_declaration=True)

    output_docx.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output_docx, "w") as target:
        for name, data in file_map.items():
            target.writestr(name, data)


def format_time_range(year: int, month_num: int) -> str:
    last_day = calendar.monthrange(year, month_num)[1]
    return f"{year}年{month_num}月1日至{year}年{month_num}月{last_day}日"


def main() -> int:
    args = parse_args()
    year, month_num = parse_month(args.month)
    meetings_md = Path(args.meetings_md)
    template_docx = Path(args.template_docx)
    samples_dir = Path(args.samples_dir)
    output_docx = derive_output_path(template_docx, args.month, args.output_docx)

    blocks = collect_month_blocks(read_text(meetings_md), year, month_num)
    if not blocks:
        raise ValueError(f"No meeting notes found for {args.month}.")
    items = parse_meeting_items(blocks)
    style_notes = load_style_notes(samples_dir)
    body_lines = build_progress_lines(items, style_notes)
    replace_progress_section(template_docx, output_docx, body_lines)

    print(f"month: {args.month}")
    print(f"name: {args.name}")
    print(f"time_range: {format_time_range(year, month_num)}")
    print(f"output_docx: {output_docx}")
    print("body:")
    for line in body_lines:
        print(line)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(1)
