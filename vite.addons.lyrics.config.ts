import { cpSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { kuromojiShims } from './vite.kuromoji.ts'

// 追加機能「歌詞の文字化」（src/lyrics.ts）を <ADDONS_OUT>/analyzer-lyrics/ にビルドする。
// Analyzer（scripts/build-addons.mjs）と WeVocalSynth（同じ名前のスクリプト）の両方から使う
const root = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(process.env.ADDONS_OUT ?? resolve(root, 'dist/addons'), 'analyzer-lyrics')
const kuromoji = resolve(root, 'node_modules/kuromoji')

export default defineConfig({
  root,
  // アプリの public/ はコピーしない
  publicDir: false,
  // 読み込み元（アプリの base）によらず、index.js からの相対パスで Worker と wasm を探す
  base: './',
  build: {
    outDir,
    emptyOutDir: true,
    assetsInlineLimit: 0,
    rollupOptions: {
      input: resolve(root, 'src/lyrics.ts'),
      // 公開している関数（transcribeLyrics など）を消さない
      preserveEntrySignatures: 'strict',
      output: { entryFileNames: 'index.js' },
    },
  },
  // 読みを付けるのは Worker の中なので、Worker のビルドにも差し替えを入れる
  worker: { format: 'es', plugins: () => [kuromojiShims()] },
  plugins: [
    {
      // 読みの辞書（kuromoji の IPADIC）と、そのライセンス（kuromoji の NOTICE.md に IPADIC の許諾がある）を入れる
      name: 'copy-kuromoji-dict',
      closeBundle() {
        // .gz の名前だと配信先が Content-Encoding を付けることがあるので、.bin にする（lyricsWorker.ts で読む）
        mkdirSync(resolve(outDir, 'dict'), { recursive: true })
        for (const f of readdirSync(resolve(kuromoji, 'dict'))) cpSync(resolve(kuromoji, 'dict', f), resolve(outDir, 'dict', f.replace(/\.gz$/, '.bin')))
        mkdirSync(resolve(outDir, 'licenses'), { recursive: true })
        cpSync(resolve(kuromoji, 'LICENSE-2.0.txt'), resolve(outDir, 'licenses/kuromoji-LICENSE-2.0.txt'))
        cpSync(resolve(kuromoji, 'NOTICE.md'), resolve(outDir, 'licenses/kuromoji-NOTICE.md'))
      },
    },
  ],
})
