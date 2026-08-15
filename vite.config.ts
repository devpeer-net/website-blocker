import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Multi-page MV3 build. `public/` (manifest.json, icons) is copied verbatim, so the
// manifest stays a hand-written, greppable file rather than a generated artifact.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': resolve(import.meta.dirname, 'src') } },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // No source maps in the shipped zip; Web Store reviewers read `src/` on GitHub.
    sourcemap: false,
    rollupOptions: {
      // HTML entries live at the repo root so they emit as `dist/options.html` and
      // `dist/blocked.html` — the exact paths manifest.json names.
      input: {
        options: resolve(import.meta.dirname, 'options.html'),
        blocked: resolve(import.meta.dirname, 'blocked.html'),
        background: resolve(import.meta.dirname, 'src/background/index.ts'),
      },
      output: {
        // manifest.json references `background.js` at the package root, so the service
        // worker must land at a stable, un-hashed path.
        entryFileNames: (chunk) =>
          chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
})
