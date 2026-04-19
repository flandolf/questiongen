**Frontend (src) Guide**

Summary: React + TypeScript UI built with Vite. Key areas:

- Entry: [src/main.tsx](src/main.tsx#L1) and [src/App.tsx](src/App.tsx#L1).
- State & Context: [src/store.ts](src/store.ts#L1), `src/store/*` (slices),
  [src/AppContext.tsx](src/AppContext.tsx#L1).
- Components: [src/components](src/components#L1) (UI controls, layout,
  sketchpad, question blocks, theme provider).
- Views: [src/views](src/views#L1) (GeneratorView, HistoryView, SettingsView,
  AnalyticsView, SavedView, WrongQuestionView).
- Hooks: [src/hooks](src/hooks#L1) (appearance, model stats, timer, local
  backup).
- Lib utilities used by frontend: [src/lib](src/lib#L1) (generator
  orchestration, token estimation, math normalization, persistence, logging).

Developer notes:

- Prefer `bun` for scripts where applicable (repo contains `bun.lock`).
- Run dev server: `bun run dev` or `npm run dev` (see `package.json`).

Example: start dev server and open in browser

```bash
bun install
bun run dev
# open http://localhost:5173
```

Example: simple component pattern

```tsx
// src/components/EmptyState.tsx
import React from 'react';
export default function EmptyState({ title }: { title: string }) {
  return <div className='p-4'>{title}</div>;
}
```
