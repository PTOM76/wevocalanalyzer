// ビブラートの解析（F0 の揺れの速さと深さ）。F0 の結果から計算するので軽く、Worker を使わない
import type { Pitch } from './types'

export interface Vibrato {
  /** 揺れの速さ（Hz。1 秒あたりの往復の回数） */
  rate: number
  /** 揺れの深さ（セント。中心から山までの平均。山から谷までの半分） */
  depth: number
}

/** 音の高さの流れ（ポルタメントなど）とみなす長さ（秒）。これより遅い変化は除く */
const TREND_SEC = 0.3
/** 解析する有声区間の最短の長さ（秒） */
const MIN_RUN_SEC = 0.4
/** ビブラートとみなす速さ（Hz）と深さ（セント）の範囲 */
const MIN_RATE = 3
const MAX_RATE = 10
const MIN_DEPTH = 10

/** 移動平均（端は窓を縮める） */
function movingAverage(x: number[], half: number): number[] {
  return x.map((_, i) => {
    const a = Math.max(0, i - half)
    const b = Math.min(x.length - 1, i + half)
    let s = 0
    for (let j = a; j <= b; j++) s += x[j]
    return s / (b - a + 1)
  })
}

/** start〜end（秒）のビブラート。有声区間ごとに山と谷を数え、全体でまとめる。揺れがなければ null */
export function analyzeVibrato(pitch: Pitch, start: number, end: number): Vibrato | null {
  const hop = pitch.hopSec
  const k0 = Math.max(0, Math.ceil(start / hop))
  const k1 = Math.min(pitch.data.length - 1, Math.floor(end / hop))
  let cycles = 0 // 半周期の数
  let span = 0 // 最初の山（谷）から最後の山（谷）までの時間（秒）
  let swing = 0 // 隣り合う山と谷の差の合計（セント）
  let swings = 0
  let k = k0
  while (k <= k1) {
    if (pitch.data[k] <= 0) {
      k++
      continue
    }
    // 有声区間を 1 つ取り出す
    const cents: number[] = []
    while (k <= k1 && pitch.data[k] > 0) cents.push(1200 * Math.log2(pitch.data[k++] / 440))
    if (cents.length * hop < MIN_RUN_SEC) continue
    // 流れを除き、細かい揺れ（推定のぶれ）をならす
    const trend = movingAverage(cents, Math.round(TREND_SEC / hop / 2))
    const r = movingAverage(cents.map((c, i) => c - trend[i]), 1)
    // 山と谷（向きが変わるところ）
    const ext: number[] = []
    for (let i = 1; i < r.length - 1; i++) {
      if ((r[i] > r[i - 1] && r[i] >= r[i + 1]) || (r[i] < r[i - 1] && r[i] <= r[i + 1])) ext.push(i)
    }
    if (ext.length < 3) continue
    cycles += ext.length - 1
    span += (ext[ext.length - 1] - ext[0]) * hop
    for (let i = 1; i < ext.length; i++) {
      swing += Math.abs(r[ext[i]] - r[ext[i - 1]])
      swings++
    }
  }
  if (!span || !swings) return null
  const rate = cycles / 2 / span
  const depth = swing / swings / 2
  if (rate < MIN_RATE || rate > MAX_RATE || depth < MIN_DEPTH) return null
  return { rate, depth }
}
