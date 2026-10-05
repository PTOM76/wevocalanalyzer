// 歌詞の文字化の Worker。Whisper を transformers.js（ONNX Runtime Web）で動かす。モデルは初めて使うときに取得し、ブラウザに保存する
import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers'
import ortMjs from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url'
import ortWasm from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url'
import type { LyricsRequest, LyricsMessage } from './lyricsTypes'

// ONNX Runtime の wasm は、アプリと一緒に配ったものを使う（指定しないと transformers.js は外部の CDN から読み込み、オフラインで使えない）
const onnx = env.backends.onnx as { wasm?: { wasmPaths?: unknown } }
if (onnx.wasm) onnx.wasm.wasmPaths = { mjs: ortMjs, wasm: ortWasm }

const post = (m: LyricsMessage) => (self as unknown as Worker).postMessage(m)

// 読み込んだモデル（同じモデルと計算の種類なら使い回す）
let loaded: { key: string; asr: AutomaticSpeechRecognitionPipeline } | null = null

async function load(req: LyricsRequest) {
  const key = `${req.model}|${req.device}`
  if (loaded?.key === key) return loaded.asr
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
    const segments = (result.chunks ?? []).map((c) => ({ start: c.timestamp[0], end: c.timestamp[1] ?? c.timestamp[0], text: c.text.trim() })).filter((s) => s.text)
    post({ kind: 'done', segments })
  } catch (err) {
    post({ kind: 'error', error: err instanceof Error ? err.message : String(err) })
  }
}
