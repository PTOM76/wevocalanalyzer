import { cpSync, mkdirSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { kuromojiShims } from './vite.kuromoji.ts'

// 追加機能「歌詞の文字化」（src/lyrics.ts）を <ADDONS_OUT>/analyzer-lyrics/ にビルドする。
// Analyzer（scripts/build-addons.mjs）と WeVocalSynth（同じ名前のスクリプト）の両方から使う
const root = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(process.env.ADDONS_OUT ?? resolve(root, 'dist/addons'), 'analyzer-lyrics')
// 依存は Node の決まりで探す（Analyzer では analyzer/node_modules、WeVocalSynth の CI では Synth の node_modules にある）
const require = createRequire(resolve(root, 'package.json'))
const kuromoji = dirname(require.resolve('kuromoji/package.json'))
// Worker が直接読む ONNX Runtime の wasm は、transformers.js が使う版のものにする（版が違うと動かない。Synth にはボーカル抽出用の別の版もある）
const ort = createRequire(require.resolve('@huggingface/transformers'))
const ortDist = dirname(ort.resolve('onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm')).replaceAll('\\', '/')

export default defineConfig({
  root,
  // アプリの public/ はコピーしない
  publicDir: false,
  // 読み込み元（アプリの base）によらず、index.js からの相対パスで Worker と wasm を探す
  base: './',
  resolve: { alias: [{ find: /^onnxruntime-web\/(ort-wasm-simd-threaded\.asyncify\.(?:mjs|wasm))/, replacement: `${ortDist}/$1` }] },
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
