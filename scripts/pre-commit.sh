#!/bin/zsh

# Bump version code
bun run scripts/version.ts

bunx eslint . --fix
bunx prettier . --write