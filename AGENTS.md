# AGENTS.md

This file contains guidelines and commands for agentic coding agents working in this repository.

## Project Overview

This is a **Tauri + React + TypeScript** application for generating exam questions. The project uses:
- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Vite
- **Backend**: Rust with Tauri for desktop app functionality
- **State Management**: Zustand
- **Math Rendering**: MathJax via better-react-mathjax
- **Authentication**: Firebase
- **Data Persistence**: Local storage with Tauri backend

## Build Commands

### Development
```bash
# Start development server
bun run tauri dev

# Build for production
bun run tauri build
```

## Code Style Guidelines

### TypeScript Configuration
- **Strict mode enabled**: All TypeScript code must pass strict type checking
- **Path aliases**: Use `@/*` for imports from `src/` directory
- **Module resolution**: Bundler mode for optimal build performance

### Import Organization
```typescript
// React imports first
import { useState, useEffect } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';

// Third-party libraries next
import { MathJaxContext } from 'better-react-mathjax';
import firebase from 'firebase';

// Internal imports with path aliases
import { AppProvider } from '@/AppContext';
import { useAppContext } from '@/AppContext';
import { Layout } from '@/components/layout/Layout';
import { GeneratorView } from '@/views/GeneratorView';
```

### Component Structure
```typescript
// Functional components with TypeScript
import React from 'react';
import { useState, useEffect } from 'react';

interface ComponentProps {
  // Prop types here
  data: string;
  onAction: (value: string) => void;
}

export default function ComponentName({ data, onAction }: ComponentProps) {
  // State hooks
  const [state, setState] = useState<Type>(initialValue);
  
  // Effects
  useEffect(() => {
    // Effect logic
  }, [dependencies]);

  // Event handlers
  const handleAction = (e: React.MouseEvent) => {
    e.preventDefault();
    onAction(data);
  };

  return (
    <div className="base-classes additional-classes">
      {/* JSX content */}
    </div>
  );
}
```

### Naming Conventions
- **Components**: PascalCase (e.g., `GeneratorView`, `WrittenQuestionCard`)
- **Functions/Variables**: camelCase (e.g., `useAppContext`, `handleAction`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `MATH_METHODS_SUBTOPICS`)
- **Files**: PascalCase for components (`GeneratorView.tsx`), camelCase for utilities (`app-utils.ts`)
- **Types**: PascalCase with descriptive names (e.g., `Difficulty`, `MathMethodsSubtopic`)

### State Management
- Use **Zustand** for global state in `store.ts`
- Use **React hooks** for local component state
- Use **context** (`AppContext.tsx`) for app-wide state like hydration status
- Firebase state managed in context modules (`useFirebase.ts`, `useFirebaseSync.ts`)

### Styling
- **Tailwind CSS v4** for all styling
- Use **shadcn/ui** components as base UI elements
- Custom components extend shadcn/ui with specific styling
- Responsive design using Tailwind's mobile-first approach

### Error Handling
```typescript
// Try-catch for async operations
try {
  const result = await someAsyncOperation();
  // Handle success
} catch (error) {
  console.error('Operation failed:', error);
  // Show user-friendly error message
}

// Optional chaining and nullish coalescing
const value = obj?.property ?? defaultValue;

// Type guards for runtime type checking
if (typeof value === 'string') {
  // Safe to use as string
}
```

### File Organization
```
src/
├── components/          # Reusable UI components
│   ├── layout/         # Layout components
│   ├── ui/             # shadcn/ui components
│   └── generator/      # Generator-specific components
├── views/             # Page-level components
├── context/           # React contexts and hooks
├── lib/               # Utility functions
├── store.ts           # Zustand store
├── types.ts           # TypeScript type definitions
├── main.tsx           # Entry point
└── App.tsx            # Main app component
```

### Math Content Guidelines
- Use **MathJax** for mathematical notation rendering
- Follow VCAA Math Methods notation conventions:
  - Functions: `f: domain → R, f(x) = ...`
  - Domain: interval notation `[a, b]` or set notation `{x ∈ R : x > 0}`
  - Exact values for trig functions at standard angles
- Include proper LaTeX formatting for all mathematical expressions

### Firebase Integration
- Use `useFirebase.ts` for Firebase initialization
- Use `useFirebaseSync.ts` for data synchronization
- Handle authentication state in context
- Use Firebase collections for persistent data storage

### Tauri Integration
- Rust backend in `src-tauri/src/`
- Use Tauri APIs for desktop-specific functionality
- Handle file operations through Tauri bridge
- Use Tauri configuration for app settings and permissions

### Testing Guidelines
- Write unit tests for utility functions in `lib/`
- Test React components with mocked dependencies
- Test Firebase integration with mocked Firebase services
- Test Tauri backend functionality with mocked Tauri APIs

### Performance Considerations
- Use React.memo for expensive components
- Implement proper loading states with `isHydrated` context
- Optimize Firebase queries with proper indexing
- Use code splitting for large components if needed

### Security Best Practices
- Never commit Firebase configuration files
- Use environment variables for sensitive data
- Validate all user inputs
- Implement proper authentication and authorization
- Sanitize mathematical content before rendering

## Common Patterns

### Data Fetching
```typescript
// Custom hook for data fetching
const useFetchData = (param: string) => {
  const [data, setData] = useState<Type | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const result = await fetchData(param);
        setData(result);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [param]);

  return { data, loading, error };
};
```

### Form Handling
```typescript
// Controlled form components
const [formData, setFormData] = useState<InitialType>({
  // initial values
});

const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  setFormData({
    ...formData,
    [e.target.name]: e.target.value,
  });
};

const handleSubmit = (e: React.FormEvent) => {
  e.preventDefault();
  // Handle form submission
};
```

## Development Workflow

1. **Before making changes**: Run `npx tsc --noEmit` to ensure type safety
2. **During development**: Use `npm run dev` for hot reloading
3. **After changes**: Test functionality manually and run type checking
4. **Before committing**: Ensure all changes pass type checking and follow style guidelines

## Debugging Tips

- Use React DevTools for component inspection
- Check browser console for JavaScript errors
- Use VS Code debugger for TypeScript issues
- Monitor Firebase console for database operations
- Check Tauri logs for backend errors

## Common Issues

- **MathJax rendering**: Ensure `MathJaxContext` wraps all math content
- **Firebase initialization**: Check that Firebase config is properly imported
- **TypeScript errors**: Verify all imports use correct path aliases
- **Build failures**: Check that all dependencies are properly installed
- **Tauri issues**: Verify Rust backend compiles correctly