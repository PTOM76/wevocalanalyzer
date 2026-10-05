import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from './package.json' with { type: 'json' }

// 単体のサイト（app/）のビルド設定。ライブラリ（src/）は React に依存しないまま、app/ から使う
const root = dirname(fileURLToPath(import.meta.url))

/**
 * submodule（`name/`）の場所。`env` を指定するか、WeVocalSynth の submodule として隣にあればそちらを使う
 * （両方を直しながら開発できるように）
 */
function submodule(name: string, entry: string, env: string | undefined) {
  const sibling = resolve(root, '..', name)
  return env ?? (existsSync(resolve(sibling, entry)) ? sibling : resolve(root, name))
}
// PevenMUI（UI 部品）と wevocal-lib（音声の読み込み、再生、波形。TypeScript 側は web/）
const pevenmui = submodule('pevenmui', 'src/index.ts', process.env.PEVENMUI_PATH)
const wevocalLib = submodule('wevocal-lib', 'web/src/index.ts', process.env.WEVOCAL_LIB_PATH)
const nodeModules = [resolve(root, 'node_modules'), resolve(root, '../node_modules')].filter((p) => existsSync(p))

/** ビルドしたコミットの短いハッシュ（取れなければ dev） */
function commitHash(): string {
  try {
    return execSync('git rev-parse --short=7 HEAD', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return 'dev'
  }
}

const commit = commitHash()

export default defineConfig({
  root: resolve(root, 'app'),
  // 配信先のサブパスは BASE_PATH で指定する
  base: process.env.BASE_PATH ?? '/',
  define: { __APP_VERSION__: JSON.stringify(pkg.version), __APP_COMMIT__: JSON.stringify(commit) },
  publicDir: resolve(root, 'public'),
  resolve: {
    alias: [
      { find: /^pevenmui$/, replacement: resolve(pevenmui, 'src/index.ts') },
      { find: /^pevenmui\/pwa$/, replacement: resolve(pevenmui, 'src/pwa/index.ts') },
      { find: /^pevenmui\/web$/, replacement: resolve(pevenmui, 'src/web/index.ts') },
      { find: /^wevocal-lib\/react$/, replacement: resolve(wevocalLib, 'web/src/react/index.ts') },
      { find: /^wevocal-lib$/, replacement: resolve(wevocalLib, 'web/src/index.ts') },
    ],
    // 外にある pevenmui から読み込む React・MUI も、このアプリと同じものにする（2つになると動かない）
    dedupe: ['react', 'react-dom', '@mui/material', '@emotion/react', '@emotion/styled', '@fortawesome/react-fontawesome'],
  },
  server: { fs: { allow: [root, pevenmui, wevocalLib, ...nodeModules] } },
  plugins: [
    react(),
    // 更新の確認で「どの版が来たか」を出すため、配信中の版を version.json に書く（WeVocalSynth と同じ。無いと確認に失敗する）
    {
      name: 'version-json',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: pkg.version, commit }) })
      },
    },
    VitePWA({
      // 新しい版は利用者が「更新」を押したときに切り替える
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'WeVocalAnalyzer',
        short_name: 'WeVocalAnalyzer',
        description: '声を解析する Web ツール',
        lang: 'ja',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#ffffff',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        inlineWorkboxRuntime: true,
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2,wasm}'],
        // 歌詞の文字化の ONNX Runtime（約 27MB）は全員には配らず、初めて使ったときに保存する（そのあとはオフラインでも使える）
        globIgnores: ['**/ort-wasm-*'],
        runtimeCaching: [{ urlPattern: /\/ort-wasm-[^/]+$/, handler: 'CacheFirst', options: { cacheName: 'wevocalanalyzer-runtime' } }],
      },
    }),
  ],
  build: { outDir: resolve(root, 'dist'), emptyOutDir: true, assetsInlineLimit: 0 },
  worker: { format: 'es' },
})
