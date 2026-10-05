import { alpha, timeToX, type View } from 'wevocal-lib'
import { LEVEL_FLOOR_DB, renderSpectrogram, type Formants, type Level, type Pitch, type Spectrogram } from '../src/index'

/** 帯の描画に共通のもの（上端 `top` から高さ `h`） */
export interface LaneBox {
  g: CanvasRenderingContext2D
  width: number
  view: View
  top: number
  h: number
}

/** フォルマントの色（F1、F2、F3）。スペクトログラムの暗い色の上で見えるもの */
export const FORMANT_COLORS = ['#ff5252', '#ffd740', '#69f0ae']

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const hzToMidi = (hz: number) => 69 + 12 * Math.log2(hz / 440)

/** 帯の上の区切り線と、解析中の文字 */
function frame(b: LaneBox, divider: string, text: string, waiting: string | null) {
  b.g.fillStyle = divider
  b.g.fillRect(0, b.top, b.width, 1)
  if (waiting === null) return false
  b.g.fillStyle = text
  b.g.fillText(waiting, 8, b.top + b.h / 2)
  return true
}

/** スペクトログラムの帯と周波数の目盛り。`analyzing` は結果がないときに出す文字 */
export function drawSpec(b: LaneBox, spec: Spectrogram | null, divider: string, text: string, analyzing: string) {
  if (frame(b, divider, text, spec ? null : analyzing) || !spec) return
  const { g, width, view, top, h } = b
  // 画像は画面のピクセルの大きさで作り、拡大して描く（putImageData は scale が効かないため、いったん別の Canvas に置く）
  const w = Math.max(1, width)
  const layer = new OffscreenCanvas(w, Math.max(1, h))
  layer.getContext('2d')!.putImageData(renderSpectrogram(spec, w, Math.max(1, h), view.start, view.dur), 0, 0)
  g.drawImage(layer, 0, top + 1, width, h - 1)
  g.fillStyle = 'rgba(255, 255, 255, 0.85)'
  for (const hz of [100, 1000, 10000]) {
    if (hz >= spec.maxHz) continue
    const y = specY(spec, top, h, hz)
    g.fillRect(0, Math.round(y), 6, 1)
    g.fillText(hz >= 1000 ? `${hz / 1000}k` : `${hz}`, 8, y)
  }
}

/** スペクトログラムの帯の中で、周波数 `hz` の高さ（対数の周波数軸） */
const specY = (spec: Spectrogram, top: number, h: number, hz: number) => top + h - (Math.log(hz / spec.minHz) / Math.log(spec.maxHz / spec.minHz)) * h

/** フォルマントの点をスペクトログラムに重ねる。無声区間（F0 が 0）は描かない */
export function drawFormants(b: LaneBox, spec: Spectrogram, formants: Formants, pitch: Pitch) {
  const { g, width, view, top, h } = b
  const k0 = Math.max(0, Math.floor(view.start / formants.hopSec))
  const k1 = Math.min(pitch.data.length - 1, Math.ceil((view.start + view.dur) / formants.hopSec))
  // 引いた表示では 1 ピクセルに何フレームも入るので、間引いて描く
  const step = Math.max(1, Math.floor((k1 - k0) / width))
  const size = 3
  for (let i = 0; i < formants.count; i++) {
    g.fillStyle = FORMANT_COLORS[i]
    for (let k = k0; k <= k1; k += step) {
      const hz = formants.data[k * formants.count + i]
      if (!pitch.data[k] || !hz || hz <= spec.minHz || hz >= spec.maxHz) continue
      g.fillRect(timeToX(width, view, k * formants.hopSec) - 1, specY(spec, top, h, hz) - 1, size, size)
    }
  }
}

/** ピッチの帯の縦軸（MIDI ノート番号）。有声部分の範囲に余白を足し、最低 1 オクターブにする */
export function pitchRange(pitch: Pitch): [number, number] {
  let lo = Infinity
  let hi = -Infinity
  for (const hz of pitch.data) {
    if (hz <= 0) continue
    const m = hzToMidi(hz)
    if (m < lo) lo = m
    if (m > hi) hi = m
  }
  if (!Number.isFinite(lo)) return [48, 72]
  lo = Math.floor(lo) - 2
  hi = Math.ceil(hi) + 2
  if (hi - lo < 12) {
    const c = (lo + hi) / 2
    lo = Math.floor(c - 6)
    hi = lo + 12
  }
  return [lo, hi]
}

/** ピッチの帯: C の音名の線と、F0 の線（無声で途切れる） */
export function drawPitch(b: LaneBox, pitch: Pitch | null, range: [number, number] | null, line: string, divider: string, text: string, analyzing: string) {
  if (frame(b, divider, text, pitch && range ? null : analyzing) || !pitch || !range) return
  const { g, width, view, top, h } = b
  const [lo, hi] = range
  const y = (m: number) => top + h - ((m - lo) / (hi - lo)) * h
  g.fillStyle = text
  for (let m = Math.ceil(lo); m <= hi; m++) {
    if (m % 12 !== 0) continue
    g.fillStyle = alpha(divider, 0.8)
    g.fillRect(0, Math.round(y(m)), width, 1)
    g.fillStyle = text
    g.fillText(`${NOTE_NAMES[m % 12]}${m / 12 - 1}`, 4, y(m) - 6)
  }
  g.strokeStyle = line
  g.lineWidth = 2
  g.lineJoin = 'round'
  g.beginPath()
  let drawing = false
  const k0 = Math.max(0, Math.floor(view.start / pitch.hopSec))
  const k1 = Math.min(pitch.data.length - 1, Math.ceil((view.start + view.dur) / pitch.hopSec))
  for (let k = k0; k <= k1; k++) {
    const hz = pitch.data[k]
    if (hz <= 0) {
      drawing = false
      continue
    }
    const px = timeToX(width, view, k * pitch.hopSec)
    const py = y(hzToMidi(hz))
    if (drawing) g.lineTo(px, py)
    else g.moveTo(px, py)
    drawing = true
  }
  g.stroke()
  g.lineWidth = 1
}

/** 時刻 `t` のピッチ（Hz、無声は 0）とフォルマント（Hz の配列） */
export function valuesAt(t: number, pitch: Pitch | null, formants: Formants | null) {
  const k = pitch ? Math.round(t / pitch.hopSec) : -1
  const f0 = pitch && k >= 0 && k < pitch.data.length ? pitch.data[k] : 0
  const f = formants && f0 > 0 ? Array.from(formants.data.subarray(k * formants.count, (k + 1) * formants.count)) : []
  return { f0, formants: f, note: f0 > 0 ? noteName(f0) : '' }
}

/** 周波数の音名とずれ（例: A4 +12c） */
function noteName(hz: number) {
  const m = hzToMidi(hz)
  const n = Math.round(m)
  const cents = Math.round((m - n) * 100)
  return `${NOTE_NAMES[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 1} ${cents >= 0 ? '+' : ''}${cents}c`
}

/** 選択範囲の値: 有声区間の平均 F0（半音で平均）と音名、有声率、F1〜F3 の平均（Hz） */
export function rangeStats(start: number, end: number, pitch: Pitch | null, formants: Formants | null) {
  if (!pitch) return null
  const k0 = Math.max(0, Math.ceil(start / pitch.hopSec))
  const k1 = Math.min(pitch.data.length - 1, Math.floor(end / pitch.hopSec))
  let frames = 0
  let voiced = 0
  let midi = 0
  const sums = new Float64Array(formants?.count ?? 0)
  const counts = new Uint32Array(formants?.count ?? 0)
  for (let k = k0; k <= k1; k++) {
    frames++
    const hz = pitch.data[k]
    if (hz <= 0) continue
    voiced++
    midi += hzToMidi(hz)
    if (!formants) continue
    for (let i = 0; i < formants.count; i++) {
      const f = formants.data[k * formants.count + i]
      if (f > 0) {
        sums[i] += f
        counts[i]++
      }
    }
  }
  const f0 = voiced ? 440 * 2 ** ((midi / voiced - 69) / 12) : 0
  return {
    f0,
    note: f0 > 0 ? noteName(f0) : '',
    voicedRatio: frames ? voiced / frames : 0,
    formants: Array.from(sums, (s, i) => (counts[i] ? s / counts[i] : 0)),
  }
}

/** 周波数の範囲（Hz）。スペクトログラムの縦の拡大で見る範囲 */
export type FreqRange = [number, number]

/**
 * スペクトログラムを周波数の範囲 [lo, hi] に絞ったもの（縦の拡大）。段を切り出すだけなので、細かさは変わらない。
 * 範囲が全体なら、そのまま返す
 */
export function cropSpec(spec: Spectrogram, range: FreqRange | null): Spectrogram {
  if (!range) return spec
  const span = Math.log(spec.maxHz / spec.minHz)
  const rowOf = (hz: number) => (Math.log(hz / spec.minHz) / span) * (spec.rows - 1)
  const r0 = Math.max(0, Math.floor(rowOf(range[0])))
  const r1 = Math.min(spec.rows - 1, Math.ceil(rowOf(range[1])))
  if (r0 === 0 && r1 === spec.rows - 1) return spec
  const rows = Math.max(2, r1 - r0 + 1)
  const data = new Uint8Array(spec.frames * rows)
  for (let k = 0; k < spec.frames; k++) data.set(spec.data.subarray(k * spec.rows + r0, k * spec.rows + r0 + rows), k * rows)
  const hzOf = (r: number) => spec.minHz * Math.exp((r / (spec.rows - 1)) * span)
  return { ...spec, data, rows, minHz: hzOf(r0), maxHz: hzOf(r0 + rows - 1) }
}

/** 縦の拡大の 1 回の倍率（対数の周波数軸で、見える幅をこの分の 1 にする） */
export const FREQ_ZOOM_STEP = 1.5
/** 縦の拡大で、見える範囲の最低の幅（オクターブ） */
const MIN_FREQ_OCTAVES = 1

/** 周波数 `center` を中心に、見える範囲を `factor` 倍に拡大する（1 未満なら縮小）。全体の範囲を超えたら全体（null）に戻す */
export function zoomFreq(full: FreqRange, cur: FreqRange | null, center: number, factor: number): FreqRange | null {
  const [lo, hi] = cur ?? full
  const span = Math.max(MIN_FREQ_OCTAVES, Math.log2(hi / lo) / factor)
  const fullSpan = Math.log2(full[1] / full[0])
  if (span >= fullSpan) return null
  // 中心の位置（範囲の中の割合）を保つ
  const ratio = Math.log2(center / lo) / Math.log2(hi / lo)
  let a = Math.log2(center) - span * ratio
  a = Math.max(Math.log2(full[0]), Math.min(Math.log2(full[1]) - span, a))
  return [2 ** a, 2 ** (a + span)]
}

/** スペクトログラムの帯の中の y の周波数（Hz） */
export const specHzAt = (spec: Spectrogram, top: number, h: number, y: number) => spec.minHz * Math.exp(((top + h - y) / h) * Math.log(spec.maxHz / spec.minHz))

/** F0 の帯の中の y の周波数（Hz） */
export const pitchHzAt = (range: [number, number], top: number, h: number, y: number) => 440 * 2 ** ((range[0] + ((top + h - y) / h) * (range[1] - range[0]) - 69) / 12)

/** 強さの帯の縦軸の下限（dB）。上限は 0dBFS */
const LEVEL_MIN_DB = -60

/** 強さの帯: -20dB ごとの線と、強さの線 */
export function drawLevel(b: LaneBox, level: Level | null, line: string, divider: string, text: string) {
  if (frame(b, divider, text, null) || !level) return
  const { g, width, view, top, h } = b
  const y = (db: number) => top + h - ((Math.max(LEVEL_MIN_DB, db) - LEVEL_MIN_DB) / -LEVEL_MIN_DB) * h
  for (const db of [-20, -40]) {
    g.fillStyle = alpha(divider, 0.8)
    g.fillRect(0, Math.round(y(db)), width, 1)
    g.fillStyle = text
    g.fillText(`${db} dB`, 4, y(db) - 6)
  }
  g.strokeStyle = line
  g.lineWidth = 1.5
  g.beginPath()
  const k0 = Math.max(0, Math.floor(view.start / level.hopSec))
  const k1 = Math.min(level.data.length - 1, Math.ceil((view.start + view.dur) / level.hopSec))
  for (let k = k0; k <= k1; k++) {
    const px = timeToX(width, view, k * level.hopSec)
    const py = y(level.data[k] <= LEVEL_FLOOR_DB ? LEVEL_MIN_DB : level.data[k])
    if (k === k0) g.moveTo(px, py)
    else g.lineTo(px, py)
  }
  g.stroke()
  g.lineWidth = 1
}

/** 時刻 `t` の強さ（dB）。範囲の外なら null */
export const levelAt = (t: number, level: Level | null) => {
  const k = level ? Math.round(t / level.hopSec) : -1
  return level && k >= 0 && k < level.data.length ? level.data[k] : null
}

/** 周波数の音名とずれ（例: A4 +12c）。カーソル位置の周波数にも使う */
export const noteOf = (hz: number) => noteName(hz)

/** 範囲の強さの平均（エネルギーで平均して dB にする）。結果がなければ null */
export function meanLevel(start: number, end: number, level: Level | null) {
  if (!level) return null
  const k0 = Math.max(0, Math.ceil(start / level.hopSec))
  const k1 = Math.min(level.data.length - 1, Math.floor(end / level.hopSec))
  let sum = 0
  let n = 0
  for (let k = k0; k <= k1; k++, n++) sum += 10 ** (level.data[k] / 10)
  return n ? Math.max(LEVEL_FLOOR_DB, 10 * Math.log10(sum / n)) : null
}

/** 調波の線を引く数（F0 の何倍まで） */
const HARMONICS = 10

/** F0 の倍音（調波）の線をスペクトログラムに重ねる（2 倍〜）。スペクトログラムの縞と F0 の推定がそろっているかを見るため。無声区間は途切れる */
export function drawHarmonics(b: LaneBox, spec: Spectrogram, pitch: Pitch) {
  const { g, width, view } = b
  const k0 = Math.max(0, Math.floor(view.start / pitch.hopSec))
  const k1 = Math.min(pitch.data.length - 1, Math.ceil((view.start + view.dur) / pitch.hopSec))
  g.strokeStyle = 'rgba(255, 255, 255, 0.55)'
  g.lineWidth = 1
  for (let n = 2; n <= HARMONICS; n++) {
    g.beginPath()
    let drawing = false
    for (let k = k0; k <= k1; k++) {
      const hz = pitch.data[k] * n
      if (pitch.data[k] <= 0 || hz <= spec.minHz || hz >= spec.maxHz) {
        drawing = false
        continue
      }
      const px = timeToX(width, view, k * pitch.hopSec)
      const py = specY(spec, b.top, b.h, hz)
      if (drawing) g.lineTo(px, py)
      else g.moveTo(px, py)
      drawing = true
    }
    g.stroke()
  }
}
