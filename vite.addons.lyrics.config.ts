import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// 追加機能「歌詞の文字化」（src/lyrics.ts）を <ADDONS_OUT>/analyzer-lyrics/ にビルドする。
// Analyzer（scripts/build-addons.mjs）と WeVocalSynth（同じ名前のスクリプト）の両方から使う
const root = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root,
  // アプリの public/ はコピーしない
  publicDir: false,
  // 読み込み元（アプリの base）によらず、index.js からの相対パスで Worker と wasm を探す
  base: './',
  build: {
    outDir: resolve(process.env.ADDONS_OUT ?? resolve(root, 'dist/addons'), 'analyzer-lyrics'),
    emptyOutDir: true,
    assetsInlineLimit: 0,
    rollupOptions: {
      input: resolve(root, 'src/lyrics.ts'),
      // 公開している関数（transcribeLyrics など）を消さない
      preserveEntrySignatures: 'strict',
      output: { entryFileNames: 'index.js' },
    },
  },
  worker: { format: 'es' },
})
