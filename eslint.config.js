// eslint.config.js
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['dist/**', 'src-tauri/**']),
  {
    rules: {
      semi: 'error',
      'prefer-const': 'error',
    },
  },
]);
