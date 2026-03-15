#!/bin/zsh

if [[ $1 == "-c" ]]; then
    ditto "src-tauri/target/release/bundle/macos/questiongen.app" "/Applications/questiongen.app"
elif [[ $1 == "-a" ]]; then
    bun run tauri android build
    adb install -r "src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk"
else
    bun run tauri build
    ditto "src-tauri/target/release/bundle/macos/questiongen.app" "/Applications/questiongen.app"
fi