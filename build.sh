#!/bin/zsh

export CARGO_BUILD_JOBS=${CARGO_BUILD_JOBS:-$(sysctl -n hw.ncpu)}

BUMP=false
VER_ARG=""
MODE=""
while getopts "BmMc" opt; do
  case $opt in
    B) BUMP=true ;;
    m) VER_ARG="minor" ;;
    M) VER_ARG="major" ;;
    c) MODE="-c" ;;
    *) echo "Usage: $0 [-B] [-m|-M] [-c]"; exit 1 ;;
  esac
done

if $BUMP; then
    echo "📦 Bumping version code..."
    if [[ -n "$VER_ARG" ]]; then
        bun run scripts/version.ts "$VER_ARG"
    else
        bun run scripts/version.ts
    fi
fi

if [[ $MODE == "-c" ]]; then
    ditto "src-tauri/target/release/bundle/macos/questiongen.app" "/Applications/questiongen.app"
else
    # Default behavior if no mode is selected
    bun run tauri build
    ditto "src-tauri/target/release/bundle/macos/questiongen.app" "/Applications/questiongen.app"
fi
