#!/bin/zsh

# Exit on error, unset variables, and pipe failures
set -euo pipefail

# Ensure we're in the project root directory
cd "$(git rev-parse --show-toplevel)"

# Check if bun is available
if ! command -v bun &> /dev/null; then
    echo "Error: bun is not installed or not in PATH"
    exit 1
fi

echo "🔄 Running pre-commit checks..."

echo "🔧 Fixing linting issues..."
bun run lint:fix

echo "✅ Running typecheck..."
bun run typecheck

echo "💅 Formatting code with Prettier..."
bun run prettier

echo "🧹 Running cargo fmt..."
cargo fmt --manifest-path ./src-tauri/Cargo.toml

echo "🔍 Running cargo clippy..."
cargo clippy --manifest-path ./src-tauri/Cargo.toml -- -D warnings

echo "🔍 Running cargo check..."
cargo check --manifest-path ./src-tauri/Cargo.toml

echo "🎉 All pre-commit checks passed!"

echo "📦 Bumping version code..."
bun run scripts/version.ts

echo "✅ Pre-commit script completed successfully!"