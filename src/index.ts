/**
 * WeVocalAnalyzer: 声の解析（UI を持たず、React にも依存しない。画面は app/）。
 * WeVocalSynth からは追加機能として使う（今のところスペクトログラムだけ。docs/PLAN.md）
 */
import type { Clip } from 'wevocal-lib'
import type { AnalyzeOptions, SpecRequest, Spectrogram, WorkerMessage } from './types'

export type { AnalyzeOptions, Spectrogram } from './types'
export { renderSpectrogram } from './spectrogram'

/** ライブラリの版（追加機能のマニフェストと合わせる） */
export const ANALYZER_VERSION = '1.0.0'

/** Rust 側 `spec::ROWS`、`spec::HOP`、`spec::MIN_HZ` と一致させる */
const SPEC_ROWS = 128
const SPEC_HOP = 256
const SPEC_MIN_HZ = 50

// 計算の Worker（ページで1つ。中止したら作り直す）
let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, { resolve: (d: Uint8Array) => void; reject: (e: Error) => void; onProgress?: (p: number) => void }>()

function getWorker() {
  if (worker) return worker
  const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  w.onmessage = (e: MessageEvent<WorkerMessage>) => {
    const m = e.data
    const p = pending.get(m.id)
    if (!p) return
    if ('progress' in m) return p.onProgress?.(m.progress)
    pending.delete(m.id)
    if ('data' in m) p.resolve(m.data)
    else p.reject(new Error(m.error))
  }
  w.onerror = (e) => {
    for (const p of pending.values()) p.reject(new Error(e.message || 'analyzer worker error'))
    pending.clear()
    worker = null
  }
  return (worker = w)
}

/** Worker を止める（計算中のものは中止のエラーで終わる） */
function abortAll(reason: unknown) {
  worker?.terminate()
  worker = null
  for (const p of pending.values()) p.reject(reason instanceof Error ? reason : new DOMException('Aborted', 'AbortError'))
  pending.clear()
}

/** 全チャンネルの平均（モノラル） */
function mixDown(channels: Float32Array[]): Float32Array {
  const len = channels[0]?.length ?? 0
  if (channels.length === 1) return channels[0].slice()
  const out = new Float32Array(len)
  for (const c of channels) for (let i = 0; i < len; i++) out[i] += c[i] / channels.length
  return out
}

/** スペクトログラム（表示用。STFT 2048 / 256、対数周波数 128 段、1 バイト）。チャンネルは平均してから計算する */
export async function analyzeSpectrogram(clip: Clip, opts: AnalyzeOptions = {}): Promise<Spectrogram> {
  opts.signal?.throwIfAborted()
  const id = nextId++
  const samples = mixDown(clip.channels)
  const data = await new Promise<Uint8Array>((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress: opts.onProgress })
    opts.signal?.addEventListener('abort', () => abortAll(opts.signal?.reason), { once: true })
    const req: SpecRequest = { id, samples, sampleRate: clip.sampleRate }
    getWorker().postMessage(req, [samples.buffer])
  })
  return { data, frames: data.length / SPEC_ROWS, rows: SPEC_ROWS, hopSec: SPEC_HOP / clip.sampleRate, minHz: SPEC_MIN_HZ, maxHz: clip.sampleRate / 2 }
}
