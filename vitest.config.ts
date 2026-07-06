import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
    // Ignora worktrees aninhados (ex.: .claude/worktrees de sessões paralelas),
    // node_modules e build — senão o vitest roda cópias duplicadas dos testes.
    exclude: ['**/node_modules/**', '**/.next/**', '**/.claude/**', '**/dist/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
