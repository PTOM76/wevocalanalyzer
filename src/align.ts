// 2 つの音声の時間のずれを、強さ（10ms ごとの RMS）の相互相関から求める
import type { Level } from './types'

/** b を a に合わせるために b を遅らせる量（秒。b の時刻 = a の時刻 − 返り値）。±maxSec の中で探す */
export function findOffset(a: Level, b: Level, maxSec = 10): number {
  const hop = a.hopSec
  // 無音を 0 にそろえ、平均を引く（音量の差に引っ張られないように）
  const prep = (l: Level) => {
    const x = Array.from(l.data, (db) => Math.max(0, db + 60))
    const m = x.reduce((s, v) => s + v, 0) / (x.length || 1)
    return x.map((v) => v - m)
  }
  const xa = prep(a)
  const xb = prep(b)
  const maxLag = Math.round(maxSec / hop)
  let best = 0
  let bestScore = -Infinity
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    // a[k] と b[k − lag] を比べる。重なりの長さで割って、端のずれに有利にならないようにする
    let sum = 0
    let n = 0
    const k0 = Math.max(0, lag)
    const k1 = Math.min(xa.length, xb.length + lag)
    for (let k = k0; k < k1; k++) {
      sum += xa[k] * xb[k - lag]
      n++
    }
    if (n < 50) continue
    const score = sum / n
    if (score > bestScore) {
      bestScore = score
      best = lag
    }
  }
  return best * hop
}
