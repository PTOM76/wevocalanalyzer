import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, Stack } from '@mui/material'
import { canvasPixelRatio, usePalette } from 'pevenmui'
import { computePeaks, drawPlayhead, drawRuler, drawSelection, drawWave, prepareCanvas, RULER_HEIGHT, SELECTION_DARK, SELECTION_LIGHT, type Clip, type Range, type WaveColors } from 'wevocal-lib'
import { Minimap, useEdgeScroll, useRangeEdges, useTouchGestures, type EdgeDrag, type useWaveformView } from 'wevocal-lib/react'
import type { Formants, Level, Pitch, Spectrogram } from '../src/index'
import type { LyricsSegment } from '../src/lyricsTypes'
import type { Label } from '../src/labels'
import { drawLabels } from './labelLane'
import type { MoraRange } from '../src/types'
import { useT } from './i18n'
import { cropSpec, drawFormants, drawHarmonics, drawLevel, drawLyrics, drawPitch, drawSpec, pitchHzAt, pitchRange, specHzAt, type FreqRange } from './lanes'
import { dividerAt, dragDivider, laneAt, layoutLanes, type LaneFlags, type LaneRect, type LaneWeights } from './layout'

/** カーソルの下の時刻と、スペクトログラムか F0 の帯の上ならその高さの周波数（Hz） */
export interface Hover {
  t: number
  hz: number | null
}

interface Props {
  clip: Clip
  /** 解析の結果（解析中は null） */
  spec: Spectrogram | null
  pitch: Pitch | null
  formants: Formants | null
  level: Level | null
  /** 歌詞（文字化していなければ null） */
  lyrics: LyricsSegment[] | null
  labels: Label[]
  /** 一音ずつの範囲（歌詞の帯の下半分に描く） */
  morae: MoraRange[] | null
  /** 出す帯と高さの比。境目のドラッグで比を変える */
  lanes: LaneFlags
  weights: LaneWeights
  onWeightsChange: (w: LaneWeights) => void
  /** フォルマント、F0 の倍音（調波）の線をスペクトログラムに重ねるか */
  showFormants: boolean
  showHarmonics: boolean
  /** スペクトログラムで見る周波数の範囲（縦の拡大。null なら全体）。Alt+ホイールで `onFreqZoom` を呼ぶ */
  freqRange: FreqRange | null
  onFreqZoom: (centerHz: number, factor: number) => void
  /** カーソルの下（外に出たら null）。右の欄に値を出すため */
  onHover: (h: Hover | null) => void
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
 * 帯（波形、スペクトログラム、F0、強さ）とミニマップ。帯は出すものだけを比で並べ、境目のドラッグで高さを変える。
 * 目盛りのドラッグで再生位置、帯のドラッグで範囲の選択、範囲の端のドラッグで調整（WeVocalSynth と同じ）。押しただけなら再生位置を移して選択を外す
 */
export default function WaveView(p: Props) {
  const { clip, view: v, selection } = p
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

  const rects = useMemo(() => layoutLanes(p.lanes, p.weights, size.h), [p.lanes, p.weights, size.h])
  const rectOf = (lane: LaneRect['lane']) => rects.find((r) => r.lane === lane) ?? null
  const range = useMemo(() => (p.pitch ? pitchRange(p.pitch) : null), [p.pitch])
  const spec = useMemo(() => (p.spec ? cropSpec(p.spec, p.freqRange) : null), [p.spec, p.freqRange])
  const peaks = useMemo(() => (size.w > 0 ? computePeaks(clip, size.w, v.view) : null), [clip, size.w, v.view])
  const localY = (clientY: number) => clientY - canvasRef.current!.getBoundingClientRect().top

  // ホイール（passive にしないため、React の onWheel ではなく直接付ける）。スペクトログラムの上の Alt+ホイールは縦の拡大
  const wheelRef = useRef<(e: WheelEvent) => void>(() => {})
  wheelRef.current = (e) => {
    e.preventDefault()
    const el = canvasRef.current!
    const r = rectOf('spec')
    const y = localY(e.clientY)
    if (e.altKey && spec && r && y >= r.top && y < r.top + r.h) return p.onFreqZoom(specHzAt(spec, r.top, r.h, y), e.deltaY < 0 ? 1.5 : 1 / 1.5)
    v.wheel(e, el.getBoundingClientRect())
  }
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => wheelRef.current(e)
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // 帯と目盛り。表示範囲、大きさ、結果、色が変わったときだけ描き直す
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !peaks || size.w <= 0) return
    const dpr = canvasPixelRatio()
    const g = prepareCanvas(canvas, size.w * dpr, size.h * dpr)
    if (!g) return
    g.scale(dpr, dpr)
    g.font = `11px ${font}`
    g.textBaseline = 'middle'
    const analyzing = t('analysis.analyzing')
    drawRuler({ g, width: size.w, view: v.view, colors, waveH: 0 })
    for (const r of rects) {
      const box = { g, width: size.w, view: v.view, top: r.top, h: r.h }
      if (r.lane === 'wave') drawWave({ g, width: size.w, view: v.view, colors, waveH: r.h }, peaks)
      else if (r.lane === 'spec') {
        drawSpec(box, spec, colors.divider, colors.textSecondary, analyzing)
        if (p.showHarmonics && spec && p.pitch) drawHarmonics(box, spec, p.pitch)
        if (p.showFormants && spec && p.formants && p.pitch) drawFormants(box, spec, p.formants, p.pitch)
      } else if (r.lane === 'f0') drawPitch(box, p.pitch, range, pal.secondary.main, colors.divider, colors.textSecondary, analyzing)
      else if (r.lane === 'level') drawLevel(box, p.level, pal.primary.main, colors.divider, colors.textSecondary)
      else if (r.lane === 'labels') drawLabels(box, p.labels, pal.secondary.main, colors.divider, colors.text, t('labels.none'))
      else drawLyrics(box, p.lyrics, pal.primary.main, colors.divider, colors.text, t('lyrics.none'), p.morae, pal.warning.main)
    }
  }, [peaks, spec, p.pitch, p.formants, p.level, p.lyrics, p.labels, p.morae, range, p.showFormants, p.showHarmonics, rects, size, v.view, colors, pal, font, t])

  // 選択範囲と再生位置の線。重ねた別の Canvas に描き、再生中は毎フレーム動かす（帯を描き直さない）
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
    draw(p.position)
    if (!p.playing) return
    let id = requestAnimationFrame(function tick() {
      draw(p.livePosition())
      id = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(id)
  }, [p.position, p.playing, p.livePosition, size, v.view, colors, selection])

  const timeAt = (clientX: number) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return Math.max(0, Math.min(duration, v.view.start + ((clientX - rect.left) / Math.max(1, rect.width)) * v.view.dur))
  }
  /** カーソルの高さの周波数（スペクトログラムか F0 の帯の上だけ） */
  const hzAt = (y: number) => {
    const r = laneAt(rects, y)
    if (r?.lane === 'spec' && spec) return specHzAt(spec, r.top, r.h, y)
    if (r?.lane === 'f0' && range) return pitchHzAt(range, r.top, r.h, y)
    return null
  }
  // 押したままドラッグすると再生位置を動かす。端に来たら表示範囲を流す（WeVocalSynth の目盛りのドラッグと同じ）
  const scrubbing = useRef(false)
  const edgeScroll = useEdgeScroll({ canvasRef, view: v.view, duration, setRange: v.setRange, seek: p.onSeek })
  const scrubTo = (x: number) => {
    p.onSeek(timeAt(x))
    edgeScroll.update(x)
  }
  // スマホ: 2 本指で拡大縮小、目盛りの長押しで横移動
  const touch = useTouchGestures({ canvasRef, view: v.view, setRange: v.setRange, seekAt: scrubTo })
  // 範囲の選択（押した位置と時刻、動かしたか）、端のドラッグ、帯の境目のドラッグ（押した y と、そのときの帯）
  const selecting = useRef<{ x0: number; t0: number; moved: boolean } | null>(null)
  const edgeDrag = useRef<EdgeDrag | null>(null)
  const divider = useRef<{ i: number; y0: number; rects: LaneRect[]; weights: LaneWeights } | null>(null)
  const selections = selection ? [selection] : []
  const { edgeAt, dragEdge } = useRangeEdges(canvasRef, v.view, selections, timeAt, (rs) => p.onSelectionChange(rs[0] ?? null))
  const [cursor, setCursor] = useState('default')
  const endDrag = (e: React.PointerEvent) => {
    const s = selecting.current
    // 動かさずに離したら、その位置へ移って選択を外す
    if (s && !s.moved) {
      p.onSelectionChange(null)
      p.onSeek(s.t0)
    }
    selecting.current = null
    edgeDrag.current = null
    divider.current = null
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
            const y = localY(e.clientY)
            if (y < RULER_HEIGHT) {
              if (e.pointerType === 'touch') return touch.rulerDown(e)
              scrubbing.current = true
              return scrubTo(e.clientX)
            }
            const i = dividerAt(rects, y)
            if (i >= 0) {
              divider.current = { i, y0: e.clientY, rects, weights: p.weights }
              return
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
            const d = divider.current
            if (d) return p.onWeightsChange(dragDivider(d.rects, d.weights, d.i, e.clientY - d.y0))
            if (scrubbing.current) scrubTo(e.clientX)
            else if (edgeDrag.current) dragEdge(edgeDrag.current, e.clientX)
            else if (selecting.current) {
              const s = selecting.current
              if (!s.moved && Math.abs(e.clientX - s.x0) < DRAG_SLOP_PX) return
              s.moved = true
              const t1 = timeAt(e.clientX)
              p.onSelectionChange({ start: Math.min(s.t0, t1), end: Math.max(s.t0, t1) })
            } else if (e.pointerType !== 'touch') {
              const y = localY(e.clientY)
              setCursor(dividerAt(rects, y) >= 0 ? 'row-resize' : edgeAt(e.clientX) ? 'col-resize' : 'default')
            }
            if (e.pointerType !== 'touch') p.onHover({ t: timeAt(e.clientX), hz: hzAt(localY(e.clientY)) })
          }}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onPointerLeave={() => p.onHover(null)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none', cursor }}
        />
        <canvas ref={headRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
      </Box>
      <Box sx={{ display: 'flex', px: 0.5, py: 0.5, borderTop: 1, borderColor: 'divider' }}>
        <Minimap clip={clip} colors={colors} duration={duration} view={v.view} selections={selections} scrollTo={v.scrollTo} label={t('wave.scroll')} position={p.position} livePosition={p.livePosition} playing={p.playing} showPlayhead />
      </Box>
    </Stack>
  )
}
