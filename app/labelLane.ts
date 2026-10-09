// ラベルの帯の描画（範囲は帯の色と文字、時刻の点は縦線と文字）
import { alpha, timeToX } from 'wevocal-lib'
import { isPoint, type Label } from '../src/labels'
import { frame, type LaneBox } from './lanes'

/** ラベルの帯。ラベルがなければ `empty` を出す */
export function drawLabels(b: LaneBox, labels: Label[], fill: string, divider: string, text: string, empty: string) {
  if (frame(b, divider, text, labels.length ? null : empty)) return
  const { g, width, view, top, h } = b
  for (const l of labels) {
    const x0 = timeToX(width, view, l.start)
    const x1 = timeToX(width, view, l.end)
    if (x1 < -200 || x0 > width) continue
    if (!isPoint(l)) {
      g.fillStyle = alpha(fill, 0.18)
      g.fillRect(x0, top + 3, Math.max(1, x1 - x0), h - 6)
    }
    g.fillStyle = alpha(fill, 0.9)
    g.fillRect(x0, top + 3, isPoint(l) ? 2 : 1, h - 6)
    g.save()
    g.beginPath()
    // 範囲は中に収め、点は右へ 200px まで出す
    g.rect(x0, top, isPoint(l) ? 200 : Math.max(0, x1 - x0), h)
    g.clip()
    g.fillStyle = text
    g.fillText(l.text, x0 + 4, top + h / 2)
    g.restore()
  }
}

/** 時刻 `t` のラベル（範囲の中か、点の近く `tol` 秒以内）。重なれば後ろのもの */
export function labelAt(labels: Label[], t: number, tol: number): number {
  for (let i = labels.length - 1; i >= 0; i--) {
    const l = labels[i]
    if (isPoint(l) ? Math.abs(t - l.start) <= tol : t >= l.start && t < l.end) return i
  }
  return -1
}
