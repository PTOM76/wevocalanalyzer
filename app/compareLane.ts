// 比較の音声の描画（帯の右上の凡例、スペクトログラムの差）
import type { Spectrogram } from '../src/index'
import type { LaneBox } from './lanes'

/** 帯の右上に、比較の線の見本と名前を出す */
export function drawCompareLegend(b: LaneBox, label: string, line: string, text: string) {
  const { g, width, top } = b
  const align = g.textAlign
  g.textAlign = 'right'
  const y = top + 10
  const w = Math.min(g.measureText(label).width, width / 2)
  g.fillStyle = text
  g.fillText(label, width - 8, y, width / 2)
  g.fillStyle = line
  g.fillRect(width - 8 - w - 20, y - 1, 14, 2)
  g.textAlign = align
}

/** スペクトログラムの 1 段の値（0〜255）が表す dB の幅。Rust 側 `spec::RANGE_DB` と一致させる */
const RANGE_DB = 90
/** 差の色（A が強い所、比較が強い所）。色覚の違いでも見分けやすい橙と青 */
export const DIFF_PLUS: [number, number, number] = [230, 120, 20]
export const DIFF_MINUS: [number, number, number] = [30, 120, 230]
/** 差の色が一番濃くなる差（dB） */
const DIFF_FULL_DB = 20

/**
 * スペクトログラムの差（A − 比較、dB）。A が強い所を `plus`、比較が強い所を `minus` の色で塗る。
 * 2 つは段の並びが同じもの（標本化周波数と縦の拡大が同じ）。`offset` は比較の音声を遅らせる量（秒）
 */
export function drawSpecDiff(b: LaneBox, a: Spectrogram, c: Spectrogram, offset: number, plus: [number, number, number], minus: [number, number, number]) {
  const { g, width, view, top, h } = b
  const w = Math.max(1, Math.round(width))
  const hh = Math.max(1, Math.round(h - 1))
  const img = new ImageData(w, hh)
  const px = img.data
  const rows = a.rows
  const frameOf = (s: Spectrogram, t: number) => (t < 0 ? -1 : Math.floor(t / s.hopSec))
  for (let x = 0; x < w; x++) {
    const t = view.start + ((x + 0.5) / w) * view.dur
    const ka = frameOf(a, t)
    const kc = frameOf(c, t - offset)
    const okA = ka >= 0 && ka < a.frames
    const okC = kc >= 0 && kc < c.frames
    for (let y = 0; y < hh; y++) {
      const r = Math.round(((hh - 1 - y) / Math.max(1, hh - 1)) * (rows - 1))
      // 片方しかない所は、ない方を無音（一番小さい値）とみなす
      const va = okA ? a.data[ka * rows + r] : 0
      const vc = okC ? c.data[kc * rows + r] : 0
      const d = ((va - vc) / 255) * RANGE_DB
      const k = Math.min(1, Math.abs(d) / DIFF_FULL_DB)
      const col = d >= 0 ? plus : minus
      const o = (y * w + x) * 4
      px[o] = col[0]
      px[o + 1] = col[1]
      px[o + 2] = col[2]
      px[o + 3] = Math.round(k * 255)
    }
  }
  const layer = new OffscreenCanvas(w, hh)
  layer.getContext('2d')!.putImageData(img, 0, 0)
  g.drawImage(layer, 0, top + 1, width, h - 1)
}
