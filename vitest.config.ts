import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('development'),
  },
});
