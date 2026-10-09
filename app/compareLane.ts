// 比較の音声の描画（帯の右上の凡例）
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
