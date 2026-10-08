import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

// kuromoji をブラウザ向けにビルドするための差し替え（vite.addons.lyrics.config.ts で使う）。
// kuromoji は Node の path と zlibjs を読み込むが、Vite では path がなく、zlibjs は ES モジュールでは動かない
const root = dirname(fileURLToPath(import.meta.url))

export function kuromojiShims(): Plugin {
  return {
    name: 'kuromoji-shims',
    enforce: 'pre',
    resolveId(id, importer) {
      if (!importer?.replaceAll('\\', '/').includes('/node_modules/kuromoji/')) return null
      if (id === 'path') return resolve(root, 'src/kuromojiPath.ts')
      // 展開は src/kuromojiDict.ts で行うので使わない
      if (id.startsWith('zlibjs/')) return resolve(root, 'src/zlibStub.ts')
      return null
    },
  }
}
