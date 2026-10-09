// ラウドネス（ITU-R BS.1770-4 の統合ラウドネス、LUFS）とトゥルーピーク（4 倍オーバーサンプリング、dBTP）

export interface Loudness {
  /** 統合ラウドネス（LUFS）。短すぎるか無音なら null */
  lufs: number | null
  /** トゥルーピーク（dBTP）。無音なら null */
  truePeak: number | null
}

/** 2 次の IIR（直接形 I） */
function biquad(x: Float32Array, b: number[], a: number[]): Float32Array {
  const y = new Float32Array(x.length)
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0
  for (let i = 0; i < x.length; i++) {
    const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v
    y[i] = v
  }
  return y
}

/** K 特性の係数（BS.1770 の 48kHz の値を、ほかの標本化周波数に合わせて作る。pyloudnorm と同じ式） */
function kWeighting(sr: number) {
  // 高域を持ち上げる棚
  let f0 = 1681.974450955533, g = 3.999843853973347, q = 0.7071752369554196
  let k = Math.tan((Math.PI * f0) / sr)
  const vh = Math.pow(10, g / 20), vb = Math.pow(vh, 0.4996667741545416)
  let a0 = 1 + k / q + k * k
  const shelfB = [(vh + (vb * k) / q + k * k) / a0, (2 * (k * k - vh)) / a0, (vh - (vb * k) / q + k * k) / a0]
  const shelfA = [1, (2 * (k * k - 1)) / a0, (1 - k / q + k * k) / a0]
  // 低域を落とすハイパス
  f0 = 38.13547087602444; q = 0.5003270373238773
  k = Math.tan((Math.PI * f0) / sr)
  a0 = 1 + k / q + k * k
  const hpB = [1, -2, 1]
  const hpA = [1, (2 * (k * k - 1)) / a0, (1 - k / q + k * k) / a0]
  return { shelfB, shelfA, hpB, hpA }
}

/** 統合ラウドネス（400ms のブロック、75% の重なり、-70 LUFS の絶対ゲートと -10 LU の相対ゲート） */
function integrated(chs: Float32Array[], sr: number): number | null {
  const kw = kWeighting(sr)
  const weighted = chs.map((ch) => biquad(biquad(ch, kw.shelfB, kw.shelfA), kw.hpB, kw.hpA))
  const step = Math.round(0.1 * sr)
  const len = chs[0].length
  if (len < 4 * step) return null
  // 100ms ごとの二乗和を先に求め、ブロック（4 つ分）はそれを足す（チャンネルの重みは左右とも 1）
  const segs = Math.floor(len / step)
  const seg = new Float64Array(segs)
  for (const w of weighted) {
    for (let k = 0; k < segs; k++) {
      let sum = 0
      for (let i = k * step; i < (k + 1) * step; i++) sum += w[i] * w[i]
      seg[k] += sum
    }
  }
  const powers: number[] = []
  for (let k = 0; k + 4 <= segs; k++) powers.push((seg[k] + seg[k + 1] + seg[k + 2] + seg[k + 3]) / (4 * step))
  const lufsOf = (z: number) => -0.691 + 10 * Math.log10(z)
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length
  const abs = powers.filter((z) => z > 0 && lufsOf(z) > -70)
  if (!abs.length) return null
  const rel = lufsOf(mean(abs)) - 10
  const gated = abs.filter((z) => lufsOf(z) > rel)
  return gated.length ? lufsOf(mean(gated)) : null
}

/** 4 倍オーバーサンプリングの補間フィルター（窓付き sinc、1 位相 12 タップ） */
const OS = 4
const TAPS = 12
const PHASES = (() => {
  const out: Float32Array[] = []
  for (let p = 1; p < OS; p++) {
    const h = new Float32Array(TAPS)
    for (let j = 0; j < TAPS; j++) {
      const x = j - TAPS / 2 + 1 - p / OS
      const sinc = x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x)
      const win = 0.5 + 0.5 * Math.cos((Math.PI * x) / (TAPS / 2))
      h[j] = sinc * win
    }
    out.push(h)
  }
  return out
})()

/** トゥルーピーク（標本の間の山も含めた最大の振幅） */
function truePeakOf(chs: Float32Array[]): number {
  let peak = 0
  for (const ch of chs) {
    const n = ch.length
    for (let i = 0; i < n; i++) {
      const a = Math.abs(ch[i])
      if (a > peak) peak = a
      // 標本の間（i と i+1 の間）を補間する。両隣が今の最大の半分（-6dB）より小さければ、間の山も届かないので省く
      if (Math.max(a, Math.abs(ch[i + 1] ?? 0)) < peak * 0.5) continue
      for (const h of PHASES) {
        let v = 0
        for (let j = 0; j < TAPS; j++) {
          const k = i + j - TAPS / 2 + 1
          if (k >= 0 && k < n) v += h[j] * ch[k]
        }
        const av = Math.abs(v)
        if (av > peak) peak = av
      }
    }
  }
  return peak
}

/** start〜end（秒。省くと全体）のラウドネスとトゥルーピーク */
export function analyzeLoudness(clip: { sampleRate: number; channels: Float32Array[] }, start = 0, end = Infinity): Loudness {
  const sr = clip.sampleRate
  const len = clip.channels[0]?.length ?? 0
  const a = Math.max(0, Math.floor(start * sr))
  const b = Math.min(len, Math.ceil(end * sr))
  if (b <= a) return { lufs: null, truePeak: null }
  const chs = clip.channels.map((c) => c.subarray(a, b))
  const peak = truePeakOf(chs)
  return { lufs: integrated(chs, sr), truePeak: peak > 0 ? 20 * Math.log10(peak) : null }
}
