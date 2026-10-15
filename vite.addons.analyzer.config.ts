import { defineConfig } from 'vite'

// 追加機能「解析」（analyzer/ の WeVocalAnalyzer）を dist/addons/analyzer/ にビルドする（analyzer/scripts/addons.mjs から呼ぶ。アプリのフォルダーで実行する。WeVocalSynth と WeVocal Studio で共通）。
// 今はスペクトログラムだけを使う（docs/DECISIONS.md）。wasm は analyzer/ でビルドしてコミットした src/dsp.wasm を使う
export default defineConfig({
  // アプリの public/ はコピーしない
  publicDir: false,
  // 読み込み元（アプリの base）によらず、index.js からの相対パスで worker・wasm を探す
  base: './',
  build: {
    outDir: `${process.env.ADDONS_OUT ?? 'dist/addons'}/analyzer`,
    emptyOutDir: true,
    assetsInlineLimit: 0,
    rollupOptions: {
      input: 'analyzer/src/index.ts',
      // 公開している関数（analyzeSpectrogram、renderSpectrogram）を消さない
      preserveEntrySignatures: 'strict',
      output: { entryFileNames: 'index.js' },
    },
  },
  worker: { format: 'es' },
})
