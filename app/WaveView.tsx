import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, Stack } from '@mui/material'
import { canvasPixelRatio, usePalette } from 'pevenmui'
import { computePeaks, drawPlayhead, drawRuler, drawWave, prepareCanvas, RULER_HEIGHT, SELECTION_DARK, SELECTION_LIGHT, type Clip, type WaveColors } from 'wevocal-lib'
import { Minimap, type useWaveformView } from 'wevocal-lib/react'
import { useT } from './i18n'

interface Props {
  clip: Clip
  view: ReturnType<typeof useWaveformView>
  position: number
  playing: boolean
  livePosition: () => number
  onSeek: (t: number) => void
}

/** 波形（wevocal-lib の描画）と、下のミニマップ。押すとその位置へ移る。解析の帯は、これに重ねて足していく */
export default function WaveView({ clip, view: v, position, playing, livePosition, onSeek }: Props) {
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
    const c = { g, width: size.w, view: v.view, colors, waveH: size.h - RULER_HEIGHT }
    drawRuler(c)
    drawWave(c, peaks)
  }, [peaks, size, v.view, colors, font])

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
