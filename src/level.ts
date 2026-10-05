import type { Clip } from 'wevocal-lib'
import type { Level } from './types'

/** 強さの間隔（秒）。F0、フォルマントと同じ */
const HOP_SEC = 0.01
/** 1 フレームの長さ（秒） */
const FRAME_SEC = 0.025
/** これより小さい値は、この値にそろえる（dB。無音の扱い） */
export const LEVEL_FLOOR_DB = -90

/** 強さ（全チャンネルの RMS、dBFS）。フレーム k の中心は k × HOP_SEC。軽いので Worker を使わない */
export function analyzeLevel(clip: Clip): Level {
  const sr = clip.sampleRate
  const len = clip.channels[0]?.length ?? 0
  const half = Math.round((FRAME_SEC * sr) / 2)
  const hop = HOP_SEC * sr
  const frames = Math.floor(len / hop) + 1
  const data = new Float32Array(frames)
  for (let k = 0; k < frames; k++) {
    const c = Math.round(k * hop)
    const a = Math.max(0, c - half)
    const b = Math.min(len, c + half)
    let sum = 0
    for (const ch of clip.channels) for (let i = a; i < b; i++) sum += ch[i] * ch[i]
    const n = (b - a) * clip.channels.length
    const rms = n ? Math.sqrt(sum / n) : 0
    data[k] = Math.max(LEVEL_FLOOR_DB, 20 * Math.log10(rms + 1e-12))
  }
  return { data, hopSec: HOP_SEC }
}
