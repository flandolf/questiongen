#!/bin/zsh

if [[ $1 == "-c" ]]; then
    ditto "src-tauri/target/release/bundle/macos/questiongen.app" "/Applications/questiongen.app"
else
    bun run tauri build
    ditto "src-tauri/target/release/bundle/macos/questiongen.app" "/Applications/questiongen.app"
fi