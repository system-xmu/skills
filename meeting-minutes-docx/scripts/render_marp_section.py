#!/usr/bin/env python3
"""Render a Marp deck to PDF and extract the report section nearest to a target date."""

from __future__ import annotations

import argparse
import datetime as dt
import re
import shutil
import subprocess
import sys
from pathlib import Path

DATE_PATTERNS = (
    re.compile(r"(?P<y>\d{4})年(?P<m>\d{1,2})月(?P<d>\d{1,2})日"),
    re.compile(r"(?P<y>\d{4})-(?P<m>\d{1,2})-(?P<d>\d{1,2})"),
    re.compile(r"(?P<y>\d{4})/(?P<m>\d{1,2})/(?P<d>\d{1,2})"),
)
MARP_FRONTMATTER_RE = re.compile(r"\A---\s*\n(?P<body>.*?)\n---\s*\n", re.DOTALL)
WORKSPACE_ROOT = Path(__file__).resolve().parents[4]
DEFAULT_THEME_SET = (
    WORKSPACE_ROOT / "themes" / "am_xmu.scss",
    WORKSPACE_ROOT / "themes" / "am_template.scss",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Render a Marp markdown deck to PDF and slice a dated report section.",
    )
    parser.add_argument(
        "--ppt-md",
        required=True,
        help="Absolute or relative path to the Marp markdown deck.",
    )
    parser.add_argument(
        "--report-date",
        default="",
        help="Optional target report date: YYYY年MM月DD日, YYYY-MM-DD, or YYYY/MM/DD.",
    )
    parser.add_argument(
        "--output-dir",
        default="",
        help="Optional output directory. Defaults to the deck directory.",
    )
    parser.add_argument(
        "--section-format",
        choices=("pptx", "pdf", "both"),
        default="pptx",
        help="Output format for the sliced section.",
    )
    parser.add_argument(
        "--no-title",
        action="store_true",
        help="Exclude the first title slide from the sliced section.",
    )
    return parser.parse_args()


def normalize_date(value: str) -> tuple[dt.date, str]:
    text = value.strip()
    if not text:
        raise ValueError("empty date")

    for pattern in DATE_PATTERNS:
        match = pattern.fullmatch(text)
        if match:
            parsed = dt.date(
                int(match.group("y")),
                int(match.group("m")),
                int(match.group("d")),
            )
            return parsed, parsed.strftime("%Y年%m月%d日")

    raise ValueError(
        f"unsupported date format: {value!r}; use YYYY年MM月DD日, YYYY-MM-DD, or YYYY/MM/DD"
    )


def format_cn_date(value: dt.date) -> str:
    return value.strftime("%Y年%m月%d日")


def load_markdown(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return path.read_text()


def load_pdf_slicer():
    try:
        from split_pdf import PDFSlicer
    except ModuleNotFoundError as exc:
        missing = exc.name or "unknown"
        raise RuntimeError(
            "Missing Python dependency for Marp section slicing: "
            f"{missing}. Install PyMuPDF, typer, rich, Pillow, and python-pptx."
        ) from exc

    return PDFSlicer


def is_marp_markdown(path: Path, content: str) -> bool:
    if path.suffix.lower() != ".md":
        return False

    match = MARP_FRONTMATTER_RE.match(content)
    if not match:
        return False

    body = match.group("body")
    return bool(re.search(r"(?mi)^\s*marp\s*:\s*true\s*$", body))


def extract_dates_from_text(content: str) -> list[tuple[dt.date, str]]:
    seen: set[dt.date] = set()
    results: list[tuple[dt.date, str]] = []
    for pattern in DATE_PATTERNS:
        for match in pattern.finditer(content):
            parsed = dt.date(
                int(match.group("y")),
                int(match.group("m")),
                int(match.group("d")),
            )
            if parsed in seen:
                continue
            seen.add(parsed)
            results.append((parsed, format_cn_date(parsed)))
    results.sort(key=lambda item: item[0])
    return results


def select_nearest_date(
    candidates: list[tuple[dt.date, str]],
    target: dt.date,
) -> tuple[dt.date, str]:
    if not candidates:
        raise ValueError("no dated sections found")
    return min(candidates, key=lambda item: (abs((item[0] - target).days), -item[0].toordinal()))


def require_render_command() -> list[str]:
    marp_bin = shutil.which("marp")
    if marp_bin:
        return [marp_bin]

    npx_bin = shutil.which("npx")
    if npx_bin:
        return [npx_bin, "--yes", "@marp-team/marp-cli"]

    raise RuntimeError(
        "Marp CLI is required to render .md decks. Install `marp` in PATH or ensure `npx @marp-team/marp-cli` is available."
    )


def resolve_theme_set() -> list[str]:
    missing = [path for path in DEFAULT_THEME_SET if not path.exists()]
    if missing:
        missing_text = ", ".join(str(path) for path in missing)
        raise RuntimeError(f"required Marp theme files not found: {missing_text}")
    return [str(path) for path in DEFAULT_THEME_SET]


def render_pdf(markdown_path: Path, pdf_path: Path) -> None:
    cmd = require_render_command()
    cmd.extend(
        [
            "--theme-set",
            *resolve_theme_set(),
            str(markdown_path),
            "--pdf",
            "--allow-local-files",
            "-o",
            str(pdf_path),
        ]
    )

    try:
        subprocess.run(
            cmd,
            check=True,
            cwd=str(markdown_path.parent),
            capture_output=True,
            text=True,
        )
    except subprocess.CalledProcessError as exc:
        stderr = exc.stderr.strip() if exc.stderr else ""
        stdout = exc.stdout.strip() if exc.stdout else ""
        detail = stderr or stdout or "unknown render failure"
        raise RuntimeError(f"failed to render Marp deck to PDF: {detail}") from exc


def discover_dates(markdown_content: str, pdf_path: Path) -> list[tuple[dt.date, str]]:
    candidates = extract_dates_from_text(markdown_content)
    if candidates:
        return candidates

    pdf_slicer = load_pdf_slicer()
    with pdf_slicer(pdf_path) as slicer:
        sections = slicer.find_section_boundaries()

    discovered: list[tuple[dt.date, str]] = []
    seen: set[dt.date] = set()
    for title, _, _ in sections:
        try:
            parsed, normalized = normalize_date(title)
        except ValueError:
            continue
        if parsed in seen:
            continue
        seen.add(parsed)
        discovered.append((parsed, normalized))

    discovered.sort(key=lambda item: item[0])
    return discovered


def section_output_path(output_dir: Path, stem: str, normalized_date: str, fmt: str) -> Path:
    safe_date = normalized_date
    if fmt == "pptx":
        return output_dir / f"{stem}_{safe_date}.pptx"
    if fmt == "pdf":
        return output_dir / f"{stem}_{safe_date}.pdf"
    return output_dir / f"{stem}_{safe_date}"


def main() -> int:
    args = parse_args()
    markdown_path = Path(args.ppt_md).expanduser().resolve()
    if not markdown_path.exists() or not markdown_path.is_file():
        print(f"[ERROR] markdown deck not found: {markdown_path}", file=sys.stderr)
        return 2

    markdown_content = load_markdown(markdown_path)
    if not is_marp_markdown(markdown_path, markdown_content):
        print(
            "[ERROR] input is not a Marp markdown deck. Require `.md` with `marp: true` in frontmatter.",
            file=sys.stderr,
        )
        return 2

    output_dir = (
        Path(args.output_dir).expanduser().resolve()
        if args.output_dir
        else markdown_path.parent
    )
    output_dir.mkdir(parents=True, exist_ok=True)

    full_pdf = output_dir / f"{markdown_path.stem}.pdf"
    render_pdf(markdown_path, full_pdf)
    print(f"[OK] Full deck PDF generated: {full_pdf}")

    candidates = discover_dates(markdown_content, full_pdf)
    if not candidates:
        print("[ERROR] no dated sections found in Marp deck or rendered PDF.", file=sys.stderr)
        return 2

    if args.report_date:
        target_date, normalized_date = normalize_date(args.report_date)
    else:
        today = dt.date.today()
        target_date, normalized_date = select_nearest_date(candidates, today)
        print(
            f"未指定汇报日期，默认选择距离当前日期 {format_cn_date(today)} 最近的章节：{normalized_date}。"
        )

    output_path = section_output_path(
        output_dir,
        markdown_path.stem,
        normalized_date,
        args.section_format,
    )

    pdf_slicer = load_pdf_slicer()
    with pdf_slicer(full_pdf) as slicer:
        success = slicer.extract_section(
            normalized_date,
            output_path,
            output_format=args.section_format,
            include_title=not args.no_title,
        )

    if not success:
        print(
            f"[ERROR] failed to extract section for {normalized_date} from {full_pdf}",
            file=sys.stderr,
        )
        return 1

    if args.section_format == "both":
        print(f"[OK] Section outputs generated: {output_path.with_suffix('.pdf')}, {output_path.with_suffix('.pptx')}")
    else:
        suffix = ".pptx" if args.section_format == "pptx" else ".pdf"
        print(f"[OK] Section output generated: {output_path.with_suffix(suffix)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
