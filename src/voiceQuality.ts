// 声の質の指標（ジッター、シマー、HNR）。F0 を手がかりに 1 周期ずつの山を拾って求める（Praat の Voice report にあたるもの）
import type { Pitch } from './types'

export interface VoiceQuality {
  /** ジッター（local、%）: 隣り合う周期の長さの差の平均 ÷ 周期の平均 */
  jitter: number
  /** シマー（local、%）: 隣り合う周期の山の高さの差の平均 ÷ 山の高さの平均 */
  shimmer: number
  /** HNR（dB）: 調波と雑音の比。周期の自己相関から求める */
  hnr: number
  /** 使った周期の数 */
  periods: number
}

/** 隣の周期とこれより違う長さ（比）は、拾い損ねとみなして差に入れない（Praat の period factor 1.3 にあたる） */
const MAX_PERIOD_RATIO = 1.3
/** HNR を測る間隔（秒） */
const HNR_STEP_SEC = 0.03

/** start〜end（秒）の声の質。有声の周期が足りなければ null */
export function analyzeVoiceQuality(channels: Float32Array[], sampleRate: number, pitch: Pitch, start: number, end: number): VoiceQuality | null {
  const len = channels[0]?.length ?? 0
  const mono = (i: number) => {
    let s = 0
    for (const c of channels) s += c[i]
    return s / channels.length
  }
  const f0At = (i: number) => {
    const k = Math.round(i / sampleRate / pitch.hopSec)
    return k >= 0 && k < pitch.data.length ? pitch.data[k] : 0
  }
  const a = Math.max(0, Math.floor(start * sampleRate))
  const b = Math.min(len, Math.ceil(end * sampleRate))
  // 周期の山（位置と高さ）。有声区間が途切れたら列を分ける
  const runs: { pos: number; amp: number }[][] = []
  let run: { pos: number; amp: number }[] = []
  let i = a
  while (i < b) {
    const f0 = f0At(i)
    if (f0 <= 0) {
      if (run.length) runs.push(run)
      run = []
      i += Math.round(pitch.hopSec * sampleRate)
      continue
    }
    const T = sampleRate / f0
    // 最初は 1 周期の中の最大、それからは前の山から T ± 20% の中の最大を次の山にする
    const from = run.length ? Math.round(run[run.length - 1].pos + T * 0.8) : i
    const to = Math.min(b, Math.round((run.length ? run[run.length - 1].pos : i) + T * (run.length ? 1.2 : 1)))
    if (to <= from) break
    let best = from
    let amp = -Infinity
    for (let j = from; j < to; j++) {
      const v = Math.abs(mono(j))
      if (v > amp) {
        amp = v
        best = j
      }
    }
    // 両隣との放物線で、標本の間の山の位置と高さを求める（整数の位置だと周期が 1 標本ずつ揺れて見える）
    const y0 = Math.abs(mono(Math.max(0, best - 1))), y2 = Math.abs(mono(Math.min(len - 1, best + 1)))
    const den = y0 - 2 * amp + y2
    const d = den < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (y0 - y2)) / den)) : 0
    run.push({ pos: best + d, amp: amp - 0.25 * (y0 - y2) * d })
    i = best + 1
  }
  if (run.length) runs.push(run)

  let dT = 0, sumT = 0, nT = 0, nDT = 0
  let dA = 0, sumA = 0, nDA = 0
  for (const r of runs) {
    for (let k = 1; k < r.length; k++) {
      const t = r[k].pos - r[k - 1].pos
      sumT += t
      sumA += r[k].amp
      nT++
      if (k < 2) continue
      const tp = r[k - 1].pos - r[k - 2].pos
      if (Math.max(t, tp) / Math.min(t, tp) > MAX_PERIOD_RATIO) continue
      dT += Math.abs(t - tp)
      nDT++
      dA += Math.abs(r[k].amp - r[k - 1].amp)
      nDA++
    }
  }
  if (nDT < 3) return null

  // HNR: 3 周期分の窓で、周期の前後の遅れの正規化した自己相関の最大 r から 10log10(r / (1 - r))
  let hnrSum = 0, hnrN = 0
  const step = Math.round(HNR_STEP_SEC * sampleRate)
  for (let c = a; c < b; c += step) {
    const f0 = f0At(c)
    if (f0 <= 0) continue
    const T = Math.round(sampleRate / f0)
    const w = T * 3
    if (c + w + T * 1.1 >= len) break
    // 遅れごとの相関（最大の前後と放物線で、標本の間の最大を求める）
    const lag0 = Math.round(T * 0.9)
    const rs: number[] = []
    for (let lag = lag0; lag <= Math.round(T * 1.1); lag++) {
      let xy = 0, xx = 0, yy = 0
      for (let j = c; j < c + w; j++) {
        const x = mono(j), y = mono(j + lag)
        xy += x * y
        xx += x * x
        yy += y * y
      }
      rs.push(xx > 0 && yy > 0 ? xy / Math.sqrt(xx * yy) : 0)
    }
    const m = rs.indexOf(Math.max(...rs))
    let best = rs[m]
    if (m > 0 && m < rs.length - 1) {
      const den = rs[m - 1] - 2 * rs[m] + rs[m + 1]
      if (den < 0) best = rs[m] - (rs[m - 1] - rs[m + 1]) ** 2 / (8 * den)
    }
    if (best <= 0) continue
    best = Math.min(best, 0.99999)
    hnrSum += 10 * Math.log10(best / (1 - best))
    hnrN++
  }

  return {
    jitter: (dT / nDT / (sumT / nT)) * 100,
    shimmer: (dA / nDA / (sumA / nT)) * 100,
    hnr: hnrN ? hnrSum / hnrN : 0,
    periods: nT,
  }
}
