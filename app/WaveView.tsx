import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, Stack } from '@mui/material'
import { canvasPixelRatio, usePalette } from 'pevenmui'
import { computePeaks, drawPlayhead, drawRuler, drawSelection, drawWave, prepareCanvas, RULER_HEIGHT, SELECTION_DARK, SELECTION_LIGHT, type Clip, type Range, type WaveColors } from 'wevocal-lib'
import { Minimap, useEdgeScroll, useRangeEdges, useTouchGestures, type EdgeDrag, type useWaveformView } from 'wevocal-lib/react'
import type { Formants, Pitch, Spectrogram } from '../src/index'
import { useT } from './i18n'
import { drawFormants, drawPitch, drawSpec, pitchRange } from './lanes'

interface Props {
  clip: Clip
  /** 解析の結果（解析中は null） */
  spec: Spectrogram | null
  pitch: Pitch | null
  formants: Formants | null
  /** フォルマントをスペクトログラムに重ねるか、ピッチの帯を出すか */
  showFormants: boolean
  showPitch: boolean
  /** カーソルの下の時刻（外に出たら null）。右の欄に値を出すため */
  onHover: (t: number | null) => void
  view: ReturnType<typeof useWaveformView>
  position: number
  playing: boolean
  livePosition: () => number
  onSeek: (t: number) => void
  /** 選択範囲（1 つだけ。なければ null） */
  selection: Range | null
  onSelectionChange: (r: Range | null) => void
}

/** これより動かしたら、押した位置への移動ではなく範囲の選択とみなす（px） */
const DRAG_SLOP_PX = 4

/**
 * 上から波形（wevocal-lib の描画）、スペクトログラム（フォルマントを重ねる）、ピッチ、ミニマップ。
 * 目盛りのドラッグで再生位置、帯のドラッグで範囲の選択、範囲の端のドラッグで調整（WeVocalSynth と同じ）。押しただけなら再生位置を移して選択を外す
 */
export default function WaveView({ clip, spec, pitch, formants, showFormants, showPitch, onHover, view: v, position, playing, livePosition, onSeek, selection, onSelectionChange }: Props) {
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

  const range = useMemo(() => (pitch ? pitchRange(pitch) : null), [pitch])
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
    // 目盛りの下を、波形 3 : スペクトログラム 4 : ピッチ 3 に分ける（ピッチを出さなければ 1 : 1）
    const body = size.h - RULER_HEIGHT
    const waveH = Math.round(body * (showPitch ? 0.3 : 0.5))
    const specH = Math.round(body * (showPitch ? 0.4 : 0.5))
    const c = { g, width: size.w, view: v.view, colors, waveH }
    drawRuler(c)
    drawWave(c, peaks)
    const analyzing = t('analysis.analyzing')
    const specBox = { g, width: size.w, view: v.view, top: RULER_HEIGHT + waveH, h: specH }
    drawSpec(specBox, spec, colors.divider, colors.textSecondary, analyzing)
    if (showFormants && spec && formants && pitch) drawFormants(specBox, spec, formants, pitch)
    if (showPitch) drawPitch({ ...specBox, top: specBox.top + specH, h: body - waveH - specH }, pitch, range, pal.secondary.main, colors.divider, colors.textSecondary, analyzing)
  }, [peaks, spec, pitch, formants, range, showFormants, showPitch, size, v.view, colors, pal, font, t])

  // 選択範囲と再生位置の線。重ねた別の Canvas に描き、再生中は毎フレーム動かす（波形を描き直さない）
  useEffect(() => {
    const canvas = headRef.current
    if (!canvas || size.w <= 0) return
    const dpr = canvasPixelRatio()
    const draw = (pos: number) => {
      const g = prepareCanvas(canvas, size.w * dpr, size.h * dpr)
      if (!g) return
      g.scale(dpr, dpr)
      const c = { g, width: size.w, view: v.view, colors, waveH: 0 }
      if (selection) drawSelection(c, selection, size.h)
      drawPlayhead(c, pos, size.h)
    }
    draw(position)
    if (!playing) return
    let id = requestAnimationFrame(function tick() {
      draw(livePosition())
      id = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(id)
  }, [position, playing, livePosition, size, v.view, colors, selection])

  const timeAt = (clientX: number) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return Math.max(0, Math.min(duration, v.view.start + ((clientX - rect.left) / Math.max(1, rect.width)) * v.view.dur))
  }
  // 押したままドラッグすると再生位置を動かす。端に来たら表示範囲を流す（WeVocalSynth の目盛りのドラッグと同じ）
  const scrubbing = useRef(false)
  const edgeScroll = useEdgeScroll({ canvasRef, view: v.view, duration, setRange: v.setRange, seek: onSeek })
  const scrubTo = (x: number) => {
    onSeek(timeAt(x))
    edgeScroll.update(x)
  }
  // スマホ: 2 本指で拡大縮小、目盛りの長押しで横移動
  const touch = useTouchGestures({ canvasRef, view: v.view, setRange: v.setRange, seekAt: scrubTo })
  const onRuler = (clientY: number) => clientY - canvasRef.current!.getBoundingClientRect().top < RULER_HEIGHT
  // 範囲の選択（押した位置と時刻、動かしたか）と、端のドラッグ
  const selecting = useRef<{ x0: number; t0: number; moved: boolean } | null>(null)
  const edgeDrag = useRef<EdgeDrag | null>(null)
  const selections = selection ? [selection] : []
  const { edgeAt, dragEdge } = useRangeEdges(canvasRef, v.view, selections, timeAt, (rs) => onSelectionChange(rs[0] ?? null))
  const [nearEdge, setNearEdge] = useState(false)
  const endDrag = (e: React.PointerEvent) => {
    const s = selecting.current
    // 動かさずに離したら、その位置へ移って選択を外す
    if (s && !s.moved) {
      onSelectionChange(null)
      onSeek(s.t0)
    }
    selecting.current = null
    edgeDrag.current = null
    scrubbing.current = false
    edgeScroll.stop()
    touch.up(e)
  }

  return (
    <Stack sx={{ height: '100%' }}>
      <Box ref={boxRef} sx={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <canvas
          ref={canvasRef}
          onPointerDown={(e) => {
            if (e.button === 2) return
            e.currentTarget.setPointerCapture(e.pointerId)
            if (touch.down(e)) {
              scrubbing.current = false
              return
            }
            selecting.current = null
            edgeDrag.current = null
            if (onRuler(e.clientY)) {
              if (e.pointerType === 'touch') return touch.rulerDown(e)
              scrubbing.current = true
              return scrubTo(e.clientX)
            }
            // 範囲の端の近くなら、端をつかんで調整する（指は広めにつかめる）
            const edge = edgeAt(e.clientX, e.pointerType === 'touch' ? 16 : undefined)
            if (edge && selection) {
              edgeDrag.current = { ...edge, stretch: false, orig: selection, last: selection }
              return
            }
            selecting.current = { x0: e.clientX, t0: timeAt(e.clientX), moved: false }
          }}
          onPointerMove={(e) => {
            if (touch.move(e)) return
            if (scrubbing.current) scrubTo(e.clientX)
            else if (edgeDrag.current) dragEdge(edgeDrag.current, e.clientX)
            else if (selecting.current) {
              const s = selecting.current
              if (!s.moved && Math.abs(e.clientX - s.x0) < DRAG_SLOP_PX) return
              s.moved = true
              const t1 = timeAt(e.clientX)
              onSelectionChange({ start: Math.min(s.t0, t1), end: Math.max(s.t0, t1) })
            } else if (e.pointerType !== 'touch') setNearEdge(!!edgeAt(e.clientX))
            if (e.pointerType !== 'touch') onHover(timeAt(e.clientX))
          }}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onPointerLeave={() => onHover(null)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none', cursor: nearEdge ? 'col-resize' : 'default' }} />
        <canvas ref={headRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
      </Box>
      <Box sx={{ display: 'flex', px: 0.5, py: 0.5, borderTop: 1, borderColor: 'divider' }}>
        <Minimap clip={clip} colors={colors} duration={duration} view={v.view} selections={selections} scrollTo={v.scrollTo} label={t('wave.scroll')} position={position} livePosition={livePosition} playing={playing} showPlayhead />
      </Box>
    </Stack>
  )
}

