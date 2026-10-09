// 歌詞の文字化の Worker。Whisper を transformers.js（ONNX Runtime Web）で動かす。モデルは追加機能 whisper-<大きさ> の保存先から読む
import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers'
import ortMjs from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url'
import ortWasm from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url'
import { loadTokenizer } from './kuromojiDict'
import type { LyricsRequest, LyricsMessage, LyricsSegment } from './lyricsTypes'
import { collapseRepeats, readingOf } from './reading'

// ONNX Runtime の wasm は、追加機能に一緒に入れたものを使う（指定しないと transformers.js は外部の CDN から読み込み、オフラインで使えない）
const onnx = env.backends.onnx as { wasm?: { wasmPaths?: unknown; numThreads?: number } }
if (onnx.wasm) onnx.wasm.wasmPaths = { mjs: ortMjs, wasm: ortWasm }

const post = (m: LyricsMessage) => (self as unknown as Worker).postMessage(m)

// 読み込んだモデル（同じモデルと計算の種類なら使い回す）
let loaded: { key: string; asr: AutomaticSpeechRecognitionPipeline } | null = null

async function load(req: LyricsRequest) {
  const key = `${req.model}|${req.device}`
  if (loaded?.key === key) return loaded.asr
  // スレッドの数（ONNX Runtime の最初の準備のときだけ効く。変えても、Worker を作り直すまでは前の数のまま）
  if (onnx.wasm) onnx.wasm.numThreads = req.threads
  // モデルは追加機能の保存先から（Service Worker が返す）。無いファイル（CPU 用の量子化したものなど）だけ Hugging Face から取る。
  // そのときは transformers.js 自身の保存先には置かない（追加機能と二重になり、設定から削除できないため）。
  // Service Worker が動いていなければ保存先を読めないので、Hugging Face から取って transformers.js の保存先に置く（毎回取り直さないように）
  env.allowLocalModels = req.fromAddon
  env.localModelPath = req.modelBase
  env.useBrowserCache = !req.fromAddon
  // WebGPU はエンコーダーを fp32、デコーダーを 4bit に量子化したもの（transformers.js の例と同じ）。CPU は 8bit
  const dtype = req.device === 'webgpu' ? { encoder_model: 'fp32', decoder_model_merged: 'q4' } : 'q8'
  const asr = (await pipeline('automatic-speech-recognition', `onnx-community/whisper-${req.model}`, {
    device: req.device,
    dtype: dtype as never,
    progress_callback: (p) => {
      if (p.status === 'progress_total') post({ kind: 'download', progress: p.progress / 100 })
    },
  })) as AutomaticSpeechRecognitionPipeline
  loaded = { key, asr }
  return asr
}

// 読みを付ける形態素解析（辞書は約 19MB。日本語の区間があるときだけ読み、使い回す）
let tokenizer: ReturnType<typeof loadTokenizer> | null = null

const JAPANESE = /[ぁ-ヿ一-鿿]/

/** 日本語の区間に読みを付ける */
async function addReadings(segments: LyricsSegment[], dicPath: string): Promise<LyricsSegment[]> {
  if (!segments.some((s) => JAPANESE.test(s.text))) return segments
  tokenizer ??= loadTokenizer(dicPath)
  const tk = await tokenizer.catch((e) => {
    tokenizer = null
    throw e
  })
  return segments.map((s) => (JAPANESE.test(s.text) ? { ...s, reading: readingOf(tk.tokenize(s.text)) } : s))
}

self.onmessage = async (e: MessageEvent<LyricsRequest>) => {
  const req = e.data
  try {
    const asr = await load(req)
    post({ kind: 'transcribe' })
    // 30 秒ごとに区切って認識し、区間ごとの時刻を付ける
    const out = await asr(req.samples, {
      language: req.language ?? undefined,
      task: 'transcribe',
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: true,
    })
    // 区間は [始まり, 終わり]（最後の区間は終わりが null のことがある）と文字
    const result = (Array.isArray(out) ? out[0] : out) as { chunks?: { timestamp: [number, number | null]; text: string }[] }
    const segments = (result.chunks ?? []).map((c) => ({ start: c.timestamp[0], end: c.timestamp[1] ?? c.timestamp[0], text: collapseRepeats(c.text.trim()) })).filter((s) => s.text)
    // 読みを付けられなくても（辞書を取れないなど）、文字化の結果は返す
    post({ kind: 'done', segments: await addReadings(segments, req.dicPath).catch(() => segments) })
  } catch (err) {
    post({ kind: 'error', error: err instanceof Error ? err.message : String(err) })
  }
}
