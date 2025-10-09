import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    open: true,
    port: 3000
  },
  preview: {
    host: '0.0.0.0',
    port: 3000
  },
  define: {
    process: { env: {} }
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  build: {
    minify: false,
    outDir: 'build'
  },
  esbuild: {
    loader: 'jsx',
    include: ['src/**/*.jsx', 'src/**/*.js'],
    exclude: ['node_modules', 'build']
  },
  plugins: [react()]
})
