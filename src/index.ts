/**
 * WeVocalAnalyzer: 音声の解析（UI を持たず、React にも依存しない。画面は app/）。
 * WeVocalSynth からは追加機能として使う（今のところスペクトログラムだけ。docs/PLAN.md）
 */
import type { Clip } from 'wevocal-lib'
import type { AnalyzeOptions, AnalyzeRequest, FormantOptions, Formants, MoraRange, Pitch, PitchOptions, Spectrogram, SpectrogramOptions, WorkerMessage } from './types'
import { moraCode, splitMora } from './reading'
import type { LyricsSegment } from './lyricsTypes'

export type { AnalyzeOptions, FormantOptions, Formants, Level, MoraRange, Pitch, PitchOptions, Spectrogram, SpectrogramOptions } from './types'
export { moraCode, readingOf, splitMora, toHiragana } from './reading'
export { analyzeLevel, LEVEL_FLOOR_DB } from './level'
export { analyzeLoudness, type Loudness } from './loudness'
export { analyzeVibrato, type Vibrato } from './vibrato'
export { analyzeF0Histogram, type F0Histogram } from './f0Histogram'
export { analyzeVoiceQuality, type VoiceQuality } from './voiceQuality'
export { findOffset } from './align'
import type { Loudness } from './loudness'
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

/**
 * 要求 `id` を中止する。ほかの要求（比較の音声の解析など）がなければ Worker ごと止めて計算を打ち切り、
 * あれば Worker は止めずに、その要求の結果を捨てる
 */
function abortRequest(id: number, reason: unknown) {
  const p = pending.get(id)
  if (!p) return
  pending.delete(id)
  p.reject(reason instanceof Error ? reason : new DOMException('Aborted', 'AbortError'))
  if (pending.size) return
  worker?.terminate()
  worker = null
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
async function request(kind: AnalyzeRequest['kind'], clip: Clip, opts: AnalyzeOptions, params: Pick<AnalyzeRequest, 'window' | 'minHz' | 'maxHz' | 'ceiling' | 'codes'> = {}) {
  opts.signal?.throwIfAborted()
  const id = nextId++
  const samples = mixDown(clip.channels)
  return new Promise<Uint8Array | Float32Array>((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress: opts.onProgress })
    opts.signal?.addEventListener('abort', () => abortRequest(id, opts.signal?.reason), { once: true })
    const req: AnalyzeRequest = { id, kind, samples, sampleRate: clip.sampleRate, ...params }
    getWorker().postMessage(req, [samples.buffer])
  })
}

/** スペクトログラム（表示用。STFT 2048 / 256、対数周波数 128 段、1 バイト） */
export async function analyzeSpectrogram(clip: Clip, opts: SpectrogramOptions = {}): Promise<Spectrogram> {
  const data = (await request('spec', clip, opts, { window: opts.window })) as Uint8Array
  return { data, frames: data.length / SPEC_ROWS, rows: SPEC_ROWS, hopSec: SPEC_HOP / clip.sampleRate, minHz: SPEC_MIN_HZ, maxHz: clip.sampleRate / 2 }
}

/** F0（ピッチ。YIN、10ms 間隔。wevocal-lib の F0 推定と同じもの） */
export async function analyzePitch(clip: Clip, opts: PitchOptions = {}): Promise<Pitch> {
  return { data: (await request('f0', clip, opts, { minHz: opts.minHz, maxHz: opts.maxHz })) as Float32Array, hopSec: HOP_SEC }
}

/** フォルマント F1〜F3（LPC、10ms 間隔）。無声区間にも値が入るので、表示するときは F0 で隠す */
export async function analyzeFormants(clip: Clip, opts: FormantOptions = {}): Promise<Formants> {
  return { data: (await request('formant', clip, opts, { ceiling: opts.ceiling })) as Float32Array, count: FORMANT_COUNT, hopSec: HOP_SEC }
}

/**
 * 歌の 1 区間（`clip`。前後に少し余白があってよい）を、読みの一音（`morae`。splitMora で分けたもの）ずつに分ける。
 * 時刻は `clip` の先頭から（秒）。声がなければ空
 */
export async function segmentMorae(clip: Clip, morae: string[], opts: AnalyzeOptions = {}): Promise<MoraRange[]> {
  if (!morae.length) return []
  const out = (await request('mora', clip, opts, { codes: morae.map(moraCode) })) as Float32Array
  return Array.from({ length: out.length / 3 }, (_, i) => ({ start: out[i * 3], end: out[i * 3 + 1], mora: morae[i], sure: out[i * 3 + 2] > 0 }))
}

/** Whisper の区間の端はずれやすいので、前後をこれだけ広げて境目を探す（秒） */
const MORA_MARGIN_SEC = 0.3

/**
 * 文字化した区間ごとに、読み（reading）を一音ずつに分けて境目を求める。時刻は `clip` の先頭から（秒）。
 * `onProgress` は区間の数に対する割合
 */
export async function findMoraeInLyrics(clip: Clip, segments: LyricsSegment[], opts: AnalyzeOptions = {}): Promise<MoraRange[]> {
  const out: MoraRange[] = []
  const len = clip.channels[0]?.length ?? 0
  for (const [i, s] of segments.entries()) {
    opts.signal?.throwIfAborted()
    const morae = splitMora(s.reading ?? '')
    if (!morae.length) continue
    // 前の区間の終わりより前には広げない（同じ音を 2 回数えないため）
    const from = Math.max(0, s.start - MORA_MARGIN_SEC, out.length ? out[out.length - 1].end : 0)
    const a = Math.floor(from * clip.sampleRate)
    const b = Math.min(len, Math.ceil((s.end + MORA_MARGIN_SEC) * clip.sampleRate))
    if (b <= a) continue
    const part = { sampleRate: clip.sampleRate, channels: clip.channels.map((c) => c.subarray(a, b)) }
    for (const m of await segmentMorae(part, morae, { signal: opts.signal })) out.push({ ...m, start: m.start + from, end: m.end + from })
    opts.onProgress?.((i + 1) / segments.length)
  }
  return out
}

/** start〜end（秒）のラウドネスとトゥルーピーク。Worker で計算し、中止したら止める */
export function measureLoudness(clip: Clip, start: number, end: number, signal?: AbortSignal): Promise<Loudness> {
  const sr = clip.sampleRate
  const a = Math.max(0, Math.floor(start * sr))
  const b = Math.max(a, Math.ceil(end * sr))
  const channels = clip.channels.map((c) => c.slice(a, b))
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason)
    const w = new Worker(new URL('./loudnessWorker.ts', import.meta.url), { type: 'module' })
    const stop = () => {
      w.terminate()
      reject(signal?.reason)
    }
    signal?.addEventListener('abort', stop, { once: true })
    w.onmessage = (e: MessageEvent<Loudness>) => {
      signal?.removeEventListener('abort', stop)
      w.terminate()
      resolve(e.data)
    }
    w.onerror = (e) => {
      w.terminate()
      reject(new Error(e.message || 'loudness worker error'))
    }
    w.postMessage({ sampleRate: sr, channels }, channels.map((c) => c.buffer))
  })
}
