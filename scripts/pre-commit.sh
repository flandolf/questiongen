#!/bin/zsh

# Bump version code
bun run scripts/version.ts

bunx prettier . --write

bun run lint:fix