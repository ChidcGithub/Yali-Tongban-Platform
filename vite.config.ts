import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const root = fileURLToPath(new URL('.', import.meta.url))

// 多页应用：根目录下每个 .html 都是一个入口
const htmlEntries = readdirSync(root).filter((f) => f.endsWith('.html'))

export default defineConfig({
  plugins: [vue()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // 现有原生 JS 以绝对路径 /js/... 引入，不需要 Vite 处理，保持原样
    assetsInlineLimit: 4096,
    rollupOptions: {
      input: Object.fromEntries(
        htmlEntries.map((f) => [f.replace(/\.html$/, ''), resolve(root, f)])
      ),
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  },
  server: {
    port: 5173
  }
})
