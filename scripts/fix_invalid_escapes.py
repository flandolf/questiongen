#!/usr/bin/env python3
"""Fix invalid backslash escapes inside quoted string literals.

This script is designed for generated JSON/text files that contain LaTeX-style
commands such as ``\frac`` or ``\text`` without the extra escaping required
for JSON string values.

It walks quoted string literals, preserves valid JSON escapes, and rewrites
single-backslash sequences so the backslash survives parsing.
"""

from __future__ import annotations

import argparse
from pathlib import Path
import re


DEFAULT_EXTENSIONS = {".json", ".md", ".txt", ".yaml", ".yml"}
STRING_RE = re.compile(r'"(?:\\.|[^"\\])*"', re.DOTALL)

# Common LaTeX commands that begin with JSON escape letters. These need to be
# preserved as literal backslash sequences rather than being interpreted as
# JSON control escapes.
LA_TEX_COMMANDS = {
    "b": (
        "beta",
        "bar",
        "bf",
        "begin",
        "binom",
        "big",
        "Big",
        "bigg",
        "Bigg",
        "bot",
        "bullet",
        "bmod",
        "bowtie",
        "backslash",
        "bmatrix",
        "bmathbb",
    ),
    "f": ("frac", "forall", "frown", "flat", "fbox", "fty"),
    "n": ("nabla", "natural", "ne", "neq", "nearrow", "not", "notin", "nu"),
    "r": (
        "rho",
        "right",
        "rightarrow",
        "Rightarrow",
        "rm",
        "Re",
        "rangle",
        "rceil",
        "rfloor",
        "rvert",
        "rVert",
    ),
    "t": (
        "tan",
        "tanh",
        "tau",
        "text",
        "textbf",
        "textit",
        "textrm",
        "textsf",
        "texttt",
        "textup",
        "theta",
        "times",
        "to",
        "top",
        "triangle",
        "triangleright",
        "therefore",
        "tilde",
        "tfrac",
    ),
}


def iter_files(paths: list[Path]) -> list[Path]:
    files: list[Path] = []
    for path in paths:
        if path.is_dir():
            for child in path.rglob("*"):
                if child.is_file() and child.suffix.lower() in DEFAULT_EXTENSIONS:
                    files.append(child)
        elif path.is_file():
            files.append(path)
    return sorted(dict.fromkeys(files))


def is_latex_command(text: str, index: int) -> bool:
    if index + 1 >= len(text):
        return False

    next_char = text[index + 1]

    if next_char == "u":
        return False

    commands = LA_TEX_COMMANDS.get(next_char)
    if not commands:
        return False

    command_text = text[index + 1 :]
    for command in commands:
        if command_text.startswith(command):
            next_index = index + 1 + len(command)
            if next_index >= len(text) or not text[next_index].isalpha():
                return True
    return False


def fix_string_literal(match: re.Match[str]) -> str:
    text = match.group(0)
    out: list[str] = []
    i = 0

    while i < len(text):
        char = text[i]
        if char != "\\":
            out.append(char)
            i += 1
            continue

        if i + 1 >= len(text):
            out.append("\\\\")
            break

        next_char = text[i + 1]

        if next_char == "u":
            hex_slice = text[i + 2 : i + 6]
            if len(hex_slice) == 4 and all(ch in "0123456789abcdefABCDEF" for ch in hex_slice):
                out.append(text[i : i + 6])
                i += 6
                continue
            out.append("\\\\u")
            i += 2
            continue

        if next_char in '"\\/':
            out.append(text[i : i + 2])
            i += 2
            continue

        if next_char in {"b", "f", "n", "r", "t"} and is_latex_command(text, i):
            out.append("\\\\")
            out.append(next_char)
            i += 2
            continue

        if next_char.isalpha() or next_char not in '"\\/bfnrtu':
            out.append("\\\\")
            out.append(next_char)
            i += 2
            continue

        out.append(text[i : i + 2])
        i += 2

    return "".join(out)


def fix_content(content: str) -> str:
    return STRING_RE.sub(fix_string_literal, content)


def process_file(path: Path, dry_run: bool) -> bool:
    original = path.read_text(encoding="utf-8")
    updated = fix_content(original)

    if updated == original:
        return False

    if not dry_run:
        path.write_text(updated, encoding="utf-8")

    return True


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Escape invalid backslashes inside quoted string literals."
    )
    parser.add_argument(
        "paths",
        nargs="*",
        default=[Path.cwd()],
        type=Path,
        help="Files or directories to process. Defaults to the current directory.",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Report files that would change without writing them.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    files = iter_files(args.paths)

    if not files:
        print("No matching text files found.")
        return 0

    changed = 0
    for path in files:
        try:
            file_changed = process_file(path, dry_run=args.check)
        except UnicodeDecodeError:
            continue

        if file_changed:
            changed += 1
            print(path)

    if args.check:
        print(f"{changed} file(s) would change.")
    else:
        print(f"{changed} file(s) updated.")

    return 1 if args.check and changed else 0


if __name__ == "__main__":
    raise SystemExit(main())