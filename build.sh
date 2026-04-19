#!/bin/zsh

export CARGO_BUILD_JOBS=${CARGO_BUILD_JOBS:-$(sysctl -n hw.ncpu)}

# Parse flags: -B = bump (only when present), -m = minor, -M = major
# -c, -a, -b control install/build targets (same as before)
BUMP=false
VER_ARG=""
MODE=""
while getopts "BmMcab" opt; do
  case $opt in
    B) BUMP=true ;;
    m) VER_ARG="minor" ;;
    M) VER_ARG="major" ;;
    c) MODE="-c" ;;
    a) MODE="-a" ;;
    b) MODE="-b" ;;
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
elif [[ $MODE == "-a" ]]; then
    bun run tauri android build -t aarch64
    adb install -r "src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk"
elif [[ $MODE == "-b" ]]; then
    bun run tauri build
    ditto "src-tauri/target/release/bundle/macos/questiongen.app" "/Applications/questiongen.app"
    bun run tauri android build -t aarch64
    adb install -r "src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk"
else
    bun run tauri build
    ditto "src-tauri/target/release/bundle/macos/questiongen.app" "/Applications/questiongen.app"
fi