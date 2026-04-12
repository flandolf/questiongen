# QuestionGen

A desktop application for generating VCE (Victorian Certificate of Education)
exam questions using AI. QuestionGen creates both multiple-choice and
written-response questions for subjects including Mathematical Methods,
Specialist Mathematics, Chemistry, and Physical Education.

## Features

- **AI-Powered Question Generation**: Uses OpenRouter API to generate exam-style
  questions aligned with VCE study design
- **Multiple Question Types**: Support for multiple-choice (4 options) and
  written-response questions
- **Subject Coverage**:
  - Mathematical Methods
  - Specialist Mathematics
  - Chemistry
  - Physical Education
- **Difficulty Levels**: Essential Skills, Easy, Medium, Hard, Extreme
- **Exam PDF Integration**: Attach past exam papers as style references for
  formatting and question patterns
- **Examiners' Reports**: Import VCAA examiners' reports to inform question
  difficulty and common misconception targeting
- **Spaced Repetition**: Practice mode with Leitner system for retention
- **Analytics Dashboard**: Track performance, generation history, and
  distinctness metrics
- **Cloud Sync**: Firebase integration for cross-device synchronization
- **Progressive Web App**: Installable desktop app built with Tauri

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, shadcn/ui
- **Desktop**: Tauri 2 (Rust backend)
- **State Management**: Zustand
- **Math Rendering**: MathJax 4
- **AI**: OpenRouter API with streaming support
- **File Handling**: PDF parsing via OpenRouter plugins
- **Analytics**: Recharts for data visualization

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://www.rust-lang.org/tools/install)
- [Tauri CLI](https://tauri.app/v1/guides/getting-started/prerequisites)

### Setup

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Run Tauri desktop app
npm run tauri
```

### Configuration

1. Copy `.env.example` to `.env`

## Project Structure

```
src/
├── App.tsx              # Main app with routing
├── views/               # Page components
│   ├── GeneratorView.tsx    # Question generation UI
│   ├── HistoryView.tsx      # Generation history
│   ├── AnalyticsView.tsx    # Performance analytics
│   ├── SettingsView.tsx     # App settings
│   └── ...
├── context/             # React contexts (Firebase, Timer)
├── store/               # Zustand state stores
├── lib/                 # Utilities (token estimation, spaced repetition)
└── types.ts             # TypeScript definitions

src-tauri/
├── src/
│   ├── lib.rs          # Rust backend with Tauri commands
│   ├── openrouter.rs   # OpenRouter API integration
│   ├── parsing.rs      # Question parsing/validation
│   ├── persistence.rs  # Local storage
│   └── quality.rs      # Question distinctness scoring
└── Cargo.toml          # Rust dependencies

exams/                  # Reference exam PDFs (PDFs excluded from git)
reports/                # VCAA examiners' reports (PDFs excluded from git)
```

## Architecture

The app follows a hybrid architecture:

- **React Frontend**: UI, state management, routing
- **Tauri Backend**: File system access, PDF I/O, API proxying
- **OpenRouter**: AI model inference with streaming
- **Local-first**: Persistent storage via Tauri's filesystem APIs
- **Optional Cloud**: Firebase for sync across devices

## Key Components

### Question Generation Flow

1. User selects topic, difficulty, question count, and type (MC/written)
2. Optional: Attach exam PDFs for style reference
3. Optional: Include examiners' reports for marking guidance
4. Backend constructs prompt with VCE-specific rules and constraints
5. OpenRouter streams response with JSON schema enforcement
6. Questions are parsed, validated, and scored for distinctness
7. Results stored locally and optionally synced to Firebase

### Quality Assurance

- **Distinctness Scoring**: Cosine similarity between question embeddings
- **Multi-step Detection**: Identifies questions requiring multiple reasoning
  steps
- **Schema Validation**: Strict JSON schema ensures consistent output format
- **Topic Compliance**: Questions mapped to user-selected topics/subtopics only

## License

Private - All rights reserved
