/**
 * 验证用的极小静态文件服务
 *
 * 为什么不用 `vite preview`：它的后台进程会随 shell 退出而死，
 * 于是「忘了起服务」会被错当成「页面零错误」——一次完整的假绿。
 * 回归/冒烟脚本自己起服务，只剩「构建产物不存在」这一种前置条件。
 *
 * 只做静态文件：目录里没有的文件返回 404（不做 history fallback），
 * 这样「某个资源没进产物」会显式暴露，而不是被 index.html 悄悄兜住。
 */
import { createServer } from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { join, extname, normalize } from 'node:path'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8'
}

/**
 * @param {string} rootDir 站点根目录（如 dist/）
 * @param {number} port 0 表示由系统分配（推荐，避免撞上别人占着的端口）
 * @returns {Promise<{ origin: string, port: number, close: () => Promise<void> }>}
 */
export function startStaticServer(rootDir, port = 0) {
  const server = createServer((req, res) => {
    const rawPath = decodeURIComponent((req.url || '/').split('?')[0])
    // 归一化后再拼，避免 ../../ 逃出根目录
    const rel = normalize(rawPath).replace(/^([/\\])+/, '')
    let file = join(rootDir, rel)
    if (rawPath.endsWith('/') || rel === '') file = join(rootDir, 'index.html')

    if (!existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('404 ' + rawPath)
      return
    }
    res.writeHead(200, {
      'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    })
    createReadStream(file).pipe(res)
  })

  return new Promise((resolvePromise) => {
    server.listen(port, '127.0.0.1', () => {
      const actual = server.address().port
      resolvePromise({
        origin: `http://127.0.0.1:${actual}`,
        port: actual,
        close: () =>
          new Promise((done) => {
            server.close(() => done())
            server.closeAllConnections?.()
          })
      })
    })
  })
}
