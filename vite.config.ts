import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    minify: 'esbuild',
    sourcemap: false,
    target: 'es2022'
  }
});
