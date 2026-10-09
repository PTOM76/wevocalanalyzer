// F0 の分布（半音ごとの有声フレームの数）
import type { Pitch } from './types'

export interface F0Histogram {
  /** counts[0] の音の MIDI 番号 */
  low: number
  /** 半音ごとのフレームの数（low から高い方へ） */
  counts: number[]
  /** 有声フレームの総数 */
  total: number
}

/** start〜end（秒。省くと全体）の F0 の分布。有声フレームがなければ null */
export function analyzeF0Histogram(pitch: Pitch, start = 0, end = Infinity): F0Histogram | null {
  const k0 = Math.max(0, Math.ceil(start / pitch.hopSec))
  const k1 = Math.min(pitch.data.length - 1, Math.floor(end / pitch.hopSec))
  const notes: number[] = []
  for (let k = k0; k <= k1; k++) if (pitch.data[k] > 0) notes.push(Math.round(69 + 12 * Math.log2(pitch.data[k] / 440)))
  if (!notes.length) return null
  let low = Infinity, high = -Infinity
  for (const n of notes) {
    if (n < low) low = n
    if (n > high) high = n
  }
  const counts = new Array<number>(high - low + 1).fill(0)
  for (const n of notes) counts[n - low]++
  return { low, counts, total: notes.length }
}
