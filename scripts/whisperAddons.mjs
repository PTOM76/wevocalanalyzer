// 歌詞の文字化のモデル（Whisper）の追加機能 whisper-<大きさ> のマニフェストを書く。Analyzer と WeVocalSynth の build-addons.mjs から使う。
// モデルは大きい（base で約 200MB）ので配信先には置かず、各ファイルの url に Hugging Face の場所を書く。導入すると追加機能の保存先に置かれ、
// Worker は transformers.js の localModelPath でそこから読む（src/lyricsWorker.ts）。版は Hugging Face のコミットに固定する
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** 配る大きさ（src/lyricsTypes.ts の LyricsModel と一致させる） */
export const WHISPER_MODELS = ['tiny', 'base', 'small']
/** WebGPU で使うもの（lyricsWorker.ts の dtype と一致させる。エンコーダーは fp32、デコーダーは 4bit） */
const ONNX = ['onnx/encoder_model.onnx', 'onnx/decoder_model_merged_q4.onnx']
/** モデルと一緒に要る小さなファイル（設定とトークナイザー） */
const SMALL = /^(added_tokens|config|generation_config|normalizer|preprocessor_config|special_tokens_map|tokenizer|tokenizer_config|vocab)\.json$|^merges\.txt$/

const api = async (path) => {
  const res = await fetch(`https://huggingface.co/api/${path}`, { headers: { 'user-agent': 'wevocal-build' } })
  if (!res.ok) throw new Error(`Hugging Face ${path}: HTTP ${res.status}`)
  return res.json()
}

/** `out`/whisper-<大きさ>/manifest.json を書く */
export async function writeWhisperManifests(out) {
  for (const size of WHISPER_MODELS) {
    const repo = `onnx-community/whisper-${size}`
    const { sha } = await api(`models/${repo}`)
    const tree = [...(await api(`models/${repo}/tree/${sha}`)), ...(await api(`models/${repo}/tree/${sha}/onnx`))]
    const files = []
    for (const f of tree.filter((f) => f.type === 'file' && (SMALL.test(f.path) || ONNX.includes(f.path)))) {
      const url = `https://huggingface.co/${repo}/resolve/${sha}/${f.path}`
      // 大きなファイル（LFS）は sha256 が一覧にある。小さなものは取って計算する
      let hash = f.lfs?.oid
      if (!hash) {
        const res = await fetch(url)
        if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
        hash = createHash('sha256').update(Buffer.from(await res.arrayBuffer())).digest('hex')
      }
      // transformers.js は localModelPath の下の <リポジトリ>/<ファイル> を読む
      files.push({ path: `${repo}/${f.path}`, size: f.lfs?.size ?? f.size, sha256: hash, url })
    }
    if (files.filter((f) => f.path.endsWith('.onnx')).length !== ONNX.length) throw new Error(`${repo}: モデルのファイルが見つからない`)
    files.sort((a, b) => a.path.localeCompare(b.path))
    const id = `whisper-${size}`
    const version = createHash('sha256').update(files.map((f) => f.sha256).join()).digest('hex').slice(0, 12)
    const dir = join(out, id)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ id, version, entry: null, files }, null, 2))
    const mb = files.reduce((s, f) => s + f.size, 0) / 2 ** 20
    console.log(`addon ${id} v${version}: ${files.length} files, ${mb.toFixed(1)} MB（Hugging Face から取得）`)
  }
}
