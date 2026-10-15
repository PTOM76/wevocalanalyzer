// 追加機能「解析」と「歌詞の文字化」（とそのモデルのマニフェスト）を作る。アプリの scripts/build-addons.mjs から呼ぶ（WeVocalSynth と WeVocal Studio で共通）。
// アプリのフォルダーで実行する（analyzer/ と extractor/ はアプリの中にある。マニフェストの書き方は extractor の手順と同じもの）
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import { writeManifest } from '../../extractor/scripts/addons.mjs'
import { writeWhisperManifests } from './whisperAddons.mjs'

const run = (cmd) => execSync(cmd, { stdio: 'inherit' })

/** 解析（analyzer）を `OUT` に作る。wasm はコミットした src/dsp.wasm を使う */
export function buildAnalyzerAddon(OUT) {
  process.env.ADDONS_OUT = OUT
  run('npx vite build -c analyzer/vite.addons.analyzer.config.ts')
  writeManifest('analyzer', join(OUT, 'analyzer'), 'index.js')
}

/** 歌詞の文字化（analyzer-lyrics）と、そのモデル（whisper。マニフェストだけで、ファイルは導入するときに Hugging Face から取る）を `OUT` に作る */
export async function buildLyricsAddons(OUT) {
  process.env.ADDONS_OUT = OUT
  run('npx vite build -c analyzer/vite.addons.lyrics.config.ts')
  writeManifest('analyzer-lyrics', join(OUT, 'analyzer-lyrics'), 'index.js')
  await writeWhisperManifests(OUT)
}
