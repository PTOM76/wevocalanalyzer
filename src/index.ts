/**
 * WeVocalAnalyzer: 音声の解析（UI を持たず、React にも依存しない。画面は app/）。
 * WeVocalSynth からは追加機能として使う（今のところスペクトログラムだけ。docs/PLAN.md）
 */
import type { Clip } from 'wevocal-lib'
import type { AnalyzeOptions, AnalyzeRequest, Formants, Pitch, Spectrogram, WorkerMessage } from './types'

export type { AnalyzeOptions, Formants, Level, Pitch, Spectrogram } from './types'
export { analyzeLevel, LEVEL_FLOOR_DB } from './level'
export { renderSpectrogram } from './spectrogram'

/** ライブラリの版（追加機能のマニフェストと合わせる） */
export const ANALYZER_VERSION = '1.0.0'

/** Rust 側 `spec::ROWS`、`spec::HOP`、`spec::MIN_HZ` と一致させる */
const SPEC_ROWS = 128
const SPEC_HOP = 256
const SPEC_MIN_HZ = 50
/** Rust 側 `f0::HOP_SEC`（wevocal-lib）、`formant::COUNT` と一致させる */
const HOP_SEC = 0.01
const FORMANT_COUNT = 3

// 計算の Worker（ページで1つ。中止したら作り直す）
let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, { resolve: (d: Uint8Array | Float32Array) => void; reject: (e: Error) => void; onProgress?: (p: number) => void }>()

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

/** Worker で `kind` の解析をする（チャンネルは平均してから） */
async function request(kind: AnalyzeRequest['kind'], clip: Clip, opts: AnalyzeOptions) {
  opts.signal?.throwIfAborted()
  const id = nextId++
  const samples = mixDown(clip.channels)
  return new Promise<Uint8Array | Float32Array>((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress: opts.onProgress })
    opts.signal?.addEventListener('abort', () => abortAll(opts.signal?.reason), { once: true })
    const req: AnalyzeRequest = { id, kind, samples, sampleRate: clip.sampleRate }
    getWorker().postMessage(req, [samples.buffer])
  })
}

/** スペクトログラム（表示用。STFT 2048 / 256、対数周波数 128 段、1 バイト） */
export async function analyzeSpectrogram(clip: Clip, opts: AnalyzeOptions = {}): Promise<Spectrogram> {
  const data = (await request('spec', clip, opts)) as Uint8Array
  return { data, frames: data.length / SPEC_ROWS, rows: SPEC_ROWS, hopSec: SPEC_HOP / clip.sampleRate, minHz: SPEC_MIN_HZ, maxHz: clip.sampleRate / 2 }
}

/** F0（ピッチ。YIN、10ms 間隔。wevocal-lib の F0 推定と同じもの） */
export async function analyzePitch(clip: Clip, opts: AnalyzeOptions = {}): Promise<Pitch> {
  return { data: (await request('f0', clip, opts)) as Float32Array, hopSec: HOP_SEC }
}

/** フォルマント F1〜F3（LPC、10ms 間隔）。無声区間にも値が入るので、表示するときは F0 で隠す */
export async function analyzeFormants(clip: Clip, opts: AnalyzeOptions = {}): Promise<Formants> {
  return { data: (await request('formant', clip, opts)) as Float32Array, count: FORMANT_COUNT, hopSec: HOP_SEC }
}
