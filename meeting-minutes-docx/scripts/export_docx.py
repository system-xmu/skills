#!/usr/bin/env python3
"""Export meeting minutes Markdown to DOCX using pandoc."""

from __future__ import annotations

import argparse
import datetime as dt
import re
import shutil
import subprocess
import sys
from pathlib import Path

DEFAULT_OUTPUT_DIR = Path("/Users/jader/Desktop/temp")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Export meeting minutes markdown to .docx with pandoc.",
    )
    parser.add_argument(
        "--minutes-md",
        required=True,
        help="Path to generated meeting minutes markdown.",
    )
    parser.add_argument(
        "--output-docx",
        default="",
        help="Optional explicit output .docx path.",
    )
    parser.add_argument(
        "--output-dir",
        default=str(DEFAULT_OUTPUT_DIR),
        help=f"Output directory when --output-docx is omitted (default: {DEFAULT_OUTPUT_DIR}).",
    )
    return parser.parse_args()


def sanitize_stem(name: str) -> str:
    cleaned = re.sub(r"[\\/:*?\"<>|]", "_", name).strip()
    cleaned = re.sub(r"\s+", "_", cleaned)
    return cleaned or "会议纪要"


def build_default_docx_path(minutes_md: Path, output_dir: Path) -> Path:
    date_tag = dt.date.today().strftime("%Y%m%d")
    stem = sanitize_stem(minutes_md.stem)
    base = stem if stem.endswith("会议纪要") else f"{stem}_会议纪要"
    candidate = output_dir / f"{base}_{date_tag}.docx"

    if not candidate.exists():
        return candidate

    idx = 1
    while True:
        next_path = output_dir / f"{base}_{date_tag}_{idx}.docx"
        if not next_path.exists():
            return next_path
        idx += 1


def require_pandoc() -> str:
    pandoc_bin = shutil.which("pandoc")
    if pandoc_bin:
        return pandoc_bin
    print(
        "[ERROR] pandoc is not available in PATH. Install pandoc first and retry.",
        file=sys.stderr,
    )
    raise SystemExit(127)


def main() -> int:
    args = parse_args()
    minutes_md = Path(args.minutes_md).expanduser().resolve()

    if not minutes_md.exists():
        print(f"[ERROR] minutes markdown not found: {minutes_md}", file=sys.stderr)
        return 2
    if not minutes_md.is_file():
        print(f"[ERROR] --minutes-md is not a file: {minutes_md}", file=sys.stderr)
        return 2

    output_docx = Path(args.output_docx).expanduser() if args.output_docx else None
    output_dir = Path(args.output_dir).expanduser().resolve()

    if output_docx:
        final_docx = output_docx.resolve()
        final_docx.parent.mkdir(parents=True, exist_ok=True)
    else:
        output_dir.mkdir(parents=True, exist_ok=True)
        final_docx = build_default_docx_path(minutes_md, output_dir)

    pandoc_bin = require_pandoc()
    cmd = [
        pandoc_bin,
        str(minutes_md),
        "-f",
        "markdown",
        "-t",
        "docx",
        "-o",
        str(final_docx),
    ]

    try:
        subprocess.run(cmd, check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as exc:
        stderr = exc.stderr.strip() if exc.stderr else ""
        if stderr:
            print(f"[ERROR] pandoc failed: {stderr}", file=sys.stderr)
        else:
            print("[ERROR] pandoc failed without stderr output.", file=sys.stderr)
        return exc.returncode or 1

    print(f"[OK] DOCX generated: {final_docx}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
