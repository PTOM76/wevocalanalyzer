import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, Stack } from '@mui/material'
import { canvasPixelRatio, usePalette } from 'pevenmui'
import { computePeaks, drawPlayhead, drawRuler, drawWave, prepareCanvas, RULER_HEIGHT, SELECTION_DARK, SELECTION_LIGHT, type Clip, type WaveColors } from 'wevocal-lib'
import { Minimap, type useWaveformView } from 'wevocal-lib/react'
import { renderSpectrogram, type Spectrogram } from '../src/index'
import { useT } from './i18n'

interface Props {
  clip: Clip
  /** スペクトログラム（解析中は null） */
  spec: Spectrogram | null
  view: ReturnType<typeof useWaveformView>
  position: number
  playing: boolean
  livePosition: () => number
  onSeek: (t: number) => void
}

/** 上に波形（wevocal-lib の描画）、下にスペクトログラム、その下にミニマップ。押すとその位置へ移る */
export default function WaveView({ clip, spec, view: v, position, playing, livePosition, onSeek }: Props) {
  const t = useT()
  const { pal, dark, font } = usePalette()
  const colors = useMemo<WaveColors>(
    () => ({ text: pal.text.primary, textSecondary: pal.text.secondary, divider: pal.divider, wave: pal.primary.main, selection: dark ? SELECTION_DARK : SELECTION_LIGHT }),
    [pal, dark],
  )
  const boxRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const headRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const duration = clip.channels[0].length / clip.sampleRate

  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.floor(e.contentRect.width), h: Math.floor(e.contentRect.height) }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ホイール（passive にしないため、React の onWheel ではなく直接付ける）
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      v.wheel(e, el.getBoundingClientRect())
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [v])

  const peaks = useMemo(() => (size.w > 0 ? computePeaks(clip, size.w, v.view) : null), [clip, size.w, v.view])

  // 波形と目盛り。表示範囲、大きさ、色が変わったときだけ描き直す
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !peaks || size.w <= 0) return
    const dpr = canvasPixelRatio()
    const g = prepareCanvas(canvas, size.w * dpr, size.h * dpr)
    if (!g) return
    g.scale(dpr, dpr)
    g.font = `11px ${font}`
    g.textBaseline = 'middle'
    // 目盛りの下を上下に分け、上を波形、下をスペクトログラムにする
    const waveH = Math.round((size.h - RULER_HEIGHT) / 2)
    const c = { g, width: size.w, view: v.view, colors, waveH }
    drawRuler(c)
    drawWave(c, peaks)
    drawSpec(g, spec, size.w, RULER_HEIGHT + waveH, size.h - RULER_HEIGHT - waveH, v.view, colors.divider, colors.textSecondary, t('analysis.analyzing'))
  }, [peaks, spec, size, v.view, colors, font, t])

  // 再生位置の線。重ねた別の Canvas に描き、再生中は毎フレーム動かす（波形を描き直さない）
  useEffect(() => {
    const canvas = headRef.current
    if (!canvas || size.w <= 0) return
    const dpr = canvasPixelRatio()
    const draw = (pos: number) => {
      const g = prepareCanvas(canvas, size.w * dpr, size.h * dpr)
      if (!g) return
      g.scale(dpr, dpr)
      drawPlayhead({ g, width: size.w, view: v.view, colors, waveH: 0 }, pos, size.h)
    }
    draw(position)
    if (!playing) return
    let id = requestAnimationFrame(function tick() {
      draw(livePosition())
      id = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(id)
  }, [position, playing, livePosition, size, v.view, colors])

  const seekAt = (clientX: number) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    onSeek(v.view.start + ((clientX - rect.left) / Math.max(1, rect.width)) * v.view.dur)
  }

  return (
    <Stack sx={{ height: '100%' }}>
      <Box ref={boxRef} sx={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <canvas ref={canvasRef} onPointerDown={(e) => seekAt(e.clientX)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none' }} />
        <canvas ref={headRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
      </Box>
      <Box sx={{ display: 'flex', px: 0.5, py: 0.5, borderTop: 1, borderColor: 'divider' }}>
        <Minimap clip={clip} colors={colors} duration={duration} view={v.view} selections={[]} scrollTo={v.scrollTo} label={t('wave.scroll')} position={position} livePosition={livePosition} playing={playing} showPlayhead />
      </Box>
    </Stack>
  )
}

/** スペクトログラムの帯（`top` から高さ `h`）。周波数の目盛りも描く */
function drawSpec(g: CanvasRenderingContext2D, spec: Spectrogram | null, width: number, top: number, h: number, view: { start: number; dur: number }, divider: string, text: string, analyzing: string) {
  g.fillStyle = divider
  g.fillRect(0, top, width, 1)
  if (!spec) {
    g.fillStyle = text
    g.fillText(analyzing, 8, top + h / 2)
    return
  }
  // 画像は画面のピクセルの大きさで作り、拡大して描く（putImageData は scale が効かないため、いったん別の Canvas に置く）
  const w = Math.max(1, width)
  const layer = new OffscreenCanvas(w, Math.max(1, h))
  layer.getContext('2d')!.putImageData(renderSpectrogram(spec, w, Math.max(1, h), view.start, view.dur), 0, 0)
  g.drawImage(layer, 0, top + 1, width, h - 1)
  g.fillStyle = 'rgba(255, 255, 255, 0.85)'
  const logSpan = Math.log(spec.maxHz / spec.minHz)
  for (const hz of [100, 1000, 10000]) {
    if (hz >= spec.maxHz) continue
    const y = top + h - (Math.log(hz / spec.minHz) / logSpan) * h
    g.fillRect(0, Math.round(y), 6, 1)
    g.fillText(hz >= 1000 ? `${hz / 1000}k` : `${hz}`, 8, y)
  }
}
