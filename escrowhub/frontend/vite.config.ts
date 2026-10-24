import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      buffer: 'buffer/',
    },
  },
  define: {
    global: 'globalThis',
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
    },
  },
  build: {
    // No source maps in production artifacts
    sourcemap: false,
    // Vendor-level splitting: framework and Solana SDK get their own cached chunks
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          solana: ['@solana/web3.js', 'buffer'],
        },
      },
    },
  },
  server: {
    port: 5000,
    strictPort: false,
  },
})
