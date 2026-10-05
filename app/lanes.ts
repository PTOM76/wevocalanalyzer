import { alpha, timeToX, type View } from 'wevocal-lib'
import { renderSpectrogram, type Formants, type Pitch, type Spectrogram } from '../src/index'

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

/** フォルマントの点をスペクトログラムに重ねる。声のない区間（F0 が 0）は描かない */
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
      if (!pitch.data[k] || !hz || hz <= spec.minHz) continue
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
