**Build, Run, and Release**

Local development:

 Install dependencies (prefer `bun`):

```bash
bun install
# bun run dev
```

- Alternative with npm/yarn:

```bash
npm install
npm run dev
```

Native (Tauri) builds:

```bash
cd src-tauri
cargo build
cargo test
```

Example: build production web assets then package with Tauri

```bash
# from repo root
bun run build
cd src-tauri
cargo build --release
# platform-specific bundle will be in target/release/bundle or similar
```
```

Packaging:
- Use Tauri tooling (see `src-tauri/tauri.conf.json`) to build platform-specific packages.

Quick links:
- Frontend entry: [src/main.tsx](src/main.tsx#L1)
- Tauri config: [src-tauri/tauri.conf.json](src-tauri/tauri.conf.json#L1)
- Tauri entry: [src-tauri/src/main.rs](src-tauri/src/main.rs#L1)
