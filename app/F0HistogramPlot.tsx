// F0 の分布のグラフ（半音ごとの棒。C の音に目盛り）
import { useEffect, useRef, useState } from 'react'
import { Box } from '@mui/material'
import { canvasPixelRatio, usePalette } from 'pevenmui'
import { alpha, prepareCanvas } from 'wevocal-lib'
import type { F0Histogram } from '../src/index'
import { midiName } from './lanes'

const HEIGHT = 100

/** `compare` は比較の音声の分布（灰色の枠で重ねる。高さは割合でそろえる） */
export default function F0HistogramPlot({ hist, compare = null }: { hist: F0Histogram; compare?: F0Histogram | null }) {
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
    // 少なくとも 1 オクターブ分の幅を取り、両端に半音 1 つずつ余白を置く
    const lo0 = Math.min(hist.low, compare?.low ?? Infinity)
    const hi0 = Math.max(hist.low + hist.counts.length, compare ? compare.low + compare.counts.length : -Infinity)
    const pad = Math.max(1, Math.ceil((12 - (hi0 - lo0)) / 2))
    const low = lo0 - pad
    const n = hi0 - lo0 + pad * 2
    const bw = width / n
    const plotH = HEIGHT - 12
    // 割合で描く（A と比較の音声で長さが違っても比べられるように）
    const max = Math.max(...hist.counts.map((c) => c / hist.total), ...(compare?.counts.map((c) => c / compare.total) ?? []))
    for (let i = 0; i < n; i++) {
      const m = low + i
      if (m % 12 === 0) {
        g.fillStyle = alpha(pal.divider, 0.9)
        g.fillRect(Math.round(i * bw), 0, 1, plotH)
        g.fillStyle = pal.text.secondary
        g.fillText(midiName(m), Math.round(i * bw) + 2, plotH + 1)
      }
      const c = hist.counts[m - hist.low] ?? 0
      if (!c) continue
      const h = (c / hist.total / max) * (plotH - 2)
      g.fillStyle = pal.primary.main
      g.fillRect(i * bw + 0.5, plotH - h, Math.max(1, bw - 1), h)
    }
    if (compare) {
      g.strokeStyle = alpha(pal.text.secondary, 0.9)
      for (const [j, c] of compare.counts.entries()) {
        if (!c) continue
        const i = compare.low + j - low
        const h = (c / compare.total / max) * (plotH - 2)
        g.strokeRect(i * bw + 1, plotH - h + 0.5, Math.max(1, bw - 2), h)
      }
    }
  }, [hist, compare, width, pal, font])

  return (
    <Box ref={boxRef} sx={{ width: '100%' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: HEIGHT, display: 'block' }} />
    </Box>
  )
}
