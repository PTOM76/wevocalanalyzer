import { useEffect, useRef, useState } from 'react'
import { Box } from '@mui/material'
import { canvasPixelRatio, usePalette } from 'pevenmui'
import { alpha, prepareCanvas } from 'wevocal-lib'
import type { Spectrogram } from '../src/index'
import { FORMANT_COLORS } from './lanes'

/** スペクトログラムの 1 段の値（0〜255）が表す dB の幅。Rust 側 `spec::RANGE_DB` と一致させる */
const RANGE_DB = 90
const HEIGHT = 140

/**
 * 時刻 [start, end] のスペクトル（段ごとの値をエネルギーで平均して dB にする）。
 * end が start と同じならその時点の 1 フレーム。値は 0dB（フルスケール）〜 -RANGE_DB
 */
export function spectrumOf(spec: Spectrogram, start: number, end: number): Float32Array {
  const k0 = Math.max(0, Math.min(spec.frames - 1, Math.round(start / spec.hopSec)))
  const k1 = Math.max(k0, Math.min(spec.frames - 1, Math.round(end / spec.hopSec)))
  const out = new Float32Array(spec.rows)
  for (let r = 0; r < spec.rows; r++) {
    let sum = 0
    for (let k = k0; k <= k1; k++) sum += 10 ** (((spec.data[k * spec.rows + r] / 255) * RANGE_DB - RANGE_DB) / 10)
    out[r] = 10 * Math.log10(sum / (k1 - k0 + 1) + 1e-12)
  }
  return out
}

/** スペクトルのグラフ（横は対数の周波数、縦は dB）。`formants`（Hz）を色の縦線で示す */
/** `compare` は比較の音声のスペクトル（同じ段の並び。灰色の線で下に描く） */
export default function SpectrumPlot({ spec, values, formants, compare = null }: { spec: Spectrogram; values: Float32Array; formants: number[]; compare?: Float32Array | null }) {
  const { pal, font } = usePalette()
  const boxRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || width <= 0) return
    const dpr = canvasPixelRatio()
    const g = prepareCanvas(canvas, width * dpr, HEIGHT * dpr)
    if (!g) return
    g.scale(dpr, dpr)
    g.font = `10px ${font}`
    g.textBaseline = 'top'
    const span = Math.log(spec.maxHz / spec.minHz)
    const xOf = (hz: number) => (Math.log(hz / spec.minHz) / span) * width
    const yOf = (db: number) => (Math.min(0, Math.max(-RANGE_DB, db)) / -RANGE_DB) * (HEIGHT - 12)
    // 目盛り（100Hz、1kHz、10kHz と、-30dB ごと）
    g.fillStyle = alpha(pal.divider, 0.9)
    g.strokeStyle = pal.divider
    for (const db of [-30, -60]) g.fillRect(0, Math.round(yOf(db)), width, 1)
    g.fillStyle = pal.text.secondary
    for (const hz of [100, 1000, 10000]) {
      if (hz <= spec.minHz || hz >= spec.maxHz) continue
      const x = Math.round(xOf(hz))
      g.fillStyle = alpha(pal.divider, 0.9)
      g.fillRect(x, 0, 1, HEIGHT - 12)
      g.fillStyle = pal.text.secondary
      g.fillText(hz >= 1000 ? `${hz / 1000}k` : `${hz}`, x + 2, HEIGHT - 11)
    }
    formants.forEach((hz, i) => {
      if (!hz || hz <= spec.minHz || hz >= spec.maxHz) return
      g.fillStyle = FORMANT_COLORS[i]
      g.fillRect(Math.round(xOf(hz)), 0, 1, HEIGHT - 12)
    })
    const stroke = (v: Float32Array, color: string, lw: number) => {
      g.strokeStyle = color
      g.lineWidth = lw
      g.beginPath()
      for (let r = 0; r < v.length; r++) {
        const x = (r / (v.length - 1)) * width
        if (r === 0) g.moveTo(x, yOf(v[r]))
        else g.lineTo(x, yOf(v[r]))
      }
      g.stroke()
    }
    if (compare) stroke(compare, alpha(pal.text.secondary, 0.8), 1)
    stroke(values, pal.primary.main, 1.5)
  }, [spec, values, formants, compare, width, pal, font])

  return (
    <Box ref={boxRef} sx={{ width: '100%' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: HEIGHT, display: 'block' }} />
    </Box>
  )
}
