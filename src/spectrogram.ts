import type { Spectrogram } from './types'

/** スペクトログラムの配色（magma 風）。明るさ 0〜255 → RGB */
const SPEC_LUT = (() => {
  const stops: [number, number, number, number][] = [
    [0, 0, 0, 4],
    [0.25, 59, 15, 112],
    [0.5, 140, 41, 129],
    [0.75, 222, 73, 104],
    [0.9, 254, 159, 109],
    [1, 252, 253, 191],
  ]
  const lut = new Uint8Array(256 * 3)
  for (let i = 0; i < 256; i++) {
    const u = i / 255
    const j = Math.max(1, stops.findIndex((st) => st[0] >= u))
    const [u0, ...c0] = stops[j - 1]
    const [u1, ...c1] = stops[j]
    const g = (u - u0) / (u1 - u0 || 1)
    for (let k = 0; k < 3; k++) lut[i * 3 + k] = Math.round(c0[k] + (c1[k] - c0[k]) * g)
  }
  return lut
})()

/**
 * 表示範囲のスペクトログラムを width × height の画像にする（1列に複数フレームが入る場合は最大値）。
 * 列ごとに、入るフレームの最大値を周波数の段ごとに先にまとめてから縦に引き伸ばす
 * （以前は画面の1点ごとにフレームをたどっていて、全体表示では拡大・縮小のたびに画面が止まった）
 */
let lastImg: ImageData | null = null

export function renderSpectrogram(spec: Spectrogram, width: number, height: number, viewStart: number, viewDur: number) {
  // 同じ大きさなら前の画像の置き場を使い回す（すぐ putImageData で写すので、上書きしてよい）
  if (!lastImg || lastImg.width !== width || lastImg.height !== height) lastImg = new ImageData(width, height)
  const img = lastImg
  const px = img.data
  const rows = spec.rows
  const col = new Uint8Array(rows)
  // 画面の y ごとの段（どの列でも同じ）
  const rowAt = new Int32Array(height)
  for (let y = 0; y < height; y++) rowAt[y] = Math.round(((height - 1 - y) / Math.max(1, height - 1)) * (rows - 1))
  for (let x = 0; x < width; x++) {
    const ka = Math.max(0, Math.floor((viewStart + (x / width) * viewDur) / spec.hopSec))
    // 音声の頭より前（比較の音声をずらしたとき）は描かない
    const end = Math.floor((viewStart + ((x + 1) / width) * viewDur) / spec.hopSec)
    const kb = end < 0 ? -1 : Math.min(spec.frames - 1, Math.max(ka, end))
    col.fill(0)
    // フレームの中の段は並んでいるので、順に読む
    for (let k = ka; k <= kb; k++) {
      const base = k * rows
      for (let r = 0; r < rows; r++) {
        const v = spec.data[base + r]
        if (v > col[r]) col[r] = v
      }
    }
    for (let y = 0; y < height; y++) {
      const v = col[rowAt[y]] * 3
      const o = (y * width + x) * 4
      px[o] = SPEC_LUT[v]
      px[o + 1] = SPEC_LUT[v + 1]
      px[o + 2] = SPEC_LUT[v + 2]
      px[o + 3] = 255
    }
  }
  return img
}
