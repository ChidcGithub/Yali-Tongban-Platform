import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const root = fileURLToPath(new URL('.', import.meta.url))

// 多页应用：根目录下每个 .html 都是一个入口
const htmlEntries = readdirSync(root).filter((f) => f.endsWith('.html'))

export default defineConfig(({ mode }) => ({
  plugins: [vue()],
  /* `npm run build:dev` 用 `--mode development` 产出 dist-dev：那份产物保留
     Vue 的 prop 校验，`regress:dev` / `smoke:dev` 靠它把「传了组件没声明的 prop」
     这类只在开发期报出的错拦下来。
     ⚠️ 光给 `--mode development` 不够：Vite 在 build 阶段仍会把
     `process.env.NODE_ENV` 固定成 'production'，Vue 的校验代码会被整段剥掉 ——
     表现就是 dist-dev 与 dist 体积一模一样、`--dev` 白跑。必须显式 define。 */
  define: mode === 'development' ? { 'process.env.NODE_ENV': JSON.stringify('development') } : {},
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
        assetFileNames: 'assets/[name]-[hash][extname]',
        // 共享层命名规范化（默认会按首个公共模块命名，得到 emblem-*.js 这种名字）
        manualChunks(id) {
          if (id.includes('src/winui/') || id.includes('node_modules/vue')) return 'winui'
        }
      }
    }
  },
  server: {
    port: 5173
  }
}))
