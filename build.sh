#!/bin/zsh

export CARGO_BUILD_JOBS=${CARGO_BUILD_JOBS:-$(sysctl -n hw.ncpu)}

# 1. Added 'k' to the optstring "BmMcabk"
BUMP=false
VER_ARG=""
MODE=""
while getopts "BmMcabk" opt; do
  case $opt in
    B) BUMP=true ;;
    m) VER_ARG="minor" ;;
    M) VER_ARG="major" ;;
    c) MODE="-c" ;;
    a) MODE="-a" ;;
    b) MODE="-b" ;;
    k) MODE="-k" ;;
    *) echo "Usage: $0 [-B] [-m|-M] [-c|-a|-b|-k]"; exit 1 ;;
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

# 2. Execution Logic
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
elif [[ $MODE == "-k" ]]; then
    echo "🤖 Installing existing APK..."
    adb install -r "src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk"
else
    # Default behavior if no mode is selected
    bun run tauri build
    ditto "src-tauri/target/release/bundle/macos/questiongen.app" "/Applications/questiongen.app"
fi
