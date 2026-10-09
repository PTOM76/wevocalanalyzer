import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from './package.json' with { type: 'json' }
import { APP_INFO } from './app/appInfo.ts'

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
// アプリの定義をビルドに渡すプラグイン（場所が決まるのは実行時なので、動的に読み込む。Node が .ts の型を取り除いて読む）
const { pevenAddonsRoute, pevenApp, pevenManifest }: typeof import('../pevenmui/src/vite.ts') = await import(pathToFileURL(resolve(pevenmui, 'src/vite.ts')).href)
const wevocalLib = submodule('wevocal-lib', 'web/src/index.ts', process.env.WEVOCAL_LIB_PATH)
const nodeModules = [resolve(root, 'node_modules'), resolve(root, '../node_modules')].filter((p) => existsSync(p))

export default defineConfig({
  root: resolve(root, 'app'),
  // 配信先のサブパスは BASE_PATH で指定する
  base: process.env.BASE_PATH ?? '/',
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
    // 版（__APP_VERSION__、__APP_COMMIT__、version.json）と、index.html の名前、言語、配信先の URL（SITE_URL で指定）。WeVocalSynth と同じ
    pevenApp(APP_INFO, { version: pkg.version, root }),
    VitePWA({
      // 新しい版は利用者が「更新」を押したときに切り替える
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'icon.svg', 'apple-touch-icon.png'],
      manifest: {
        ...pevenManifest(APP_INFO),
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
        // 更新で切り替わったときに、名前の違う古い版のキャッシュを消す
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,wasm}'],
        // 追加機能（歌詞の文字化など）は本体のプリキャッシュに入れず、導入した人だけ別の保存先に置く（app/addons.ts）
        globIgnores: ['addons/**'],
        // 追加機能のページ（addons/ 以下）を開いたときにアプリ本体の index.html を返さない
        navigateFallbackDenylist: [/\/addons\//],
        // 追加機能のファイルを保存先から返す（PevenMUI の pevenAddonsRoute）
        runtimeCaching: [pevenAddonsRoute(APP_INFO.id)],
      },
    }),
  ],
  build: { outDir: resolve(root, 'dist'), emptyOutDir: true, assetsInlineLimit: 0 },
  worker: { format: 'es' },
})
