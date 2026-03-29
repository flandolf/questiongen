#!/bin/zsh

# Bump version code
bun run scripts/version.ts

# Get staged files safely into array
staged_files=("${(@f)$(git diff --cached --name-only --diff-filter=ACM)}")

# Filter ESLint files
eslint_files=()
for file in $staged_files; do
  [[ $file =~ \.(js|jsx|ts|tsx)$ ]] && eslint_files+=("$file")
done

# Filter Prettier files
prettier_files=()
for file in $staged_files; do
  [[ $file =~ \.(js|jsx|ts|tsx|json|css|scss|md)$ ]] && prettier_files+=("$file")
done

# Run ESLint if files exist
if (( ${#eslint_files[@]} )); then
  bunx eslint "${eslint_files[@]}" --fix
fi

# Run Prettier if files exist
if (( ${#prettier_files[@]} )); then
  bunx prettier "${prettier_files[@]}" --write
fi