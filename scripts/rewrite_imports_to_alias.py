#!/usr/bin/env python3
"""Rewrite relative JS/TS imports to use the @/ alias.

By default, this script rewrites parent-relative imports ("../...") to "@/..."
for files inside the source root directory.
"""

from __future__ import annotations

import argparse
from pathlib import Path
import posixpath
import re


DEFAULT_EXTENSIONS = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"}

IMPORT_PATH_RE = re.compile(
    r"""
    (?P<prefix>
        \bimport\s+(?:type\s+)?[^\n;]*?\s+from\s* |
        \bexport\s+(?:type\s+)?[^\n;]*?\s+from\s* |
        \bimport\s* |
        \bimport\s*\(\s* |
        \brequire\s*\(\s*
    )
    (?P<quote>['\"])
    (?P<path>[^'\"]+)
    (?P=quote)
    """,
    re.VERBOSE,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Rewrite relative import paths to @/ alias."
    )
    parser.add_argument(
        "paths",
        nargs="*",
        type=Path,
        default=[Path("src")],
        help="Files or directories to process. Defaults to src.",
    )
    parser.add_argument(
        "--src-root",
        type=Path,
        default=Path("src"),
        help="Directory that @ points to. Defaults to src.",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Report files that would change without writing them.",
    )
    parser.add_argument(
        "--include-current-dir",
        action="store_true",
        help='Also rewrite "./..." imports. By default only "../..." imports are rewritten.',
    )
    return parser.parse_args()


def iter_files(paths: list[Path]) -> list[Path]:
    files: list[Path] = []
    for path in paths:
        if path.is_dir():
            for child in path.rglob("*"):
                if child.is_file() and child.suffix.lower() in DEFAULT_EXTENSIONS:
                    files.append(child)
        elif path.is_file() and path.suffix.lower() in DEFAULT_EXTENSIONS:
            files.append(path)
    return sorted(dict.fromkeys(files))


def resolve_posix(base_dir: Path, import_path: str) -> str:
    base_posix = base_dir.as_posix()
    if not base_posix.startswith("/"):
        base_posix = "/" + base_posix
    normalized = posixpath.normpath(posixpath.join(base_posix, import_path))
    return normalized


def path_to_alias(
    file_path: Path,
    import_path: str,
    src_root: Path,
    include_current_dir: bool,
) -> str | None:
    if not import_path.startswith("."):
        return None

    if import_path.startswith("./") and not include_current_dir:
        return None

    if import_path.startswith("../") is False and import_path.startswith("./") is False:
        return None

    file_dir = file_path.parent.resolve()
    src_root_abs = src_root.resolve()

    resolved_str = resolve_posix(file_dir, import_path)
    resolved = Path(resolved_str)

    try:
        rel_from_src = resolved.relative_to(src_root_abs)
    except ValueError:
        return None

    new_path = "@/" + rel_from_src.as_posix()
    if import_path.endswith("/") and not new_path.endswith("/"):
        new_path += "/"
    return new_path


def rewrite_content(
    content: str,
    file_path: Path,
    src_root: Path,
    include_current_dir: bool,
) -> tuple[str, int]:
    changes = 0

    def repl(match: re.Match[str]) -> str:
        nonlocal changes
        original_path = match.group("path")
        rewritten = path_to_alias(
            file_path=file_path,
            import_path=original_path,
            src_root=src_root,
            include_current_dir=include_current_dir,
        )
        if rewritten is None or rewritten == original_path:
            return match.group(0)

        changes += 1
        return (
            f"{match.group('prefix')}"
            f"{match.group('quote')}"
            f"{rewritten}"
            f"{match.group('quote')}"
        )

    return IMPORT_PATH_RE.sub(repl, content), changes


def process_file(
    path: Path,
    src_root: Path,
    dry_run: bool,
    include_current_dir: bool,
) -> int:
    original = path.read_text(encoding="utf-8")
    updated, count = rewrite_content(
        content=original,
        file_path=path,
        src_root=src_root,
        include_current_dir=include_current_dir,
    )
    if count and not dry_run:
        path.write_text(updated, encoding="utf-8")
    return count


def main() -> int:
    args = parse_args()
    src_root = args.src_root.resolve()
    files = iter_files(args.paths)

    if not files:
        print("No matching source files found.")
        return 0

    changed_files = 0
    total_rewrites = 0

    for path in files:
        try:
            rewrites = process_file(
                path=path,
                src_root=src_root,
                dry_run=args.check,
                include_current_dir=args.include_current_dir,
            )
        except UnicodeDecodeError:
            continue

        if rewrites:
            changed_files += 1
            total_rewrites += rewrites
            print(f"{path} ({rewrites} rewrite{'s' if rewrites != 1 else ''})")

    if args.check:
        print(
            f"{changed_files} file(s) would change. "
            f"{total_rewrites} import path(s) would be rewritten."
        )
    else:
        print(
            f"{changed_files} file(s) updated. "
            f"{total_rewrites} import path(s) rewritten."
        )

    return 1 if args.check and changed_files else 0


if __name__ == "__main__":
    raise SystemExit(main())